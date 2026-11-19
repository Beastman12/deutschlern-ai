/**
 * My Progress — an honest report built from the local store.
 *
 * The report measures what the app actually records: lessons passed, assessment
 * attempts, saved words and study minutes. Empty states say exactly what is
 * missing instead of inventing activity.
 */
import {
  curriculum,
  getCourseLessons,
  getLevel,
  findWord,
  getSkillIndex,
  getSkillInventory,
} from './content.js';
import { getPreferences, getState, updatePreferences } from './store.js';
import { buildAnalyticsReport } from './analytics.js';
import { buildDemoProgress } from './stats.js';
import {
  escapeHtml,
  emptyState,
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

const PASS_SCORE = 70;

function quizHistory(stats) {
  const progress = getPreferences().demoData ? buildDemoProgress() : getState().progress;
  return (progress.quizAttempts || [])
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);
}

function statCards(stats) {
  return [
    statCard({
      label: 'Full path completed',
      value: String(stats.completedCount),
      suffix: `/ ${stats.totalLessons}`,
      iconName: 'book',
      hint: `${stats.completionPct}% of A1–C2`,
      tone: 'brand',
    }),
    statCard({
      label: 'Current level',
      value: stats.currentLevel?.code || '—',
      suffix: stats.currentLevel?.name || '',
      iconName: 'compass',
      hint: `${stats.levelProgressPct}% of this level`,
      tone: 'sky',
      href: `#/courses/${stats.currentLevel?.id || 'a1'}`,
    }),
    statCard({
      label: 'Assessment average',
      value: stats.quizCount ? String(stats.quizAverage) : '—',
      suffix: stats.quizCount ? '%' : '',
      iconName: 'trophy',
      hint: stats.quizCount
        ? `${pluralise(stats.quizCount, 'attempt')} recorded`
        : 'Complete a lesson check to start',
      tone: 'amber',
    }),
    statCard({
      label: 'Words saved',
      value: String(stats.learnedWords),
      suffix: `/ ${stats.totalWords}`,
      iconName: 'languages',
      hint: `${stats.favoriteWords} favourites`,
      tone: 'teal',
      href: '#/vocabulary',
    }),
  ].join('');
}

function readinessRows(stats) {
  return curriculum.levels
    .map((level) => {
      const progress = stats.lessonsByLevel[level.id] || { completed: 0, total: 0, pct: 0 };
      const isCurrent = stats.currentLevel?.id === level.id;
      const isComplete = progress.total > 0 && progress.completed === progress.total;

      return `
        <div class="readiness-row tone-${escapeHtml(level.color)} ${isCurrent ? 'is-current' : ''}">
          ${levelBadge(level)}
          <div class="readiness-row__body">
            <div class="readiness-row__head">
              <strong>${escapeHtml(level.title)}</strong>
              <span class="readiness-row__pct">${progress.pct}%</span>
            </div>
            ${progressBar(progress.pct, {
              size: 'sm',
              label: `${level.code} curriculum coverage`,
            })}
            <div class="readiness-row__meta">
              <span>${progress.completed}/${progress.total} lessons covered</span>
              ${
                isComplete
                  ? `<span class="readiness-row__flag">${icon('check')} Curriculum complete</span>`
                  : isCurrent
                    ? `<span class="readiness-row__flag readiness-row__flag--next">${icon('compass')} In progress</span>`
                    : `<span>${escapeHtml(level.name)}</span>`
              }
            </div>
          </div>
          <a class="btn btn--ghost btn--sm" href="#/courses/${level.id}">
            ${isCurrent ? 'Continue' : 'Open'} ${icon('arrow-right')}
          </a>
        </div>`;
    })
    .join('');
}

