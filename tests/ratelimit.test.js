/**
 * Milestone 9 — shared rate limiting.
 *
 * Verifies the bounded sliding window, standard headers, environment parsing
 * and the limits now applied to password, account-deletion and sync writes.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import {
  createRateLimitMiddleware,
  createSlidingWindow,
  rateLimitFromEnv,
  readRateLimits,
  setRateLimitHeaders,
} from '../server/rate-limit.js';
import {
  SESSION_COOKIE,
  createAuthConfig,
  hashToken,
  newToken,
  signSessionId,
} from '../server/auth.js';
import { createAuthRouter } from '../server/auth-router.js';
import { createDatabase } from '../server/db.js';
import { createSyncRouter } from '../server/sync-router.js';

test('the sliding window counts per key, reports headers and rejects bursts', () => {
  const window = createSlidingWindow({ windowMs: 60_000, max: 2 });
  const first = window.check('ip:a');
  assert.equal(first.limited, false);
  assert.equal(first.remaining, 1);
  const second = window.check('ip:a');
  assert.equal(second.limited, false);
  assert.equal(second.remaining, 0);
  const third = window.check('ip:a');
  assert.equal(third.limited, true);
  assert.equal(third.remaining, 0);
  assert.ok(third.retryAfterSeconds >= 1);
  assert.ok(third.resetAt > Date.now());

  // A different IP has an independent budget.
  assert.equal(window.check('ip:b').limited, false);
});

test('the sliding window map is hard-capped against unique-key floods', () => {
  const window = createSlidingWindow({ windowMs: 60_000, max: 5 });
  for (let index = 0; index < 1_020; index += 1) window.check(`spoofed:${index}`);
  assert.ok(window.size <= 1_000, `tracked ${window.size} keys`);
});

test('a unique-key flood cannot reset an already throttled key', () => {
  const window = createSlidingWindow({ windowMs: 60_000, max: 1 });
  assert.equal(window.check('victim').limited, false);
  assert.equal(window.check('victim').limited, true);
  for (let index = 0; index < 1_050; index += 1) window.check(`spoofed:${index}`);
  assert.ok(window.size <= 1_000, `tracked ${window.size} keys`);
  assert.equal(window.check('victim').limited, true, 'an active counter must survive a flood');
  const newcomer = window.check('newcomer');
  assert.equal(newcomer.limited, true, 'a saturated map must refuse new keys, not evict active ones');
  assert.equal(newcomer.saturated, true);
});

test('rate-limit keys use the socket peer, not forwarded headers', () => {
  const window = createSlidingWindow({ windowMs: 60_000, max: 1 });
  const first = { ip: '203.0.113.1', socket: { remoteAddress: '127.0.0.1' } };
  const rotated = { ip: '203.0.113.2', socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(window.keyFor(first, 'chat'), window.keyFor(rotated, 'chat'));
  assert.equal(window.check(window.keyFor(first, 'chat')).limited, false);
  assert.equal(window.check(window.keyFor(rotated, 'chat')).limited, true);
});

test('rotating X-Forwarded-For cannot rotate a limiter bucket over HTTP', async () => {
  const app = express();
  app.set('trust proxy', true);
  const limiter = createRateLimitMiddleware({ windowMs: 60_000, max: 1, keyPrefix: 'xff-test' });
  app.get('/', limiter, (req, res) => res.json({ ok: true }));
  const instance = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const { port } = instance.address();
    const call = (forwarded) =>
      fetch(`http://127.0.0.1:${port}/`, { headers: { 'x-forwarded-for': forwarded } });
    assert.equal((await call('198.51.100.1')).status, 200);
    assert.equal((await call('198.51.100.2')).status, 429);
  } finally {
    instance.closeAllConnections?.();
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('a validated proxy hop keys limits on the forwarded client, not the socket', async () => {
  const app = express();
  app.set('trust proxy', 1);
  const limiter = createRateLimitMiddleware({ windowMs: 60_000, max: 1, keyPrefix: 'proxy-hop-test' });
  app.get('/', limiter, (req, res) => res.json({ ok: true }));
  const instance = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const { port } = instance.address();
    const call = (forwarded) =>
      fetch(`http://127.0.0.1:${port}/`, { headers: { 'x-forwarded-for': forwarded } });
    assert.equal((await call('198.51.100.10')).status, 200);
    assert.equal((await call('198.51.100.10')).status, 429);
    assert.equal((await call('198.51.100.11')).status, 200);
    // With one trusted hop the left-most spoofed entry is ignored.
    assert.equal((await call('203.0.113.9, 198.51.100.11')).status, 429);
  } finally {
    instance.closeAllConnections?.();
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('a loopback Cloudflare Tunnel visitor uses CF-Connecting-IP, not a shared socket bucket', () => {
  const window = createSlidingWindow({ windowMs: 60_000, max: 1 });
  const request = (socketAddress, headers, trustProxy, expressIp) => ({
    socket: { remoteAddress: socketAddress },
    headers,
    ip: expressIp,
    app: { get: () => trustProxy },
    get: (name) => headers[name.toLowerCase()],
  });

  // cloudflared connects from loopback and sets the real visitor IP itself.
  assert.equal(
    window.keyFor(
      request('::ffff:127.0.0.1', { 'cf-connecting-ip': '198.51.100.30' }, 1, '198.51.100.30'),
      'chat',
    ),
    'chat:198.51.100.30',
  );
  assert.equal(
    window.keyFor(
      request('127.0.0.1', { 'cf-connecting-ip': '198.51.100.31' }, 1, '198.51.100.31'),
      'chat',
    ),
    'chat:198.51.100.31',
  );
  // A client-supplied XFF cannot override Cloudflare's own value.
  assert.equal(
    window.keyFor(
      request(
        '127.0.0.1',
        { 'cf-connecting-ip': '198.51.100.30', 'x-forwarded-for': '203.0.113.99' },
        1,
        '203.0.113.99',
      ),
      'chat',
    ),
    'chat:198.51.100.30',
  );
  // The header is ignored without validated proxy config or from a real LAN peer.
  assert.equal(
    window.keyFor(
      request('127.0.0.1', { 'cf-connecting-ip': '198.51.100.30' }, false, '198.51.100.30'),
      'chat',
    ),
    'chat:127.0.0.1',
  );
  assert.equal(
    window.keyFor(
      request('192.168.1.50', { 'cf-connecting-ip': '198.51.100.30' }, 1, '203.0.113.5'),
      'chat',
    ),
    'chat:203.0.113.5',
  );
  // Malformed values never create a new bucket from attacker-controlled text.
  assert.equal(
    window.keyFor(request('127.0.0.1', { 'cf-connecting-ip': 'not-an-ip' }, 1, '198.51.100.40'), 'chat'),
    'chat:198.51.100.40',
  );
});

test('rate-limit headers include limit, remaining, reset and Retry-After when blocked', () => {
  const headers = new Map();
  const res = { setHeader: (name, value) => headers.set(name, value) };
  setRateLimitHeaders(res, {
    max: 3,
    remaining: 0,
    resetAt: 1_800_000_000_000,
    retryAfterSeconds: 12,
    limited: true,
  });
  assert.equal(headers.get('RateLimit-Limit'), '3');
  assert.equal(headers.get('RateLimit-Remaining'), '0');
  assert.equal(headers.get('RateLimit-Reset'), String(Math.ceil(1_800_000_000_000 / 1000)));
  assert.equal(headers.get('Retry-After'), '12');
});

test('environment limits ignore malformed and hostile values', () => {
  const previous = { ...process.env };
  try {
    process.env.RATE_TEST_WINDOW_MS = '2500';
    process.env.RATE_TEST_MAX = '4';
    assert.deepEqual(rateLimitFromEnv('TEST', { windowMs: 60_000, max: 20 }), {
      windowMs: 2500,
      max: 4,
    });
    process.env.RATE_TEST_MAX = '-9';
    assert.equal(rateLimitFromEnv('TEST', { windowMs: 60_000, max: 20 }).max, 20);
    process.env.RATE_TEST_WINDOW_MS = 'not-a-number';
    assert.equal(rateLimitFromEnv('TEST', { windowMs: 60_000, max: 20 }).windowMs, 60_000);
  } finally {
    for (const key of ['RATE_TEST_WINDOW_MS', 'RATE_TEST_MAX']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
  const defaults = readRateLimits();
  assert.ok(defaults.auth.windowMs > 0 && defaults.auth.register > 0);
  assert.ok(defaults.sync.write > 0 && defaults.ai.max > 0);
});

/* -------------------------------------------------------------------------- */
/* Real routers with small injected limits                                     */
/* -------------------------------------------------------------------------- */

