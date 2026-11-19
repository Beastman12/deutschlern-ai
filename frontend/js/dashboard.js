/**
 * Dashboard — the learner's home.
 * All figures come from the curriculum plus the local progress store.
 */
import {
  curriculum,
  getCourse,
  getGrammarForLevel,
  getWordOfDay,
} from './content.js';
import { getPreferences, updatePreferences, toggleFavoriteWord, isFavoriteWord } from './store.js';
import {
  escapeHtml,
  icon,
  levelBadge,
  pluralise,
  progressBar,
  ring,
  speakGerman,
  statCard,
  toast,
} from './ui.js';
import { skillBarsHTML, weekChartHTML } from './charts.js';

const GOAL_OPTIONS = [10, 20, 30, 45];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function firstName(profile) {
  return String(profile?.name || '').trim().split(/\s+/)[0] || '';
}

function levelPath(stats) {
  return curriculum.levels
    .map((level) => {
      const progress = stats.lessonsByLevel[level.id] || { completed: 0, total: 0, pct: 0 };
      const isCurrent = stats.currentLevel?.id === level.id;
      const isComplete = progress.total > 0 && progress.completed === progress.total;
      return `
        <a class="level-card tone-${escapeHtml(level.color)} ${isCurrent ? 'is-current' : ''}" href="#/courses/${level.id}">
          <div class="level-card__top">
            ${levelBadge(level)}
            ${isCurrent ? '<span class="badge badge--brand">You are here</span>' : ''}
            ${isComplete ? `<span class="badge badge--success">${icon('check')} Complete</span>` : ''}
          </div>
          <h3 class="level-card__title">${escapeHtml(level.title)}</h3>
          <p class="level-card__tagline">${escapeHtml(level.tagline)}</p>
          <div class="level-card__foot">
            ${progressBar(progress.pct, { size: 'sm', tone: 'brand', label: `${level.code} progress` })}
            <div class="level-card__meta">
              <span>${progress.completed}/${progress.total} lessons</span>
              <span>${progress.pct}%</span>
            </div>
          </div>
        </a>`;
    })
    .join('');
}

function moduleStrip(stats, course) {
  return course.modules
    .map((module) => {
      const completed = module.lessons.filter((lesson) => stats.completedLessons[lesson.id]).length;
      const total = module.lessons.length;
      const isDone = completed === total;
      return `
        <a class="module-chip ${isDone ? 'is-done' : ''}" href="#/courses/${course.id}">
          <span class="module-chip__num">${isDone ? icon('check') : module.number}</span>
          <span class="module-chip__text">
            <strong>${escapeHtml(module.title)}</strong>
            <small>${completed}/${total} lessons</small>
          </span>
        </a>`;
    })
    .join('');
}

function streakDays(week) {
  return week
    .map(
      (day) => `
      <span class="streak-day ${day.minutes > 0 ? 'is-active' : ''}" title="${escapeHtml(day.label)} · ${day.minutes} min">
        <span class="streak-day__dot" aria-hidden="true"></span>
        <span class="streak-day__label">${escapeHtml(day.label.slice(0, 1))}</span>
      </span>`,
    )
    .join('');
}

function statCards(stats) {
  const streakHint = stats.streak > 0 ? 'Keep the momentum going' : 'Finish a lesson to start a streak';
  return [
    statCard({
      label: 'Learning streak',
      value: String(stats.streak),
      suffix: stats.streak === 1 ? 'day' : 'days',
      iconName: 'flame',
      hint: streakHint,
      tone: 'amber',
    }),
    statCard({
      label: 'Lessons completed',
      value: `${stats.completedCount}`,
      suffix: `/ ${stats.totalLessons}`,
      iconName: 'book',
      hint: `${stats.completionPct}% of the full A1–C2 path`,
      tone: 'brand',
      href: '#/progress',
    }),
    statCard({
      label: 'Words learned',
      value: `${stats.learnedWords}`,
      suffix: `/ ${stats.totalWords}`,
      iconName: 'languages',
      hint: 'Vocabulary builder',
      tone: 'sky',
      href: '#/vocabulary',
    }),
    statCard({
      label: 'Study time',
      value: `${stats.studyHours}`,
      suffix: 'h',
      iconName: 'clock',
      hint: `${stats.weeklyTotal} min in the last 7 days`,
      tone: 'teal',
      href: '#/progress',
    }),
  ].join('');
}