function quizRows(stats) {
  const attempts = quizHistory(stats);
  if (!attempts.length) {
    return emptyState({
      iconName: 'trophy',
      title: 'No assessments yet',
      text: 'Complete a lesson and submit its assessment. Every attempt and score will appear here — including failed attempts, because mistakes are useful data.',
      action: `<a class="btn btn--soft btn--sm" href="#/courses/${stats.currentLevel?.id || 'a1'}">Open a lesson</a>`,
    });
  }

  return `
    <ul class="quiz-list" role="list">
      ${attempts
        .map((attempt) => {
          const level = getLevel(attempt.level);
          const pct = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
          const passed = pct >= PASS_SCORE;
          return `
            <li class="quiz-row ${passed ? 'is-passed' : 'is-failed'}">
              <span class="quiz-row__score">${pct}<small>%</small></span>
              <span class="quiz-row__body">
                <strong>${escapeHtml(attempt.title)}</strong>
                <small>${level ? escapeHtml(level.code) : '—'} · ${attempt.score}/${attempt.total} · ${new Intl.DateTimeFormat(
                  'en-GB',
                  { day: 'numeric', month: 'short' },
                ).format(new Date(attempt.date))}</small>
              </span>
              <span class="chip ${passed ? 'chip--success' : 'chip--warning'}">${passed ? 'Passed' : 'Retake'}</span>
            </li>`;
        })
        .join('')}
    </ul>`;
}

function favouriteWordsHTML(stats) {
  const words = stats.favoriteWordIds.map(findWord).filter(Boolean).slice(0, 4);
  if (!words.length) {
    return emptyState({
      iconName: 'star',
      title: 'No saved words yet',
      text: 'Star a word in the Vocabulary Builder and it will appear here for quick revision.',
      action: '<a class="btn btn--soft btn--sm" href="#/vocabulary">Browse vocabulary</a>',
    });
  }

  return `
    <div class="mini-word-grid">
      ${words
        .map(
          (word) => `
            <a class="mini-word" href="#/vocabulary?word=${encodeURIComponent(word.id)}">
              <span class="mini-word__de">${escapeHtml(word.article ? word.de.replace(/^(der|die|das)\s+/, '') : word.de)}</span>
              <span class="mini-word__en">${escapeHtml(word.en)}</span>
              <span class="mini-word__meta">${word.article ? `${escapeHtml(word.article)} · ` : ''}${escapeHtml(word.level.toUpperCase())}</span>
            </a>`,
        )
        .join('')}
    </div>`;
}

