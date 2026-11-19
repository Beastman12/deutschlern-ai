/**
 * One-command project verifier.
 *
 * Usage: npm run verify
 *
 * Checks the curriculum, the navigation contract, frontend module wiring,
 * asset references and the live HTTP server. Exits non-zero on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { curriculumChecks } from './checks/content-checks.mjs';
import { frontendChecks } from './checks/frontend-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
const { app } = await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);

const failures = [];
const passes = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    passes.push(name);
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name} — ${error.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/* -------------------------------------------------------------------------- */
/* Curriculum                                                                  */
/* -------------------------------------------------------------------------- */

section('Curriculum');
await check('curriculum files load', () => {
  const result = curriculumChecks();
  return result.summary;
});

/* -------------------------------------------------------------------------- */
/* Frontend                                                                    */
/* -------------------------------------------------------------------------- */

section('Frontend');
const frontend = await frontendChecks(ROOT);

await check('index.html references only existing local assets', () => {
  if (frontend.missingAssets.length) throw new Error(`missing ${frontend.missingAssets.join(', ')}`);
  return `${frontend.assetCount} assets`;
});

await check('JavaScript imports and exports resolve', () => {
  if (frontend.wiringProblems.length) throw new Error(frontend.wiringProblems.join('; '));
  return `${frontend.moduleCount} modules`;
});

await check('every referenced icon exists in the SVG sprite', () => {
  if (frontend.missingIcons.length) throw new Error(frontend.missingIcons.join(', '));
  return `${frontend.iconCount} icons`;
});

await check('navigation defines all 17 modules with honest status', () => {
  const {
    navItemCount,
    liveRoutes,
    plannedRoutes,
    roadmapRoute,
    missingMilestones,
    missingDescriptions,
  } = frontend.navigation;

  if (navItemCount !== 17) throw new Error(`expected 17 navigation modules, found ${navItemCount}`);
  if (roadmapRoute !== true) throw new Error('roadmap route is missing');
  if (liveRoutes.length !== 18) throw new Error(`expected 18 live routes, found ${liveRoutes.length}`);
  if (plannedRoutes.length !== 0) throw new Error(`expected 0 planned routes, found ${plannedRoutes.length}`);
  if (missingMilestones.length) throw new Error(`routes without milestone: ${missingMilestones.join(', ')}`);
  if (missingDescriptions.length) {
    throw new Error(`routes without description/features: ${missingDescriptions.join(', ')}`);
  }
  return `${liveRoutes.length} live · ${plannedRoutes.length} planned`;
});

await check('all route paths are unique hash links', () => {
  if (frontend.navigation.badPaths.length) throw new Error(frontend.navigation.badPaths.join(', '));
  return `${frontend.navigation.routeCount} routes`;
});

/* -------------------------------------------------------------------------- */
/* HTTP server                                                                 */
/* -------------------------------------------------------------------------- */