export function renderDashboard(ctx) {
  const { stats } = ctx;
  const preferences = getPreferences();
  const course = getCourse(stats.currentLevel.id);
  const next = stats.nextLesson;
  const nextCourseLesson = next?.lesson;
  const word = getWordOfDay();
  const grammarTopics = getGrammarForLevel(stats.currentLevel.id);
  const grammarTopic = grammarTopics[0];
  const scenario = course?.scenarios?.[0];
  const targetLevel = curriculum.levels.find((level) => level.id === stats.profile.targetLevel);
  const learnerName = firstName(stats.profile);

  const continueHref = nextCourseLesson
    ? `#/courses/${stats.currentLevel.id}/${nextCourseLesson.id}`
    : '#/courses';

  const heroTitle = learnerName
    ? `Weiter so, <em>${escapeHtml(learnerName)}</em>.`
    : 'Learn German. <em>Speak</em> German. Live German.';

  const html = `
    <div class="page page--dashboard">
      <section class="hero" aria-labelledby="dashboard-title">
        <div class="hero__content">
          <p class="hero__kicker">
            <span class="flagline" aria-hidden="true"><i></i><i></i><i></i></span>
            ${greeting()}${learnerName ? `, ${escapeHtml(learnerName)}` : ''} · ${formatToday()}
          </p>
          <h1 class="hero__title" id="dashboard-title">${heroTitle}</h1>
          <p class="hero__lede">
            A complete, CEFR-aligned route from your first words to confident C2 German.
            ${targetLevel ? `Your goal: <strong>${escapeHtml(targetLevel.code)} · ${escapeHtml(targetLevel.name)}</strong>.` : ''}
          </p>
          <div class="hero__actions">
            <a class="btn btn--primary btn--lg" href="${continueHref}">
              ${stats.completedCount === 0 ? 'Start your first lesson' : 'Continue learning'}
              ${icon('arrow-right')}
            </a>
            <a class="btn btn--soft btn--lg" href="#/courses">Explore the curriculum</a>
          </div>
          <ul class="hero__meta" role="list">
            <li>${icon('check')} CEFR A1–C2</li>
            <li>${icon('book')} ${pluralise(curriculum.totals.lessons, 'lesson')}</li>
            <li>${icon('layers')} ${pluralise(curriculum.totals.grammar, 'grammar topic')}</li>
            <li>${icon('sparkles')} AI tutor · ${curriculum.totals.scenarios} role-plays</li>
          </ul>
        </div>

        <aside class="hero__panel" aria-label="Your current level">
          <div class="hero-level">
            <div class="hero-level__head">
              ${levelBadge(stats.currentLevel, { size: 'lg' })}
              <div class="hero-level__titles">
                <span class="hero-level__eyebrow">Your current path</span>
                <strong>${escapeHtml(stats.currentLevel.title)}</strong>
              </div>
              <span class="chip ${stats.demo ? 'chip--warning' : 'chip--soft'}">${stats.demo ? 'Demo data' : 'Local progress'}</span>
            </div>

            <div class="hero-level__body">
              ${ring(stats.levelProgressPct, {
                size: 132,
                label: `${stats.currentLevel.code} level progress: ${stats.levelProgressPct} percent`,
              })}
              <div class="hero-level__facts">
                <div><strong>${stats.completedInLevel}/${stats.totalInLevel}</strong><span>lessons complete</span></div>
                <div><strong>${grammarTopics.length}</strong><span>grammar topics</span></div>
                <div><strong>${curriculum.levels.length}</strong><span>levels to mastery</span></div>
              </div>
            </div>

            <div class="hero-next">
              <p class="eyebrow">${nextCourseLesson ? 'Next up' : 'All caught up'}</p>
              ${
                nextCourseLesson
                  ? `<a class="hero-next__title" href="${continueHref}">${escapeHtml(nextCourseLesson.title)}</a>
                     <p class="hero-next__meta">${escapeHtml(next.lesson.moduleTitle)} · ${nextCourseLesson.minutes} min · ${escapeHtml(nextCourseLesson.skills.join(' · '))}</p>
                     <div class="hero-next__actions">
                       <a class="link-arrow" href="${continueHref}">Open lesson plan ${icon('arrow-right')}</a>
                       <button class="icon-btn icon-btn--sm" type="button" data-speak="${escapeHtml(nextCourseLesson.keyPhrase.de)}" aria-label="Hear key phrase: ${escapeHtml(nextCourseLesson.keyPhrase.de)}" title="Hear the key phrase">${icon('volume')}</button>
                     </div>`
                  : `<p class="hero-next__meta">You have previewed every lesson in this level. Explore another level below.</p>`
              }
            </div>
          </div>
        </aside>
      </section>

      <section class="stat-grid" aria-label="Learning overview">
        ${statCards(stats)}
      </section>

      <div class="dash-grid">
        <section class="card continue-card" aria-labelledby="continue-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Continue learning</p>
              <h2 class="card__title" id="continue-title">${escapeHtml(stats.currentLevel.code)} · ${escapeHtml(course.title)}</h2>
              <p class="card__sub">${escapeHtml(course.tagline)}</p>
            </div>
            <a class="btn btn--ghost btn--sm" href="#/courses/${stats.currentLevel.id}">View course ${icon('arrow-right')}</a>
          </header>

          <div class="continue-card__progress">
            <div class="continue-card__progress-head">
              <span>Level progress</span>
              <strong>${stats.levelProgressPct}%</strong>
            </div>
            ${progressBar(stats.levelProgressPct, { label: `${stats.currentLevel.code} level progress`, tone: 'brand' })}
          </div>

          <div class="module-strip" aria-label="Course modules">
            ${moduleStrip(stats, course)}
          </div>

          <div class="continue-card__cta">
            <div class="continue-card__next">
              <span class="continue-card__next-icon">${icon(nextCourseLesson ? 'play-circle' : 'check')}</span>
              <div>
                <strong>${nextCourseLesson ? escapeHtml(nextCourseLesson.title) : 'Module review'}</strong>
                <span>${next ? `${nextCourseLesson.minutes} min · Assessment at the end` : 'Choose another level to keep going'}</span>
              </div>
            </div>
            <a class="btn btn--primary" href="${continueHref}">${nextCourseLesson ? 'Start lesson' : 'Browse courses'} ${icon('arrow-right')}</a>
          </div>
        </section>

        <aside class="card goal-card" aria-labelledby="goal-title">
          <header class="card__head">
            <p class="eyebrow">Today</p>
            <h2 class="card__title" id="goal-title">Daily goal</h2>
          </header>

          <div class="goal-card__ring">
            ${ring(stats.dailyGoalPct, {
              size: 124,
              label: `Daily goal: ${stats.minutesToday} of ${stats.dailyGoal} minutes`,
              tone: 'success',
            })}
            <p class="goal-card__minutes"><strong>${stats.minutesToday}</strong> of ${stats.dailyGoal} min</p>
            <p class="goal-card__hint">${stats.minutesToday >= stats.dailyGoal ? 'Goal reached. Sehr gut!' : 'A little every day beats a lot once a week.'}</p>
          </div>

          <div class="goal-card__options" role="group" aria-label="Set daily goal">
            ${GOAL_OPTIONS.map(
              (goal) => `
              <button class="goal-option ${goal === stats.dailyGoal ? 'is-active' : ''}" type="button"
                data-goal="${goal}" aria-pressed="${goal === stats.dailyGoal}">${goal} min</button>`,
            ).join('')}
          </div>

          <div class="goal-card__streak">
            <div class="goal-card__streak-head">
              <span>${icon('flame')} ${stats.streak}-day streak</span>
              <span class="muted">${stats.weeklyTotal}/${stats.weeklyGoal} min this week</span>
            </div>
            <div class="streak-days">${streakDays(stats.weekly)}</div>
          </div>

          <button class="demo-toggle" type="button" data-demo-toggle>
            ${icon(stats.demo ? 'x' : 'info')}
            ${stats.demo ? 'Turn off demo data' : 'Preview with demo data'}
          </button>
        </aside>
      </div>

      <div class="dash-grid dash-grid--activity">
        <section class="card activity-card" aria-labelledby="activity-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Consistency</p>
              <h2 class="card__title" id="activity-title">This week</h2>
            </div>
            <a class="btn btn--ghost btn--sm" href="#/progress">Full report ${icon('arrow-right')}</a>
          </header>
          ${weekChartHTML(stats.weekly, { goal: stats.dailyGoal })}
        </section>

        <section class="card skills-card" aria-labelledby="skills-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Balance</p>
              <h2 class="card__title" id="skills-title">Skill snapshot</h2>
            </div>
            <span class="chip chip--soft">${stats.overallSkill}% average</span>
          </header>
          ${skillBarsHTML(stats.skills)}
          ${stats.overallSkill === 0 ? `<p class="card__note">${icon('info')} Skills fill in as you complete exercises, writing and speaking tasks.</p>` : ''}
        </section>
      </div>

      <section class="path-section" aria-labelledby="path-title">
        <header class="section-head">
          <div>
            <p class="eyebrow">Your route</p>
            <h2 class="section-title" id="path-title">Six levels. One clear path.</h2>
            <p class="section-sub">Every level has four modules, real-life scenarios and an end-of-level assessment.</p>
          </div>
          <a class="btn btn--ghost btn--sm" href="#/courses">All courses ${icon('arrow-right')}</a>
        </header>
        <div class="level-grid">${levelPath(stats)}</div>
      </section>

      <div class="dashboard-bottom">
        <section class="card word-card" aria-labelledby="word-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Word of the day</p>
              <h2 class="card__title" id="word-title">Build your vocabulary</h2>
            </div>
            <button class="icon-btn ${isFavoriteWord(word.id) ? 'is-favorite' : ''}" type="button"
              data-favorite-word="${escapeHtml(word.id)}" aria-pressed="${isFavoriteWord(word.id)}"
              aria-label="Save ${escapeHtml(word.de)} to favourites" title="Save to favourites">
              ${icon('star')}
            </button>
          </header>

          <div class="word-card__word">
            ${word.article ? `<span class="article article--${escapeHtml(word.article)}">${escapeHtml(word.article)}</span>` : ''}
            <span class="word-card__de">${escapeHtml(word.article ? word.de.replace(/^(der|die|das)\s+/, '') : word.de)}</span>
            <button class="icon-btn icon-btn--sm" type="button" data-speak-word aria-label="Hear ${escapeHtml(word.de)}" title="Hear pronunciation">
              ${icon('volume')}
            </button>
          </div>
          <p class="word-card__pron">[${escapeHtml(word.pronunciation)}] · ${escapeHtml(word.pos)} · ${escapeHtml(word.level.toUpperCase())}</p>
          <p class="word-card__en">${escapeHtml(word.en)}</p>
          <blockquote class="word-card__example">
            <p>${escapeHtml(word.example)}</p>
            <cite>${escapeHtml(word.exampleEn)}</cite>
          </blockquote>
          <a class="link-arrow" href="#/vocabulary?word=${encodeURIComponent(word.id)}">Open in vocabulary builder ${icon('arrow-right')}</a>
        </section>

        <section class="card recommended-card" aria-labelledby="recommended-title">
          <header class="card__head">
            <p class="eyebrow">Recommended today</p>
            <h2 class="card__title" id="recommended-title">Your next three steps</h2>
          </header>
          <ol class="recommend-list">
            <li>
              <a href="${continueHref}">
                <span class="recommend-list__icon">${icon('book')}</span>
                <span class="recommend-list__text">
                  <strong>${escapeHtml(nextCourseLesson ? nextCourseLesson.title : 'Review your course')}</strong>
                  <small>${nextCourseLesson ? `${stats.currentLevel.code} · ${nextCourseLesson.minutes} min` : 'Choose a level to continue'}</small>
                </span>
                ${icon('chevron-right')}
              </a>
            </li>
            ${
              grammarTopic
                ? `<li>
                    <a href="#/grammar?topic=${encodeURIComponent(grammarTopic.id)}">
                      <span class="recommend-list__icon">${icon('layers')}</span>
                      <span class="recommend-list__text">
                        <strong>${escapeHtml(grammarTopic.title)}</strong>
                        <small>Grammar · ${stats.currentLevel.code}</small>
                      </span>
                      ${icon('chevron-right')}
                    </a>
                  </li>`
                : ''
            }
            ${
              scenario
                ? `<li>
                    <a href="#/conversations">
                      <span class="recommend-list__icon">${icon('message')}</span>
                      <span class="recommend-list__text">
                        <strong>${escapeHtml(scenario.title)}</strong>
                        <small>Real-life scenario · ${escapeHtml(scenario.titleDe)}</small>
                      </span>
                      ${icon('chevron-right')}
                    </a>
                  </li>`
                : ''
            }
            <li>
              <a href="#/vocabulary?word=${encodeURIComponent(word.id)}">
                <span class="recommend-list__icon">${icon('languages')}</span>
                <span class="recommend-list__text">
                  <strong>${escapeHtml(word.de)}</strong>
                  <small>Vocabulary · ${escapeHtml(word.topic)}</small>
                </span>
                ${icon('chevron-right')}
              </a>
            </li>
          </ol>
          <p class="card__note">${icon('info')} Recommendations follow your current level and recent activity.</p>
        </section>

        <aside class="card tip-card" aria-labelledby="tip-title">
          <p class="eyebrow">Learning tip</p>
          <h2 class="tip-card__de" id="tip-title">Übung macht den <em>Meister</em>.</h2>
          <p class="tip-card__en">Practice makes the master.</p>
          <p class="tip-card__text">Ten focused minutes today is worth more than a two-hour session next Sunday. Read the example sentence aloud, then close the page and say it from memory.</p>
          <a class="link-arrow" href="#/courses">Find a ten-minute lesson ${icon('arrow-right')}</a>
        </aside>
      </div>
    </div>`;

  return {
    title: 'Dashboard',
    crumbs: [{ label: 'Dashboard' }],
    html,
    mount(root) {
      root.querySelector('[data-speak-word]')?.addEventListener('click', () => {
        speakGerman(word.de);
      });
      root.querySelectorAll('[data-speak]').forEach((button) => {
        button.addEventListener('click', () => speakGerman(button.dataset.speak));
      });

      root.querySelector('[data-favorite-word]')?.addEventListener('click', (event) => {
        const button = event.currentTarget;
        const nowFavorite = toggleFavoriteWord(word.id);
        button.classList.toggle('is-favorite', nowFavorite);
        button.setAttribute('aria-pressed', String(nowFavorite));
        toast(nowFavorite ? `Saved “${word.de}” to favourites.` : `Removed “${word.de}” from favourites.`, {
          type: 'success',
          duration: 2400,
        });
      });

      root.querySelectorAll('[data-goal]').forEach((button) => {
        button.addEventListener('click', () => {
          const goal = Number(button.dataset.goal);
          updatePreferences({ dailyGoal: goal });
          toast(`Daily goal set to ${goal} minutes.`, { type: 'success', duration: 2400 });
          ctx.refresh();
        });
      });

      root.querySelector('[data-demo-toggle]')?.addEventListener('click', () => {
        const enable = !preferences.demoData;
        updatePreferences({ demoData: enable });
        toast(
          enable
            ? 'Demo data is on — figures are illustrative, not your own activity.'
            : 'Demo data is off. Showing your real progress.',
          { type: enable ? 'warning' : 'success', duration: 3600 },
        );
        ctx.refresh();
      });
    },
  };
}

function formatToday() {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}