function skillAnalyticsHTML(report, inventory) {
  const summary = report.skillPractice;
  const accuracy = summary.accuracy === null ? '—' : `${summary.accuracy}%`;
  const skillLabels = {
    reading: { label: 'Reading', iconName: 'book-open', href: '#/reading', unit: 'answers correct' },
    listening: { label: 'Listening', iconName: 'headphones', href: '#/listening', unit: 'answers correct' },
    writing: { label: 'Writing', iconName: 'pen', href: '#/writing', unit: 'checks met' },
  };
  const rows = Object.entries(skillLabels)
    .map(([id, meta]) => {
      const bucket = report.bySkill[id];
      return `
        <a class="skill-analytics-row" href="${meta.href}">
          <span class="skill-analytics-row__icon">${icon(meta.iconName)}</span>
          <span class="skill-analytics-row__name"><strong>${meta.label}</strong><small>${bucket.practicedTasks} of ${bucket.authored} tasks used</small></span>
          <span class="skill-analytics-row__count"><strong>${bucket.correct}/${bucket.evaluated}</strong><small>${meta.unit}</small></span>
          <span class="chip ${bucket.attempts ? 'chip--brand' : 'chip--soft'}">${
            bucket.accuracy === null ? 'No attempts' : `${bucket.accuracy}%`
          }</span>
        </a>`;
    })
    .join('');

  const levels = curriculum.levels
    .map((level) => {
      const bucket = report.byLevel[level.id];
      return `<span class="chip chip--soft">${escapeHtml(level.code)} · ${bucket.practicedTasks}/${bucket.authored} tasks · ${
        bucket.attempts
      } checks</span>`;
    })
    .join('');

  const recent = summary.recent.length
    ? `<ul class="skill-analytics-recent" role="list">
        ${summary.recent
          .map(
            (entry) => `
              <li>
                <span class="chip chip--soft">${escapeHtml(entry.level.toUpperCase())}</span>
                <strong>${escapeHtml(skillLabels[entry.skill]?.label || entry.skill)}</strong>
                <small>${escapeHtml(entry.correct)}/${escapeHtml(entry.total)} ${entry.mode === 'checklist' ? 'checks met' : 'correct'} · ${escapeHtml(
                  formatShortDate(entry.date),
                )}</small>
              </li>`,
          )
          .join('')}
      </ul>`
    : emptyState({
        iconName: 'target',
        title: 'No skill practice recorded yet',
        text: 'Open Reading, Listening or Writing Practice. The first saved check will appear here with its real result.',
        action: '<a class="btn btn--soft btn--sm" href="#/reading">Start reading practice</a>',
      });

  return `
    <section class="card skill-analytics-card" aria-labelledby="skill-analytics-title">
      <header class="card__head card__head--row">
        <div>
          <p class="eyebrow">Milestone 8</p>
          <h2 class="card__title" id="skill-analytics-title">Graded skill practice</h2>
          <p class="card__sub">Reading, listening and writing results derived only from checks you actually saved on this device.</p>
        </div>
        <span class="chip chip--soft">${icon('layers')} ${
          inventory.reading + inventory.listening + inventory.writing
        } authored tasks</span>
      </header>
      <div class="skill-analytics-summary">
        <div><strong>${summary.attempts}</strong><span>checks saved</span></div>
        <div><strong>${summary.practicedTasks}</strong><span>of ${summary.authored} tasks used</span></div>
        <div><strong>${accuracy}</strong><span>overall met / evaluated</span></div>
        <div><strong>${summary.drafts}</strong><span>writing drafts saved</span></div>
      </div>
      <div class="skill-analytics-rows">${rows}</div>
      <div class="skill-analytics-levels" aria-label="Practice by CEFR level">${levels}</div>
      <div class="skill-analytics-recent-box"><h3>Recent skill checks</h3>${recent}</div>
      <p class="card__note">${icon('shield')} This section never uses demo data. Writing percentages count checklist rules met, not an AI grammar score.</p>
    </section>`;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

export function renderProgress(ctx) {
  const { stats } = ctx;
  const courseLessons = getCourseLessons(stats.currentLevel?.id || 'a1');
  const next = stats.nextLesson;
  const nextLesson = next?.lesson;
  const activeDays = stats.weekly.filter((day) => day.minutes > 0).length;
  const bestDay = stats.weekly.reduce(
    (best, day) => (day.minutes > best.minutes ? day : best),
    { minutes: 0, label: '—' },
  );
  const favouriteWord = stats.favoriteWordIds.map(findWord).find(Boolean);
  const skillReport = buildAnalyticsReport(getState(), getSkillIndex());
  const skillInventory = getSkillInventory();

  const html = `
    <div class="page page--progress">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">My progress</p>
          <h1 class="page-title">Progress you can actually trust.</h1>
          <p class="page-sub">Every figure here comes from your own activity in this browser. Nothing is estimated or filled in for effect.</p>
        </div>
        <div class="page-head__actions">
          ${
            stats.demo
              ? '<span class="chip chip--warning">Previewing demo data</span>'
              : '<span class="chip chip--soft">Local progress</span>'
          }
          <a class="btn btn--primary" href="${nextLesson ? `#/courses/${stats.currentLevel.id}/${nextLesson.id}` : '#/courses'}">
            ${nextLesson ? 'Continue learning' : 'Browse courses'} ${icon('arrow-right')}
          </a>
        </div>
      </header>

      ${
        stats.demo
          ? `<div class="notice notice--warning" role="note">
               <span class="notice__icon">${icon('info')}</span>
               <div>
                 <strong>You are previewing demo data.</strong>
                 <p>These numbers are illustrative. Turn the preview off in Settings or on this page to return to your real, local progress.</p>
               </div>
               <button class="btn btn--soft btn--sm" type="button" data-demo-toggle>Turn off demo</button>
             </div>`
          : `<div class="notice notice--info" role="note">
               <span class="notice__icon">${icon('info')}</span>
               <div>
                 <strong>Showcase the full design with demo data.</strong>
                 <p>Lesson completion and assessment scores are recorded locally on this device. Use a clearly-labelled demo preview to see what a fully populated report looks like.</p>
               </div>
               <button class="btn btn--ghost btn--sm" type="button" data-demo-toggle>Preview demo data</button>
             </div>`
      }

      <section class="stat-grid" aria-label="Progress summary">
        ${statCards(stats)}
      </section>

      <section class="card progress-hero" aria-labelledby="route-progress-title">
        <div class="progress-hero__ring">
          ${ring(stats.completionPct, {
            size: 152,
            label: `Full A1 to C2 path: ${stats.completionPct} percent complete`,
          })}
        </div>
        <div class="progress-hero__copy">
          <p class="eyebrow">The whole route</p>
          <h2 class="card__title" id="route-progress-title">${stats.completedCount} of ${stats.totalLessons} lessons covered</h2>
          <p class="card__sub">
            You are working through <strong>${escapeHtml(stats.currentLevel?.code || 'A1')} · ${escapeHtml(
              stats.currentLevel?.title || '',
            )}</strong>. Each level has ${courseLessons.length} lessons, four modules and an end-of-level assessment.
          </p>
          <div class="progress-hero__facts">
            <span>${icon('flame')} <strong>${stats.streak}</strong> day streak</span>
            <span>${icon('clock')} <strong>${stats.studyHours}</strong> study hours</span>
            <span>${icon('check')} <strong>${stats.quizAverage || 0}%</strong> assessment average</span>
          </div>
          <div class="progress-hero__actions">
            <a class="btn btn--primary" href="#/courses/${stats.currentLevel?.id || 'a1'}">Open ${escapeHtml(stats.currentLevel?.code || 'A1')} course ${icon('arrow-right')}</a>
            <a class="btn btn--soft" href="#/grammar">Revise grammar</a>
          </div>
        </div>
      </section>

      <div class="report-grid">
        <section class="card report-card report-card--wide" aria-labelledby="week-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Last seven days</p>
              <h2 class="card__title" id="week-title">Weekly study rhythm</h2>
            </div>
            <span class="chip chip--soft">${icon('calendar')} ${stats.weeklyTotal} min</span>
          </header>
          ${weekChartHTML(stats.weekly, { goal: stats.dailyGoal })}
        </section>

        <aside class="card consistency-card" aria-labelledby="consistency-title">
          <header class="card__head">
            <p class="eyebrow">Consistency</p>
            <h2 class="card__title" id="consistency-title">Keep the chain alive</h2>
          </header>
          <div class="consistency-facts">
            <div class="consistency-fact">
              <span class="consistency-fact__icon">${icon('flame')}</span>
              <strong>${stats.streak}</strong>
              <span>${stats.streak === 1 ? 'day streak' : 'day streak'}</span>
            </div>
            <div class="consistency-fact">
              <span class="consistency-fact__icon">${icon('calendar')}</span>
              <strong>${activeDays}/7</strong>
              <span>active days</span>
            </div>
            <div class="consistency-fact">
              <span class="consistency-fact__icon">${icon('target')}</span>
              <strong>${stats.weeklyTotal}</strong>
              <span>of ${stats.weeklyGoal} min goal</span>
            </div>
          </div>
          <div class="streak-days streak-days--lg">${stats.weekly
            .map(
              (day) => `
              <span class="streak-day ${day.minutes > 0 ? 'is-active' : ''}" title="${escapeHtml(day.label)} · ${day.minutes} min">
                <span class="streak-day__dot" aria-hidden="true"></span>
                <span class="streak-day__label">${escapeHtml(day.label.slice(0, 1))}</span>
              </span>`,
            )
            .join('')}</div>
          <p class="card__note">${icon('info')} Best day this week: ${bestDay.minutes} minutes${bestDay.label !== '—' ? ` on ${escapeHtml(bestDay.label)}` : ''}.</p>
        </aside>
      </div>

      <section class="card readiness-card" aria-labelledby="readiness-title">
        <header class="card__head card__head--row">
          <div>
            <p class="eyebrow">Level by level</p>
            <h2 class="card__title" id="readiness-title">Curriculum coverage</h2>
            <p class="card__sub">How much of each level you have worked through. This is coverage, not an official CEFR certification.</p>
          </div>
          <span class="chip chip--soft">${icon('layers')} ${curriculum.levels.length} levels</span>
        </header>
        <div class="readiness-list">${readinessRows(stats)}</div>
        <p class="card__note">${icon('info')} Exam readiness uses recorded mock-paper scores only. Writing and speaking stay unscored self-practice.</p>
      </section>

      ${skillAnalyticsHTML(skillReport, skillInventory)}

      <div class="progress-grid">
        <section class="card quiz-card" aria-labelledby="quiz-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Assessments</p>
              <h2 class="card__title" id="quiz-title">Recent checks</h2>
            </div>
            <span class="chip chip--soft">${stats.quizCount} recorded</span>
          </header>
          ${quizRows(stats)}
        </section>

        <section class="card skills-card" aria-labelledby="progress-skills-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Skill balance</p>
              <h2 class="card__title" id="progress-skills-title">Where you stand</h2>
            </div>
            <span class="chip chip--soft">${stats.overallSkill}% average</span>
          </header>
          ${skillBarsHTML(stats.skills, { showEmptyHint: true })}
          <p class="card__note">${icon('info')} Skill scores start at zero and only move when the matching activity is completed. No invented baseline.</p>
        </section>
      </div>

      <div class="progress-grid progress-grid--bottom">
        <section class="card favourites-card" aria-labelledby="favourites-title">
          <header class="card__head card__head--row">
            <div>
              <p class="eyebrow">Revision shelf</p>
              <h2 class="card__title" id="favourites-title">Saved words</h2>
            </div>
            <a class="btn btn--ghost btn--sm" href="#/vocabulary">All vocabulary ${icon('arrow-right')}</a>
          </header>
          ${favouriteWordsHTML(stats)}
          ${
            favouriteWord
              ? `<button class="link-arrow link-arrow--button" type="button" data-speak="${escapeHtml(favouriteWord.de)}">
                   ${icon('volume')} Hear “${escapeHtml(favouriteWord.de)}”
                 </button>`
              : ''
          }
        </section>

        <aside class="card next-step-card" aria-labelledby="next-step-title">
          <p class="eyebrow">Recommended next step</p>
          <h2 class="card__title" id="next-step-title">${escapeHtml(nextLesson ? nextLesson.title : 'Choose your next level')}</h2>
          <p class="card__sub">${
            nextLesson
              ? `${escapeHtml(next.lesson.moduleTitle)} · ${nextLesson.minutes} min · ${escapeHtml(nextLesson.skills.join(' · '))}`
              : 'Every lesson in this level has been covered. Continue with the next CEFR level or revise anything you like.'
          }</p>
          <a class="btn btn--primary btn--block" href="${nextLesson ? `#/courses/${stats.currentLevel.id}/${nextLesson.id}` : '#/courses'}">
            ${nextLesson ? 'Open lesson' : 'Browse courses'} ${icon('arrow-right')}
          </a>
          <button class="btn btn--ghost btn--block" type="button" data-demo-toggle>
            ${icon(stats.demo ? 'x' : 'sparkles')} ${stats.demo ? 'Stop demo preview' : 'Preview with demo data'}
          </button>
          <p class="card__note">${icon('shield')} Local only. Export or reset your data in Settings.</p>
        </aside>
      </div>
    </div>`;

  return {
    title: 'My Progress',
    crumbs: [{ label: 'My Progress' }],
    html,
    mount(root) {
      root.querySelectorAll('[data-demo-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
          const enable = !getPreferences().demoData;
          updatePreferences({ demoData: enable });
          toast(
            enable
              ? 'Demo data is on — these figures are illustrative, not your activity.'
              : 'Demo data is off. Showing your real local progress.',
            { type: enable ? 'warning' : 'success', duration: 3600 },
          );
          ctx.refresh();
        });
      });

      root.querySelectorAll('[data-speak]').forEach((button) => {
        button.addEventListener('click', () => speakGerman(button.dataset.speak));
      });
    },
  };
}
