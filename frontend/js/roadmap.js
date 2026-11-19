/**
 * Honest roadmap pages for modules that are not built yet.
 *
 * Planned navigation never opens a fake working screen. It explains what the
 * module will do, which milestone delivers it, what exists today, and where to
 * continue learning in the meantime.
 */
import { curriculum, getCourse } from './content.js';
import { ROUTES } from './routes.js';
import { escapeHtml, icon, levelBadge } from './ui.js';

export const MILESTONES = [
  {
    id: 1,
    title: 'Foundation & curriculum map',
    summary:
      'Responsive app shell, complete A1–C2 curriculum, grammar library, vocabulary library, dashboard, progress, profile and settings.',
    state: 'complete',
    delivers: ['72 lesson plans', '30 grammar topics', '48 vocabulary entries', 'Local preferences'],
  },
  {
    id: 2,
    title: 'Lesson engine',
    summary:
      'The full interactive lesson experience: explanations, rules, vocabulary, examples, practice, speaking and a gated end-of-lesson assessment.',
    state: 'complete',
    delivers: ['17-section lesson flow', 'Instant exercise scoring', '70% unlock gating', 'Saved lesson results'],
  },
  {
    id: 3,
    title: 'Grammar & vocabulary deep dive',
    summary: 'Conjugation tables, per-topic drills, flashcards, spaced repetition and mistake review.',
    state: 'complete',
    delivers: [
      'Reference tables for all 30 topics',
      '90 authored, scored drills',
      '369 sourced flashcards',
      'SM-2-style spaced repetition',
      'Automatic mistake review',
    ],
  },
  {
    id: 4,
    title: 'Practice exercises & mock exams',
    summary: 'An authored question bank, unlimited filtered practice, timed A1–C2 mock papers and an honest readiness report.',
    state: 'complete',
    delivers: [
      '1,995 sourced, authored practice questions',
      'Level, skill, type and source filters',
      '144 unscored writing and speaking prompts',
      'Timed papers with resume and auto-submit',
      'Section and skill scores without answer reveal',
    ],
  },
  {
    id: 5,
    title: 'AI tutor & real-life role-plays',
    summary: 'A real server-side AI proxy, text tutoring with corrections, and 35 curriculum-linked role-plays.',
    state: 'complete',
    delivers: [
      'Server-side AI proxy with keys kept off the client',
      'Honest 503 unavailable state without credentials',
      'Text tutor with corrections and English explanations',
      '35 authored A1–C2 scenario role-plays',
      'Locally saved conversation history',
    ],
  },
  {
    id: 6,
    title: 'Voice, pronunciation & speaking',
    summary: 'Microphone practice, German speech recognition, spoken AI replies and pronunciation comparison.',
    state: 'complete',
    delivers: [
      'Browser Web Speech microphone recognition',
      'Optional server-side Azure speech fallback',
      'Editable transcript and real spoken AI replies',
      'Word-level pronunciation comparison without invented scores',
      'Bounded local speaking and pronunciation history',
    ],
  },
  {
    id: 7,
    title: 'Accounts & secure progress sync',
    summary: 'Real registration, salted scrypt passwords, signed server-side sessions, atomic local storage, password reset and revision-checked cross-device sync.',
    state: 'complete',
    delivers: [
      'Real accounts with no client-side secrets',
      'HttpOnly signed sessions and per-user salts',
      'Atomic JSON persistence for progress',
      'Password reset with honest unconfigured states',
      'Revision conflicts resolved only by the learner',
    ],
  },
  {
    id: 8,
    title: 'Reading, listening, writing & analytics',
    summary: 'Graded skill practice with authored A1–C2 texts, real browser speech audio, deterministic writing checklists and local-first analytics.',
    state: 'complete',
    delivers: [
      '12 authored reading passages with glossary and explanations',
      '12 listening scripts with speech playback and exact dictation',
      '12 writing prompts with transparent checklist feedback',
      'Real skill analytics from saved checks only',
      'Bounded local drafts and history that sync safely',
    ],
  },
  {
    id: 9,
    title: 'Hardening, testing & deployment',
    summary: 'Hardened APIs, full test coverage, accessibility verification and reproducible production deployment.',
    state: 'complete',
    delivers: [
      'Bounded per-IP rate limits on every writable API',
      'A readiness endpoint that fails closed when misconfigured',
      'Full automated test suite with built-in coverage reporting',
      'Docker, Compose and a rotated state-backup script',
      'Production deployment guide and security checks',
    ],
  },
];

