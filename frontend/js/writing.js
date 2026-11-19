/**
 * Milestone 8 — graded writing practice.
 *
 * Feedback is a deterministic checklist over authored rules. It never claims
 * to assess grammar, spelling, style or an exam score. Drafts and checks are
 * local-first, bounded and synced with the rest of the opaque state object.
 */
import { getSkillTasks } from './content.js';
import { LEVEL_IDS } from './skill-content.js';
import {
  clearSkillHistory,
  clearWritingDraft,
  getSkillAttempts,
  getState,
  getWritingDraft,
  recordSkillAttempt,
  saveWritingDraft,
} from './store.js';
import {
  countWords,
  evaluateWriting,
  FEEDBACK_LABEL,
  writingResultToDetails,
} from './writing-feedback.js';
import {
  confirmDialog,
  emptyState,
  escapeHtml,
  formatDate,
  icon,
  levelBadge,
  toast,
} from './ui.js';

function levelOptions(selected) {
  return LEVEL_IDS.map(
    (level) =>
      `<option value="${level}" ${level === selected ? 'selected' : ''}>${level.toUpperCase()}</option>`,
  ).join('');
}

function taskOptions(tasks, selectedId) {
  return tasks
    .map(
      (task) =>
        `<option value="${escapeHtml(task.id)}" ${task.id === selectedId ? 'selected' : ''}>${escapeHtml(
          task.title,
        )}</option>`,
    )
    .join('');
}

