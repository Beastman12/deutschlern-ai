/**
 * Offline tests for the sync coordinator and its immediate dependencies.
 *
 * Network calls are replaced with a deterministic fetch stub and localStorage
 * is an in-memory Map, so no server, timers with real delays or browser is
 * needed. All modules are imported dynamically after the globals are in place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };

const putCalls = [];
let fetchImpl = async () => {
  throw new Error('Unexpected fetch call');
};
globalThis.fetch = (...args) => fetchImpl(...args);

const { clearAllData, getSyncMeta, updateState, updateSyncMeta } = await import('../frontend/js/store.js');
const session = await import('../frontend/js/session.js');
const syncClient = await import('../frontend/js/sync-client.js');
const { ApiError, requestJSON } = await import('../frontend/js/api.js');

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

async function reset(putHandler) {
  await syncClient.noteSignedOut();
  syncClient.setConflictHandler(null);
  clearAllData();
  session.setSignedOut();
  putCalls.length = 0;
  fetchImpl = async (url, options) => {
    if (url === '/api/sync/state' && (!options || options.method === 'GET')) {
      return json({ state: null, revision: 0 });
    }
    if (url === '/api/sync/state' && options.method === 'PUT') {
      putCalls.push(options);
      return putHandler
        ? putHandler(putCalls.length, options)
        : json({ revision: putCalls.length, updatedAt: '2026-01-01T00:00:00.000Z' });
    }
    if (url === '/api/auth/status') return json({ configured: true, authenticated: false, user: null });
    return json({});
  };
}

test('sign-in uploads flashcard-only local progress', async () => {
  await reset();
  updateState((current) => ({
    ...current,
    progress: {
      ...current.progress,
      flashcards: { 'v-x': { due: '2026-01-01T00:00:00.000Z', reps: 1, intervalDays: 1 } },
    },
  }));
  session.setSignedIn({ id: 'u1' });

  await syncClient.handleSignIn();

  assert.equal(putCalls.length, 1, 'flashcards alone count as local progress');
  assert.equal(getSyncMeta().localOwner, 'u1');
  await syncClient.noteSignedOut();
});

test('local progress owned by a different account is never auto-uploaded', async () => {
  await reset();
  updateSyncMeta({ localOwner: 'u1', accountId: 'u1', revision: 3 });
  updateState((current) => ({
    ...current,
    progress: { ...current.progress, flashcards: { 'v-x': { reps: 1 } } },
  }));
  session.setSignedIn({ id: 'u2' });
  let conflict = null;
  syncClient.setConflictHandler((value) => {
    conflict = value;
  });

  await syncClient.handleSignIn();

  assert.equal(putCalls.length, 0, 'the previous account must not be uploaded to a new one');
  assert.ok(conflict, 'the learner must get an explicit choice');
  assert.match(conflict.message, /different account/);
  assert.equal(conflict.revision, 0);
  await syncClient.noteSignedOut();
});

test('concurrent sync calls are serialized instead of silently dropped', async () => {
  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  await reset(async (index) => {
    if (index === 1) await gate;
    return json({ revision: index, updatedAt: '2026-01-01T00:00:00.000Z' });
  });
  session.setSignedIn({ id: 'u1' });

  const first = syncClient.pushLocalState();
  const second = syncClient.pushLocalState();
  await flushMicrotasks();
  assert.equal(putCalls.length, 1, 'only the first push is in flight');

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(putCalls.length, 2, 'the queued push ran after the first one');
  await syncClient.noteSignedOut();
});

test('changes made during a push schedule a follow-up push', async () => {
  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  await reset(async (index) => {
    if (index === 1) await gate;
    return json({ revision: index, updatedAt: '2026-01-01T00:00:00.000Z' });
  });
  session.setSignedIn({ id: 'u1' });

  const pending = syncClient.pushLocalState();
  await flushMicrotasks();
  assert.equal(putCalls.length, 1);
  updateState((current) => ({ ...current, profile: { ...current.profile, name: 'Changed mid-push' } }));
  releaseFirst();

  assert.equal(await pending, true);
  assert.equal(syncClient.getSyncSnapshot().pending, true, 'a follow-up push must be pending');
  await syncClient.noteSignedOut(); // clears the follow-up timer
});

test('ApiError keeps 409 fields and an already-aborted signal sends no request', async () => {
  let calls = 0;
  fetchImpl = async () => {
    calls += 1;
    return json(
      { error: 'conflict', code: 'revision_conflict', revision: 9, updatedAt: '2026-03-04T00:00:00.000Z' },
      409,
    );
  };
  await assert.rejects(
    () => requestJSON('/api/sync/state', { method: 'PUT', body: {} }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.revision, 9);
      assert.equal(error.updatedAt, '2026-03-04T00:00:00.000Z');
      return true;
    },
  );
  assert.equal(calls, 1);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => requestJSON('/api/x', { signal: controller.signal }),
    (error) => error instanceof ApiError && error.code === 'aborted',
  );
  assert.equal(calls, 1, 'an already-aborted signal must not reach fetch');
});

test('forced session refresh repeats an in-flight request; network errors keep configured', async () => {
  let calls = 0;
  fetchImpl = async (url) => {
    assert.equal(url, '/api/auth/status');
    calls += 1;
    return json({ configured: true, authenticated: true, user: { id: calls === 1 ? 'v1' : 'v2' } });
  };

  const first = session.refreshSession({ force: true });
  const forced = session.refreshSession({ force: true });
  await Promise.all([first, forced]);

  assert.equal(calls, 2, 'a forced refresh must wait for, then repeat, the in-flight request');
  assert.equal(session.getSessionSnapshot().user.id, 'v2');

  fetchImpl = async () => {
    throw new Error('offline');
  };
  const errored = await session.refreshSession({ force: true });
  assert.equal(errored.status, 'error');
  assert.equal(errored.configured, true, 'a network failure is not proof accounts are disabled');
  assert.equal(errored.authenticated, true);
  assert.equal(errored.user.id, 'v2');
  await syncClient.noteSignedOut();
});