const DELIVERED_COUNT = MILESTONES.filter((milestone) => milestone.state === 'complete').length;

function stateLabel(state) {
  if (state === 'complete') return 'Delivered';
  if (state === 'next') return 'Next';
  return 'Planned';
}

function timeline({ compact = false } = {}) {
  return `
    <ol class="timeline ${compact ? 'timeline--compact' : ''}" role="list">
      ${MILESTONES.map(
        (milestone) => `
          <li class="timeline__item timeline__item--${milestone.state}">
            <span class="timeline__marker" aria-hidden="true">${
              milestone.state === 'complete' ? icon('check') : String(milestone.id)
            }</span>
            <div class="timeline__body">
              <div class="timeline__head">
                <strong>Milestone ${milestone.id} · ${escapeHtml(milestone.title)}</strong>
                <span class="chip ${milestone.state === 'complete' ? 'chip--success' : milestone.state === 'next' ? 'chip--brand' : 'chip--soft'}">
                  ${stateLabel(milestone.state)}
                </span>
              </div>
              <p>${escapeHtml(milestone.summary)}</p>
              ${
                !compact && milestone.delivers
                  ? `<ul class="timeline__delivers">${milestone.delivers.map((item) => `<li>${icon('check')} ${escapeHtml(item)}</li>`).join('')}</ul>`
                  : ''
              }
            </div>
          </li>`,
      ).join('')}
    </ol>`;
}

function scenarioLibrary() {
  return curriculum.levels
    .map((level) => {
      const course = getCourse(level.id);
      if (!course?.scenarios?.length) return '';
      return `
        <div class="scenario-group tone-${escapeHtml(level.color)}">
          <div class="scenario-group__head">
            ${levelBadge(level, { size: 'sm' })}
            <strong>${escapeHtml(level.code)} scenarios</strong>
            <span class="muted">${course.scenarios.length} role-play scenarios</span>
          </div>
          <ul class="scenario-grid" role="list">
            ${course.scenarios
              .map(
                (scenario) => `
                  <li class="scenario-tile">
                    <span class="scenario-tile__icon">${icon('message')}</span>
                    <span>
                      <strong>${escapeHtml(scenario.title)}</strong>
                      <small>${escapeHtml(scenario.titleDe)}</small>
                    </span>
                  </li>`,
              )
              .join('')}
          </ul>
        </div>`;
    })
    .join('');
}