export function renderWriting() {
  const savedLevel = getState().profile.targetLevel;
  let level = LEVEL_IDS.includes(savedLevel) ? savedLevel : 'a1';
  let tasks = getSkillTasks({ skill: 'writing', level });
  let task = tasks[0] || null;
  let startedAt = Date.now();
  let saveTimer = null;
  let lastSavedText = '';
  // Hoisted so destroy() can flush the final draft even if mount() never ran.
  let host = null;

  const html = `
    <div class="page page--skill" data-skill-view="writing">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practise · Milestone 8</p>
          <h1 class="page-title">Writing Practice</h1>
          <p class="page-sub">Write at every CEFR level, then check the authored task checklist. Feedback is transparent and deterministic — no invented AI grammar assessment.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/roadmap">${icon('compass')} Roadmap</a>
        </div>
      </header>

      <div class="skill-layout">
        <aside class="card skill-controls" aria-labelledby="writing-controls-title">
          <header class="card__head">
            <p class="eyebrow">Choose a task</p>
            <h2 class="card__title" id="writing-controls-title">Writing set</h2>
          </header>

          <div class="field">
            <label for="writing-level">CEFR level</label>
            <span class="select-wrap">
              <select class="select" id="writing-level" data-skill-level>${levelOptions(level)}</select>
              ${icon('chevron-down')}
            </span>
          </div>

          <div class="field">
            <label for="writing-task">Prompt</label>
            <span class="select-wrap">
              <select class="select" id="writing-task" data-skill-task>${taskOptions(tasks, task?.id)}</select>
              ${icon('chevron-down')}
            </span>
          </div>

          <div class="skill-inventory" data-skill-inventory></div>

          <div class="skill-history">
            <div class="skill-history__head">
              <h3>Recent checks</h3>
              <button class="btn btn--ghost btn--sm" type="button" data-skill-clear hidden>Clear</button>
            </div>
            <div data-skill-history></div>
          </div>
        </aside>

        <section class="card skill-main" aria-labelledby="writing-task-title">
          <div class="skill-main__head">
            <div>
              <p class="eyebrow">Authored prompt</p>
              <h2 class="card__title" id="writing-task-title">Open a prompt to begin</h2>
            </div>
            <span class="chip chip--soft" data-writing-count>0 words</span>
          </div>
          <div data-skill-content aria-live="polite"></div>
        </section>
      </div>
    </div>`;

  return {
    title: 'Writing Practice',
    crumbs: [{ label: 'Practise' }, { label: 'Writing Practice' }],
    html,

    mount(root) {
      host = root.querySelector('[data-skill-view="writing"]');
      if (!host) return;

      const levelSelect = host.querySelector('[data-skill-level]');
      const taskSelect = host.querySelector('[data-skill-task]');
      const inventoryBox = host.querySelector('[data-skill-inventory]');
      const historyBox = host.querySelector('[data-skill-history]');
      const clearButton = host.querySelector('[data-skill-clear]');
      const contentBox = host.querySelector('[data-skill-content]');
      const titleNode = host.querySelector('#writing-task-title');
      const countChip = host.querySelector('[data-writing-count]');
      const guard = () => host.isConnected;

      function renderInventory() {
        if (!guard()) return;
        inventoryBox.innerHTML = `
          <div class="skill-inventory__row">
            <span class="chip chip--soft">${icon('pen')} ${tasks.length} prompt${tasks.length === 1 ? '' : 's'}</span>
            <span class="chip chip--soft">${icon('target')} ${tasks.reduce((sum, item) => sum + item.checks.length, 0)} checks</span>
          </div>`;
      }

      function renderTaskOptions() {
        if (!guard()) return;
        taskSelect.innerHTML = taskOptions(tasks, task?.id);
        taskSelect.disabled = tasks.length === 0;
      }

      function renderHistory() {
        if (!guard()) return;
        const entries = getSkillAttempts()
          .filter((attempt) => attempt.skill === 'writing')
          .slice(-5)
          .reverse();
        clearButton.hidden = entries.length === 0;
        if (!entries.length) {
          historyBox.innerHTML = '<p class="skill-history__empty">No writing checks saved yet.</p>';
          return;
        }
        historyBox.innerHTML = `
          <ul class="skill-history__list" role="list">
            ${entries
              .map(
                (entry) => `
                  <li class="skill-history__item">
                    <span class="chip chip--soft">${escapeHtml(entry.level.toUpperCase())}</span>
                    <span>
                      <strong>${escapeHtml(entry.correct)} of ${escapeHtml(entry.total)} checks met</strong>
                      <small>${escapeHtml(formatDate(entry.date))}</small>
                    </span>
                  </li>`,
              )
              .join('')}
          </ul>`;
      }

      function updateCount(value = '') {
        if (!guard() || !task) return;
        const words = countWords(value);
        countChip.innerHTML = `${icon('target')} ${words} words · target ${task.targetWords.min}–${task.targetWords.max}`;
      }

      function persistDraft({ announce = false } = {}) {
        if (!task || !guard()) return;
        const input = contentBox.querySelector('[data-writing-text]');
        const text = input?.value || '';
        if (text === lastSavedText) {
          if (announce) toast('Draft is already saved.', { type: 'success' });
          return;
        }
        const draft = saveWritingDraft(task.id, text);
        lastSavedText = text;
        const status = contentBox.querySelector('[data-writing-status]');
        if (status && draft) {
          status.textContent = `Draft saved at ${new Date(draft.updatedAt).toLocaleTimeString()}.`;
        }
        if (announce) toast('Draft saved on this device.', { type: 'success' });
        renderHistory();
      }

      function scheduleSave() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => persistDraft(), 500);
      }

      function flushDraft() {
        window.clearTimeout(saveTimer);
        persistDraft();
      }

      function renderTask() {
        if (!guard()) return;
        startedAt = Date.now();
        const draft = task ? getWritingDraft(task.id) : null;
        lastSavedText = draft?.text || '';
        updateCount(lastSavedText);
        if (!task) {
          titleNode.textContent = 'No prompt available';
          contentBox.innerHTML = emptyState({
            iconName: 'pen',
            title: 'No authored prompt for this level',
            text: 'Choose another CEFR level.',
          });
          return;
        }

        titleNode.textContent = task.title;
        contentBox.innerHTML = `
          <div class="skill-task-meta">
            ${levelBadge(task.level)}
            <span class="chip chip--soft">${escapeHtml(task.topic)}</span>
            <span class="chip chip--soft">${escapeHtml(task.register)} register</span>
            <span class="chip chip--soft">${icon('clock')} ${escapeHtml(task.minutes)} min</span>
          </div>
          <div class="writing-prompt">
            <p lang="de">${escapeHtml(task.prompt)}</p>
            <small lang="en">${escapeHtml(task.promptEn)}</small>
          </div>
          <p class="writing-situation"><strong>Situation:</strong> ${escapeHtml(task.situation)}</p>
          <div class="writing-brief">
            <div>
              <h3>Required points</h3>
              <ul role="list">${task.requiredPoints
                .map((point) => `<li>${escapeHtml(point)}</li>`)
                .join('')}</ul>
            </div>
            <div>
              <h3>Useful phrases</h3>
              <ul role="list">${task.keyPhrases
                .map(
                  (phrase) =>
                    `<li><span lang="de">${escapeHtml(phrase.de)}</span> — ${escapeHtml(phrase.en)}</li>`,
                )
                .join('')}</ul>
            </div>
          </div>
          <div class="field writing-field">
            <label for="writing-text">Your answer</label>
            <textarea class="textarea" id="writing-text" data-writing-text rows="10" maxlength="6000"
              lang="de" placeholder="Write your German answer here…">${escapeHtml(lastSavedText)}</textarea>
            <small class="field__hint">Drafts save automatically on this device. You can resubmit as often as you like.</small>
          </div>
          <div class="writing-actions" role="group" aria-label="Writing controls">
            <button class="btn btn--primary" type="button" data-writing-check disabled>${icon('check')} Check checklist</button>
            <button class="btn btn--soft" type="button" data-writing-save>${icon('download')} Save draft</button>
            <button class="btn btn--ghost" type="button" data-writing-clear hidden>${icon('rotate')} Clear draft</button>
          </div>
          <p class="writing-status" data-writing-status role="status">
            ${draft ? `Draft restored from ${escapeHtml(formatDate(draft.updatedAt))}.` : 'New draft — nothing saved for this task yet.'}
          </p>
          <div class="writing-result" data-writing-result hidden aria-live="polite"></div>
          <details class="skill-details writing-model" data-writing-model>
            <summary>${icon('book-open')} Reveal authored model answer</summary>
            <p lang="de">${task.modelAnswer.map(escapeHtml).join(' ')}</p>
            <small>${escapeHtml(task.modelNotes)}</small>
          </details>`;

        const input = contentBox.querySelector('[data-writing-text]');
        const checkButton = contentBox.querySelector('[data-writing-check]');
        const clearButtonLocal = contentBox.querySelector('[data-writing-clear]');
        clearButtonLocal.hidden = !lastSavedText;
        input?.addEventListener('input', () => {
          updateCount(input.value);
          if (checkButton) checkButton.disabled = !input.value.trim();
          clearButtonLocal.hidden = !input.value;
          scheduleSave();
        });
        contentBox.querySelector('[data-writing-check]')?.addEventListener('click', checkWriting);
        contentBox.querySelector('[data-writing-save]')?.addEventListener('click', () =>
          persistDraft({ announce: true }),
        );
        clearButtonLocal?.addEventListener('click', () => {
          confirmDialog({
            title: 'Clear this draft?',
            message: 'Only the saved text for this writing task is removed. Submitted checks stay in your history.',
            confirmLabel: 'Clear draft',
            danger: true,
            onConfirm: () => {
              window.clearTimeout(saveTimer);
              clearWritingDraft(task.id);
              if (input) input.value = '';
              lastSavedText = '';
              updateCount('');
              clearButtonLocal.hidden = true;
              if (checkButton) checkButton.disabled = true;
              const status = contentBox.querySelector('[data-writing-status]');
              if (status) status.textContent = 'Draft cleared.';
              renderHistory();
              toast('Draft cleared.', { type: 'success' });
            },
          });
        });
      }

      function checkWriting() {
        if (!task || !guard()) return;
        const input = contentBox.querySelector('[data-writing-text]');
        const text = input?.value || '';
        if (!text.trim()) {
          toast('Write an answer before checking.', { type: 'warning' });
          return;
        }
        flushDraft();
        const result = evaluateWriting(task, text);
        const minutes = Math.max(0, Math.round((Date.now() - startedAt) / 60000));
        recordSkillAttempt({
          skill: 'writing',
          level: task.level,
          taskId: task.id,
          mode: 'checklist',
          correct: result.met,
          total: result.total,
          details: writingResultToDetails(result),
          words: result.words,
          sentences: result.sentences,
          minutes,
        });

        const resultBox = contentBox.querySelector('[data-writing-result]');
        if (resultBox) {
          resultBox.hidden = false;
          resultBox.innerHTML = `
            <div class="skill-result__head">
              <h3>${escapeHtml(FEEDBACK_LABEL)}</h3>
              <span class="chip ${result.complete ? 'chip--success' : 'chip--brand'}">
                ${result.met} of ${result.total} checks met
              </span>
            </div>
            <p>This only verifies the authored checklist below. It does not assess grammar, spelling, style or an exam grade.</p>
            <ul class="writing-check-list" role="list">
              ${result.checks
                .map(
                  (check) => `
                    <li class="writing-check ${check.passed ? 'is-met' : 'is-unmet'}">
                      <span class="writing-check__icon">${icon(check.passed ? 'check' : 'info')}</span>
                      <span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></span>
                    </li>`,
                )
                .join('')}
            </ul>
            <p class="writing-result__note">${result.complete ? 'All visible checks are met. You can still revise and check again.' : 'Revise your answer and check again — unlimited resubmissions are allowed.'}</p>`;
        }
        renderHistory();
        toast('Checklist result saved to this device.', { type: 'success' });
      }

      levelSelect?.addEventListener('change', () => {
        flushDraft();
        level = levelSelect.value;
        tasks = getSkillTasks({ skill: 'writing', level });
        task = tasks[0] || null;
        renderTaskOptions();
        renderInventory();
        renderTask();
      });

      taskSelect?.addEventListener('change', () => {
        flushDraft();
        task = tasks.find((item) => item.id === taskSelect.value) || tasks[0] || null;
        renderTask();
      });

      clearButton?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear writing history?',
          message: 'Only saved checklist results are removed. Drafts, lessons and other skill results stay.',
          confirmLabel: 'Clear history',
          danger: true,
          onConfirm: () => {
            clearSkillHistory('writing');
            renderHistory();
            toast('Writing history cleared.', { type: 'success' });
          },
        });
      });

      renderTaskOptions();
      renderInventory();
      renderHistory();
      renderTask();
    },

    destroy() {
      window.clearTimeout(saveTimer);
      const input = host?.querySelector('[data-writing-text]');
      if (task && input && input.value !== lastSavedText) saveWritingDraft(task.id, input.value);
      host = null;
    },
  };
}
