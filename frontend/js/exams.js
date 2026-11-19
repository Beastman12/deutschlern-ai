/**
 * Mock Examinations — timed, local, A1–C2 practice papers.
 *
 * Papers are sampled from the authored exercise bank and scored with the pure
 * functions in exam.js. A result reports section and skill performance only:
 * correct answers and explanations are never shown here, so a mock paper can
 * never be used as an answer key. Writing and speaking stay unscored prompts
 * until a real AI service exists.
 */
import { curriculum, getExercises } from './content.js';
import {
  EXAM_TOTAL_QUESTIONS,
  PASS_PERCENT,
  buildExam,
  getExamDuration,
  getExamSections,
  hasAnswer,
  readinessReport,
  scoreExam,
  selectPrompt,
} from './exam.js';
import {
  abandonExamAttempt,
  completeExamAttempt,
  getExamActive,
  getExamAttempts,
  getState,
  startExamAttempt,
  updateExamAnswers,
} from './store.js';
import { bindDrillInteractions, drillBody } from './practice.js';
import { confirmDialog, escapeHtml, icon, levelBadge, ring, scrollToView, toast } from './ui.js';

const STATUS_LABELS = {
  ready: { label: 'Ready', tone: 'success' },
  building: { label: 'Building', tone: 'brand' },
  'needs-work': { label: 'Needs work', tone: 'warning' },
  'no-exam-evidence': { label: 'Not yet assessed', tone: 'soft' },
};

function bestScore(attempts) {
  const submitted = attempts.filter((attempt) => attempt.status === 'submitted' && Number.isFinite(attempt.percent));
  return submitted.length ? Math.max(...submitted.map((attempt) => attempt.percent)) : null;
}

