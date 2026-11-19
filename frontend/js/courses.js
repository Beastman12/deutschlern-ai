/**
 * Course catalogue, course detail and lesson plan views.
 *
 * The curriculum map and lesson plans are live. The lesson route hands off to
 * the Milestone 2 lesson engine, and course lists show gated lesson status.
 */
import {
  curriculum,
  findLesson,
  getCourse,
  getCourseLessons,
  getGrammarForLevel,
  getLevel,
  getWordsForLevel,
} from './content.js';
import { escapeHtml, icon, levelBadge, progressBar, ring } from './ui.js';
import { getGatedLessonStatus, getNextLessonForLevel } from './gating.js';
import { getState } from './store.js';
import { renderNotFound } from './notfound.js';

function statusChip(status) {
  if (status === 'completed') return `<span class="status status--done">${icon('check')} Completed</span>`;
  if (status === 'next') return `<span class="status status--next">Next up</span>`;
  if (status === 'locked') return `<span class="status status--locked">${icon('lock')} Locked</span>`;
  return `<span class="status status--preview">Open</span>`;
}

function courseFacts(levelId, level) {
  const course = getCourse(levelId);
  const grammar = getGrammarForLevel(levelId).length;
  const words = getWordsForLevel(levelId).length;
  const lessons = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
  return { modules: course.modules.length, lessons, grammar, words, hours: level.hours };
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

export function renderCourses(ctx) {
  const { stats } = ctx;
  const totalHours = curriculum.levels.reduce((sum, level) => sum + level.hours, 0);

  const cards = curriculum.levels
    .map((level) => {
      const facts = courseFacts(level.id, level);
      const progress = stats.lessonsByLevel[level.id] || { completed: 0, total: facts.lessons, pct: 0 };
      const isCurrent = stats.currentLevel?.id === level.id;
      const isComplete = progress.total > 0 && progress.completed === progress.total;

      return `
        <a class="course-card tone-${escapeHtml(level.color)} ${isCurrent ? 'is-current' : ''}" href="#/courses/${level.id}">
          <div class="course-card__top">
            <div class="course-card__identity">
              ${levelBadge(level, { size: 'lg' })}
              <span class="course-card__level">${escapeHtml(level.name)} · <span>CEFR ${escapeHtml(level.code)}</span></span>
            </div>
            <div class="course-card__flags">
              ${isCurrent ? '<span class="badge badge--brand">Current</span>' : ''}
              ${isComplete ? `<span class="badge badge--success">${icon('check')} Complete</span>` : ''}
            </div>
          </div>

          <h2 class="course-card__title">${escapeHtml(level.title)}</h2>
          <p class="course-card__tagline">${escapeHtml(level.tagline)}</p>

          <ul class="course-card__facts" role="list">
            <li>${icon('book')} ${facts.modules} modules · ${facts.lessons} lessons</li>
            <li>${icon('clock')} ${facts.hours} guided hours</li>
            <li>${icon('layers')} ${facts.grammar} grammar topics</li>
            <li>${icon('languages')} ${facts.words} starter words</li>
          </ul>

          <div class="course-card__progress">
            <div class="course-card__progress-head">
              <span>${progress.completed} of ${progress.total} lessons</span>
              <strong>${progress.pct}%</strong>
            </div>
            ${progressBar(progress.pct, { size: 'sm', label: `${level.code} progress` })}
          </div>

          <span class="course-card__cta">Open course ${icon('arrow-right')}</span>
        </a>`;
    })
    .join('');

  const html = `
    <div class="page page--courses">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">German courses</p>
          <h1 class="page-title">Six levels. One complete route to German.</h1>
          <p class="page-sub">Structured modules take you from your first greeting to nuanced C2 communication, with English explanations exactly where you need them.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--primary" href="#/courses/a1">Start at A1 ${icon('arrow-right')}</a>
        </div>
      </header>

      <div class="summary-strip" role="list" aria-label="Curriculum summary">
        <div class="summary-strip__item" role="listitem">${icon('book')}<strong>${curriculum.totals.lessons}</strong><span>structured lessons</span></div>
        <div class="summary-strip__item" role="listitem">${icon('layers')}<strong>${curriculum.totals.modules}</strong><span>thematic modules</span></div>
        <div class="summary-strip__item" role="listitem">${icon('clock')}<strong>${totalHours}</strong><span>guided learning hours</span></div>
        <div class="summary-strip__item" role="listitem">${icon('sparkles')}<strong>${curriculum.totals.grammar}</strong><span>grammar topics</span></div>
      </div>

      <div class="notice notice--info" role="note">
        <span class="notice__icon">${icon('info')}</span>
        <div>
          <strong>The full lesson engine is live.</strong>
          <p>Every lesson now opens into a 17-section guided session with interactive exercises, audio, speaking practice and a scored assessment. Pass the check to unlock the next lesson.</p>
        </div>
        <span class="chip chip--success">Live · M2</span>
      </div>

      <section class="course-grid" aria-label="All CEFR levels">
        ${cards}
      </section>

      <section class="how-it-works" aria-labelledby="how-title">
        <header class="section-head">
          <div>
            <p class="eyebrow">How the path works</p>
            <h2 class="section-title" id="how-title">Learn it, use it, prove it.</h2>
          </div>
        </header>
        <div class="how-grid">
          <article class="how-card">
            <span class="how-card__icon">${icon('book')}</span>
            <h3>Structured input</h3>
            <p>Each lesson starts with German examples and a clear English explanation, so grammar never stays abstract.</p>
          </article>
          <article class="how-card">
            <span class="how-card__icon">${icon('mic')}</span>
            <h3>Active practice</h3>
            <p>Multiple choice, gap-fill, sentence building, speaking and pronunciation bring the language into use.</p>
          </article>
          <article class="how-card">
            <span class="how-card__icon">${icon('trophy')}</span>
            <h3>Checkpoint assessment</h3>
            <p>A short assessment closes each lesson. Pass it to unlock the next one, and revisit any lesson whenever you like.</p>
          </article>
        </div>
      </section>
    </div>`;

  return {
    title: 'German Courses',
    crumbs: [{ label: 'German Courses' }],
    html,
    mount() {},
  };
}

/* -------------------------------------------------------------------------- */
/* Course detail                                                               */
/* -------------------------------------------------------------------------- */

export function renderCourse(ctx) {
  const { levelId } = ctx.params;
  const level = getLevel(levelId);
  const course = getCourse(levelId);
  if (!level || !course) {
    return renderNotFound(ctx, {
      title: 'Course not found',
      message: `There is no course for “${levelId}”. Choose one of the six CEFR levels instead.`,
    });
  }

  const { stats } = ctx;
  const facts = courseFacts(level.id, level);
  const progress = stats.lessonsByLevel[level.id] || { completed: 0, total: facts.lessons, pct: 0 };
  const courseLessons = getCourseLessons(level.id);
  // Demo preview data is display-only: real lesson access comes from persisted
  // progress, so enabling the preview cannot unlock lessons.
  const gatingProgress = getState().progress;
  const nextLessonItem =
    getNextLessonForLevel(level.id, gatingProgress) || courseLessons[courseLessons.length - 1];
  const allComplete = progress.total > 0 && progress.completed >= progress.total;
  const levelPosition = curriculum.levels.findIndex((item) => item.id === level.id);
  const previousLevel = curriculum.levels[levelPosition - 1] || null;
  const nextLevel = curriculum.levels[levelPosition + 1] || null;

  const modules = course.modules
    .map((module, index) => {
      const completed = module.lessons.filter((lesson) => stats.completedLessons[lesson.id]).length;
      const total = module.lessons.length;
      const modulePct = Math.round((completed / total) * 100);

      const lessons = module.lessons
        .map((lesson, lessonIndex) => {
          const deep = findLesson(lesson.id);
          const status = getGatedLessonStatus(lesson.id, gatingProgress);
          return `
            <a class="lesson-row ${status === 'completed' ? 'is-completed' : ''} ${status === 'next' ? 'is-next' : ''} ${status === 'locked' ? 'is-locked' : ''}"
              href="#/courses/${level.id}/${lesson.id}">
              <span class="lesson-row__num">${status === 'locked' ? icon('lock') : String(lessonIndex + 1).padStart(2, '0')}</span>
              <span class="lesson-row__body">
                <span class="lesson-row__title">${escapeHtml(lesson.title)}</span>
                <span class="lesson-row__sub">${escapeHtml(lesson.titleDe)} · ${lesson.minutes} min · ${escapeHtml(lesson.skills.join(' · '))}</span>
              </span>
              ${statusChip(status)}
              ${icon('chevron-right', 'lesson-row__chev')}
              <span class="sr-only">Module ${module.number}, lesson ${deep?.lesson.number || lessonIndex + 1}</span>
            </a>`;
        })
        .join('');

      return `
        <details class="module-block" ${index === 0 ? 'open' : ''}>
          <summary class="module-block__summary">
            <span class="module-block__number">${String(module.number).padStart(2, '0')}</span>
            <span class="module-block__text">
              <span class="module-block__title">${escapeHtml(module.title)}</span>
              <span class="module-block__de">${escapeHtml(module.titleDe)} · ${completed}/${total} lessons complete</span>
            </span>
            <span class="module-block__bar">${progressBar(modulePct, { size: 'sm', label: `${module.title} progress` })}</span>
            <span class="module-block__chevron">${icon('chevron-down')}</span>
          </summary>
          <div class="module-block__body">
            <p class="module-block__summary-text">${escapeHtml(module.summary)}</p>
            <div class="lesson-list">${lessons}</div>
          </div>
        </details>`;
    })
    .join('');

  const scenarios = (course.scenarios || [])
    .map(
      (scenario) => `
        <li class="scenario-chip">
          <span class="scenario-chip__icon">${icon('message')}</span>
          <span>
            <strong>${escapeHtml(scenario.title)}</strong>
            <small>${escapeHtml(scenario.titleDe)}</small>
          </span>
        </li>`,
    )
    .join('');

  const html = `
    <div class="page page--course">
      <a class="back-link" href="#/courses">${icon('arrow-left')} All courses</a>

      <section class="course-hero tone-${escapeHtml(level.color)}">
        <div class="course-hero__main">
          <div class="course-hero__badges">
            ${levelBadge(level, { size: 'lg' })}
            <span class="chip chip--soft">${escapeHtml(level.name)}</span>
            <span class="chip chip--soft">${facts.hours} guided hours</span>
            <span class="chip chip--soft">CEFR ${escapeHtml(level.code)}</span>
          </div>
          <h1 class="course-hero__title">${escapeHtml(course.title)}</h1>
          <p class="course-hero__de">${escapeHtml(level.code)} · ${escapeHtml(level.name)} · ${escapeHtml(level.tagline)}</p>
          <p class="course-hero__overview">${escapeHtml(course.overview)}</p>
          <div class="course-hero__actions">
            <a class="btn btn--primary btn--lg" href="#/courses/${level.id}/${nextLessonItem.id}">
              ${allComplete ? 'Revise this course' : progress.completed ? 'Continue course' : 'Start this course'} ${icon('arrow-right')}
            </a>
            <a class="btn btn--soft btn--lg" href="#/grammar">Grammar for ${escapeHtml(level.code)}</a>
          </div>
          <p class="course-hero__goal"><strong>Level goal:</strong> ${escapeHtml(course.levelGoal)}</p>
        </div>

        <aside class="course-hero__panel" aria-label="Course progress">
          ${ring(progress.pct, {
            size: 148,
            label: `${level.code} course progress: ${progress.pct} percent`,
          })}
          <div class="course-hero__panel-facts">
            <div><strong>${progress.completed}/${progress.total}</strong><span>lessons</span></div>
            <div><strong>${facts.modules}</strong><span>modules</span></div>
            <div><strong>${facts.grammar}</strong><span>grammar</span></div>
          </div>
          <p class="course-hero__panel-note">${stats.demo ? 'Showing demo progress.' : 'Progress is saved in this browser, and synced when you sign in.'}</p>
        </aside>
      </section>

      <div class="course-layout">
        <div class="course-main">
          <section class="card can-do-card" aria-labelledby="cando-title">
            <header class="card__head">
              <p class="eyebrow">Learning outcomes</p>
              <h2 class="card__title" id="cando-title">What you will be able to do</h2>
            </header>
            <ul class="check-list">
              ${course.canDo.map((item) => `<li>${icon('check')} <span>${escapeHtml(item)}</span></li>`).join('')}
            </ul>
          </section>

          <section class="card curriculum-card" aria-labelledby="curriculum-title">
            <header class="card__head card__head--row">
              <div>
                <p class="eyebrow">Curriculum</p>
                <h2 class="card__title" id="curriculum-title">${facts.modules} modules · ${facts.lessons} lessons</h2>
              </div>
              <span class="chip chip--soft">${facts.hours} hours</span>
            </header>
            <div class="module-list">${modules}</div>
            <p class="card__note">${icon('lock')} Lessons unlock in order. Pass a lesson assessment at 70% or more to open the next one; completed lessons stay open for revision.</p>
          </section>
        </div>

        <aside class="course-side">
          <section class="card start-card">
            <p class="eyebrow">${allComplete ? 'Revision' : progress.completed ? 'Continue' : 'Start here'}</p>
            <h2 class="card__title">${escapeHtml(nextLessonItem.title)}</h2>
            <p class="card__sub">${escapeHtml(nextLessonItem.titleDe)}</p>
            <div class="start-card__meta">
              <span>${icon('clock')} ${nextLessonItem.minutes} min</span>
              <span>${icon('layers')} ${escapeHtml(nextLessonItem.skills.join(' · '))}</span>
            </div>
            <a class="btn btn--primary btn--block" href="#/courses/${level.id}/${nextLessonItem.id}">${allComplete ? 'Revise lesson' : 'Open lesson'} ${icon('arrow-right')}</a>
            <p class="start-card__note">Assessment: ${nextLessonItem.assessment.questions} questions · ${nextLessonItem.assessment.passScore}% to pass</p>
          </section>

          <section class="card facts-card">
            <h2 class="card__title">Level at a glance</h2>
            <dl class="fact-list">
              <div><dt>Guided hours</dt><dd>${facts.hours}</dd></div>
              <div><dt>Modules</dt><dd>${facts.modules}</dd></div>
              <div><dt>Lessons</dt><dd>${facts.lessons}</dd></div>
              <div><dt>Grammar topics</dt><dd>${facts.grammar}</dd></div>
              <div><dt>Starter vocabulary</dt><dd>${facts.words}</dd></div>
              <div><dt>CEFR level</dt><dd>${escapeHtml(level.code)} · ${escapeHtml(level.name)}</dd></div>
            </dl>
          </section>

          <section class="card scenarios-card">
            <h2 class="card__title">Real-life scenarios</h2>
            <ul class="scenario-list">${scenarios}</ul>
            <a class="link-arrow" href="#/conversations">Role-play practice ${icon('arrow-right')}</a>
          </section>

          <nav class="level-nav" aria-label="Other CEFR levels">
            ${
              previousLevel
                ? `<a class="level-nav__link" href="#/courses/${previousLevel.id}">${icon('arrow-left')}<span><small>Previous level</small><strong>${escapeHtml(previousLevel.code)} · ${escapeHtml(previousLevel.name)}</strong></span></a>`
                : '<span></span>'
            }
            ${
              nextLevel
                ? `<a class="level-nav__link level-nav__link--next" href="#/courses/${nextLevel.id}"><span><small>Next level</small><strong>${escapeHtml(nextLevel.code)} · ${escapeHtml(nextLevel.name)}</strong></span>${icon('arrow-right')}</a>`
                : '<span></span>'
            }
          </nav>
        </aside>
      </div>
    </div>`;

  return {
    title: `${level.code} · ${course.title}`,
    crumbs: [{ label: 'German Courses', href: '#/courses' }, { label: `${level.code} ${level.name}` }],
    html,
    mount() {},
  };
}

