/**
 * HTTP and security tests for the Express server.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { app, readTrustProxy } from '../server/index.js';
import { loadAIConfig } from '../server/ai.js';
import { createAIRouter } from '../server/ai-router.js';
import { loadSpeechConfig } from '../server/speech.js';
import { createSpeechRouter } from '../server/speech-router.js';

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const get = (pathname, options) => fetch(`${base}${pathname}`, options);

test('GET /api/health reports a healthy Milestone 9 service', async () => {
  const response = await get('/api/health');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'deutschlern-ai');
  assert.equal(body.milestone, 9);
  assert.equal(body.version, '1.0.0');
  assert.equal(typeof body.auth.configured, 'boolean');
  assert.equal(body.auth.storage, 'file');
  assert.ok(Number.isInteger(body.uptimeSeconds));
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('account status endpoints are public, honest and secret-free', async () => {
  const authResponse = await get('/api/auth/status');
  assert.equal(authResponse.status, 200);
  const authBody = await authResponse.json();
  assert.equal(authBody.status, 'ok');
  assert.equal(authBody.authenticated, false);
  assert.equal(typeof authBody.configured, 'boolean');
  assert.ok(!('passwordHash' in authBody));
  assert.ok(!('tokenHash' in authBody));
  assert.ok(!('secret' in authBody));

  const syncResponse = await get('/api/sync/status');
  assert.equal(syncResponse.status, 200);
  const syncBody = await syncResponse.json();
  assert.equal(syncBody.status, 'ok');
  assert.equal(syncBody.authenticated, false);
  assert.equal(syncBody.storage, 'file');
});

test('account and sync writes require a real session', async () => {
  const cases = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/sync/state'],
    ['PUT', '/api/sync/state'],
    ['DELETE', '/api/sync/state'],
    ['DELETE', '/api/auth/account'],
    ['POST', '/api/auth/logout'],
  ];
  for (const [method, pathname] of cases) {
    const response = await get(pathname, { method });
    assert.equal(response.status, 401, `${method} ${pathname} should require authentication`);
    const body = await response.json();
    assert.equal(body.code, 'auth_required');
  }
});

test('GET /api/ai/status is credential-free and honest', async () => {
  const response = await get('/api/ai/status');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.configured, 'boolean');
  assert.ok(body.modes.includes('tutor'));
  assert.ok(body.modes.includes('roleplay'));
  if (!body.configured) assert.match(body.reason, /\S/);

  // The reason may honestly name a missing environment variable. What must
  // never appear is a key field or an actual configured key value.
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
    assert.ok(allowedFields.has(field), `unexpected public field "${field}"`);
  }
  for (const field of ['apiKey', 'api_key', 'key', 'token', 'secret']) {
    assert.ok(!(field in body), `${field} must not be sent to the browser`);
  }
  const serialized = JSON.stringify(body);
  for (const value of [process.env.OPENAI_API_KEY, process.env.AI_API_KEY].filter(Boolean)) {
    assert.ok(!serialized.includes(value), 'a configured key value leaked into the status response');
  }
});

test('AI chat returns an explicit 503 when no provider is configured', async () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/ai', createAIRouter({ config: loadAIConfig({ AI_PROVIDER: 'openai' }) }));
  let testServer;
  await new Promise((resolve) => {
    testServer = testApp.listen(0, '127.0.0.1', () => resolve());
  });
  try {
    const { port } = testServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'tutor', level: 'a1', messages: [{ role: 'user', text: 'Hallo' }] }),
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'ai_not_configured');
    assert.equal(body.configured, false);
  } finally {
    testServer.closeAllConnections?.();
    await new Promise((resolve) => testServer.close(resolve));
  }
});

test('GET /api/speech/status is credential-free and honest', async () => {
  const response = await get('/api/speech/status');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.configured, 'boolean');
  assert.equal(body.provider, 'azure-speech');
  assert.ok(body.capabilities.includes('speech-to-text'));
  if (!body.configured) assert.match(body.reason, /\S/);

  const allowedFields = new Set(['status', 'configured', 'provider', 'region', 'reason', 'capabilities', 'maxAudioBytes']);
  for (const field of Object.keys(body)) {
    assert.ok(allowedFields.has(field), `unexpected public field "${field}"`);
  }
  for (const field of ['apiKey', 'api_key', 'key', 'token', 'secret']) {
    assert.ok(!(field in body), `${field} must not be sent to the browser`);
  }
  const serialized = JSON.stringify(body);
  for (const value of [process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION].filter(Boolean)) {
    assert.ok(!serialized.includes(value), 'a configured speech value leaked into the status response');
  }
});

test('POST /api/speech/transcribe returns 503 without Azure credentials', async () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/speech', createSpeechRouter({ config: loadSpeechConfig({}) }));
  let testServer;
  await new Promise((resolve) => {
    testServer = testApp.listen(0, '127.0.0.1', () => resolve());
  });
  try {
    const { port } = testServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/speech/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio: 'UklGRg', sampleRate: 16000 }),
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'speech_not_configured');
    assert.equal(body.configured, false);
  } finally {
    testServer.closeAllConnections?.();
    await new Promise((resolve) => testServer.close(resolve));
  }
});

test('security headers are applied to documents and API responses', async () => {
  for (const pathname of ['/', '/api/health']) {
    const response = await get(pathname);
    const csp = response.headers.get('content-security-policy') || '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.ok(response.headers.get('permissions-policy'));
  }
});

test('API responses are not cacheable and vary by session cookie', async () => {
  for (const pathname of [
    '/api/health',
    '/api/auth/status',
    '/api/ai/status',
    '/api/speech/status',
    '/api/sync/status',
  ]) {
    const response = await get(pathname);
    assert.equal(response.headers.get('cache-control'), 'no-store', pathname);
    assert.match(response.headers.get('vary') || '', /Cookie/i, pathname);
  }
});

test('the application shell is served with its assets', async () => {
  const response = await get('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const html = await response.text();
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<div class="app" id="app">/);
  assert.match(html, /js\/theme-boot\.js/);
  assert.match(html, /js\/app\.js/);
  assert.match(html, /id="boot"/);
  assert.match(html, /Skip to main content/);
});

test('CSS, JavaScript and font assets return the expected types', async () => {
  const assets = [
    ['/css/style.css', /text\/css/],
    ['/css/components.css', /text\/css/],
    ['/css/responsive.css', /text\/css/],
    ['/js/app.js', /javascript/],
    ['/js/theme-boot.js', /javascript/],
    ['/assets/favicon.svg', /image\/svg\+xml/],
    ['/assets/fonts/inter-latin.woff2', /font\/woff2|application\/octet-stream/],
    ['/assets/fonts/instrument-serif-italic-latin.woff2', /font\/woff2|application\/octet-stream/],
  ];

  for (const [pathname, type] of assets) {
    const response = await get(pathname);
    assert.equal(response.status, 200, `${pathname} should exist`);
    assert.match(response.headers.get('content-type'), type, `${pathname} has the wrong type`);
    const body = await response.arrayBuffer();
    assert.ok(body.byteLength > 100, `${pathname} is unexpectedly small`);
  }
});

test('all curriculum JSON documents are served', async () => {
  const documents = [
    '/content/levels.json',
    '/content/grammar.json',
    '/content/vocabulary.json',
    ...['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((id) => `/content/${id}/course.json`),
  ];

  for (const pathname of documents) {
    const response = await get(pathname);
    assert.equal(response.status, 200, `${pathname} should exist`);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.equal(typeof body, 'object');
    assert.ok(body !== null);
  }
});

test('unknown API routes return a JSON 404 instead of HTML', async () => {
  const response = await get('/api/not-a-route');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.error, 'not_found');
  assert.match(body.message, /No API route matches/);
});

test('POST /api/health is not silently accepted', async () => {
  const response = await get('/api/health', { method: 'POST' });
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, 'not_found');
});

test('missing content files are a real 404', async () => {
  const response = await get('/content/not-a-level/course.json');
  assert.equal(response.status, 404);
});

test('direct navigation falls back to the single-page app', async () => {
  for (const pathname of ['/dashboard', '/courses/a1', '/some/deep/link']) {
    const response = await get(pathname);
    assert.equal(response.status, 200, `${pathname} should serve the shell`);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /<div class="app" id="app">/);
  }
});

test('HEAD requests are supported for the shell', async () => {
  const response = await get('/', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
});

test('write methods on unknown non-API paths are not served the shell', async () => {
  const response = await get('/some/form', { method: 'POST' });
  assert.equal(response.status, 404);
});

test('GET /api/health/ready reports readiness honestly without exposing credentials', async () => {
  const response = await get('/api/health/ready');
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('x-powered-by'), null);
  const body = await response.json();

  // HTTP status and payload must agree: 200 means ready, 503 fails closed.
  if (response.status === 200) {
    assert.equal(body.status, 'ready');
    assert.equal(body.service, 'deutschlern-ai');
    assert.equal(body.version, '1.0.0');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  } else {
    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_ready');
    assert.match(body.reason, /\S/);
  }

  const allowed = new Set(['status', 'service', 'version', 'timestamp', 'reason']);
  for (const field of Object.keys(body)) {
    assert.ok(allowed.has(field), `unexpected readiness field "${field}"`);
  }
  for (const field of ['secret', 'apiKey', 'api_key', 'key', 'token', 'passwordHash', 'config', 'db']) {
    assert.ok(!(field in body), `${field} must never appear in readiness`);
  }
});

test('TRUST_PROXY is opt-in and parsed only for proxy setups', () => {
  assert.equal(readTrustProxy(undefined), false);
  assert.equal(readTrustProxy(''), false);
  assert.equal(readTrustProxy('false'), false);
  assert.equal(readTrustProxy('0'), false);
  assert.equal(readTrustProxy('true'), 1);
  assert.equal(readTrustProxy('1'), 1);
  assert.equal(readTrustProxy('2'), 2);
  assert.deepEqual(readTrustProxy('10.0.0.1, 10.0.0.2'), ['10.0.0.1', '10.0.0.2']);
  assert.equal(app.get('trust proxy'), readTrustProxy(process.env.TRUST_PROXY));
});

test('oversized API bodies are rejected with a JSON 413', async () => {
  const response = await get('/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blob: 'x'.repeat(3.3 * 1024 * 1024) }),
  });
  assert.equal(response.status, 413);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.error, 'request_error');
});

test('smaller per-router body caps apply without a global JSON parser', async () => {
  const cases = [
    ['/api/auth/register', { email: 'big@example.com', password: 'DeutschLern1', blob: 'x'.repeat(70 * 1024) }],
    ['/api/sync/state', { state: { blob: 'x'.repeat(1.1 * 1024 * 1024) }, expectedRevision: 0 }],
    ['/api/speech/transcribe', { audio: 'x'.repeat(3.3 * 1024 * 1024) }],
  ];
  for (const [pathname, payload] of cases) {
    const response = await get(pathname, {
      method: pathname === '/api/sync/state' ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 413, `${pathname} should reject its oversized body`);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal((await response.json()).error, 'request_error');
  }
});

test('dotfiles and traversal attempts never disclose server files or env templates', async () => {
  const attempts = [
    '/.env',
    '/.env.example',
    '/.gitignore',
    '/%2e%2e/server/index.js',
    '/..%2fserver%2findex.js',
    '/content/../server/index.js',
  ];
  for (const pathname of attempts) {
    const response = await get(pathname);
    const text = await response.text();
    assert.ok(!text.includes('import express'), `${pathname} leaked server source`);
    assert.ok(!text.includes('readRateLimits'), `${pathname} leaked server source`);
    assert.ok(!text.includes('SESSION_SECRET'), `${pathname} leaked env template`);
    assert.ok(!text.includes('deutschlern-db.json'), `${pathname} leaked a server path`);
  }
});
