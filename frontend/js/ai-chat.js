/**
 * Milestone 5 — shared AI conversation shell.
 *
 * This module owns the transcript, composer, provider-status panel and local
 * history UI used by both the tutor and the role-play views. It never invents
 * a reply: the composer is disabled until the server reports a configured
 * provider, and every assistant message comes from `/api/ai/chat`.
 */
import { curriculum, getScenarios } from './content.js';
import { friendlyAIError, getAIStatus, sendAIChat } from './ai.js';
import {
  appendAIMessage,
  clearAllAIConversations,
  createAIConversation,
  deleteAIConversation,
  getAIConversation,
  getAIConversations,
  getState,
} from './store.js';
import { confirmDialog, emptyState, escapeHtml, formatDate, icon, toast } from './ui.js';

const MAX_HISTORY = 12;

function levelOptions(selected) {
  const levels = curriculum.levels.length
    ? curriculum.levels
    : ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((id) => ({ id, code: id.toUpperCase(), name: '' }));
  return levels
    .map(
      (level) =>
        `<option value="${escapeHtml(level.id)}" ${level.id === selected ? 'selected' : ''}>${escapeHtml(
          level.code,
        )}${level.name ? ` · ${escapeHtml(level.name)}` : ''}</option>`,
    )
    .join('');
}

function scenarioOptions(level, selected) {
  const scenarios = getScenarios(level);
  if (!scenarios.length) return '<option value="">No scenarios authored for this level</option>';
  return [
    '<option value="">Choose a scenario</option>',
    ...scenarios.map(
      (scenario) =>
        `<option value="${escapeHtml(scenario.title)}" ${scenario.title === selected ? 'selected' : ''}>${escapeHtml(
          scenario.title,
        )} · ${escapeHtml(scenario.titleDe)}</option>`,
    ),
  ].join('');
}

/** The provider may append "EN: …" to the German reply; keep both parts honest. */
export function splitTranslation(reply) {
  const text = String(reply || '');
  const marker = '\nEN:';
  const index = text.lastIndexOf(marker);
  if (index === -1) return { text: text.trim(), translation: '' };
  return {
    text: text.slice(0, index).trim(),
    translation: text.slice(index + marker.length).trim(),
  };
}

/**
 * Render one saved transcript turn. Voice conversations pass a different
 * partner label and add replay buttons; tutor/role-play keep their original markup.
 */
export function messageMarkup(message, { partnerLabel = 'DeutschLern AI', speak = false } = {}) {
  const when = message.at ? formatDate(message.at, { hour: '2-digit', minute: '2-digit' }) : '';
  const time = when ? `<time datetime="${escapeHtml(message.at)}">${escapeHtml(when)}</time>` : '';

  if (message.role === 'user') {
    return `
      <article class="ai-msg ai-msg--user">
        <header class="ai-msg__head"><strong>You</strong>${time}</header>
        <p class="ai-msg__text" lang="de">${escapeHtml(message.text)}</p>
      </article>`;
  }

  const replay = speak && message.text
    ? `<div class="ai-msg__actions" role="group" aria-label="Replay partner reply">
         <button class="btn btn--ghost btn--sm" type="button" data-ai-replay="${escapeHtml(message.id)}">
           ${icon('volume')} Hear reply
         </button>
         <button class="btn btn--ghost btn--sm" type="button" data-ai-replay="${escapeHtml(message.id)}" data-ai-replay-slow>
           ${icon('play')} Slow
         </button>
       </div>`
    : '';

  return `
    <article class="ai-msg ai-msg--ai">
      <header class="ai-msg__head"><strong>${escapeHtml(partnerLabel)}</strong>${time}</header>
      <p class="ai-msg__text ai-msg__reply" lang="de">${escapeHtml(message.text)}</p>
      ${
        message.translation
          ? `<div class="ai-feedback ai-feedback--translation">
               <span class="ai-feedback__label">English translation</span>
               <p lang="en">${escapeHtml(message.translation)}</p>
             </div>`
          : ''
      }
      ${
        message.correction
          ? `<div class="ai-feedback ai-feedback--correction">
               <span class="ai-feedback__label">Correction</span>
               <p lang="de">${escapeHtml(message.correction)}</p>
             </div>`
          : ''
      }
      ${
        message.explanation
          ? `<div class="ai-feedback ai-feedback--explanation">
               <span class="ai-feedback__label">Why</span>
               <p lang="en">${escapeHtml(message.explanation)}</p>
             </div>`
          : ''
      }
      ${replay}
    </article>`;
}