function availableNow() {
  return `
    <div class="available-grid">
      <a class="available-card" href="#/courses/a1/a1-m1-l1">
        <span class="available-card__icon">${icon('book')}</span>
        <strong>Interactive lessons</strong>
        <small>${curriculum.totals.lessons} lessons · 17 sections · scored checks</small>
      </a>
      <a class="available-card" href="#/courses">
        <span class="available-card__icon">${icon('compass')}</span>
        <strong>Full curriculum</strong>
        <small>${curriculum.totals.lessons} lesson plans across A1–C2</small>
      </a>
      <a class="available-card" href="#/grammar">
        <span class="available-card__icon">${icon('layers')}</span>
        <strong>Grammar Academy</strong>
        <small>${curriculum.totals.grammar} topics · ${curriculum.totals.drills} scored drills</small>
      </a>
      <a class="available-card" href="#/vocabulary?tab=flashcards">
        <span class="available-card__icon">${icon('languages')}</span>
        <strong>Vocabulary Builder</strong>
        <small>${curriculum.totals.words} library words · ${curriculum.totals.cards} flashcards</small>
      </a>
      <a class="available-card" href="#/exercises">
        <span class="available-card__icon">${icon('zap')}</span>
        <strong>Practice Exercises</strong>
        <small>${curriculum.totals.exercises.toLocaleString()} authored questions · instant feedback</small>
      </a>
      <a class="available-card" href="#/exams">
        <span class="available-card__icon">${icon('trophy')}</span>
        <strong>Mock Examinations</strong>
        <small>Timed A1–C2 papers · local readiness report</small>
      </a>
      <a class="available-card" href="#/tutor">
        <span class="available-card__icon">${icon('sparkles')}</span>
        <strong>AI German Tutor</strong>
        <small>Real provider replies · corrections · explanations</small>
      </a>
      <a class="available-card" href="#/conversations">
        <span class="available-card__icon">${icon('message')}</span>
        <strong>Real-Life Conversations</strong>
        <small>${curriculum.totals.scenarios} authored scenarios · A1–C2</small>
      </a>
      <a class="available-card" href="#/speaking">
        <span class="available-card__icon">${icon('mic')}</span>
        <strong>Speaking Practice</strong>
        <small>Real recognition · editable transcript · spoken AI reply</small>
      </a>
      <a class="available-card" href="#/pronunciation">
        <span class="available-card__icon">${icon('volume')}</span>
        <strong>Pronunciation Trainer</strong>
        <small>Model audio · word comparison · no invented scores</small>
      </a>
      <a class="available-card" href="#/reading">
        <span class="available-card__icon">${icon('book-open')}</span>
        <strong>Reading Practice</strong>
        <small>${curriculum.totals.skillTasks / 3} graded passages · glossary · explained answers</small>
      </a>
      <a class="available-card" href="#/listening">
        <span class="available-card__icon">${icon('headphones')}</span>
        <strong>Listening Practice</strong>
        <small>${curriculum.totals.skillTasks / 3} scripts · real speech audio · dictation</small>
      </a>
      <a class="available-card" href="#/writing">
        <span class="available-card__icon">${icon('pen')}</span>
        <strong>Writing Practice</strong>
        <small>${curriculum.totals.skillTasks / 3} prompts · deterministic checklist · saved drafts</small>
      </a>
    </div>`;
}

function featureList(route) {
  if (!route?.features?.length) return '';
  return `
    <ul class="feature-list" role="list">
      ${route.features
        .map(
          (feature) => `
            <li class="feature-list__item">
              <span class="feature-list__check">${icon('check')}</span>
              <span>${escapeHtml(feature)}</span>
            </li>`,
        )
        .join('')}
    </ul>`;
}