let directory;
let server;
let base;
let cookie;

const LIMITS = Object.freeze({
  windowMs: 60_000,
  register: 2,
  login: 2,
  password: 2,
  accountDelete: 1,
});
const SYNC_LIMITS = Object.freeze({ windowMs: 60_000, write: 2 });

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-ratelimit-'));
  const db = await createDatabase({ filePath: path.join(directory, 'db.json') });
  const config = createAuthConfig();
  const auth = createAuthRouter({ db, config, limits: LIMITS });
  const sync = createSyncRouter({
    db,
    config,
    requireAuth: auth.requireAuth,
    getAuth: auth.getAuth,
    limits: SYNC_LIMITS,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', auth.router);
  app.use('/api/sync', sync);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function call(pathname, { method = 'GET', body, headers = {} } = {}) {
  return fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function assertThrottled(pending, expectedLimit) {
  const response = await pending;
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('RateLimit-Limit'), String(expectedLimit));
  assert.equal(response.headers.get('RateLimit-Remaining'), '0');
  assert.ok(response.headers.get('RateLimit-Reset'));
  assert.ok(Number(response.headers.get('Retry-After')) >= 1);
  const body = await response.json();
  assert.match(body.code || body.error, /rate_limited|Too many/);
}

test('registration and login limits reject bursts with honest headers', async () => {
  const signup = (email) =>
    call('/api/auth/register', {
      method: 'POST',
      body: { name: 'Limit Tester', email, password: 'DeutschLern1' },
    });
  assert.equal((await signup('limit-a@example.com')).status, 201);
  assert.equal((await signup('limit-b@example.com')).status, 201);
  await assertThrottled(signup('limit-c@example.com'), LIMITS.register);

  const login = () =>
    call('/api/auth/login', {
      method: 'POST',
      body: { email: 'limit-a@example.com', password: 'DeutschLern1' },
    });
  const signedIn = await login();
  assert.equal(signedIn.status, 200);
  cookie = signedIn.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(cookie, 'login must issue a session cookie');
  assert.equal((await login()).status, 200);
  await assertThrottled(login(), LIMITS.login);
});

test('password request and reset are limited in separate buckets', async () => {
  const requestReset = () =>
    call('/api/auth/password/request', {
      method: 'POST',
      body: { email: 'limit-a@example.com' },
    });
  assert.equal((await requestReset()).status, 200);
  assert.equal((await requestReset()).status, 200);
  await assertThrottled(requestReset(), LIMITS.password);

  const reset = () =>
    call('/api/auth/password/reset', {
      method: 'POST',
      body: { email: 'limit-a@example.com', token: 'bad', password: 'DeutschLern2' },
    });
  assert.equal((await reset()).status, 400);
  assert.equal((await reset()).status, 400);
  await assertThrottled(reset(), LIMITS.password);
});

test('sync writes are limited and still protect against stale revisions', async () => {
  const write = () =>
    call('/api/sync/state', {
      method: 'PUT',
      headers: { cookie },
      body: { state: { version: 7, progress: {} }, expectedRevision: null },
    });
  assert.equal((await write()).status, 200);
  assert.equal((await write()).status, 200);
  await assertThrottled(write(), SYNC_LIMITS.write);
});

test('account deletion checks authentication before consuming the limiter', async () => {
  const remove = () => call('/api/auth/account', { method: 'DELETE', headers: { cookie } });
  assert.equal((await remove()).status, 200);
  // The session was deleted by the first call. Authentication must be checked
  // first, so repeated anonymous attempts return 401 instead of burning the
  // shared per-IP budget.
  const unauthenticated = await remove();
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).code, 'auth_required');
  assert.equal((await remove()).status, 401);
});

