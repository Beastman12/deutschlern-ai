/**
 * Milestone 7 — account, session and sync behaviour.
 *
 * These tests run against real routers with an isolated temporary JSON database
 * and real HTTP requests. No credentials or provider keys are involved.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { createDatabase } from '../server/db.js';
import {
  createAuthConfig,
  hashPassword,
  loadAuthConfig,
  newToken,
  normalizeEmail,
  parseCookies,
  sessionFromRequest,
  signSessionId,
  validEmail,
  validatePassword,
  verifyPassword,
  verifySessionCookie,
} from '../server/auth.js';
import { createAuthRouter } from '../server/auth-router.js';
import { createSyncRouter } from '../server/sync-router.js';

let dataDir;
let db;
let server;
let base;
let cookie;

async function startHarness({ config = createAuthConfig() } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-auth-'));
  const database = await createDatabase({ filePath: path.join(directory, 'db.json') });
  const auth = createAuthRouter({ db: database, config });
  const sync = createSyncRouter({
    db: database,
    config,
    requireAuth: auth.requireAuth,
    getAuth: auth.getAuth,
  });
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/auth', auth.router);
  testApp.use('/api/sync', sync);

  const instance = await new Promise((resolve) => {
    const listening = testApp.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return {
    directory,
    db: database,
    base: `http://127.0.0.1:${instance.address().port}`,
    server: instance,
  };
}

async function stopHarness(harness) {
  harness.server.closeAllConnections?.();
  await new Promise((resolve) => harness.server.close(resolve));
  await fs.rm(harness.directory, { recursive: true, force: true });
}

function request(pathname, { method = 'GET', body, cookieHeader = cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookieHeader) headers.cookie = cookieHeader;
  return fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(async () => {
  ({ directory: dataDir, db, server, base } = await startHarness());
});

after(async () => {
  if (server) await stopHarness({ server, directory: dataDir });
});

test('password helpers use unique salts and constant-time verification', async () => {
  const first = await hashPassword(' DeutschLern1 ');
  const second = await hashPassword(' DeutschLern1 ');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPassword(' DeutschLern1 ', first.salt, first.hash), true);
  assert.equal(await verifyPassword('deutschlern1', first.salt, first.hash), false);
  assert.equal(await verifyPassword('wrong', '', first.hash), false);
  assert.equal(validEmail('Aditi@Example.COM'), true);
  assert.equal(validEmail('not-an-email'), false);
  assert.match(validatePassword('short1'), /at least 10/);
  assert.match(validatePassword('lettersonly'), /letter and one number/);
  assert.equal(validatePassword('DeutschLern1'), '');
  assert.equal(normalizeEmail('  A@B.CO  '), 'a@b.co');
});

test('session cookies are signed and cannot be forged', () => {
  const config = createAuthConfig();
  const id = newToken(24);
  const signed = signSessionId(id, config.secret);
  assert.equal(verifySessionCookie(signed, config.secret), id);
  assert.equal(verifySessionCookie(`${id}.forged`, config.secret), null);
  assert.equal(verifySessionCookie('no-signature', config.secret), null);
  assert.ok(!signed.includes(config.secret));
});

test('registration creates a real account with no credential internals', async () => {
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Aditi', email: 'Aditi@Example.com', password: 'DeutschLern1' },
    cookieHeader: '',
  });
  assert.equal(response.status, 201);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /dl_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  cookie = String(setCookie).split(';')[0];

  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'email', 'id', 'name']);
  assert.equal(body.user.email, 'aditi@example.com');
  assert.ok(!JSON.stringify(body).includes('passwordHash'));
  assert.ok(!JSON.stringify(body).includes('salt'));

  const me = await request('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'aditi@example.com');
});

test('duplicate emails and weak passwords are rejected honestly', async () => {
  const duplicate = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'aditi@example.com', password: 'DeutschLern1' },
    cookieHeader: '',
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'email_taken');

  const weak = await request('/api/auth/register', {
    method: 'POST',
    body: { email: 'new@example.com', password: 'short' },
    cookieHeader: '',
  });
  assert.equal(weak.status, 400);
  assert.equal((await weak.json()).code, 'invalid_registration');
});

test('logout invalidates the server-side session', async () => {
  const response = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  const me = await request('/api/auth/me');
  assert.equal(me.status, 401);
  assert.equal((await me.json()).code, 'auth_required');

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'aditi@example.com', password: 'DeutschLern1' },
    cookieHeader: '',
  });
  assert.equal(login.status, 200);
  cookie = String(login.headers.get('set-cookie')).split(';')[0];

  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'aditi@example.com', password: 'WrongPassword1' },
    cookieHeader: '',
  });
  assert.equal(badLogin.status, 401);
  assert.equal((await badLogin.json()).code, 'invalid_credentials');
});

test('unknown-email login performs comparable password hashing', async () => {
  const samples = { known: [], unknown: [] };
  for (let index = 0; index < 3; index += 1) {
    for (const [kind, email] of [
      ['known', 'aditi@example.com'],
      ['unknown', 'nobody@example.com'],
    ]) {
      const started = performance.now();
      const response = await request('/api/auth/login', {
        method: 'POST',
        body: { email, password: 'WrongPassword1' },
        cookieHeader: '',
      });
      samples[kind].push(performance.now() - started);
      assert.equal(response.status, 401);
    }
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const known = median(samples.known);
  const unknown = median(samples.unknown);
  assert.ok(unknown >= 10, `unknown-email login completed in ${unknown.toFixed(1)}ms`);
  assert.ok(
    unknown >= known / 3,
    `unknown ${unknown.toFixed(1)}ms vs known ${known.toFixed(1)}ms`,
  );
});

test('password requests do not reveal accounts; dev tokens can reset once', async () => {
  const unknown = await request('/api/auth/password/request', {
    method: 'POST',
    body: { email: 'nobody@example.com' },
    cookieHeader: '',
  });
  assert.equal(unknown.status, 200);
  const unknownBody = await unknown.json();
  assert.equal(unknownBody.token, null);

  const known = await request('/api/auth/password/request', {
    method: 'POST',
    body: { email: 'aditi@example.com' },
    cookieHeader: '',
  });
  const { token } = await known.json();
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 20);

  const reused = await request('/api/auth/password/reset', {
    method: 'POST',
    body: { email: 'aditi@example.com', token, password: 'AnotherPass1' },
    cookieHeader: '',
  });
  assert.equal(reused.status, 200);

  const replay = await request('/api/auth/password/reset', {
    method: 'POST',
    body: { email: 'aditi@example.com', token, password: 'ThirdPass123' },
    cookieHeader: '',
  });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).code, 'invalid_reset_token');

  const oldLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'aditi@example.com', password: 'DeutschLern1' },
    cookieHeader: '',
  });
  assert.equal(oldLogin.status, 401);

  const newLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'aditi@example.com', password: 'AnotherPass1' },
    cookieHeader: '',
  });
  assert.equal(newLogin.status, 200);
  cookie = String(newLogin.headers.get('set-cookie')).split(';')[0];
});

test('progress sync requires auth and rejects stale revisions', async () => {
  const anonymous = await request('/api/sync/state', { method: 'GET', cookieHeader: '' });
  assert.equal(anonymous.status, 401);

  const state = { version: 6, profile: { name: 'Aditi' }, progress: { completedLessons: { 'a1-m1-l1': { passed: true } } } };
  const first = await request('/api/sync/state', {
    method: 'PUT',
    body: { state, expectedRevision: 0 },
  });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 1);

  const stale = await request('/api/sync/state', {
    method: 'PUT',
    body: { state, expectedRevision: 0 },
  });
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.code, 'revision_conflict');
  assert.equal(conflict.revision, 1);

  const fresh = await request('/api/sync/state', {
    method: 'PUT',
    body: { state: { ...state, profile: { name: 'Aditi S' } }, expectedRevision: 1 },
  });
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json()).revision, 2);

  const downloaded = await request('/api/sync/state');
  const downloadedBody = await downloaded.json();
  assert.equal(downloadedBody.revision, 2);
  assert.equal(downloadedBody.state.profile.name, 'Aditi S');

  const invalid = await request('/api/sync/state', {
    method: 'PUT',
    body: { state: [], expectedRevision: 2 },
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'invalid_state');
});

test('deleting progress resets the revision; deleting the account removes everything', async () => {
  const deleted = await request('/api/sync/state', { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  const empty = await request('/api/sync/state');
  assert.equal((await empty.json()).state, null);

  const again = await request('/api/sync/state', {
    method: 'PUT',
    body: { state: { version: 6, progress: {} }, expectedRevision: 0 },
  });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).revision, 1);

  const removed = await request('/api/auth/account', { method: 'DELETE' });
  assert.equal(removed.status, 200);
  const me = await request('/api/auth/me');
  assert.equal(me.status, 401);
  assert.equal(db.stats().users, 0);
  assert.equal(db.stats().progressRecords, 0);
});

test('unconfigured accounts fail closed without a fake sign-in', async () => {
  const harness = await startHarness({
    config: createAuthConfig({
      secret: '',
      configured: false,
      reason: 'SESSION_SECRET is required in production. Set it on the server to enable accounts.',
    }),
  });
  try {
    const status = await fetch(`${harness.base}/api/auth/status`);
    const body = await status.json();
    assert.equal(body.configured, false);
    assert.equal(body.authenticated, false);
    assert.match(body.reason, /SESSION_SECRET/);

    const register = await fetch(`${harness.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@example.com', password: 'DeutschLern1' }),
    });
    assert.equal(register.status, 503);
    assert.equal((await register.json()).code, 'auth_unavailable');
  } finally {
    await stopHarness(harness);
  }
});

test('production rejects a short SESSION_SECRET without echoing it', async () => {
  const weak = await loadAuthConfig({
    env: { NODE_ENV: 'production', SESSION_SECRET: 'too-short-secret' },
    dataDir,
  });
  assert.equal(weak.configured, false);
  assert.equal(
    weak.reason,
    'SESSION_SECRET must be at least 32 characters in production. Set it on the server to enable accounts.',
  );
  assert.equal(weak.secret, '');
  assert.ok(!JSON.stringify(weak).includes('too-short-secret'));

  const strong = await loadAuthConfig({
    env: { NODE_ENV: 'production', SESSION_SECRET: 'a-32-character-session-secret-value' },
    dataDir,
  });
  assert.equal(strong.configured, true);
  assert.equal(strong.reason, '');

  const missing = await loadAuthConfig({ env: { NODE_ENV: 'production', SESSION_SECRET: '' }, dataDir });
  assert.equal(missing.configured, false);
  assert.equal(
    missing.reason,
    'SESSION_SECRET is required in production. Set it on the server to enable accounts.',
  );
});

test('malformed cookie escapes fall back to the raw value without a 500', () => {
  const parsed = parseCookies('dl_session=%ZZ; theme=dark');
  assert.equal(parsed.dl_session, '%ZZ');
  assert.equal(parsed.theme, 'dark');
  assert.equal(
    sessionFromRequest({ headers: { cookie: 'dl_session=%ZZ' } }, createAuthConfig(), db),
    null,
  );
});

test('concurrent pushes with the same expectedRevision cannot both win', async () => {
  const harness = await startHarness();
  try {
    const signup = await fetch(`${harness.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'sync-race@example.com', password: 'DeutschLern1' }),
    });
    assert.equal(signup.status, 201);
    const session = String(signup.headers.get('set-cookie')).split(';')[0];

    const push = (name) =>
      fetch(`${harness.base}/api/sync/state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({ state: { version: 6, profile: { name } }, expectedRevision: 0 }),
      });

    const [first, second] = await Promise.all([push('first'), push('second')]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409], 'exactly one concurrent push must succeed');
    const conflict = (first.status === 409 ? first : second);
    assert.equal((await conflict.json()).code, 'revision_conflict');

    const current = await fetch(`${harness.base}/api/sync/state`, { headers: { cookie: session } });
    assert.equal((await current.json()).revision, 1);
  } finally {
    await stopHarness(harness);
  }
});

test('reset requests preserve other users and cap only their own tokens', async () => {
  const harness = await startHarness();
  try {
    const jsonPost = (pathname, body) =>
      fetch(`${harness.base}${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    for (const email of ['victim@example.com', 'other@example.com']) {
      assert.equal(
        (await jsonPost('/api/auth/register', { email, password: 'DeutschLern1' })).status,
        201,
      );
    }
    const ask = async (email) => {
      const response = await jsonPost('/api/auth/password/request', { email });
      assert.equal(response.status, 200);
      return (await response.json()).token;
    };

    const victimFirst = await ask('victim@example.com');
    const otherToken = await ask('other@example.com');
    assert.equal(typeof victimFirst, 'string');
    assert.equal(typeof otherToken, 'string');

    // A request for another email must not invalidate either existing token.
    const victimSecond = await ask('victim@example.com');
    assert.equal(typeof victimSecond, 'string');
    assert.equal(
      (
        await jsonPost('/api/auth/password/reset', {
          email: 'victim@example.com',
          token: victimFirst,
          password: 'FreshPass123',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await jsonPost('/api/auth/password/reset', {
          email: 'other@example.com',
          token: otherToken,
          password: 'FreshPass456',
        })
      ).status,
      200,
    );

    // Only the three most recent tokens for one user are retained.
    const tokens = [];
    for (let index = 0; index < 4; index += 1) tokens.push(await ask('victim@example.com'));
    assert.equal(
      (
        await jsonPost('/api/auth/password/reset', {
          email: 'victim@example.com',
          token: tokens[0],
          password: 'OldestPass1',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await jsonPost('/api/auth/password/reset', {
          email: 'victim@example.com',
          token: tokens[3],
          password: 'NewestPass1',
        })
      ).status,
      200,
    );
  } finally {
    await stopHarness(harness);
  }
});
