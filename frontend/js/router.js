/**
 * Hash router. Hash routing keeps deployment simple (no server rewrites) and
 * lets the Express server serve a single static index.html.
 */

export function parseHash(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        // A malformed escape sequence (e.g. "#/%") must not throw out of
        // routing. Keep the raw segment so the resolver can show a safe route.
        return segment;
      }
    });
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { raw, segments, query };
}

export function resolveRoute(parsed = parseHash()) {
  const [first, second, third] = parsed.segments;

  if (!first) return { name: 'dashboard', params: {}, query: parsed.query };
  if (first === 'courses') {
    if (!second) return { name: 'courses', params: {}, query: parsed.query };
    if (!third) return { name: 'course', params: { levelId: second }, query: parsed.query };
    return { name: 'lesson', params: { levelId: second, lessonId: third }, query: parsed.query };
  }

  const known = new Set([
    'dashboard',
    'progress',
    'roadmap',
    'grammar',
    'vocabulary',
    'tutor',
    'talk',
    'speaking',
    'pronunciation',
    'listening',
    'reading',
    'writing',
    'conversations',
    'exercises',
    'exams',
    'profile',
    'settings',
  ]);

  if (known.has(first)) {
    return { name: first, params: {}, query: parsed.query };
  }

  return { name: 'not-found', params: { path: parsed.raw }, query: parsed.query };
}

export function hrefFor(name, params = {}) {
  switch (name) {
    case 'dashboard':
      return '#/dashboard';
    case 'courses':
      return '#/courses';
    case 'course':
      return `#/courses/${encodeURIComponent(params.levelId)}`;
    case 'lesson':
      return `#/courses/${encodeURIComponent(params.levelId)}/${encodeURIComponent(params.lessonId)}`;
    default:
      return `#/${name}`;
  }
}

export function createRouter(onRoute) {
  let started = false;

  const handle = () => {
    const parsed = parseHash();
    const route = resolveRoute(parsed);
    onRoute(route, parsed);
  };

  const onHashChange = () => handle();

  return {
    start() {
      if (started) return;
      started = true;
      if (!window.location.hash) {
        window.history.replaceState(null, '', '#/dashboard');
      }
      window.addEventListener('hashchange', onHashChange);
      handle();
    },
    stop() {
      started = false;
      window.removeEventListener('hashchange', onHashChange);
    },
    refresh: handle,
  };
}

export function navigate(path) {
  if (window.location.hash === path) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = path;
}