function formatClock(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Reserved slot inside an active paper's `answers` map. store.js whitelists
 * examActive fields but normalizes answers values, so this survives a save or
 * reload without changing store.js. A full-duration fallback covers papers
 * saved before remaining-time tracking existed.
 */
export const EXAM_REMAINING_KEY = '__remainingMs';

export function remainingMsFromActive(active) {
  const full = Math.max(1, Number(active?.durationMinutes) || 30) * 60_000;
  const stored = active?.answers?.[EXAM_REMAINING_KEY];
  if (stored === undefined || stored === null || stored === '') return full;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 ? Math.min(full, value) : full;
}

function scoreBar(label, value, assessed = true, suffix = '') {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const tone = !assessed ? 'soft' : percent >= 80 ? 'success' : percent >= PASS_PERCENT ? 'brand' : 'warning';
  return `
    <div class="exam-score-row">
      <div class="exam-score-row__label">
        <strong>${escapeHtml(label)}</strong>
        <span>${assessed ? `${percent}%${suffix}` : 'Not assessed'}</span>
      </div>
      <div class="progress exam-score-row__bar" role="progressbar" aria-label="${escapeHtml(label)}"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${assessed ? percent : 0}">
        <span class="progress__bar progress__bar--${tone}" style="width:${assessed ? percent : 0}%"></span>
      </div>
    </div>`;
}

/** Collect a stored answer straight from the rendered question element. */
function examGivenAnswer(question, element) {
  if (question.type === 'mcq') {
    const selected = element.querySelector('input[type="radio"]:checked');
    return selected ? Number(selected.value) : '';
  }
  if (question.type === 'gap') return element.querySelector('[data-answer-input]')?.value || '';
  const answer = element.querySelector('[data-order-answer]');
  return [...(answer?.querySelectorAll('[data-token]') || [])].map((button) => Number(button.dataset.token));
}

/** Put a resumed answer back into its question element. */
function restoreAnswer(question, element, value) {
  if (value === undefined || value === null || value === '') return;
  if (question.type === 'mcq') {
    const radio = element.querySelector(`input[type="radio"][value="${CSS.escape(String(value))}"]`);
    if (radio) radio.checked = true;
    return;
  }
  if (question.type === 'gap') {
    const input = element.querySelector('[data-answer-input]');
    if (input) input.value = String(value);
    return;
  }
  if (!Array.isArray(value) || !value.length) return;
  const answer = element.querySelector('[data-order-answer]');
  const tokens = element.querySelector('[data-order-tokens]');
  if (!answer || !tokens) return;
  const byIndex = new Map([...tokens.querySelectorAll('[data-token]')].map((button) => [Number(button.dataset.token), button]));
  value.forEach((index) => {
    const button = byIndex.get(Number(index));
    if (button) answer.append(button);
  });
  if (answer.querySelector('[data-token]')) answer.querySelector('.order-builder__placeholder')?.remove();
}

export function renderExams(ctx) {
  const query = ctx.query || {};
  const levels = curriculum.levels;
  const bank = getExercises();
  const prompts = curriculum.prompts;
  const sections = getExamSections();
  const initialLevel = levels.some((level) => level.id === query.level)
    ? query.level
    : ctx.stats?.currentLevel?.id || 'a1';

  // A live paper counts down with performance.now() deltas, accrued only while
  // this screen is mounted. System clock changes and time spent elsewhere can
  // neither force-submit nor instantly expire a resumed paper.
  let timer = null;
  let submitted = false;
  let timedLevel = null;
  let remainingMs = 0;
  let lastTickAt = 0;
  let latestAnswers = {};

  const clearTimer = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const advanceClock = () => {
    const now = performance.now();
    remainingMs = Math.max(0, remainingMs - Math.max(0, now - lastTickAt));
    lastTickAt = now;
    return remainingMs;
  };

  const persistLiveExam = () => {
    if (!timedLevel) return;
    updateExamAnswers(timedLevel, { ...latestAnswers, [EXAM_REMAINING_KEY]: Math.ceil(remainingMs) });
  };

  const stopClock = () => {
    advanceClock();
    clearTimer();
    persistLiveExam();
    timedLevel = null;
  };

  const html = `
    <div class="page page--exams">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Mock Examinations</p>
          <h1 class="page-title">Exam conditions, without the mystery.</h1>
          <p class="page-sub">Sit a timed ${EXAM_TOTAL_QUESTIONS}-question paper at your level. Answers are scored locally and results show section and skill performance — never a hidden answer key.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/exercises">Practice exercises ${icon('arrow-right')}</a>
        </div>
      </header>
      <div data-exam-root></div>
    </div>`;

  return {
    title: 'Mock Examinations',
    crumbs: [{ label: 'Mock Examinations' }],
    html,
    mount(root) {
      const host = root.querySelector('[data-exam-root]');
      if (!host) return;

      let selectedLevel = initialLevel;

      const readiness = (level) =>
        readinessReport({
          level,
          bank,
          prompts,
          deck: curriculum.vocabularyDeck,
          progress: getState().progress,
        });

      const readinessPanel = (level) => {
        const report = readiness(level);
        const status = STATUS_LABELS[report.status] || STATUS_LABELS['no-exam-evidence'];
        const skillRows = Object.entries(report.skills)
          .map(([skill, info]) => scoreBar(info.label, info.percent, info.assessed))
          .join('');
        return `
          <section class="card exam-readiness" aria-labelledby="exam-readiness-title">
            <header class="card__head card__head--row">
              <div>
                <p class="eyebrow">Readiness report</p>
                <h2 class="card__title" id="exam-readiness-title">
                  ${escapeHtml(levels.find((item) => item.id === level)?.code || level)} · ${escapeHtml(status.label)}
                  ${report.overall !== null ? `<span class="card__count">${report.overall}% average</span>` : ''}
                </h2>
              </div>
              <span class="chip chip--${status.tone}">${icon(report.status === 'ready' ? 'award' : 'info')} ${escapeHtml(status.label)}</span>
            </header>
            <p class="exam-readiness__note">${escapeHtml(report.note)}</p>
            <div class="exam-readiness__grid">
              <div class="exam-readiness__scores">${skillRows}</div>
              <div class="exam-readiness__evidence">
                <h3>Supporting evidence</h3>
                <ul role="list">
                  <li><span>Lessons completed</span><strong>${report.evidence.lessons.completed}/${report.evidence.lessons.total}</strong></li>
                  <li><span>Grammar drill accuracy</span><strong>${report.evidence.drills.accuracy === null ? '—' : report.evidence.drills.accuracy + '%'}</strong></li>
                  <li><span>Flashcards learned</span><strong>${report.evidence.flashcards.learned}/${report.evidence.flashcards.total}</strong></li>
                  <li><span>Writing prompts available</span><strong>${report.evidence.prompts.writing}</strong></li>
                  <li><span>Speaking prompts available</span><strong>${report.evidence.prompts.speaking}</strong></li>
                </ul>
                <div class="callout callout--info">
                  <span class="callout__icon">${icon('info')}</span>
                  <p>Writing and speaking are <strong>not assessed</strong>. No score is invented for them until real AI feedback exists.</p>
                </div>
              </div>
            </div>
          </section>`;
      };

      const recentAttempts = () => {
        const attempts = getExamAttempts().slice(-6).reverse();
        if (!attempts.length) {
          return `
            <section class="card exam-history">
              <header class="card__head"><p class="eyebrow">Local history</p><h2 class="card__title">Recent papers</h2></header>
              <div class="exercise-mini-empty">${icon('clock')}<p>Submit your first mock exam and it will be recorded here.</p></div>
            </section>`;
        }
        return `
          <section class="card exam-history">
            <header class="card__head"><p class="eyebrow">Local history</p><h2 class="card__title">Recent papers</h2></header>
            <ul class="exercise-attempts" role="list">
              ${attempts
                .map((attempt) => {
                  const level = levels.find((item) => item.id === attempt.level);
                  return `
                    <li class="exercise-attempts__item">
                      <span class="exercise-attempts__score ${attempt.percent >= PASS_PERCENT ? 'is-strong' : ''}">${attempt.percent}%</span>
                      <span class="exercise-attempts__body">
                        <strong>${attempt.passed ? 'Passed' : 'Not passed'} · ${attempt.status === 'expired' ? 'Time expired' : 'Submitted'}</strong>
                        <small>${level ? level.code + ' · ' : ''}${attempt.correct}/${attempt.total} correct · ${new Date(attempt.completedAt).toLocaleDateString()}</small>
                      </span>
                    </li>`;
                })
                .join('')}
            </ul>
          </section>`;
      };

      const renderList = () => {
        if (timedLevel) stopClock();
        clearTimer();
        submitted = false;
        const active = getExamActive();
        const cards = levels
          .map((level) => {
            const attempts = getExamAttempts(level.id);
            const best = bestScore(attempts);
            const report = readiness(level.id);
            const status = STATUS_LABELS[report.status] || STATUS_LABELS['no-exam-evidence'];
            const hasActive = Boolean(active[level.id]);
            return `
              <article class="exam-level-card tone-${escapeHtml(level.color)} ${selectedLevel === level.id ? 'is-selected' : ''}"
                data-exam-level="${escapeHtml(level.id)}">
                <span class="exam-level-card__head">
                  ${levelBadge(level, { size: 'sm' })}
                  <span class="chip chip--${status.tone}">${escapeHtml(status.label)}</span>
                </span>
                <strong class="exam-level-card__title">${escapeHtml(level.name)}</strong>
                <span class="exam-level-card__facts">
                  <span>${icon('clock')} ${getExamDuration(level.id)} min</span>
                  <span>${icon('layers')} ${EXAM_TOTAL_QUESTIONS} questions</span>
                </span>
                <span class="exam-level-card__stats">
                  <span><strong>${best === null ? '—' : best + '%'}</strong><small>best paper</small></span>
                  <span><strong>${attempts.length}</strong><small>${attempts.length === 1 ? 'attempt' : 'attempts'}</small></span>
                </span>
                <button class="btn btn--ghost btn--sm btn--block" type="button"
                  data-exam-level-select="${escapeHtml(level.id)}">
                  ${icon('chart')} View report
                </button>
                <button class="btn ${hasActive ? 'btn--primary' : 'btn--soft'} btn--sm btn--block" type="button"
                  data-exam-start="${escapeHtml(level.id)}">
                  ${icon(hasActive ? 'play' : 'trophy')} ${hasActive ? 'Resume paper' : 'Start paper'}
                </button>
                ${hasActive ? '<small class="exam-level-card__resume">An unfinished paper is saved on this device.</small>' : ''}
              </article>`;
          })
          .join('');

        host.innerHTML = `
          <div class="notice notice--warning" role="note">
            <span class="notice__icon">${icon('shield')}</span>
            <div>
              <strong>What this paper can and cannot tell you.</strong>
              <p>It scores reading, listening, vocabulary and grammar from authored questions. It is inspired by the CEFR, not an official certificate. Writing and speaking are provided as unscored self-practice prompts, and no correct answers are revealed after submitting.</p>
            </div>
            <a class="btn btn--ghost btn--sm" href="#/roadmap">Roadmap ${icon('arrow-right')}</a>
          </div>

          <section class="card exam-levels" aria-labelledby="exam-levels-title">
            <header class="card__head">
              <p class="eyebrow">Choose a level</p>
              <h2 class="card__title" id="exam-levels-title">A1 to C2</h2>
              <p class="card__sub">Select a card to inspect its readiness report, or start a paper directly. A running paper survives a reload.</p>
            </header>
            <div class="exam-level-grid">${cards}</div>
          </section>

          ${readinessPanel(selectedLevel)}
          ${recentAttempts()}`;

        const selectLevel = (levelId, card) => {
          selectedLevel = levelId;
          host.querySelectorAll('[data-exam-level]').forEach((item) => {
            item.classList.toggle('is-selected', item === card);
          });
          const oldPanel = host.querySelector('.exam-readiness');
          const holder = document.createElement('div');
          holder.innerHTML = readinessPanel(selectedLevel);
          oldPanel?.replaceWith(holder.firstElementChild);
        };

        host.querySelectorAll('[data-exam-level]').forEach((card) => {
          card.addEventListener('click', () => selectLevel(card.dataset.examLevel, card));
          card.querySelector('[data-exam-level-select]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            selectLevel(card.dataset.examLevel, card);
          });
        });

        host.querySelectorAll('[data-exam-start]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            startPaper(button.dataset.examStart);
          });
        });
      };

      const collectAnswers = (exam, container) => {
        const answers = {};
        exam.questions.forEach((question) => {
          const element = container.querySelector(`[data-question="${CSS.escape(question.id)}"]`);
          if (element) answers[question.id] = examGivenAnswer(question, element);
        });
        return answers;
      };

      const submitPaper = (exam, container, level, status) => {
        if (submitted) return;
        submitted = true;
        clearTimer();
        timedLevel = null;
        const answers = collectAnswers(exam, container);
        const result = scoreExam({ questions: exam.questions, answers });
        completeExamAttempt({ level, result, status });
        renderResult(level, exam, result, status);
      };

      const renderTaking = (level, exam, savedAnswers = {}) => {
        clearTimer();
        submitted = false;
        const levelInfo = levels.find((item) => item.id === level);
        const active = getExamActive(level);
        remainingMs = remainingMsFromActive(active);
        lastTickAt = performance.now();
        timedLevel = level;
        latestAnswers = { ...savedAnswers };
        delete latestAnswers[EXAM_REMAINING_KEY];
        const groupMarkup = exam.sections
          .map((section, sectionIndex) => {
            const questions = exam.questions.filter((question) => question.examSection === section.id);
            return `
              <section class="exam-section" aria-labelledby="exam-section-${escapeHtml(section.id)}">
                <header class="exam-section__head">
                  <span class="exam-section__icon">${icon(section.icon)}</span>
                  <div>
                    <p class="eyebrow">Section ${sectionIndex + 1} of ${exam.sections.length}</p>
                    <h2 id="exam-section-${escapeHtml(section.id)}">${escapeHtml(section.label)}</h2>
                  </div>
                  <span class="chip chip--soft">${questions.length} questions</span>
                </header>
                <div class="exam-section__questions">
                  ${questions
                    .map((question, questionIndex) => {
                      const number = exam.questions.indexOf(question) + 1;
                      return `
                        <article class="exam-question" data-exam-question="${escapeHtml(question.id)}">
                          <div class="exam-question__head">
                            <span class="exam-question__number">${number}</span>
                            <span class="exam-question__label">Question ${number} of ${exam.questions.length}</span>
                            <span class="exam-question__saved" data-saved="${escapeHtml(question.id)}"></span>
                          </div>
                          ${drillBody(question)}
                        </article>`;
                    })
                    .join('')}
                </div>
              </section>`;
          })
          .join('');

        host.innerHTML = `
          <div class="exam-taking">
            <div class="exam-taking__bar" role="status">
              <span class="exam-taking__level">${levelBadge(levelInfo, { size: 'sm' })}</span>
              <span class="exam-taking__title"><strong>${escapeHtml(levelInfo?.code || level)} mock paper</strong><small>${EXAM_TOTAL_QUESTIONS} questions · ${active.durationMinutes} minutes</small></span>
              <span class="exam-clock" data-exam-clock aria-label="Time remaining">${formatClock(remainingMs)}</span>
              <span class="exam-taking__answered" data-exam-answered aria-live="polite"></span>
              <button class="btn btn--ghost btn--sm" type="button" data-exam-exit>${icon('log-out')} Save &amp; exit</button>
              <button class="btn btn--primary btn--sm" type="button" data-exam-submit>${icon('check')} Submit paper</button>
            </div>
            <div class="notice notice--info" role="note">
              <span class="notice__icon">${icon('info')}</span>
              <div>
                <strong>Answer at your own pace, but watch the clock.</strong>
                <p>Answers save as you go and the paper resumes after a reload. When time runs out it submits automatically. Results show scores only — never the correct answers.</p>
              </div>
            </div>
            ${groupMarkup}
          </div>`;

        const container = host.querySelector('.exam-taking');
        bindDrillInteractions(container);

        exam.questions.forEach((question) => {
          const element = container.querySelector(`[data-question="${CSS.escape(question.id)}"]`);
          if (!element) return;
          restoreAnswer(question, element, savedAnswers[question.id]);
        });

        // The live answer map is shared with the persistence helpers so every
        // save includes the current monotonic remaining time.
        const answers = latestAnswers;
        const answeredNode = container.querySelector('[data-exam-answered]');

        const refreshProgress = () => {
          const count = exam.questions.filter((question) => hasAnswer(question, answers[question.id])).length;
          if (answeredNode) answeredNode.textContent = `${count}/${exam.questions.length} answered`;
          exam.questions.forEach((question) => {
            const label = container.querySelector(`[data-saved="${CSS.escape(question.id)}"]`);
            if (label) {
              const answered = hasAnswer(question, answers[question.id]);
              label.textContent = answered ? 'Saved' : '';
              label.classList.toggle('is-saved', answered);
            }
          });
        };

        container.addEventListener('change', (event) => {
          const element = event.target.closest('[data-question]');
          if (!element) return;
          const id = element.dataset.question;
          const question = exam.questions.find((item) => item.id === id);
          if (!question) return;
          answers[id] = examGivenAnswer(question, element);
          persistLiveExam();
          refreshProgress();
        });
        container.addEventListener('input', (event) => {
          const element = event.target.closest('[data-question]');
          if (!element || event.target.type === 'radio') return;
          const id = element.dataset.question;
          const question = exam.questions.find((item) => item.id === id);
          if (!question) return;
          answers[id] = examGivenAnswer(question, element);
          persistLiveExam();
          refreshProgress();
        });
        container.addEventListener('order-change', (event) => {
          const element = event.target.closest('[data-question]');
          if (!element) return;
          const id = element.dataset.question;
          const question = exam.questions.find((item) => item.id === id);
          if (!question) return;
          answers[id] = examGivenAnswer(question, element);
          persistLiveExam();
          refreshProgress();
        });

        container.querySelector('[data-exam-submit]')?.addEventListener('click', () => {
          confirmDialog({
            title: 'Submit this paper?',
            message: 'You will see your section and skill scores, but no correct answers. You cannot change answers after submitting.',
            confirmLabel: 'Submit paper',
            onConfirm() {
              submitPaper(exam, container, level, 'submitted');
            },
          });
        });
        container.querySelector('[data-exam-exit]')?.addEventListener('click', () => {
          Object.assign(answers, collectAnswers(exam, container));
          stopClock();
          toast('Paper saved. Pick it up again any time on this device.', { type: 'info' });
          renderList();
        });

        const clockNode = container.querySelector('[data-exam-clock]');
        const tick = () => {
          if (!document.body.contains(host)) {
            stopClock();
            return;
          }
          const remaining = advanceClock();
          if (clockNode) {
            clockNode.textContent = formatClock(remaining);
            clockNode.classList.toggle('is-urgent', remaining <= 5 * 60 * 1000);
          }
          if (remaining <= 0) {
            submitPaper(exam, container, level, 'expired');
            return;
          }
        };
        timer = window.setInterval(tick, 1000);
        tick();
        refreshProgress();
        scrollToView(container);
      };

      const renderResult = (level, exam, result, status) => {
        const levelInfo = levels.find((item) => item.id === level);
        const sectionRows = exam.sections
          .map((section) => scoreBar(section.label, result.sections[section.id]?.percent, true, ` · ${result.sections[section.id]?.correct || 0}/${result.sections[section.id]?.total || 0}`))
          .join('');
        const skillRows = Object.entries(result.skills)
          .map(([skill, info]) => scoreBar(skill === 'vocabulary' ? 'Vocabulary' : skill.charAt(0).toUpperCase() + skill.slice(1), info.percent))
          .join('');

        const assessedSkills = Object.entries(result.skills)
          .filter(([, info]) => Number.isFinite(info.percent))
          .sort((a, b) => a[1].percent - b[1].percent);
        const weakest = assessedSkills[0]?.[0] || 'reading';

        const promptCard = (skill) => {
          const prompt = selectPrompt({ prompts, level, skill, seed: exam.seed });
          if (!prompt) return '';
          const isSpeaking = skill === 'speaking';
          return `
            <article class="exam-prompt">
              <header class="exam-prompt__head">
                <span class="exam-prompt__icon">${icon(isSpeaking ? 'mic' : 'pen')}</span>
                <div>
                  <p class="eyebrow">Unscored self-practice</p>
                  <h3>${isSpeaking ? 'Speaking prompt' : 'Writing prompt'}</h3>
                </div>
                <span class="chip chip--soft">No AI feedback yet</span>
              </header>
              <p class="exam-prompt__text" lang="de">${escapeHtml(prompt.prompt)}</p>
              ${
                isSpeaking && prompt.model?.de
                  ? `<details class="exam-prompt__model"><summary>Show a model answer</summary><p lang="de">${escapeHtml(prompt.model.de)}</p></details>`
                  : ''
              }
              ${
                !isSpeaking && prompt.checklist?.length
                  ? `<ul class="check-list" role="list">${prompt.checklist.map((item) => `<li>${icon('check')}<span>${escapeHtml(item)}</span></li>`).join('')}</ul>`
                  : ''
              }
              <p class="exam-prompt__note">Practise this on your own. It is not included in your paper score and no AI feedback is available yet.</p>
            </article>`;
        };

        host.innerHTML = `
          <div class="exam-result">
            <section class="card exam-result__hero" aria-labelledby="exam-result-title">
              <div class="exam-result__score">
                ${ring(result.percent, { size: 148, label: `${result.percent} percent`, tone: result.passed ? 'success' : 'brand' })}
                <span class="chip chip--${result.passed ? 'success' : 'warning'}">
                  ${icon(result.passed ? 'award' : 'rotate')} ${result.passed ? 'Passed' : 'Not passed'}
                </span>
              </div>
              <div class="exam-result__summary">
                <p class="eyebrow">${escapeHtml(levelInfo?.code || level)} mock paper · ${status === 'expired' ? 'time expired' : 'submitted'}</p>
                <h2 id="exam-result-title">${result.correct} of ${result.total} correct · ${result.percent}%</h2>
                <p>${result.answered} of ${result.total} questions answered. The ${PASS_PERCENT}% mark is used for this practice report; it is not an official CEFR result.</p>
                <div class="exam-result__actions">
                  <button class="btn btn--primary" type="button" data-exam-retake>${icon('rotate')} Retake at ${escapeHtml(levelInfo?.code || level)}</button>
                  <a class="btn btn--soft" href="#/exercises?level=${escapeHtml(level)}&amp;skill=${escapeHtml(weakest)}">Practise ${escapeHtml(weakest)} ${icon('arrow-right')}</a>
                  <button class="btn btn--ghost" type="button" data-exam-back>All papers</button>
                </div>
              </div>
            </section>

            <div class="notice notice--warning" role="note">
              <span class="notice__icon">${icon('shield')}</span>
              <div>
                <strong>No answer key is shown.</strong>
                <p>This report deliberately hides correct answers and explanations. To review the underlying content, open the relevant lesson or run a Practice Exercises session where feedback is part of learning.</p>
              </div>
            </div>

            <div class="exam-result__grids">
              <section class="card" aria-labelledby="exam-sections-title">
                <header class="card__head"><p class="eyebrow">Paper breakdown</p><h2 class="card__title" id="exam-sections-title">By section</h2></header>
                <div class="exam-score-list">${sectionRows}</div>
              </section>
              <section class="card" aria-labelledby="exam-skills-title">
                <header class="card__head"><p class="eyebrow">Skill view</p><h2 class="card__title" id="exam-skills-title">By skill</h2></header>
                <div class="exam-score-list">${skillRows}</div>
              </section>
            </div>

            <section class="exam-prompts" aria-labelledby="exam-prompts-title">
              <header class="exam-prompts__head">
                <p class="eyebrow">Beyond the scored paper</p>
                <h2 class="card__title" id="exam-prompts-title">Writing &amp; speaking practice</h2>
                <p>These are authored prompts from your lessons. They are shown as self-practice only — no score, no invented AI feedback.</p>
              </header>
              <div class="exam-prompts__grid">${promptCard('writing')}${promptCard('speaking')}</div>
            </section>
          </div>`;

        host.querySelector('[data-exam-retake]')?.addEventListener('click', () => startPaper(level));
        host.querySelector('[data-exam-back]')?.addEventListener('click', renderList);
        scrollToView(host);
      };

      const startPaper = (level) => {
        const active = getExamActive(level);
        if (active) {
          try {
            const exam = buildExam({ bank, level, seed: active.id });
            renderTaking(level, exam, active.answers);
          } catch (error) {
            console.error('[exams] Could not rebuild a saved paper.', error);
            abandonExamAttempt(level);
            toast('That saved paper could not be restored. Please start a new one.', { type: 'error' });
            renderList();
          }
          return;
        }
        try {
          const seed = `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const exam = buildExam({ bank, level, seed });
          startExamAttempt({
            level,
            id: seed,
            durationMinutes: getExamDuration(level),
            questionIds: exam.questions.map((question) => question.id),
          });
          renderTaking(level, exam, {});
        } catch (error) {
          console.error('[exams] Could not build a paper.', error);
          toast('This paper could not be built. Please try again.', { type: 'error' });
        }
      };

      renderList();
    },

    destroy() {
      // app.js calls this before replacing the DOM: pause and save the live
      // paper so Resume restores its remaining time, not a stale deadline.
      if (timedLevel) stopClock();
      clearTimer();
    },
  };
}
