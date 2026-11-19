/**
 * Practice Exercises — unlimited, instant-scored practice from authored content.
 *
 * Every question comes from the derived exercise bank: lesson practice,
 * lesson checks, listening scripts and grammar drills. Nothing is invented at
 * runtime. Filters and a seeded sampler choose a fresh set on demand, and
 * results feed a reusable, local mistake queue.
 */
import { curriculum, findExercise, getExercises } from './content.js';
import {
  clearPracticeMistakes,
  getPracticeAttempts,
  getPracticeMistakes,
  recordPracticeAttempt,
} from './store.js';
import { createDrillSession } from './practice.js';
import { confirmDialog, escapeHtml, icon, levelBadge, scrollToView, toast } from './ui.js';

const SKILLS = [
  { id: 'reading', label: 'Reading' },
  { id: 'listening', label: 'Listening' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'grammar', label: 'Grammar' },
];

const TYPES = [
  { id: 'mcq', label: 'Multiple choice' },
  { id: 'gap', label: 'Gap fill' },
  { id: 'order', label: 'Word order' },
];

const SOURCES = [
  { id: 'lesson-practice', label: 'Lesson practice' },
  { id: 'lesson-assessment', label: 'Lesson checks' },
  { id: 'lesson-listening', label: 'Listening scripts' },
  { id: 'grammar-drill', label: 'Grammar drills' },
];

const SIZES = [5, 8, 12, 16];

function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic but rotating sample so a retry is not the identical set. */
function seededSample(items, size, seed) {
  return [...items]
    .map((item) => ({ item, key: hashString(`${seed}:${item.id}`) }))
    .sort((a, b) => a.key - b.key || a.item.id.localeCompare(b.item.id))
    .slice(0, size)
    .map((entry) => entry.item);
}

function attemptAccuracy(attempts) {
  if (!attempts.length) return 0;
  const correct = attempts.reduce((sum, attempt) => sum + (Number(attempt.correct) || 0), 0);
  const total = attempts.reduce((sum, attempt) => sum + (Number(attempt.total) || 0), 0);
  return total ? Math.round((correct / total) * 100) : 0;
}

function chipGroup(name, label, options, active) {
  return `
    <div class="filter-group" role="group" aria-label="${escapeHtml(label)}">
      <span class="filter-group__label">${escapeHtml(label)}</span>
      <div class="filter-row">
        <button class="filter-chip ${active === 'all' ? 'is-active' : ''}" type="button"
          data-filter="${name}" data-value="all" aria-pressed="${active === 'all'}">All</button>
        ${options
          .map(
            (option) => `
              <button class="filter-chip ${active === option.id ? 'is-active' : ''}" type="button"
                data-filter="${name}" data-value="${escapeHtml(option.id)}" aria-pressed="${active === option.id}">
                ${escapeHtml(option.label)}
              </button>`,
          )
          .join('')}
      </div>
    </div>`;
}