/**
 * Build a complete routed view for one conversation mode.
 * @param {{ mode: 'tutor'|'roleplay', title: string, description: string }} options
 */
export function renderAIChat({ mode, title, description }) {
  const isRoleplay = mode === 'roleplay';
  const initialLevel = getState().profile.targetLevel || 'a1';
  const level = /^[abc][12]$/.test(initialLevel) ? initialLevel : 'a1';
  const modeLabel = isRoleplay ? 'Real-life role-play' : 'AI tutor';

  let activeId = null;
  let status = null;
  let statusError = '';
  let checking = true;
  let statusGeneration = 0;
  let busy = false;
  let controller = null;
  let errorMessage = '';
  let destroyed = false;

  const html = `
    <div class="page page--ai" data-ai-chat>
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practise · Milestone 5</p>
          <h1 class="page-title">${escapeHtml(title)}</h1>
          <p class="page-sub">${escapeHtml(description)}</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/roadmap">${icon('compass')} Roadmap</a>
        </div>
      </header>

      <div class="ai-layout">
        <aside class="card ai-setup" aria-labelledby="ai-setup-title">
          <header class="card__head">
            <p class="eyebrow">Conversation</p>
            <h2 class="card__title" id="ai-setup-title">Set the scene</h2>
            <p class="card__sub">Settings apply to the next message in a new conversation.</p>
          </header>

          <div class="ai-setup__fields">
            <div class="field">
              <label for="ai-level">Your CEFR level</label>
              <span class="select-wrap">
                <select class="select" id="ai-level" data-ai-level>${levelOptions(level)}</select>
                ${icon('chevron-down')}
              </span>
            </div>

            ${
              isRoleplay
                ? `<div class="field">
                     <label for="ai-scenario">Scenario</label>
                     <span class="select-wrap">
                       <select class="select" id="ai-scenario" data-ai-scenario>${scenarioOptions(level, '')}</select>
                       ${icon('chevron-down')}
                     </span>
                     <small class="field__hint">All scenarios come from the authored A1–C2 curriculum.</small>
                   </div>`
                : ''
            }
          </div>

          <button class="btn btn--primary btn--block" type="button" data-ai-new>
            ${icon('rotate')} New conversation
          </button>

          <div class="ai-history">
            <div class="ai-history__head">
              <h3>Saved conversations</h3>
              <button class="btn btn--ghost btn--sm" type="button" data-ai-clear-all hidden>Clear all</button>
            </div>
            <div class="ai-history__list" data-ai-conversations></div>
          </div>

          <p class="ai-setup__note">
            ${icon('shield')} Conversations stay in this browser. Provider keys never reach the page.
          </p>
        </aside>

        <section class="card ai-panel" aria-labelledby="ai-thread-title">
          <header class="ai-panel__head">
            <div>
              <p class="eyebrow">${escapeHtml(modeLabel)}</p>
              <h2 class="card__title" id="ai-thread-title" data-ai-context>New conversation</h2>
            </div>
            <span class="chip chip--soft" data-ai-mode-chip>${icon(isRoleplay ? 'message' : 'sparkles')} ${escapeHtml(
              modeLabel,
            )}</span>
          </header>

          <div class="ai-status" data-ai-status role="status" aria-live="polite">
            ${icon('clock')} <span>Checking whether AI is configured on the server…</span>
          </div>

          <div class="ai-error" data-ai-error role="alert" hidden></div>

          <div class="ai-thread" data-ai-thread role="log" aria-label="Conversation transcript" aria-live="polite">
            ${emptyState({
              iconName: isRoleplay ? 'message' : 'sparkles',
              title: 'No messages yet',
              text: isRoleplay
                ? 'Choose a scenario, then write your first line in German. The AI partner will reply in character.'
                : 'Write a German sentence. The tutor will reply and correct it when needed.',
            })}
          </div>

          <form class="ai-composer" data-ai-form>
            <label class="sr-only" for="ai-message">Your message in German</label>
            <textarea id="ai-message" class="ai-composer__input" data-ai-input rows="3"
              maxlength="1200" placeholder="Schreib auf Deutsch…" aria-describedby="ai-composer-help" disabled></textarea>
            <div class="ai-composer__bar">
              <label class="ai-check" for="ai-translation">
                <input id="ai-translation" type="checkbox" data-ai-translation disabled />
                <span>Show English translation</span>
              </label>
              <span class="ai-composer__count" data-ai-count aria-hidden="true">0/1200</span>
              <div class="ai-composer__actions">
                <button class="btn btn--ghost btn--sm" type="button" data-ai-stop hidden>${icon('x')} Stop</button>
                <button class="btn btn--primary btn--sm" type="submit" data-ai-send disabled>${icon(
                  'arrow-right',
                )} Send</button>
              </div>
            </div>
            <p class="ai-composer__help" id="ai-composer-help" data-ai-help>
              Replies are generated only by a configured server-side AI provider. Nothing here is pre-written.
            </p>
          </form>
        </section>
      </div>
    </div>`;

  return {
    title,
    crumbs: [{ label: 'Practise' }, { label: title }],
    html,

    mount(root) {
      const host = root.querySelector('[data-ai-chat]');
      if (!host) return;

      const levelSelect = host.querySelector('[data-ai-level]');
      const scenarioSelect = host.querySelector('[data-ai-scenario]');
      const newButton = host.querySelector('[data-ai-new]');
      const clearAllButton = host.querySelector('[data-ai-clear-all]');
      const historyList = host.querySelector('[data-ai-conversations]');
      const context = host.querySelector('[data-ai-context]');
      const statusBox = host.querySelector('[data-ai-status]');
      const errorBox = host.querySelector('[data-ai-error]');
      const thread = host.querySelector('[data-ai-thread]');
      const form = host.querySelector('[data-ai-form]');
      const input = host.querySelector('[data-ai-input]');
      const translationInput = host.querySelector('[data-ai-translation]');
      const count = host.querySelector('[data-ai-count]');
      const stopButton = host.querySelector('[data-ai-stop]');
      const sendButton = host.querySelector('[data-ai-send]');
      const help = host.querySelector('[data-ai-help]');

      const currentConversation = () => (activeId ? getAIConversation(activeId) : null);
      const guard = () => !destroyed && host.isConnected;

      function renderStatus() {
        if (!guard()) return;
        let label = 'AI unavailable';
        let tone = 'chip--warning';
        let message = '';

        if (checking) {
          label = 'Checking…';
          message = 'Checking whether AI is configured on the server…';
        } else if (statusError) {
          message = statusError;
        } else if (!status?.configured) {
          message = status?.reason || 'AI is not configured on the server.';
        } else {
          label = 'AI connected';
          tone = 'chip--success';
          const model = status.model ? ` · ${status.model}` : '';
          message = `${status.provider || 'Server AI'} configured${model}. Messages go through this server to the configured provider.`;
        }

        const chip = host.querySelector('[data-ai-mode-chip]');
        // The mode chip stays informative; availability is shown in the status row.
        chip?.classList.toggle('chip--brand', !checking && Boolean(status?.configured));
        chip?.classList.toggle('chip--success', false);

        statusBox.className = `ai-status ${status?.configured && !checking ? 'ai-status--ready' : 'ai-status--offline'}`;
        statusBox.innerHTML = `
          <span class="chip ${tone}">${icon(status?.configured && !checking ? 'check' : 'info')} ${escapeHtml(label)}</span>
          <span class="ai-status__text">${escapeHtml(message)}</span>
          ${checking ? '' : '<button class="link-button" type="button" data-ai-status-retry>Recheck</button>'}`;
      }

      function renderComposer() {
        if (!guard()) return;
        const ready = Boolean(status?.configured) && !checking;
        const scenarioReady = !isRoleplay || Boolean(scenarioSelect?.value);
        const canSend = ready && !busy && scenarioReady && Boolean(input.value.trim());
        const limit = Number(status?.maxMessageChars) || 1200;

        input.maxLength = limit;
        input.disabled = !ready || busy;
        input.placeholder = !ready
          ? 'AI is not configured on this server — chat is unavailable.'
          : !scenarioReady
            ? 'Choose an authored scenario first…'
            : 'Schreib auf Deutsch…';
        translationInput.disabled = !ready || busy;
        sendButton.disabled = !canSend;
        stopButton.hidden = !busy;
        count.textContent = `${input.value.length}/${limit}`;
        help.textContent = !ready
          ? 'This server has no AI provider configured. Add the key server-side to enable real replies; no canned answers are shown.'
          : !scenarioReady
            ? 'Choose one of the authored scenarios before sending. The role-play reply uses the selected scene.'
            : 'Replies, corrections and explanations come only from the configured provider. Nothing here is pre-written.';
      }

      function renderHistory() {
        if (!guard()) return;
        const conversations = getAIConversations()
          .filter((conversation) => conversation.mode === mode)
          .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));

        clearAllButton.hidden = conversations.length === 0;
        if (!conversations.length) {
          historyList.innerHTML = `<p class="ai-history__empty">No saved ${modeLabel.toLowerCase()} conversations yet.</p>`;
          return;
        }

        historyList.innerHTML = conversations
          .map((conversation) => {
            const last = conversation.messages.at(-1);
            const preview = last ? `${last.role === 'user' ? 'You: ' : 'AI: '}${last.text}` : 'Empty conversation';
            return `
              <div class="ai-history__item ${conversation.id === activeId ? 'is-active' : ''}">
                <button class="ai-history__open" type="button" data-ai-open="${escapeHtml(conversation.id)}"
                  ${conversation.id === activeId ? 'aria-current="true"' : ''}>
                  <strong>${escapeHtml(conversation.title)}</strong>
                  <small>${escapeHtml(conversation.level.toUpperCase())} · ${escapeHtml(preview)}</small>
                </button>
                <button class="ai-history__delete" type="button" data-ai-delete="${escapeHtml(conversation.id)}"
                  aria-label="Delete ${escapeHtml(conversation.title)}">${icon('x')}</button>
              </div>`;
          })
          .join('');
      }

      function renderThread() {
        if (!guard()) return;
        const conversation = currentConversation();
        context.textContent = conversation ? conversation.title : 'New conversation';
        if (!conversation?.messages.length) {
          thread.innerHTML = emptyState({
            iconName: isRoleplay ? 'message' : 'sparkles',
            title: 'No messages yet',
            text: isRoleplay
              ? 'Choose a scenario, then write your first line in German. The AI partner will reply in character.'
              : 'Write a German sentence. The tutor will reply and correct it when needed.',
          });
          return;
        }
        thread.innerHTML = conversation.messages.map((message) => messageMarkup(message)).join('');
        thread.scrollTop = thread.scrollHeight;
      }

      function syncSetup() {
        if (!guard()) return;
        const conversation = currentConversation();
        const selectedLevel = conversation?.level || levelSelect.value || level;
        levelSelect.value = selectedLevel;
        levelSelect.disabled = Boolean(conversation);

        if (scenarioSelect) {
          const scenarios = getScenarios(selectedLevel);
          scenarioSelect.innerHTML = scenarioOptions(selectedLevel, conversation?.scenario || scenarios[0]?.title || '');
          scenarioSelect.disabled = Boolean(conversation) || !scenarios.length;
        }
      }

      function renderAll() {
        if (!guard()) return;
        syncSetup();
        renderHistory();
        renderThread();
        renderStatus();
        renderComposer();
      }

      function showError(message, { retry = true } = {}) {
        if (!guard()) return;
        errorMessage = message;
        errorBox.hidden = false;
        errorBox.innerHTML = `
          <span class="ai-error__icon">${icon('info')}</span>
          <div class="ai-error__body">
            <strong>The AI could not reply.</strong>
            <p>${escapeHtml(message)}</p>
          </div>
          ${retry ? '<button class="btn btn--ghost btn--sm" type="button" data-ai-retry>Retry</button>' : ''}`;
        renderComposer();
      }

      function clearError() {
        if (!guard()) return;
        errorMessage = '';
        errorBox.hidden = true;
        errorBox.innerHTML = '';
      }

      async function checkStatus() {
        const generation = ++statusGeneration;
        if (!guard()) return;
        checking = true;
        statusError = '';
        renderStatus();
        renderComposer();
        try {
          const result = await getAIStatus();
          if (!guard() || generation !== statusGeneration) return;
          status = result;
        } catch (error) {
          if (!guard() || generation !== statusGeneration) return;
          status = null;
          statusError = friendlyAIError(error);
        } finally {
          if (guard() && generation === statusGeneration) {
            checking = false;
            renderStatus();
            renderComposer();
          }
        }
      }

      function requireIdle() {
        if (!busy) return true;
        toast('Wait for the current AI reply to finish.', { type: 'warning', duration: 2400 });
        return false;
      }

      async function send({ retry = false } = {}) {
        if (!guard() || busy || !status?.configured || checking) return;

        let conversation = currentConversation();
        const lastUser = conversation?.messages.at(-1);
        const text = retry ? (lastUser?.role === 'user' ? lastUser.text : '') : input.value.trim();
        if (!text) return;

        if (!conversation) {
          conversation = createAIConversation({
            mode,
            level: levelSelect.value || level,
            scenario: scenarioSelect?.value || '',
          });
          activeId = conversation.id;
        }

        if (!retry) {
          appendAIMessage(conversation.id, { role: 'user', text });
          input.value = '';
        }
        clearError();

        const requestMessages = getAIConversation(conversation.id)
          .messages.slice(-MAX_HISTORY)
          .map(({ role, text: content }) => ({ role, text: content }));
        const targetId = conversation.id;
        controller = new AbortController();
        busy = true;
        renderComposer();
        renderHistory();
        renderThread();

        try {
          const reply = await sendAIChat(
            {
              mode: conversation.mode,
              level: conversation.level,
              scenario: scenarioSelect?.value || conversation.scenario || '',
              messages: requestMessages,
              showTranslation: translationInput.checked,
            },
            controller.signal,
          );
          if (!guard()) return;
          const parts = splitTranslation(reply.reply);
          appendAIMessage(targetId, {
            role: 'assistant',
            text: parts.text,
            translation: parts.translation,
            correction: reply.correction || '',
            explanation: reply.explanation || '',
          });
        } catch (error) {
          if (!guard()) return;
          const stopped = controller?.signal.aborted;
          showError(
            stopped ? 'Request stopped. Your message is saved; choose Retry to send it again.' : friendlyAIError(error),
            { retry: true },
          );
        } finally {
          controller = null;
          busy = false;
          if (guard()) {
            renderComposer();
            renderHistory();
            renderThread();
          }
        }
      }

      /* Event wiring ------------------------------------------------------- */

      levelSelect?.addEventListener('change', () => {
        if (!guard() || !requireIdle()) return;
        if (scenarioSelect) {
          const scenarios = getScenarios(levelSelect.value);
          // Keep a real authored scene selected when the level changes; an
          // empty picker previously made the next role-play turn generic.
          scenarioSelect.innerHTML = scenarioOptions(levelSelect.value, scenarios[0]?.title || '');
          renderComposer();
        }
      });

      scenarioSelect?.addEventListener('change', () => {
        if (guard()) renderComposer();
      });

      input.addEventListener('input', () => {
        if (!guard()) return;
        count.textContent = `${input.value.length}/${Number(input.maxLength) || 1200}`;
        renderComposer();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        send();
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        send();
      });

      stopButton.addEventListener('click', () => {
        if (!guard() || !controller) return;
        controller.abort(new Error('stopped'));
      });

      statusBox.addEventListener('click', (event) => {
        if (!guard() || !event.target.closest('[data-ai-status-retry]')) return;
        checkStatus();
      });

      errorBox.addEventListener('click', (event) => {
        if (!guard() || !event.target.closest('[data-ai-retry]')) return;
        send({ retry: true });
      });

      newButton.addEventListener('click', () => {
        if (!guard() || !requireIdle()) return;
        activeId = null;
        clearError();
        renderAll();
        input.focus({ preventScroll: true });
      });

      clearAllButton.addEventListener('click', () => {
        if (!guard() || !requireIdle() || clearAllButton.hidden) return;
        confirmDialog({
          title: 'Delete all AI conversations?',
          message: 'This removes every saved tutor and role-play transcript from this browser. It cannot be undone.',
          confirmLabel: 'Delete conversations',
          danger: true,
          onConfirm() {
            clearAllAIConversations();
            activeId = null;
            renderAll();
            toast('All AI conversations were deleted.', { type: 'success' });
          },
        });
      });

      historyList.addEventListener('click', (event) => {
        if (!guard() || !requireIdle()) return;
        const deleteButton = event.target.closest('[data-ai-delete]');
        if (deleteButton) {
          const id = deleteButton.dataset.aiDelete;
          const conversation = getAIConversation(id);
          confirmDialog({
            title: 'Delete this conversation?',
            message: `“${conversation?.title || 'Conversation'}” will be removed from this browser.`,
            confirmLabel: 'Delete',
            danger: true,
            onConfirm() {
              deleteAIConversation(id);
              if (activeId === id) activeId = null;
              clearError();
              renderAll();
            },
          });
          return;
        }

        const openButton = event.target.closest('[data-ai-open]');
        if (openButton) {
          activeId = openButton.dataset.aiOpen;
          clearError();
          renderAll();
        }
      });

      const initial = getAIConversations()
        .filter((conversation) => conversation.mode === mode && conversation.messages.length)
        .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0];
      if (initial) activeId = initial.id;

      renderAll();
      checkStatus();
    },

    destroy() {
      // Navigation must not leave an /api/ai/chat request running against a
      // detached transcript. Invalidate pending status checks as well; all
      // element listeners die with the view's DOM.
      destroyed = true;
      statusGeneration += 1;
      controller?.abort();
      controller = null;
      busy = false;
    },
  };
}