section('HTTP server');
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const health = await fetch(`${base}/api/health`);
  await check('/api/health responds', async () => {
    if (health.status !== 200) throw new Error(`status ${health.status}`);
    const body = await health.json();
    if (body.status !== 'ok' || body.milestone !== 9) throw new Error('unexpected health payload');
    if (body.version !== '1.0.0') throw new Error(`unexpected version ${body.version}`);
    if (!body.auth || typeof body.auth.configured !== 'boolean') throw new Error('auth health is missing');
    return `v${body.version} · milestone ${body.milestone}`;
  });

  await check('/api/ai/status reports configuration honestly', async () => {
    const response = await fetch(`${base}/api/ai/status`);
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const body = await response.json();
    if (body.status !== 'ok' || typeof body.configured !== 'boolean') throw new Error('unexpected status payload');
    if (!Array.isArray(body.modes) || !body.modes.includes('tutor') || !body.modes.includes('roleplay')) {
      throw new Error('AI modes are missing');
    }
    if (!body.configured && !body.reason) throw new Error('an unconfigured AI must explain why');
    const allowedFields = new Set([
      'status',
      'configured',
      'provider',
      'model',
      'reason',
      'modes',
      'maxMessageChars',
      'maxHistory',
    ]);
    for (const field of Object.keys(body)) {
      if (!allowedFields.has(field)) throw new Error(`status exposed an unexpected field: ${field}`);
    }
    const serialized = JSON.stringify(body);
    for (const value of [process.env.OPENAI_API_KEY, process.env.AI_API_KEY].filter(Boolean)) {
      if (serialized.includes(value)) throw new Error('status leaked a configured key value');
    }
    return body.configured ? `configured · ${body.provider}` : `not configured · ${body.provider}`;
  });

  await check('/api/speech/status reports speech configuration honestly', async () => {
    const response = await fetch(`${base}/api/speech/status`);
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const body = await response.json();
    if (body.status !== 'ok' || typeof body.configured !== 'boolean') throw new Error('unexpected status payload');
    if (!Array.isArray(body.capabilities) || !body.capabilities.includes('speech-to-text')) {
      throw new Error('speech capabilities are missing');
    }
    if (!body.configured && !body.reason) throw new Error('an unconfigured speech service must explain why');
    const allowedFields = new Set(['status', 'configured', 'provider', 'region', 'reason', 'capabilities', 'maxAudioBytes']);
    for (const field of Object.keys(body)) {
      if (!allowedFields.has(field)) throw new Error(`status exposed an unexpected field: ${field}`);
    }
    const serialized = JSON.stringify(body);
    for (const value of [process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION].filter(Boolean)) {
      if (serialized.includes(value)) throw new Error('status leaked a configured speech value');
    }
    return body.configured ? `configured · ${body.region}` : `not configured · ${body.provider}`;
  });

  await check('/api/auth/status reports accounts honestly without secrets', async () => {
    const response = await fetch(`${base}/api/auth/status`);
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const body = await response.json();
    const allowedFields = new Set([
      'status',
      'configured',
      'provider',
      'storage',
      'authenticated',
      'user',
      'reason',
      'passwordReset',
      'sessionMaxAgeSeconds',
    ]);
    for (const field of Object.keys(body)) {
      if (!allowedFields.has(field)) throw new Error(`auth status exposed an unexpected field: ${field}`);
    }
    if (typeof body.configured !== 'boolean' || typeof body.authenticated !== 'boolean') {
      throw new Error('auth status is missing booleans');
    }
    if (!body.configured && !body.reason) throw new Error('unconfigured accounts must explain why');
    if (!body.passwordReset || typeof body.passwordReset.available !== 'boolean') {
      throw new Error('password reset status is missing');
    }
    const serialized = JSON.stringify(body);
    for (const value of [process.env.SESSION_SECRET, process.env.JWT_SECRET].filter(Boolean)) {
      if (serialized.includes(value)) throw new Error('auth status leaked a secret value');
    }
    if (serialized.includes('passwordHash') || serialized.includes('tokenHash') || serialized.includes('dl_session=')) {
      throw new Error('auth status leaked credential internals');
    }
    return body.configured ? `configured · ${body.provider}` : `not configured · ${body.reason}`;
  });

  await check('/api/sync/status requires no credentials and is honest', async () => {
    const response = await fetch(`${base}/api/sync/status`);
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const body = await response.json();
    if (body.status !== 'ok' || typeof body.configured !== 'boolean' || typeof body.authenticated !== 'boolean') {
      throw new Error('unexpected sync status payload');
    }
    const allowedFields = new Set(['status', 'configured', 'authenticated', 'storage', 'reason']);
    for (const field of Object.keys(body)) {
      if (!allowedFields.has(field)) throw new Error(`sync status exposed an unexpected field: ${field}`);
    }
    return `configured · ${body.storage}`;
  });

  await check('protected account and sync routes reject anonymous access', async () => {
    for (const [method, pathname] of [['GET', '/api/auth/me'], ['GET', '/api/sync/state'], ['DELETE', '/api/auth/account']]) {
      const response = await fetch(`${base}${pathname}`, { method });
      if (response.status !== 401) throw new Error(`${method} ${pathname} → ${response.status}, expected 401`);
      const body = await response.json();
      if (!body.code) throw new Error(`${pathname} had no error code`);
    }
    return '3 protected routes';
  });

  await check('application shell and assets are reachable', async () => {
    const paths = [
      '/',
      '/css/style.css',
      '/css/components.css',
      '/css/responsive.css',
      '/js/app.js',
      '/js/lesson.js',
      '/js/gating.js',
      '/js/ai.js',
      '/js/ai-chat.js',
      '/js/tutor.js',
      '/js/conversations.js',
      '/js/speech.js',
      '/js/speech-client.js',
      '/js/speaking.js',
      '/js/pronunciation.js',
      '/js/skill-content.js',
      '/js/reading.js',
      '/js/listening.js',
      '/js/writing.js',
      '/js/writing-feedback.js',
      '/js/analytics.js',
      '/js/session.js',
      '/js/sync-client.js',
      '/js/auth-ui.js',
      '/js/theme-boot.js',
      '/assets/favicon.svg',
      '/assets/fonts/inter-latin.woff2',
      '/assets/fonts/instrument-serif-italic-latin.woff2',
    ];
    for (const pathname of paths) {
      const response = await fetch(`${base}${pathname}`);
      if (response.status !== 200) throw new Error(`${pathname} → ${response.status}`);
    }
    return `${paths.length} responses`;
  });

  await check('curriculum JSON is reachable over HTTP', async () => {
    const paths = [
      '/content/levels.json',
      '/content/grammar.json',
      '/content/vocabulary.json',
      '/content/exercise-bank.json',
      '/content/skill-practice.json',
      '/content/a1/course.json',
      '/content/a2/course.json',
      '/content/b1/course.json',
      '/content/b2/course.json',
      '/content/c1/course.json',
      '/content/c2/course.json',
    ];
    for (const pathname of paths) {
      const response = await fetch(`${base}${pathname}`);
      if (response.status !== 200) throw new Error(`${pathname} → ${response.status}`);
    }
    return `${paths.length} documents`;
  });

  await check('every lesson body is reachable over HTTP', async () => {
    const levels = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'levels.json'), 'utf8')).levels;
    const ids = [];
    for (const level of levels) {
      const course = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'content', level.id, 'course.json'), 'utf8'),
      );
      for (const module of course.modules) {
        for (const lesson of module.lessons) ids.push(lesson.id);
      }
    }
    if (ids.length !== 72) throw new Error(`curriculum defines ${ids.length} lessons, expected 72`);
    for (const id of ids) {
      const response = await fetch(`${base}/content/lessons/${id}.json`);
      if (response.status !== 200) throw new Error(`${id}.json → ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.sections) || body.sections.length !== 17) {
        throw new Error(`${id}.json does not contain 17 sections`);
      }
    }
    return `${ids.length} lesson bodies`;
  });

  await check('unknown API routes return JSON 404', async () => {
    const response = await fetch(`${base}/api/definitely-not-real`);
    if (response.status !== 404) throw new Error(`status ${response.status}`);
    const body = await response.json();
    if (body.error !== 'not_found') throw new Error('wrong error code');
    return 'JSON 404';
  });

  await check('deep links serve the SPA shell', async () => {
    const response = await fetch(`${base}/courses/a1/a1-m1-l1`);
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const html = await response.text();
    if (!html.includes('id="app"')) throw new Error('shell markup missing');
    return '200 · app shell';
  });

  await check('security headers are present', async () => {
    const response = await fetch(`${base}/`);
    const csp = response.headers.get('content-security-policy') || '';
    for (const directive of ['default-src', "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
      if (!csp.includes(directive)) throw new Error(`CSP missing ${directive}`);
    }
    if (response.headers.get('x-content-type-options') !== 'nosniff') throw new Error('missing nosniff');
    if (response.headers.get('x-frame-options') !== 'DENY') throw new Error('missing frame deny');
    return 'CSP + frame + nosniff';
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
}

/* -------------------------------------------------------------------------- */
/* Result                                                                      */
/* -------------------------------------------------------------------------- */

console.log('');
if (failures.length) {
  console.log(`VERIFY FAILED — ${failures.length} failure(s), ${passes.length} passed`);
  for (const failure of failures) console.log(`  · ${failure}`);
  process.exit(1);
}
console.log(`VERIFY PASSED — ${passes.length} checks, 0 failures`);
