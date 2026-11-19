/**
 * Application bootstrap.
 *
 * Loads the curriculum, initialises the shell, then renders hash-routed views.
 * A view returns { title, crumbs, html, mount(root) }; this file owns nothing
 * about individual screens.
 */
import { loadCurriculum } from './content.js';
import { getState, subscribe } from './store.js';
import { getLearnerStats } from './stats.js';
import { createRouter } from './router.js';
import { ROUTES } from './routes.js';
import { initTheme, applyAccessibility } from './theme.js';
import { initNavigation } from './navigation.js';
import { closeAllModals, escapeHtml, icon, toast } from './ui.js';
import { getSessionSnapshot, refreshSession, subscribeSession } from './session.js';
import { initSync, setConflictHandler } from './sync-client.js';
import { openConflictDialog } from './auth-ui.js';

import { renderDashboard } from './dashboard.js';
import { renderProgress } from './progress.js';
import { renderCourses, renderCourse } from './courses.js';
import { renderLesson } from './lesson.js';
import { renderGrammar } from './grammar.js';
import { renderVocabulary } from './vocabulary.js';
import { renderExercises } from './exercises.js';
import { renderExams } from './exams.js';
import { renderTutor } from './tutor.js';
import { renderTalk } from './talk.js';
import { renderConversations } from './conversations.js';
import { renderSpeaking } from './speaking.js';
import { renderPronunciation } from './pronunciation.js';
import { renderListening } from './listening.js';
import { renderReading } from './reading.js';
import { renderWriting } from './writing.js';
import { renderProfile } from './profile.js';
import { renderSettings } from './settings.js';
import { renderNotFound } from './notfound.js';
import { renderPlanned, renderRoadmapPage } from './roadmap.js';

const main = document.getElementById('main');

// The app uses the URL hash for routing. A native `#main` jump would replace
// the route with `#main` and land on the 404 screen, so keep focus behaviour
// without touching the hash.
document.querySelector('[data-skip-link]')?.addEventListener('click', (event) => {
  event.preventDefault();
  main?.focus({ preventScroll: true });
});

const PLANNED_ROUTES = Object.fromEntries(
  Object.entries(ROUTES)
    .filter(([, route]) => route.status === 'planned')
    .map(([id]) => [id, renderPlanned]),
);

const VIEWS = {
  dashboard: renderDashboard,
  progress: renderProgress,
  roadmap: renderRoadmapPage,
  courses: renderCourses,
  course: renderCourse,
  lesson: renderLesson,
  grammar: renderGrammar,
  vocabulary: renderVocabulary,
  exercises: renderExercises,
  exams: renderExams,
  tutor: renderTutor,
  talk: renderTalk,
  conversations: renderConversations,
  speaking: renderSpeaking,
  pronunciation: renderPronunciation,
  listening: renderListening,
  reading: renderReading,
  writing: renderWriting,
  profile: renderProfile,
  settings: renderSettings,
  'not-found': (ctx) => renderNotFound(ctx),
  ...PLANNED_ROUTES,
};

let nav = null;
let router = null;
let firstRender = true;
let currentRouteName = 'dashboard';
let activeView = null;

// Every render bumps the token. A slow view that resolves after the learner
// has already navigated elsewhere must never paint over the newer screen.
let renderToken = 0;
let loadingTimer = null;

function showRouteLoading() {
  window.clearTimeout(loadingTimer);
  loadingTimer = window.setTimeout(() => {
    if (!main || main.getAttribute('aria-busy') !== 'true') return;
    main.innerHTML = `
      <div class="page page--narrow">
        <div class="route-loading card" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <p>Loading this screen…</p>
        </div>
      </div>`;
  }, 180);
}

function activeNavId(routeName) {
  if (routeName === 'course' || routeName === 'lesson') return 'courses';
  return ROUTES[routeName] ? routeName : null;
}

function setDocumentTitle(title) {
  document.title = title ? `${title} · DeutschLern AI` : 'DeutschLern AI — Learn German. Speak German. Live German.';
}

function errorView(error) {
  const message = escapeHtml(error?.message || 'Unknown error');
  return {
    title: 'Something went wrong',
    crumbs: [{ label: 'Error' }],
    html: `
      <div class="page page--narrow">
        <div class="error-page card">
          <span class="error-page__code">!</span>
          <span class="error-page__icon">${icon('info')}</span>
          <h1 class="error-page__title">This screen could not load</h1>
          <p class="error-page__text">The curriculum loaded, but this view hit an unexpected problem. Your saved progress is safe.</p>
          <pre class="error-page__detail">${message}</pre>
          <div class="error-page__actions">
            <a class="btn btn--primary" href="#/dashboard">${icon('grid')} Back to dashboard</a>
            <button class="btn btn--soft" type="button" data-retry-view>Try again</button>
          </div>
        </div>
      </div>`,
    mount(root) {
      root.querySelector('[data-retry-view]')?.addEventListener('click', () => router?.refresh());
    },
  };
}

