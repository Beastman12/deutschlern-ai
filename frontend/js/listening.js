/**
 * Milestone 8 — graded listening practice.
 *
 * Audio is real browser German speech synthesis over the authored script.
 * Comprehension answers are checked against authored keys; dictation is a
 * deterministic exact-word comparison. There is no generated audio or score.
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
import { normalizeWritingText } from './writing-feedback.js';
import { audioPlaybackSupported } from './speech.js';
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

export function renderListening() {
  let level = 'a1';
  let tasks = getSkillTasks({ skill: 'listening', level });
  let task = tasks[0] || null;
  let startedAt = Date.now();

  const html = `
    <div class="page page--skill" data-skill-view="listening">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practise · Milestone 8</p>
          <h1 class="page-title">Listening Practice</h1>
          <p class="page-sub">Authored A1–C2 scripts played by your browser's German voice, with comprehension questions and exact-word dictation.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/roadmap">${icon('compass')} Roadmap</a>
        </div>
      </header>

      <div class="skill-layout">
        <aside class="card skill-controls" aria-labelledby="listening-controls-title">
          <header class="card__head">
            <p class="eyebrow">Choose a script</p>
            <h2 class="card__title" id="listening-controls-title">Listening set</h2>
          </header>

          <div class="field">
            <label for="listening-level">CEFR level</label>
            <span class="select-wrap">
              <select class="select" id="listening-level" data-skill-level>${levelOptions(level)}</select>
              ${icon('chevron-down')}
            </span>
          </div>

          <div class="field">
            <label for="listening-task">Script</label>
            <span class="select-wrap">
              <select class="select" id="listening-task" data-skill-task>${taskOptions(tasks, task?.id)}</select>
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

        <section class="card skill-main" aria-labelledby="listening-task-title">
          <div class="skill-main__head">
            <div>
              <p class="eyebrow">Audio script</p>
              <h2 class="card__title" id="listening-task-title">Open a script to begin</h2>
            </div>
            <div class="skill-audio-actions" role="group" aria-label="Audio playback controls">
              <button class="btn btn--primary btn--sm" type="button" data-listen-play disabled>${icon('play')} Play</button>
              <button class="btn btn--ghost btn--sm" type="button" data-listen-slow disabled>${icon('volume')} Slow</button>
              <button class="btn btn--ghost btn--sm" type="button" data-listen-stop hidden>${icon('x')} Stop</button>
            </div>
          </div>
          <div data-skill-content aria-live="polite"></div>
        </section>
      </div>
    </div>`;

  return {
    title: 'Listening Practice',
    crumbs: [{ label: 'Practise' }, { label: 'Listening Practice' }],
    html,

    mount(root) {
      const host = root.querySelector('[data-skill-view="listening"]');
      if (!host) return;

      const levelSelect = host.querySelector('[data-skill-level]');
      const taskSelect = host.querySelector('[data-skill-task]');
      const inventoryBox = host.querySelector('[data-skill-inventory]');
      const historyBox = host.querySelector('[data-skill-history]');
      const clearButton = host.querySelector('[data-skill-clear]');
      const contentBox = host.querySelector('[data-skill-content]');
      const titleNode = host.querySelector('#listening-task-title');
      const playButton = host.querySelector('[data-listen-play]');
      const slowButton = host.querySelector('[data-listen-slow]');
      const stopButton = host.querySelector('[data-listen-stop]');
      const guard = () => host.isConnected;
      let playing = false;

      function renderInventory() {
        if (!guard()) return;
        inventoryBox.innerHTML = `
          <div class="skill-inventory__row">
            <span class="chip chip--soft">${icon('headphones')} ${tasks.length} script${tasks.length === 1 ? '' : 's'}</span>
            <span class="chip chip--soft">${icon('pen')} ${tasks.reduce((sum, item) => sum + item.dictation.length, 0)} dictation lines</span>
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
          .filter((attempt) => attempt.skill === 'listening')
          .slice(-5)
          .reverse();
        clearButton.hidden = entries.length === 0;
        if (!entries.length) {
          historyBox.innerHTML = '<p class="skill-history__empty">No listening checks saved yet.</p>';
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

      function setPlaybackState(value) {
        playing = value;
        if (!guard()) return;
        stopButton.hidden = !playing;
        playButton.disabled = !audioPlaybackSupported() || !task || playing;
        slowButton.disabled = !audioPlaybackSupported() || !task || playing;
      }

      function play(rate) {
        if (!task || !audioPlaybackSupported() || playing) return;
        setPlaybackState(true);
        const started = speakGermanLines(task.lines, {
          rate,
          onEnd: () => setPlaybackState(false),
          onError: () => setPlaybackState(false),
        });
        if (!started) setPlaybackState(false);
      }

      function renderTask() {
        if (!guard()) return;
        stopSpeaking();
        setPlaybackState(false);
        startedAt = Date.now();
        if (!task) {
          titleNode.textContent = 'No script available';
          contentBox.innerHTML = emptyState({
            iconName: 'headphones',
            title: 'No authored script for this level',
            text: 'Choose another CEFR level.',
          });
          setPlaybackState(false);
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
          <div class="notice notice--info skill-notice" role="note">
            <span class="notice__icon">${icon('info')}</span>
            <div>
              <strong>Listen before revealing the transcript.</strong>
              <p>Audio uses your browser's German speech voice. If no voice is installed, the text below is still available.</p>
            </div>
          </div>
          <details class="skill-details" data-listen-transcript>
            <summary>${icon('book-open')} Show transcript and translation</summary>
            <div class="skill-transcript">
              ${task.lines
                .map(
                  (line, index) => `
                    <div class="skill-transcript__row">
                      <p lang="de">${escapeHtml(line)}</p>
                      <p lang="en">${escapeHtml(task.translation[index])}</p>
                    </div>`,
                )
                .join('')}
            </div>
            <ul class="skill-glossary" role="list">
              ${task.glossary
                .map(
                  (item) =>
                    `<li><strong lang="de">${escapeHtml(item.de)}</strong> — ${escapeHtml(item.en)}</li>`,
                )
                .join('')}
            </ul>
          </details>
          <div class="skill-dictation">
            <h3>Dictation</h3>
            <p class="field__hint">Type the lines you hear. Capitalisation and punctuation are ignored; spelling and word order must match.</p>
            ${task.dictation
              .map(
                (line) => `
                  <div class="field skill-dictation__field">
                    <label for="${escapeHtml(line.id)}">${escapeHtml(line.hint)}</label>
                    <input class="input" id="${escapeHtml(line.id)}" type="text" autocomplete="off" spellcheck="false"
                      lang="de" data-dictation="${escapeHtml(line.id)}" placeholder="Type the German line…" />
                  </div>`,
              )
              .join('')}
          </div>
          <div class="skill-questions" data-skill-questions>
            ${task.questions.map((question) => drillBody(question)).join('')}
          </div>
          <div class="skill-actions" role="group" aria-label="Listening answer controls">
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
        const questionElements = [...contentBox.querySelectorAll('[data-skill-questions] [data-question]')];
        const dictationInputs = [...contentBox.querySelectorAll('[data-dictation]')];
        if (
          questionElements.some((element) => !element.querySelector('input[type="radio"]:checked')) ||
          dictationInputs.some((input) => !input.value.trim())
        ) {
          toast('Answer every question and complete both dictation lines.', { type: 'warning' });
          return;
        }

        const details = [];
        let correct = 0;
        let comprehensionCorrect = 0;
        let dictationCorrect = 0;

        task.questions.forEach((question, index) => {
          const element = questionElements[index];
          const passed = evaluateDrill(question, element);
          if (passed) {
            correct += 1;
            comprehensionCorrect += 1;
          }
          element.classList.add(passed ? 'is-correct' : 'is-wrong');
          const feedback = element.querySelector('[data-feedback]');
          if (feedback) {
            feedback.innerHTML = drillFeedbackHtml(question, passed);
            feedback.hidden = false;
          }
          details.push({
            questionId: question.id,
            type: 'mcq',
            correct: passed,
            given: givenAnswer(question, element),
            expected: answerText(question),
            focus: question.focus,
          });
        });

        task.dictation.forEach((line) => {
          const input = dictationInputs.find((item) => item.dataset.dictation === line.id);
          const given = input?.value || '';
          const passed = normalizeWritingText(given) === normalizeWritingText(line.text);
          if (passed) {
            correct += 1;
            dictationCorrect += 1;
          }
          const field = input?.closest('.skill-dictation__field');
          field?.classList.add(passed ? 'is-correct' : 'is-wrong');
          let feedback = field?.querySelector('[data-dictation-feedback]');
          if (!feedback && field) {
            feedback = document.createElement('p');
            feedback.className = 'skill-dictation__feedback';
            feedback.setAttribute('data-dictation-feedback', '');
            feedback.setAttribute('role', 'status');
            field.append(feedback);
          }
          if (feedback) {
            feedback.innerHTML = passed
              ? `${icon('check')} Exact match.`
              : `${icon('info')} Expected: <span lang="de">${escapeHtml(line.text)}</span>`;
          }
          details.push({
            questionId: line.id,
            type: 'dictation',
            correct: passed,
            given,
            expected: line.text,
            focus: 'Exact-word dictation',
          });
        });

        const minutes = Math.max(0, Math.round((Date.now() - startedAt) / 60000));
        recordSkillAttempt({
          skill: 'listening',
          level: task.level,
          taskId: task.id,
          mode: 'comprehension',
          correct,
          total: details.length,
          details,
          minutes,
        });

        const resultBox = contentBox.querySelector('[data-skill-result]');
        if (resultBox) {
          resultBox.hidden = false;
          resultBox.innerHTML = `
            <div class="skill-result__head">
              <h3>Listening result</h3>
              <span class="chip ${correct === details.length ? 'chip--success' : 'chip--brand'}">
                ${correct} of ${details.length} correct
              </span>
            </div>
            <p>Comprehension: ${comprehensionCorrect} of ${task.questions.length}. Dictation: ${dictationCorrect} of ${
              task.dictation.length
            }.</p>
            <p>Explanations and exact dictation targets are shown inline. This is practice feedback, not an exam grade. Retakes are unlimited.</p>`;
        }
        const checkButton = contentBox.querySelector('[data-skill-check]');
        const retryButton = contentBox.querySelector('[data-skill-retry]');
        if (checkButton) checkButton.disabled = true;
        if (retryButton) retryButton.hidden = false;
        renderHistory();
        toast('Listening check saved to this device.', { type: 'success' });
      }

      levelSelect?.addEventListener('change', () => {
        level = levelSelect.value;
        tasks = getSkillTasks({ skill: 'listening', level });
        task = tasks[0] || null;
        renderTaskOptions();
        renderInventory();
        renderTask();
      });

      taskSelect?.addEventListener('change', () => {
        task = tasks.find((item) => item.id === taskSelect.value) || tasks[0] || null;
        renderTask();
      });

      playButton?.addEventListener('click', () => play(1));
      slowButton?.addEventListener('click', () => play(0.7));
      stopButton?.addEventListener('click', () => {
        stopSpeaking();
        setPlaybackState(false);
      });

      clearButton?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear listening history?',
          message: 'Only saved listening checks are removed. Lessons, writing drafts and other skill results stay.',
          confirmLabel: 'Clear history',
          danger: true,
          onConfirm: () => {
            clearSkillHistory('listening');
            renderHistory();
            toast('Listening history cleared.', { type: 'success' });
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