test('authenticated account deletion and logout are limited after auth', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-authwrite-'));
  const db = await createDatabase({ filePath: path.join(directory, 'db.json') });
  const config = createAuthConfig();
  const limits = { windowMs: 60_000, register: 10, login: 1, password: 10, accountDelete: 1 };
  const auth = createAuthRouter({ db, config, limits });
  const isolatedApp = express();
  isolatedApp.use(express.json());
  isolatedApp.use('/api/auth', auth.router);
  const isolatedServer = await new Promise((resolve) => {
    const instance = isolatedApp.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const isolatedBase = `http://127.0.0.1:${isolatedServer.address().port}`;
  const post = (pathname, body, cookieHeader = '') =>
    fetch(`${isolatedBase}${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    });
  const remove = (cookieHeader = '') =>
    fetch(`${isolatedBase}/api/auth/account`, {
      method: 'DELETE',
      ...(cookieHeader ? { headers: { cookie: cookieHeader } } : {}),
    });

  try {
    // Anonymous attempts must not consume either shared per-IP budget.
    for (let index = 0; index < 3; index += 1) {
      assert.equal((await remove()).status, 401);
      assert.equal((await post('/api/auth/logout', {})).status, 401);
    }

    const users = [];
    for (const email of ['write-a@example.com', 'write-b@example.com']) {
      const response = await post('/api/auth/register', {
        name: 'Write Tester',
        email,
        password: 'DeutschLern1',
      });
      assert.equal(response.status, 201);
      users.push({
        user: (await response.json()).user,
        cookie: String(response.headers.get('set-cookie')).split(';')[0],
      });
    }

    assert.equal((await remove(users[0].cookie)).status, 200);
    await assertThrottled(remove(users[1].cookie), limits.accountDelete);

    // The blocked deletion left the second session usable, so logout can be
    // checked independently with another valid session after the first one.
    assert.equal((await post('/api/auth/logout', {}, users[1].cookie)).status, 200);
    const sessionId = newToken(32);
    await db.createSession({
      id: sessionId,
      tokenHash: hashToken(sessionId),
      userId: users[1].user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const alternateCookie = `${SESSION_COOKIE}=${signSessionId(sessionId, config.secret)}`;
    await assertThrottled(post('/api/auth/logout', {}, alternateCookie), limits.login);
  } finally {
    isolatedServer.closeAllConnections?.();
    await new Promise((resolve) => isolatedServer.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