export function renderExercises(ctx) {
  const query = ctx.query || {};
  const levels = curriculum.levels;
  const validLevel = (value) => levels.some((level) => level.id === value);
  const validSkill = (value) => SKILLS.some((skill) => skill.id === value);
  const validType = (value) => TYPES.some((type) => type.id === value);
  const validSource = (value) => SOURCES.some((source) => source.id === value);

  const initial = {
    level: validLevel(query.level) ? query.level : 'all',
    skill: validSkill(query.skill) ? query.skill : 'all',
    type: validType(query.type) ? query.type : 'all',
    source: validSource(query.source) ? query.source : 'all',
    size: SIZES.includes(Number(query.size)) ? Number(query.size) : 8,
  };

  const attempts = getPracticeAttempts();
  const mistakes = getPracticeMistakes();
  const accuracy = attemptAccuracy(attempts);
  const levelChips = levels.map((level) => ({ id: level.id, label: level.code }));

  const html = `
    <div class="page page--exercises">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practice Exercises</p>
          <h1 class="page-title">Any question, any time.</h1>
          <p class="page-sub">Build a set from ${curriculum.totals.exercises.toLocaleString()} authored questions drawn from your lessons, listening scripts and grammar drills. Check each answer instantly, then revisit anything you missed.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/exams">Mock exams ${icon('arrow-right')}</a>
        </div>
      </header>

      <div class="summary-strip" role="list" aria-label="Practice summary">
        <div class="summary-strip__item" role="listitem">${icon('layers')}<strong>${curriculum.totals.exercises.toLocaleString()}</strong><span>authored questions</span></div>
        <div class="summary-strip__item" role="listitem">${icon('target')}<strong data-ex-summary-accuracy>${accuracy}%</strong><span>session accuracy</span></div>
        <div class="summary-strip__item" role="listitem">${icon('zap')}<strong data-ex-summary-attempts>${attempts.length}</strong><span>sessions completed</span></div>
        <div class="summary-strip__item" role="listitem">${icon('rotate')}<strong data-ex-summary-mistakes>${mistakes.length}</strong><span>saved mistakes</span></div>
      </div>

      <div class="notice notice--info" role="note">
        <span class="notice__icon">${icon('shield')}</span>
        <div>
          <strong>Real content, honest scoring.</strong>
          <p>Questions are copied verbatim from the same lesson bodies and grammar drills you can read in class. No AI invents text here, and your results stay in this browser.</p>
        </div>
        <span class="chip chip--soft">M4</span>
      </div>

      <section class="card exercise-setup" aria-labelledby="exercise-setup-title">
        <header class="card__head">
          <p class="eyebrow">Build your set</p>
          <h2 class="card__title" id="exercise-setup-title">Choose what to practise</h2>
          <p class="card__sub">Deep links work too — for example <code>#/exercises?level=a1&amp;skill=grammar</code>.</p>
        </header>

        <div class="exercise-filters">
          ${chipGroup('level', 'Level', levelChips, initial.level)}
          ${chipGroup('skill', 'Skill', SKILLS, initial.skill)}
          ${chipGroup('type', 'Question type', TYPES, initial.type)}
          ${chipGroup('source', 'Source', SOURCES, initial.source)}
          <div class="filter-group" role="group" aria-label="Session size">
            <span class="filter-group__label">Session size</span>
            <div class="filter-row">
              ${SIZES.map(
                (size) => `
                  <button class="filter-chip ${size === initial.size ? 'is-active' : ''}" type="button"
                    data-filter="size" data-value="${size}" aria-pressed="${size === initial.size}">${size}</button>`,
              ).join('')}
            </div>
          </div>
        </div>

        <div class="exercise-setup__bar">
          <p class="exercise-setup__count" data-ex-count aria-live="polite"></p>
          <button class="btn btn--primary" type="button" data-ex-start>${icon('play')} Start session</button>
        </div>
      </section>

      <section class="card exercise-live" aria-labelledby="exercise-live-title">
        <header class="card__head">
          <p class="eyebrow">Your session</p>
          <h2 class="card__title" id="exercise-live-title">Answer, check, learn</h2>
        </header>
        <div data-session-mount>
          <div class="exercise-idle">
            <span class="exercise-idle__icon">${icon('zap')}</span>
            <strong>Ready when you are.</strong>
            <p>Pick your filters above, then start a session. Explanations appear after each answer.</p>
          </div>
        </div>
      </section>

      <div class="exercise-columns">
        <section class="card exercise-mistakes" aria-labelledby="exercise-mistakes-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Targeted retry</p>
              <h2 class="card__title" id="exercise-mistakes-title">Mistake review <span class="card__count" data-ex-mistake-count>${mistakes.length}</span></h2>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" data-ex-clear-mistakes ${mistakes.length ? '' : 'disabled'}>Clear</button>
          </header>
          <div data-mistakes-mount></div>
        </section>

        <section class="card exercise-history" aria-labelledby="exercise-history-title">
          <header class="card__head">
            <p class="eyebrow">Local history</p>
            <h2 class="card__title" id="exercise-history-title">Recent sessions</h2>
          </header>
          <div data-attempts-mount></div>
        </section>
      </div>
    </div>`;

  return {
    title: 'Practice Exercises',
    crumbs: [{ label: 'Practice Exercises' }],
    html,
    mount(root) {
      const filters = { ...initial };
      const countNode = root.querySelector('[data-ex-count]');
      const startButton = root.querySelector('[data-ex-start]');
      const sessionMount = root.querySelector('[data-session-mount]');
      const mistakesMount = root.querySelector('[data-mistakes-mount]');
      const attemptsMount = root.querySelector('[data-attempts-mount]');
      let sessionsRun = attempts.length;

      const pool = () =>
        getExercises({
          level: filters.level,
          skill: filters.skill,
          type: filters.type,
          sourceType: filters.source,
        });

      const labelFor = (kind, value) => {
        if (value === 'all') return 'all';
        if (kind === 'level') return levels.find((item) => item.id === value)?.code || value;
        const list = { skill: SKILLS, type: TYPES, source: SOURCES }[kind] || [];
        return list.find((item) => item.id === value)?.label || value;
      };

      const updateCount = () => {
        const size = pool().length;
        const take = Math.min(filters.size, size);
        if (countNode) {
          countNode.innerHTML = size
            ? `<strong>${size.toLocaleString()}</strong> questions match · ${labelFor('level', filters.level)} · ${labelFor('skill', filters.skill)} · ${labelFor('type', filters.type)}. A session will draw ${take}.`
            : 'No questions match those filters. Try widening your selection.';
        }
        if (startButton) startButton.disabled = size === 0;
      };

      const refreshSummary = () => {
        const currentAttempts = getPracticeAttempts();
        const currentMistakes = getPracticeMistakes();
        const setText = (selector, value) => {
          const node = root.querySelector(selector);
          if (node) node.textContent = value;
        };
        setText('[data-ex-summary-accuracy]', `${attemptAccuracy(currentAttempts)}%`);
        setText('[data-ex-summary-attempts]', String(currentAttempts.length));
        setText('[data-ex-summary-mistakes]', String(currentMistakes.length));
        setText('[data-ex-mistake-count]', String(currentMistakes.length));
        const clear = root.querySelector('[data-ex-clear-mistakes]');
        if (clear) clear.disabled = currentMistakes.length === 0;
        renderMistakes(currentMistakes);
        renderAttempts(currentAttempts);
      };

      const renderMistakes = (list) => {
        if (!mistakesMount) return;
        if (!list.length) {
          mistakesMount.innerHTML = `
            <div class="exercise-mini-empty">
              ${icon('check')}
              <p>Nothing saved. Any question you miss is queued here until you get it right.</p>
            </div>`;
          return;
        }
        mistakesMount.innerHTML = `
          <div class="mistake-review__list" role="list">
            ${list
              .slice(-12)
              .reverse()
              .map(
                (mistake) => `
                  <article class="mistake-review__item" role="listitem">
                    <div class="mistake-review__head">
                      <span class="chip chip--soft">${escapeHtml(mistake.skill)}</span>
                      ${mistake.level !== 'all' ? levelBadge(levels.find((level) => level.id === mistake.level) || { id: mistake.level, code: mistake.level, name: '', color: 'indigo' }, { size: 'sm' }) : ''}
                    </div>
                    <p class="mistake-review__prompt" lang="de">${escapeHtml(mistake.prompt)}</p>
                    <p class="mistake-review__answer"><span>Your answer:</span> ${escapeHtml(mistake.given || '—')}</p>
                    <p class="mistake-review__answer mistake-review__answer--right"><span>Correct answer:</span> ${escapeHtml(mistake.answer || '—')}</p>
                    <p class="mistake-review__why">${escapeHtml(mistake.explanation)}</p>
                  </article>`,
              )
              .join('')}
          </div>
          <div class="exercise-mistakes__actions">
            <button class="btn btn--soft btn--sm" type="button" data-ex-retry-mistakes ${list.length ? '' : 'disabled'}>
              ${icon('rotate')} Practise these again
            </button>
          </div>`;
        mistakesMount.querySelector('[data-ex-retry-mistakes]')?.addEventListener('click', () => {
          const questions = list
            .map((mistake) => findExercise(mistake.questionId))
            .filter(Boolean);
          if (!questions.length) {
            toast('Those questions are no longer in the bank. Start a fresh session instead.', { type: 'info' });
            return;
          }
          startSession(questions, 'Retrying your saved mistakes.', 'all', 'all', 'all');
        });
      };

      const renderAttempts = (list) => {
        if (!attemptsMount) return;
        if (!list.length) {
          attemptsMount.innerHTML = `
            <div class="exercise-mini-empty">
              ${icon('clock')}
              <p>Finish a session and its score will appear here.</p>
            </div>`;
          return;
        }
        attemptsMount.innerHTML = `
          <ul class="exercise-attempts" role="list">
            ${list
              .slice(-6)
              .reverse()
              .map((attempt) => {
                const level = levels.find((item) => item.id === attempt.level);
                return `
                  <li class="exercise-attempts__item">
                    <span class="exercise-attempts__score ${attempt.percent >= 70 ? 'is-strong' : ''}">${attempt.percent}%</span>
                    <span class="exercise-attempts__body">
                      <strong>${attempt.correct} of ${attempt.total} correct</strong>
                      <small>${level ? level.code + ' · ' : ''}${escapeHtml(attempt.skill)} · ${escapeHtml(attempt.type)}</small>
                    </span>
                    <time datetime="${escapeHtml(attempt.date)}">${new Date(attempt.date).toLocaleDateString()}</time>
                  </li>`;
              })
              .join('')}
          </ul>`;
      };

      const startSession = (questions, intro, level, skill, type) => {
        if (!sessionMount || !questions.length) return;
        sessionsRun += 1;
        sessionMount.innerHTML = '<div data-drill-host></div>';
        const host = sessionMount.querySelector('[data-drill-host]');
        createDrillSession({
          container: host,
          questions,
          intro,
          onFinish({ results, minutes }) {
            recordPracticeAttempt({
              level,
              skill,
              type,
              minutes,
              results: results.map((result) => ({
                questionId: result.question.id,
                correct: result.correct,
                level: result.question.level,
                skill: result.question.skill,
                type: result.question.type,
                prompt: result.question.prompt,
                given: result.given,
                answer: result.answer,
                explanation: result.question.explanation,
              })),
            });
            refreshSummary();
            toast('Session saved. Missed questions are queued for review.', { type: 'success' });
          },
        });
        scrollToView(sessionMount);
      };

      root.querySelectorAll('[data-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          const { filter, value } = button.dataset;
          filters[filter] = filter === 'size' ? Number(value) : value;
          root.querySelectorAll(`[data-filter="${filter}"]`).forEach((sibling) => {
            const isActive = sibling === button;
            sibling.classList.toggle('is-active', isActive);
            sibling.setAttribute('aria-pressed', String(isActive));
          });
          updateCount();
        });
      });

      startButton?.addEventListener('click', () => {
        const questions = seededSample(pool(), filters.size, `practice-${filters.level}-${filters.skill}-${filters.type}-${filters.source}-${sessionsRun}`);
        if (!questions.length) return;
        startSession(
          questions,
          `${questions.length} authored questions · instant feedback with explanations.`,
          filters.level,
          filters.skill,
          filters.type,
        );
      });

      root.querySelector('[data-ex-clear-mistakes]')?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear mistake review?',
          message: 'This removes your saved practice mistakes from this browser. Session history is kept.',
          confirmLabel: 'Clear mistakes',
          danger: true,
          onConfirm() {
            clearPracticeMistakes();
            refreshSummary();
            toast('Mistake review cleared.', { type: 'info' });
          },
        });
      });

      updateCount();
      renderMistakes(getPracticeMistakes());
      renderAttempts(getPracticeAttempts());
    },
  };
}