async function render(route, parsed) {
  if (!main) return;
  const token = ++renderToken;

  // A dialog opened from a deep link or the previous screen must not survive
  // navigation (browser Back, a hash edit, or a palette result).
  closeAllModals();

  currentRouteName = route.name;
  const renderer = VIEWS[route.name] || VIEWS['not-found'];

  let view;
  try {
    main.setAttribute('aria-busy', 'true');
    // Keep stats inside the guarded section: one bad persisted value must not
    // abort the route before the error view can render. ctx still receives it.
    const stats = getLearnerStats();
    const ctx = {
      params: route.params || {},
      query: parsed?.query || {},
      routeId: route.name,
      stats,
      // Always re-resolve the current hash: a callback firing after navigation
      // must refresh the screen the learner is actually looking at.
      refresh: () => router?.refresh(),
    };
    const result = renderer(ctx);
    if (result && typeof result.then === 'function') {
      showRouteLoading();
      view = await result;
      if (token !== renderToken) return;
    } else {
      view = result;
    }
  } catch (error) {
    if (token !== renderToken) return;
    console.error(`[app] Failed to render route "${route.name}".`, error);
    view = errorView(error);
  } finally {
    window.clearTimeout(loadingTimer);
  }

  if (token !== renderToken) return;

  try {
    // Release microphones, recorders and speech synthesis from the old screen
    // before its DOM is replaced. A broken cleanup must never stop navigation:
    // isolate it and drop the stale view either way.
    if (activeView && activeView !== view) {
      try {
        if (typeof activeView.destroy === 'function') activeView.destroy();
      } catch (error) {
        console.error('[app] Previous view failed to clean up.', error);
      } finally {
        activeView = null;
      }
    }
    activeView = view;
    main.innerHTML = view.html;
    main.setAttribute('aria-busy', 'false');

    setDocumentTitle(view.title);
    nav?.setActiveRoute(activeNavId(route.name));
    if (route.name === 'dashboard') nav?.setCrumbs([]);
    else nav?.setCrumbs(view.crumbs || []);

    if (typeof view.mount === 'function') {
      view.mount(main);
    }

    nav?.setProfile(getState().profile, getSessionSnapshot());
    nav?.updateHeader(getLearnerStats());

    if (firstRender) {
      firstRender = false;
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      main.focus({ preventScroll: true });
    }
  } catch (error) {
    console.error(`[app] Failed to mount route "${route.name}".`, error);
    try {
      if (activeView && typeof activeView.destroy === 'function') activeView.destroy();
    } catch (cleanupError) {
      console.error('[app] Failed view also failed to clean up.', cleanupError);
    }
    activeView = null;
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = errorView(error).html;
    main.querySelector('[data-retry-view]')?.addEventListener('click', () => router?.refresh());
  }
}

function showBootError(error) {
  if (!main) return;
  console.error('[app] Curriculum failed to load.', error);
  main.setAttribute('aria-busy', 'false');
  main.innerHTML = `
    <div class="page page--narrow">
      <div class="error-page card">
        <span class="error-page__code">!</span>
        <span class="error-page__icon">${icon('compass')}</span>
        <h1 class="error-page__title">The curriculum could not load</h1>
        <p class="error-page__text">
          DeutschLern AI loads its lessons as JSON from this server. The request failed, so there is no content to show yet.
          Check that the server is running, then try again.
        </p>
        <pre class="error-page__detail">${escapeHtml(error?.message || 'Unknown loading error')}</pre>
        <div class="error-page__actions">
          <button class="btn btn--primary" type="button" data-reload>${icon('rotate')} Reload the app</button>
        </div>
        <div class="error-page__links">
          <span>Diagnostics:</span>
          <a href="/api/health">/api/health</a>
          <a href="/content/levels.json">/content/levels.json</a>
        </div>
      </div>
    </div>`;
  main.querySelector('[data-reload]')?.addEventListener('click', () => window.location.reload());
  setDocumentTitle('Could not load');
}

async function boot() {
  initTheme();

  // A full or disabled localStorage means changes only exist in memory. Say so
  // once instead of letting the learner believe progress was saved.
  window.addEventListener('dl:storage-error', () => {
    toast('This browser could not save your changes. Check storage settings or free some space.', {
      type: 'error',
      duration: 9000,
    });
  });

  try {
    // Both calls fail soft: a missing account service never blocks the course.
    await Promise.all([loadCurriculum(), refreshSession()]);
  } catch (error) {
    showBootError(error);
    return;
  }

  applyAccessibility();
  nav = initNavigation();
  nav.setProfile(getState().profile, getSessionSnapshot());
  nav.updateHeader(getLearnerStats());

  initSync();
  setConflictHandler((conflict) => {
    openConflictDialog(conflict, { onResolved: () => router?.refresh() });
  });

  router = createRouter(render);
  router.start();

  document.documentElement.dataset.app = 'ready';

  subscribe((detail) => {
    nav?.setProfile(getState().profile, getSessionSnapshot());
    nav?.updateHeader(getLearnerStats());
    // Another tab changed this browser's data: pull the current view again.
    if (detail?.type === 'external' && router) router.refresh();
  });

  const authKey = (session) => (session.authenticated && session.user ? session.user.id : 'guest');
  let lastAuthKey = authKey(getSessionSnapshot());
  subscribeSession((session) => {
    nav?.setProfile(getState().profile, session);
    const nextKey = authKey(session);
    // Account changes made from the top-bar menu must refresh the current
    // screen too, not just the profile page that owns the form.
    if (nextKey !== lastAuthKey) {
      lastAuthKey = nextKey;
      router?.refresh();
    }
  });

  window.addEventListener('keydown', (event) => {
    const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    if (!isShortcut) return;
    event.preventDefault();
    nav?.openSearchPalette();
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[app] Unhandled promise rejection.', event.reason);
    toast('Something unexpected happened. Your saved progress is unaffected.', {
      type: 'error',
      duration: 4200,
    });
  });

  window.addEventListener('error', (event) => {
    if (event.message) console.error('[app] Uncaught error.', event.message);
  });
}

/** Small hook for automated smoke checks; harmless in production. */
window.__deutschlern = {
  get ready() {
    return document.documentElement.dataset.app === 'ready';
  },
  get route() {
    return currentRouteName;
  },
  stats: () => getLearnerStats(),
};

boot();