export function renderPlanned(ctx) {
  const routeId = ctx.routeId;
  const route = ROUTES[routeId];
  if (!route) {
    return {
      title: 'Roadmap',
      crumbs: [{ label: 'Roadmap' }],
      html: `<div class="page page--narrow"><div class="card"><h1 class="page-title">Module not found</h1></div></div>`,
      mount() {},
    };
  }

  const milestone = MILESTONES.find((item) => item.id === route.milestone);
  const isConversations = routeId === 'conversations';
  const isTutor = routeId === 'tutor';

  const html = `
    <div class="page page--roadmap">
      <header class="roadmap-hero">
        <div class="roadmap-hero__main">
          <span class="roadmap-hero__icon">${icon(route.icon)}</span>
          <p class="eyebrow">${escapeHtml(route.group)} · Milestone ${route.milestone}</p>
          <h1 class="page-title">${escapeHtml(route.label)}</h1>
          <p class="roadmap-hero__desc">${escapeHtml(route.description || '')}</p>
          <div class="roadmap-hero__actions">
            <a class="btn btn--primary" href="#/courses">Keep learning now ${icon('arrow-right')}</a>
            <a class="btn btn--soft" href="#/roadmap">Full roadmap</a>
          </div>
        </div>
        <aside class="roadmap-hero__status">
          <span class="chip chip--warning">${icon('clock')} Not available yet</span>
          <strong>Milestone ${route.milestone}</strong>
          <span>${escapeHtml(milestone?.title || '')}</span>
          <p>${escapeHtml(milestone?.summary || '')}</p>
          <div class="roadmap-hero__progress">
            <span style="width:${Math.round((DELIVERED_COUNT / MILESTONES.length) * 100)}%"></span>
          </div>
          <small>Milestone ${DELIVERED_COUNT} of ${MILESTONES.length} delivered</small>
        </aside>
      </header>

      <div class="notice notice--info" role="note">
        <span class="notice__icon">${icon('info')}</span>
        <div>
          <strong>No placeholder controls here.</strong>
          <p>${
            isTutor
              ? 'A chat box that returns canned text would be dishonest. The tutor uses a real server-side AI provider, with keys kept off the client.'
              : isConversations
                ? 'The 35 scenarios come directly from the six course documents, so practice aligns with the lesson you just studied.'
                : 'This module is designed and scheduled. It will appear in navigation as a working feature only when it actually works.'
          }</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/roadmap">Roadmap ${icon('arrow-right')}</a>
      </div>

      <div class="roadmap-layout">
        <div class="roadmap-main">
          <section class="card roadmap-features" aria-labelledby="features-title">
            <header class="card__head">
              <p class="eyebrow">What it will do</p>
              <h2 class="card__title" id="features-title">Capabilities in scope</h2>
            </header>
            ${featureList(route)}
          </section>

          ${
            isConversations
              ? `<section class="card roadmap-scenarios" aria-labelledby="scenarios-title">
                   <header class="card__head">
                     <p class="eyebrow">Curriculum-linked</p>
                     <h2 class="card__title" id="scenarios-title">Every scenario already mapped</h2>
                     <p class="card__sub">These role-plays come directly from the six course documents, so practice aligns with the lesson you just studied.</p>
                   </header>
                   <div class="scenario-library">${scenarioLibrary()}</div>
                 </section>`
              : ''
          }

          <section class="card roadmap-available" aria-labelledby="available-title">
            <header class="card__head">
              <p class="eyebrow">Meanwhile</p>
              <h2 class="card__title" id="available-title">What is live today</h2>
              <p class="card__sub">Milestones 1–8 already give you the whole route, interactive lessons, scored drills, scheduled flashcards, unlimited practice, timed papers, AI conversation, voice practice, graded reading, listening and writing, plus optional cross-device sync.</p>
            </header>
            ${availableNow()}
          </section>

          <section class="card roadmap-timeline" aria-labelledby="timeline-title">
            <header class="card__head">
              <p class="eyebrow">Delivery plan</p>
              <h2 class="card__title" id="timeline-title">Where this sits</h2>
            </header>
            ${timeline()}
          </section>
        </div>

        <aside class="roadmap-side">
          <section class="card roadmap-why">
            <p class="eyebrow">Why wait?</p>
            <h2 class="card__title">Built in the right order.</h2>
            <p>The lesson engine came first because every later feature — exercises, exams, AI corrections, voice — depends on a trustworthy record of what you have learned.</p>
            <a class="link-arrow" href="#/courses">Explore the curriculum ${icon('arrow-right')}</a>
          </section>

          <section class="card roadmap-side-card">
            <p class="eyebrow">Your current level</p>
            <div class="roadmap-level">
              ${levelBadge(ctx.stats.currentLevel, { size: 'lg' })}
              <div>
                <strong>${escapeHtml(ctx.stats.currentLevel?.code || 'A1')} · ${escapeHtml(ctx.stats.currentLevel?.name || 'Beginner')}</strong>
                <span>${escapeHtml(ctx.stats.currentLevel?.title || '')}</span>
              </div>
            </div>
            <a class="btn btn--soft btn--block" href="#/courses/${ctx.stats.currentLevel?.id || 'a1'}">
              Open course ${icon('arrow-right')}
            </a>
          </section>

          <section class="card roadmap-side-card">
            <p class="eyebrow">Track progress</p>
            <h2 class="card__title">${ctx.stats.completedCount} lessons covered</h2>
            <p class="card__sub">Completions, assessment scores and study time are recorded locally on this device.</p>
            <a class="btn btn--ghost btn--block" href="#/progress">My progress ${icon('arrow-right')}</a>
          </section>
        </aside>
      </div>
    </div>`;

  return {
    title: route.label,
    crumbs: [{ label: route.label }],
    html,
    mount() {},
  };
}

