/**
 * Milestone 8 — graded reading practice.
 *
 * Every passage, question, answer key and explanation comes from the authored
 * skill-practice file. Scoring is instant multiple-choice checking only, saved
 * locally, with unlimited retakes.
 */
import { getSkillTasks } from './content.js';
import { LEVEL_IDS } from './skill-content.js';
import { getSkillAttempts, recordSkillAttempt, clearSkillHistory } from './store.js';
import {
  answerText,
  bindDrillInteractions,
  drillBody,
  drillFeedbackHtml,
  evaluateDrill,
  givenAnswer,
} from './practice.js';
import {
  audioPlaybackSupported,
} from './speech.js';
import {
  confirmDialog,
  emptyState,
  escapeHtml,
  formatDate,
  icon,
  levelBadge,
  speakGermanLines,
  stopSpeaking,
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

export function renderReading() {
  let level = 'a1';
  let tasks = getSkillTasks({ skill: 'reading', level });
  let task = tasks[0] || null;
  let startedAt = Date.now();

  const html = `
    <div class="page page--skill" data-skill-view="reading">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practise · Milestone 8</p>
          <h1 class="page-title">Reading Practice</h1>
          <p class="page-sub">Two authored passages at every CEFR level. Read, check your answers, then read the explanations — no invented score.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/roadmap">${icon('compass')} Roadmap</a>
        </div>
      </header>

      <div class="skill-layout">
        <aside class="card skill-controls" aria-labelledby="reading-controls-title">
          <header class="card__head">
            <p class="eyebrow">Choose a text</p>
            <h2 class="card__title" id="reading-controls-title">Reading set</h2>
          </header>

          <div class="field">
            <label for="reading-level">CEFR level</label>
            <span class="select-wrap">
              <select class="select" id="reading-level" data-skill-level>${levelOptions(level)}</select>
              ${icon('chevron-down')}
            </span>
          </div>

          <div class="field">
            <label for="reading-task">Passage</label>
            <span class="select-wrap">
              <select class="select" id="reading-task" data-skill-task>${taskOptions(tasks, task?.id)}</select>
              ${icon('chevron-down')}
            </span>
          </div>

          <div class="skill-inventory" data-skill-inventory></div>

          <div class="skill-history">
            <div class="skill-history__head">
              <h3>Recent results</h3>
              <button class="btn btn--ghost btn--sm" type="button" data-skill-clear hidden>Clear</button>
            </div>
            <div data-skill-history></div>
          </div>
        </aside>

        <section class="card skill-main" aria-labelledby="reading-task-title">
          <div class="skill-main__head">
            <div>
              <p class="eyebrow">Authored passage</p>
              <h2 class="card__title" id="reading-task-title">Open a text to begin</h2>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" data-skill-audio disabled>
              ${icon('volume')} Hear text
            </button>
          </div>
          <div data-skill-content aria-live="polite"></div>
        </section>
      </div>
    </div>`;

  return {
    title: 'Reading Practice',
    crumbs: [{ label: 'Practise' }, { label: 'Reading Practice' }],
    html,

    mount(root) {
      const host = root.querySelector('[data-skill-view="reading"]');
      if (!host) return;

      const levelSelect = host.querySelector('[data-skill-level]');
      const taskSelect = host.querySelector('[data-skill-task]');
      const inventoryBox = host.querySelector('[data-skill-inventory]');
      const historyBox = host.querySelector('[data-skill-history]');
      const clearButton = host.querySelector('[data-skill-clear]');
      const contentBox = host.querySelector('[data-skill-content]');
      const titleNode = host.querySelector('#reading-task-title');
      const audioButton = host.querySelector('[data-skill-audio]');
      const guard = () => host.isConnected;

      function renderInventory() {
        if (!guard()) return;
        inventoryBox.innerHTML = `
          <div class="skill-inventory__row">
            <span class="chip chip--soft">${icon('book-open')} ${tasks.length} passage${tasks.length === 1 ? '' : 's'}</span>
            <span class="chip chip--soft">${icon('target')} ${tasks.reduce((sum, item) => sum + item.questions.length, 0)} questions</span>
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
          .filter((attempt) => attempt.skill === 'reading')
          .slice(-5)
          .reverse();
        clearButton.hidden = entries.length === 0;
        if (!entries.length) {
          historyBox.innerHTML = '<p class="skill-history__empty">No reading checks saved yet.</p>';
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
                      <strong>${escapeHtml(entry.correct)} of ${escapeHtml(entry.total)} correct</strong>
                      <small>${escapeHtml(formatDate(entry.date))}</small>
                    </span>
                  </li>`,
              )
              .join('')}
          </ul>`;
      }

      function renderTask() {
        if (!guard()) return;
        startedAt = Date.now();
        audioButton.disabled = !audioPlaybackSupported() || !task;
        if (!task) {
          titleNode.textContent = 'No passage available';
          contentBox.innerHTML = emptyState({
            iconName: 'book-open',
            title: 'No authored passage for this level',
            text: 'Choose another CEFR level.',
          });
          return;
        }

        titleNode.textContent = task.title;
        contentBox.innerHTML = `
          <div class="skill-task-meta">
            ${levelBadge(task.level)}
            <span class="chip chip--soft">${escapeHtml(task.topic)}</span>
            <span class="chip chip--soft">${icon('clock')} ${escapeHtml(task.minutes)} min</span>
          </div>
          <p class="skill-focus"><strong>Focus:</strong> ${escapeHtml(task.focus)}</p>
          <div class="skill-passage" lang="de">
            ${task.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
          </div>
          <div class="skill-support">
            <details class="skill-details">
              <summary>${icon('languages')} Glossary</summary>
              <ul role="list">
                ${task.glossary
                  .map(
                    (item) =>
                      `<li><strong lang="de">${escapeHtml(item.de)}</strong> — ${escapeHtml(item.en)}</li>`,
                  )
                  .join('')}
              </ul>
            </details>
            <details class="skill-details" data-skill-translation>
              <summary>${icon('globe')} English translation</summary>
              <div class="skill-translation">
                ${task.translation.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
              </div>
            </details>
          </div>
          <div class="skill-questions" data-skill-questions>
            ${task.questions.map((question) => drillBody(question)).join('')}
          </div>
          <div class="skill-actions" role="group" aria-label="Reading answer controls">
            <button class="btn btn--primary" type="button" data-skill-check>${icon('check')} Check answers</button>
            <button class="btn btn--ghost" type="button" data-skill-retry hidden>${icon('rotate')} Try again</button>
          </div>
          <div class="skill-result" data-skill-result hidden aria-live="polite"></div>`;

        bindDrillInteractions(contentBox);
        contentBox.querySelector('[data-skill-check]')?.addEventListener('click', checkAnswers);
        contentBox.querySelector('[data-skill-retry]')?.addEventListener('click', renderTask);
      }

      function checkAnswers() {
        if (!task || !guard()) return;
        const elements = [...contentBox.querySelectorAll('[data-skill-questions] [data-question]')];
        if (elements.some((element) => !element.querySelector('input[type="radio"]:checked'))) {
          toast('Answer every question before checking.', { type: 'warning' });
          return;
        }

        let correct = 0;
        const details = task.questions.map((question, index) => {
          const element = elements[index];
          const passed = evaluateDrill(question, element);
          if (passed) correct += 1;
          element.classList.add(passed ? 'is-correct' : 'is-wrong');
          const feedback = element.querySelector('[data-feedback]');
          if (feedback) {
            feedback.innerHTML = drillFeedbackHtml(question, passed);
            feedback.hidden = false;
          }
          return {
            questionId: question.id,
            type: 'mcq',
            correct: passed,
            given: givenAnswer(question, element),
            expected: answerText(question),
            focus: question.focus,
          };
        });

        const minutes = Math.max(0, Math.round((Date.now() - startedAt) / 60000));
        recordSkillAttempt({
          skill: 'reading',
          level: task.level,
          taskId: task.id,
          mode: 'comprehension',
          correct,
          total: task.questions.length,
          details,
          minutes,
        });

        const missed = details.filter((detail) => !detail.correct);
        const resultBox = contentBox.querySelector('[data-skill-result]');
        if (resultBox) {
          resultBox.hidden = false;
          resultBox.innerHTML = `
            <div class="skill-result__head">
              <h3>Comprehension result</h3>
              <span class="chip ${correct === details.length ? 'chip--success' : 'chip--brand'}">
                ${correct} of ${details.length} correct
              </span>
            </div>
            <p>Each answer now shows the authored explanation. This is a practice check, not an exam grade. Retakes are unlimited.</p>
            ${
              missed.length
                ? `<p class="skill-result__focus"><strong>Review focus:</strong> ${escapeHtml(
                    missed.map((detail) => detail.focus).filter(Boolean).join(' · '),
                  )}</p>`
                : ''
            }`;
        }
        const checkButton = contentBox.querySelector('[data-skill-check]');
        const retryButton = contentBox.querySelector('[data-skill-retry]');
        if (checkButton) checkButton.disabled = true;
        if (retryButton) retryButton.hidden = false;
        renderHistory();
        toast('Reading check saved to this device.', { type: 'success' });
      }

      levelSelect?.addEventListener('change', () => {
        level = levelSelect.value;
        tasks = getSkillTasks({ skill: 'reading', level });
        task = tasks[0] || null;
        renderTaskOptions();
        renderInventory();
        renderTask();
      });

      taskSelect?.addEventListener('change', () => {
        task = tasks.find((item) => item.id === taskSelect.value) || tasks[0] || null;
        renderTask();
      });

      audioButton?.addEventListener('click', () => {
        if (!task) return;
        stopSpeaking();
        speakGermanLines(task.lines, { rate: 0.95 });
      });

      clearButton?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear reading history?',
          message: 'Only saved reading checks are removed. Lessons, writing drafts and other skill results stay.',
          confirmLabel: 'Clear history',
          danger: true,
          onConfirm: () => {
            clearSkillHistory('reading');
            renderHistory();
            toast('Reading history cleared.', { type: 'success' });
          },
        });
      });

      renderTaskOptions();
      renderInventory();
      renderHistory();
      renderTask();
    },

    destroy() {
      stopSpeaking();
    },
  };
}
