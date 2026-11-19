/**
 * Milestone 9 — spoken two-way conversation.
 *
 * A dedicated "talk with a partner" screen: the learner speaks German, sees the
 * recognised transcript, and hears a real AI reply spoken back in German.
 * Recognition and playback use the browser; replies come only from the
 * configured server-side provider. No transcript or answer is ever invented.
 */
import { friendlyAIError, getAIStatus, sendAIChat } from './ai.js';
import { messageMarkup, splitTranslation } from './ai-chat.js';
import { audioPlaybackSupported, recognitionSupported, startListening } from './speech.js';
import {
  appendAIMessage,
  clearAllAIConversations,
  createAIConversation,
  deleteAIConversation,
  getAIConversation,
  getAIConversations,
  getState,
} from './store.js';
import {
  confirmDialog,
  emptyState,
  escapeHtml,
  formatDate,
  icon,
  speakGerman,
  stopSpeaking,
  toast,
} from './ui.js';

const MODE = 'voice';
const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 1200;
const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
const PARTNER_LABEL = 'German partner';

function levelOptions(selected) {
  return LEVELS.map(
    (level) =>
      `<option value="${level}" ${level === selected ? 'selected' : ''}>${level.toUpperCase()}</option>`,
  ).join('');
}

export function renderTalk() {
  const savedLevel = getState().profile.targetLevel || 'a1';
  const initialLevel = /^[abc][12]$/.test(savedLevel) ? savedLevel : 'a1';

  let activeId = null;
  let status = null;
  let statusError = '';
  let checking = true;
  let statusGeneration = 0;
  let busy = false;
  let controller = null;
  let recognizer = null;
  let interimText = '';
  let autoSpeak = audioPlaybackSupported();
  let destroyed = false;

  const html = `
    <div class="page page--talk" data-talk>
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practise · Voice conversation</p>
          <h1 class="page-title">Talk with your German partner</h1>
          <p class="page-sub">Speak naturally in German and hear a short, real AI reply back — like two people having a conversation.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/roadmap">${icon('compass')} Roadmap</a>
        </div>
      </header>

      <div class="ai-layout talk-layout">
        <aside class="card ai-setup talk-setup" aria-labelledby="talk-setup-title">
          <header class="card__head">
            <p class="eyebrow">Conversation</p>
            <h2 class="card__title" id="talk-setup-title">Set the conversation</h2>
            <p class="card__sub">Settings apply to the next turn in a new conversation.</p>
          </header>

          <div class="ai-setup__fields">
            <div class="field">
              <label for="talk-level">Your CEFR level</label>
              <span class="select-wrap">
                <select class="select" id="talk-level" data-talk-level>${levelOptions(initialLevel)}</select>
                ${icon('chevron-down')}
              </span>
            </div>

            <div class="talk-options">
              <label class="ai-check" for="talk-auto-speak">
                <input id="talk-auto-speak" type="checkbox" data-talk-autospeak checked />
                <span>Partner speaks replies aloud</span>
              </label>
              <small class="field__hint" data-talk-playback-note></small>

              <label class="ai-check" for="talk-translation">
                <input id="talk-translation" type="checkbox" data-talk-translation />
                <span>Show English translation</span>
              </label>
              <small class="field__hint">Translation is shown after the German reply; only the German is spoken.</small>
            </div>
          </div>

          <button class="btn btn--primary btn--block" type="button" data-talk-new>
            ${icon('rotate')} New conversation
          </button>

          <div class="ai-history">
            <div class="ai-history__head">
              <h3>Voice conversations</h3>
              <button class="btn btn--ghost btn--sm" type="button" data-talk-clear-all hidden>Clear voice chats</button>
            </div>
            <div class="ai-history__list" data-talk-history></div>
          </div>

          <p class="ai-setup__note">
            ${icon('shield')} Speech runs in this browser. Provider keys never reach the page.
          </p>
        </aside>

        <section class="card ai-panel talk-panel" aria-labelledby="talk-thread-title">
          <header class="ai-panel__head">
            <div>
              <p class="eyebrow">Two-way voice</p>
              <h2 class="card__title" id="talk-thread-title" data-talk-context>New conversation</h2>
            </div>
            <span class="chip chip--soft" data-talk-chip>${icon('headphones')} Voice conversation</span>
          </header>

          <div class="ai-status" data-talk-status role="status" aria-live="polite">
            ${icon('clock')} <span>Checking whether AI is configured on the server…</span>
          </div>

          <div class="speech-status speech-status--offline" data-talk-mic-status role="status" aria-live="polite">
            <span class="chip chip--warning">${icon('clock')} Checking recognition…</span>
            <span class="speech-status__text">Checking browser speech support…</span>
          </div>

          <div class="ai-error" data-talk-error role="alert" hidden></div>

          <div class="ai-thread" data-talk-thread role="log" aria-label="Voice conversation transcript" aria-live="polite">
            ${emptyState({
              iconName: 'headphones',
              title: 'Your conversation starts here',
              text: 'Press Speak and talk in German, or type your turn below. Your partner replies with a real, spoken German answer.',
            })}
          </div>

          <form class="ai-composer talk-composer" data-talk-form>
            <label class="sr-only" for="talk-input">Your message in German</label>
            <textarea id="talk-input" class="ai-composer__input" data-talk-input rows="3"
              maxlength="1200" placeholder="Speak, or type your German turn…"
              aria-describedby="talk-help" disabled></textarea>
            <div class="ai-composer__bar">
              <button class="btn btn--primary btn--sm" type="button" data-talk-listen disabled>
                ${icon('mic')} Speak
              </button>
              <button class="btn btn--ghost btn--sm" type="button" data-talk-stop hidden>${icon('x')} Stop</button>
              <span class="ai-composer__count" data-talk-count aria-hidden="true">0/1200</span>
              <div class="ai-composer__actions">
                <button class="btn btn--primary btn--sm" type="submit" data-talk-send disabled>
                  ${icon('arrow-right')} Send
                </button>
              </div>
            </div>
            <p class="ai-composer__help" id="talk-help" data-talk-help>
              Replies come only from the configured server-side provider. Nothing here is pre-written.
            </p>
          </form>
        </section>
      </div>
    </div>`;

  return {
    title: 'Talk with your German partner',
    crumbs: [{ label: 'Practise' }, { label: 'Talk with partner' }],
    html,

    mount(root) {
      const host = root.querySelector('[data-talk]');
      if (!host) return;

      const levelSelect = host.querySelector('[data-talk-level]');
      const autoSpeakInput = host.querySelector('[data-talk-autospeak]');
      const playbackNote = host.querySelector('[data-talk-playback-note]');
      const translationInput = host.querySelector('[data-talk-translation]');
      const newButton = host.querySelector('[data-talk-new]');
      const clearAllButton = host.querySelector('[data-talk-clear-all]');
      const historyList = host.querySelector('[data-talk-history]');
      const context = host.querySelector('[data-talk-context]');
      const statusBox = host.querySelector('[data-talk-status]');
      const micStatusBox = host.querySelector('[data-talk-mic-status]');
      const errorBox = host.querySelector('[data-talk-error]');
      const thread = host.querySelector('[data-talk-thread]');
      const form = host.querySelector('[data-talk-form]');
      const input = host.querySelector('[data-talk-input]');
      const listenButton = host.querySelector('[data-talk-listen]');
      const stopButton = host.querySelector('[data-talk-stop]');
      const sendButton = host.querySelector('[data-talk-send]');
      const count = host.querySelector('[data-talk-count]');
      const help = host.querySelector('[data-talk-help]');
      const chip = host.querySelector('[data-talk-chip]');

      const guard = () => !destroyed && host.isConnected;
      const currentConversation = () => (activeId ? getAIConversation(activeId) : null);
      const messageLimit = () => Number(status?.maxMessageChars) || MAX_MESSAGE_CHARS;

      function renderStatus() {
        if (!guard()) return;
        const aiReady = Boolean(status?.configured) && !checking;
        const micReady = recognitionSupported();
        let label = 'AI unavailable';
        let tone = 'chip--warning';
        let message = '';

        if (checking) {
          label = 'Checking…';
          tone = 'chip--brand';
          message = 'Checking whether AI is configured on the server…';
        } else if (statusError) {
          message = statusError;
        } else if (!status?.configured) {
          message = status?.reason || 'AI is not configured on the server.';
        } else {
          label = 'AI connected';
          tone = 'chip--success';
          const model = status.model ? ` · ${status.model}` : '';
          message = `${status.provider || 'Server AI'} configured${model}. Your partner's replies come only from this provider.`;
        }

        statusBox.className = `ai-status ${aiReady ? 'ai-status--ready' : 'ai-status--offline'}`;
        statusBox.innerHTML = `
          <span class="chip ${tone}">${icon(aiReady ? 'check' : checking ? 'clock' : 'info')} ${escapeHtml(label)}</span>
          <span class="ai-status__text">${escapeHtml(message)}</span>
          ${checking ? '' : '<button class="link-button" type="button" data-talk-status-retry>Recheck</button>'}`;

        let micMessage;
        if (recognizer) {
          micMessage = interimText ? `Listening… ${interimText}` : 'Listening… speak now. Your words appear here as they are recognised.';
        } else if (!micReady) {
          micMessage = 'This browser does not support speech recognition. Type your German turn in the box instead.';
        } else if (!aiReady) {
          micMessage = 'Recognition is available, but no AI provider is configured. Your transcript stays local; no reply is invented.';
        } else {
          micMessage = 'German recognition is ready. Press Speak and talk naturally; your final words are sent automatically.';
        }

        micStatusBox.className = `speech-status ${micReady ? 'speech-status--ready' : 'speech-status--offline'}`;
        micStatusBox.innerHTML = `
          <span class="chip ${micReady ? 'chip--success' : 'chip--warning'}">
            ${icon(micReady ? 'check' : 'info')} ${micReady ? 'Mic ready' : 'Mic unavailable'}
          </span>
          <span class="speech-status__text">${escapeHtml(micMessage)}</span>`;

        chip?.classList.toggle('chip--brand', aiReady);
      }

      function renderControls() {
        if (!guard()) return;
        const ready = Boolean(status?.configured) && !checking;
        const listening = Boolean(recognizer);
        const limit = messageLimit();
        const playback = audioPlaybackSupported();

        input.maxLength = limit;
        input.disabled = !ready || busy || listening;
        input.placeholder = ready
          ? 'Speak, or type your German turn…'
          : 'AI is not configured — replies are unavailable.';
        translationInput.disabled = !ready || busy || listening;
        listenButton.disabled = busy || listening || !recognitionSupported();
        listenButton.title = recognitionSupported()
          ? 'Use browser German speech recognition'
          : 'This browser does not expose speech recognition';
        stopButton.hidden = !listening && !busy;
        stopButton.innerHTML = `${icon('x')} ${listening ? 'Stop listening' : 'Stop reply'}`;
        sendButton.disabled = !ready || busy || listening || !input.value.trim();
        count.textContent = `${input.value.length}/${limit}`;
        help.textContent = ready
          ? 'Final speech is sent automatically. Edit the transcript and press Send if recognition needs a correction.'
          : 'This server has no AI provider configured. You can still see the recognition state, but no reply is generated.';

        autoSpeakInput.disabled = !playback || busy || listening;
        if (!playback) autoSpeak = false;
        autoSpeakInput.checked = playback && autoSpeak;
        playbackNote.textContent = playback
          ? 'Replies are spoken with a German voice when available; the text is always shown.'
          : 'This browser cannot speak replies. Full German replies still appear in the transcript.';

        levelSelect.disabled = Boolean(activeId) || busy || listening;
        newButton.disabled = busy || listening;
        clearAllButton.disabled = busy || listening;
      }

      function renderHistory() {
        if (!guard()) return;
        const conversations = getAIConversations()
          .filter((conversation) => conversation.mode === MODE)
          .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));

        clearAllButton.hidden = conversations.length === 0;
        if (!conversations.length) {
          historyList.innerHTML = '<p class="ai-history__empty">No saved voice conversations yet.</p>';
          return;
        }

        historyList.innerHTML = conversations
          .map((conversation) => {
            const last = conversation.messages.at(-1);
            const preview = last
              ? `${last.role === 'user' ? 'You' : 'Partner'}: ${last.text}`
              : 'Empty conversation';
            return `
              <div class="ai-history__item ${conversation.id === activeId ? 'is-active' : ''}">
                <button class="ai-history__open" type="button" data-talk-open="${escapeHtml(conversation.id)}"
                  ${conversation.id === activeId ? 'aria-current="true"' : ''}>
                  <strong>${escapeHtml(conversation.title)}</strong>
                  <small>${escapeHtml(conversation.level.toUpperCase())} · ${escapeHtml(preview)}</small>
                </button>
                <button class="ai-history__delete" type="button" data-talk-delete="${escapeHtml(conversation.id)}"
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
            iconName: 'headphones',
            title: 'Your conversation starts here',
            text: 'Press Speak and talk in German, or type your turn below. Your partner replies with a real, spoken German answer.',
          });
          return;
        }
        thread.innerHTML = conversation.messages
          .map((message) => messageMarkup(message, { partnerLabel: PARTNER_LABEL, speak: audioPlaybackSupported() }))
          .join('');
        thread.scrollTop = thread.scrollHeight;
      }

      function syncSetup() {
        if (!guard()) return;
        const conversation = currentConversation();
        levelSelect.value = conversation?.level || levelSelect.value || initialLevel;
        levelSelect.disabled = Boolean(conversation);
      }

      function renderAll() {
        if (!guard()) return;
        syncSetup();
        renderHistory();
        renderThread();
        renderStatus();
        renderControls();
      }

      function showError(message, { retry = false } = {}) {
        if (!guard()) return;
        errorBox.hidden = false;
        errorBox.innerHTML = `
          <span class="ai-error__icon">${icon('info')}</span>
          <div class="ai-error__body">
            <strong>The conversation could not continue.</strong>
            <p>${escapeHtml(message)}</p>
          </div>
          ${retry ? '<button class="btn btn--ghost btn--sm" type="button" data-talk-retry>Retry</button>' : ''}`;
      }

      function clearError() {
        if (!guard()) return;
        errorBox.hidden = true;
        errorBox.innerHTML = '';
      }

      async function checkStatus() {
        const generation = ++statusGeneration;
        if (!guard()) return;
        checking = true;
        statusError = '';
        renderStatus();
        renderControls();
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
            renderAll();
          }
        }
      }

      async function send({ text, retry = false } = {}) {
        if (!guard() || busy || recognizer || checking || !status?.configured) return;

        let conversation = currentConversation();
        const lastUser = conversation?.messages.at(-1);
        const raw = retry ? (lastUser?.role === 'user' ? lastUser.text : '') : (text ?? input.value);
        const message = String(raw ?? '')
          .trim()
          .slice(0, messageLimit());
        if (!message) return;

        if (!conversation) {
          conversation = createAIConversation({
            mode: MODE,
            level: levelSelect.value || initialLevel,
          });
          activeId = conversation.id;
        }

        if (!retry) appendAIMessage(conversation.id, { role: 'user', text: message });
        input.value = '';
        interimText = '';
        clearError();

        const saved = getAIConversation(conversation.id);
        const requestMessages = saved.messages
          .slice(-MAX_HISTORY)
          .map(({ role, text: content }) => ({ role, text: content }));
        const targetId = conversation.id;

        controller = new AbortController();
        busy = true;
        stopSpeaking();
        renderAll();

        try {
          const reply = await sendAIChat(
            {
              mode: MODE,
              level: saved.level,
              scenario: '',
              messages: requestMessages,
              showTranslation: translationInput.checked,
            },
            controller.signal,
          );
          if (!guard()) return;
          const parts = splitTranslation(reply.reply);
          if (!parts.text) {
            showError('The provider returned no German reply. Nothing was added to the transcript.', { retry: true });
            return;
          }
          appendAIMessage(targetId, {
            role: 'assistant',
            text: parts.text,
            translation: parts.translation,
            correction: reply.correction || '',
            explanation: reply.explanation || '',
          });
          if (autoSpeak && parts.text) speakGerman(parts.text);
        } catch (error) {
          if (!guard()) return;
          const stopped = controller?.signal.aborted;
          showError(
            stopped
              ? 'Reply stopped. Your message is saved; choose Retry to ask again.'
              : friendlyAIError(error),
            { retry: true },
          );
        } finally {
          controller = null;
          busy = false;
          if (guard()) renderAll();
        }
      }

      async function listen() {
        if (!guard() || busy || recognizer || !recognitionSupported()) return;
        clearError();
        stopSpeaking();
        interimText = '';
        input.value = '';
        renderStatus();
        renderControls();

        const session = startListening({
          onInterim: (text) => {
            if (!guard()) return;
            interimText = String(text).slice(0, messageLimit());
            input.value = interimText;
            renderStatus();
            renderControls();
          },
        });
        recognizer = session;
        renderAll();

        try {
          const result = await session.promise;
          if (!guard()) return;
          const text = String(result?.text || '')
            .trim()
            .slice(0, messageLimit());
          recognizer = null;
          interimText = '';
          if (!text) {
            showError('No speech was recognised. You can type your German turn instead.');
            renderAll();
            return;
          }
          input.value = text;
          renderStatus();
          renderControls();

          if (status?.configured && !checking) {
            await send({ text });
          } else {
            showError('Transcript ready. No AI provider is configured, so no reply was generated.');
          }
        } catch (error) {
          if (!guard()) return;
          const message =
            error?.code === 'aborted'
              ? 'Listening stopped. You can type or send what was recognised.'
              : error?.message || 'Speech recognition could not complete.';
          showError(message);
        } finally {
          recognizer = null;
          if (guard()) renderAll();
        }
      }

      function stopActive() {
        if (recognizer) recognizer.abort();
        else if (controller) controller.abort(new Error('stopped'));
      }

      /* Event wiring ------------------------------------------------------- */

      levelSelect?.addEventListener('change', () => {
        if (!guard() || activeId) return;
        clearError();
        renderAll();
      });

      autoSpeakInput?.addEventListener('change', () => {
        if (!guard()) return;
        autoSpeak = autoSpeakInput.checked;
        if (!autoSpeak) stopSpeaking();
      });

      input.addEventListener('input', () => {
        if (!guard()) return;
        interimText = '';
        clearError();
        renderControls();
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

      listenButton.addEventListener('click', listen);
      stopButton.addEventListener('click', stopActive);

      statusBox.addEventListener('click', (event) => {
        if (!guard() || !event.target.closest('[data-talk-status-retry]')) return;
        checkStatus();
      });

      errorBox.addEventListener('click', (event) => {
        if (!guard() || !event.target.closest('[data-talk-retry]')) return;
        send({ retry: true });
      });

      thread.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ai-replay]');
        if (!guard() || !button || !audioPlaybackSupported()) return;
        const message = currentConversation()?.messages.find((item) => item.id === button.dataset.aiReplay);
        if (!message?.text) return;
        speakGerman(message.text, { rate: button.hasAttribute('data-ai-replay-slow') ? 0.7 : 1 });
      });

      newButton.addEventListener('click', () => {
        if (!guard() || busy || recognizer) return;
        activeId = null;
        clearError();
        stopSpeaking();
        renderAll();
        input.focus({ preventScroll: true });
      });

      clearAllButton.addEventListener('click', () => {
        if (!guard() || busy || recognizer || clearAllButton.hidden) return;
        confirmDialog({
          title: 'Delete all voice conversations?',
          message: 'This removes every saved voice transcript from this browser. Your tutor and role-play chats stay untouched.',
          confirmLabel: 'Delete voice chats',
          danger: true,
          onConfirm() {
            clearAllAIConversations(MODE);
            activeId = null;
            clearError();
            renderAll();
            toast('Voice conversations were deleted.', { type: 'success' });
          },
        });
      });

      historyList.addEventListener('click', (event) => {
        if (!guard() || busy || recognizer) return;
        const deleteButton = event.target.closest('[data-talk-delete]');
        if (deleteButton) {
          const id = deleteButton.dataset.talkDelete;
          const conversation = getAIConversation(id);
          confirmDialog({
            title: 'Delete this voice conversation?',
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

        const openButton = event.target.closest('[data-talk-open]');
        if (openButton) {
          activeId = openButton.dataset.talkOpen;
          clearError();
          stopSpeaking();
          renderAll();
        }
      });

      const initial = getAIConversations()
        .filter((conversation) => conversation.mode === MODE && conversation.messages.length)
        .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0];
      if (initial) activeId = initial.id;

      renderAll();
      checkStatus();
    },

    destroy() {
      // Navigation must never leave a live microphone, provider request or
      // speech utterance running on a detached screen.
      destroyed = true;
      statusGeneration += 1;
      recognizer?.abort();
      recognizer = null;
      controller?.abort();
      controller = null;
      stopSpeaking();
      busy = false;
    },
  };
}