export function renderRoadmapPage(ctx) {
  const planned = Object.values(ROUTES).filter((route) => route.status === 'planned');

  const html = `
    <div class="page page--roadmap">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Product roadmap</p>
          <h1 class="page-title">Nine milestones. No smoke and mirrors.</h1>
          <p class="page-sub">DeutschLern AI ships in honest increments. Navigation marks every module with the milestone that delivers it, and planned pages explain what is missing.</p>
        </div>
        <div class="page-head__actions">
          <span class="chip chip--success">${icon('check')} Milestone ${DELIVERED_COUNT} delivered</span>
        </div>
      </header>

      <div class="notice notice--info" role="note">
        <span class="notice__icon">${icon('sparkles')}</span>
        <div>
          <strong>Current stage: hardened, tested and ready to deploy.</strong>
          <p>All ${curriculum.totals.lessons} lessons, ${curriculum.totals.drills} grammar drills, ${curriculum.totals.cards} flashcards, ${curriculum.totals.exercises.toLocaleString()} practice questions and ${curriculum.totals.skillTasks} authored skill tasks are live. APIs are rate-limited, readiness fails closed when misconfigured, and Docker, Compose and backup tooling make a self-hosted deploy reproducible.</p>
        </div>
        <a class="btn btn--primary btn--sm" href="#/courses">Open curriculum ${icon('arrow-right')}</a>
      </div>

      <div class="roadmap-overview">
        <section class="card roadmap-full-timeline" aria-labelledby="full-timeline-title">
          <header class="card__head">
            <p class="eyebrow">The plan</p>
            <h2 class="card__title" id="full-timeline-title">From foundation to production</h2>
          </header>
          ${timeline()}
        </section>

        <aside class="roadmap-overview__side">
          <section class="card">
            <p class="eyebrow">Planned modules</p>
            <h2 class="card__title">${planned.length} modules scheduled</h2>
            ${
              planned.length
                ? `<ul class="planned-links" role="list">
                    ${planned
                      .map(
                        (route) => `
                          <li>
                            <a class="planned-link" href="${route.path}">
                              <span class="planned-link__icon">${icon(route.icon)}</span>
                              <span>
                                <strong>${escapeHtml(route.label)}</strong>
                                <small>Milestone ${route.milestone}</small>
                              </span>
                              ${icon('chevron-right')}
                            </a>
                          </li>`,
                      )
                      .join('')}
                  </ul>`
                : '<p class="card__sub">Every navigation module is live. All nine milestones are delivered; no planned screens remain.</p>'
            }
          </section>

          <section class="card">
            <p class="eyebrow">Delivered now</p>
            <h2 class="card__title">Milestones 1–9</h2>
            <p class="card__sub">The foundation, lesson engine, grammar and vocabulary deep dive, assessment layer, AI conversation layer, voice layer, graded skills layer and hardening pass are complete: the full route, interactive lessons, scored drills, flashcards, authored practice, timed papers, real provider-backed conversations, honest speech practice, graded reading, listening and writing, plus rate limits, readiness checks and production deployment tooling.</p>
            ${availableNow()}
          </section>
        </aside>
      </div>
    </div>`;

  return {
    title: 'Roadmap',
    crumbs: [{ label: 'Roadmap' }],
    html,
    mount() {},
  };
}
