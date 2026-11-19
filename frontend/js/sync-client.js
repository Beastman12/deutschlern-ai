/**
 * Cross-device sync coordinator.
 *
 * Local-first rules:
 *  - nothing is uploaded unless the learner is signed in and sync is configured;
 *  - the server is never overwritten by a stale device (revision conflicts are
 *    surfaced to the learner);
 *  - remote state is only applied after an explicit choice, never silently.
 *
 * All network operations go through one promise queue so a download or a
 * conflict decision can never interleave with an in-flight push.
 */
import { ApiError, sync } from './api.js';
import {
  DEFAULT_STATE,
  getState,
  getSyncMeta,
  getSyncableState,
  replaceStateFromServer,
  subscribe,
  updateSyncMeta,
} from './store.js';
import { getSessionSnapshot, isAuthenticated, subscribeSession } from './session.js';

const AUTO_SYNC_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 30_000;

let initialized = false;
let autoTimer = null;
let retryTimer = null;
let retryDelayMs = AUTO_SYNC_DELAY_MS;
let busy = false;
let conflictHandler = null;
let lastSignInHandled = null;
let queue = Promise.resolve();
const listeners = new Set();

const IDLE = Object.freeze({
  status: 'idle',
  message: '',
  revision: 0,
  lastSyncedAt: null,
  pending: false,
});

let snapshot = { ...IDLE };

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = canonical(value[key]);
    return result;
  }
  return value;
}

function fingerprint(value) {
  return JSON.stringify(canonical(value));
}

function publish(patch) {
  const meta = getSyncMeta();
  snapshot = {
    ...snapshot,
    ...patch,
    revision: normalizeRevision(meta.revision),
    lastSyncedAt: meta.lastSyncedAt || null,
  };
  for (const listener of listeners) {
    try {
      listener(getSyncSnapshot());
    } catch (error) {
      console.error('[sync] listener failed.', error);
    }
  }
}

export function getSyncSnapshot() {
  return copy(snapshot);
}

export function subscribeSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setConflictHandler(handler) {
  conflictHandler = typeof handler === 'function' ? handler : null;
}

function currentAccountId() {
  return getSessionSnapshot().user?.id || null;
}

function canSync() {
  const session = getSessionSnapshot();
  return session.status === 'ok' && session.configured && isAuthenticated();
}

/** An owner from another account means this device's data must not be uploaded. */
function ownedByAnotherAccount() {
  const accountId = currentAccountId();
  if (!accountId) return false;
  const meta = getSyncMeta();
  const owner = meta.localOwner || meta.accountId;
  return Boolean(owner && owner !== accountId);
}

/**
 * Compare the entire syncable state with the defaults, ignoring updatedAt.
 * A hand-picked field list silently discarded flashcards, drafts, AI history,
 * skills and study-log-only progress on sign-in.
 */
function hasLocalProgress() {
  const state = copy(getState());
  const defaults = copy(DEFAULT_STATE);
  delete state.updatedAt;
  delete defaults.updatedAt;
  return fingerprint(state) !== fingerprint(defaults);
}

function stateFingerprint() {
  const state = copy(getSyncableState());
  delete state.updatedAt;
  return fingerprint(state);
}

function errorText(error, fallback) {
  if (error instanceof ApiError) return error.message;
  return error?.message || fallback;
}

async function reportConflict(error) {
  let remote = null;
  try {
    const response = await sync.getState();
    remote = response.state || null;
  } catch {
    // The conflict itself is already enough information to ask the learner.
  }
  const meta = getSyncMeta();
  updateSyncMeta({ lastError: 'revision_conflict' });
  publish({
    status: 'conflict',
    message: error?.message || 'Your progress changed on another device.',
    pending: true,
  });
  if (conflictHandler) {
    conflictHandler({
      // Prefer the payload fields carried by ApiError from the 409 response.
      revision: normalizeRevision(error?.revision ?? meta.revision),
      updatedAt: error?.updatedAt || null,
      message: error?.message || 'Your progress changed on another device.',
      remote,
      local: getSyncableState(),
    });
  }
}

/** Serialize every sync operation; callers never get a silent `false` for busy. */
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function runExclusive(task) {
  // A caller arriving while another operation is in flight is queued, not
  // dropped; show that explicitly instead of returning a silent `false`.
  if (busy && snapshot.status !== 'conflict') {
    publish({ status: 'syncing', message: 'Waiting for the current sync to finish…' });
  }
  return enqueue(async () => {
    busy = true;
    try {
      return await task();
    } finally {
      busy = false;
    }
  });
}

function clearTimers() {
  clearTimeout(autoTimer);
  autoTimer = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  retryDelayMs = AUTO_SYNC_DELAY_MS;
}

function scheduleAutoSync(delayMs = AUTO_SYNC_DELAY_MS) {
  if (!canSync()) return;
  publish({ status: 'idle', message: 'Unsaved changes on this device.', pending: true });
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    autoTimer = null;
    pushLocalState({ silent: true }).catch((error) => {
      console.warn('[sync] Auto-sync failed.', error);
    });
  }, delayMs);
}

/** Failed silent pushes retry with a capped backoff until they succeed. */
function scheduleRetry() {
  if (!canSync()) return;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    pushLocalState({ silent: true }).catch((error) => {
      console.warn('[sync] Auto-sync retry failed.', error);
    });
  }, retryDelayMs);
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
}

/** Flush queued work on init, account change and a restored connection. */
function flushPending({ force = false } = {}) {
  if (!canSync()) return;
  clearTimeout(autoTimer);
  autoTimer = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  retryDelayMs = AUTO_SYNC_DELAY_MS;
  if (force || snapshot.pending) {
    pushLocalState({ silent: true }).catch((error) => {
      console.warn('[sync] Pending sync failed.', error);
    });
  }
}

/** Push the current local state. Returns true when the server accepted it. */
async function doPush({ silent = false, allowCrossAccount = false } = {}) {
  if (!canSync()) {
    if (!silent) {
      publish({ status: 'error', message: 'Sign in to sync your progress.', pending: true });
    }
    return false;
  }
  if (!allowCrossAccount && ownedByAnotherAccount()) {
    publish({
      status: 'conflict',
      message: 'This device has progress from another account. Choose which copy to keep.',
      pending: true,
    });
    return false;
  }

  const before = stateFingerprint();
  let succeeded = false;
  let conflicted = false;
  if (!silent) publish({ status: 'syncing', message: 'Saving to your account…' });
  try {
    const meta = getSyncMeta();
    const accountId = currentAccountId();
    const response = await sync.pushState(
      getSyncableState(),
      meta.accountId === accountId ? normalizeRevision(meta.revision) : 0,
    );
    updateSyncMeta({
      revision: normalizeRevision(response?.revision),
      lastSyncedAt: response?.updatedAt || new Date().toISOString(),
      accountId,
      localOwner: accountId,
      lastError: '',
    });
    succeeded = true;
    publish({ status: 'synced', message: 'Progress saved to your account.', pending: false });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'revision_conflict') {
      conflicted = true; // wait for the learner's decision instead of retrying
      await reportConflict(error);
      return false;
    }
    updateSyncMeta({ lastError: errorText(error, 'sync_failed') });
    publish({
      status: 'error',
      message: errorText(error, 'Could not save progress on the server.'),
      pending: true,
    });
    if (!silent) throw error;
    return false;
  } finally {
    // Changes made while the request was in flight must not be lost.
    const changed = stateFingerprint() !== before;
    if (succeeded && !changed) {
      clearTimers();
    } else if (changed) {
      scheduleAutoSync();
    } else if (!conflicted) {
      scheduleRetry();
    }
  }
}

/** Download the server copy and apply it locally after an explicit request. */
async function doDownload() {
  if (!canSync()) throw new Error('Sign in to sync your progress.');
  publish({ status: 'syncing', message: 'Checking your account…' });
  try {
    const response = await sync.getState();
    if (!response?.state) {
      publish({ status: 'idle', message: 'No saved progress on the server yet.', pending: Boolean(getSyncMeta().revision) });
      return false;
    }
    const accountId = currentAccountId();
    replaceStateFromServer(response.state, {
      revision: normalizeRevision(response.revision),
      lastSyncedAt: response.updatedAt || new Date().toISOString(),
      accountId,
      localOwner: accountId,
      lastError: '',
    });
    publish({ status: 'synced', message: 'Downloaded your saved progress.', pending: false });
    return true;
  } catch (error) {
    publish({ status: 'error', message: errorText(error, 'Could not download progress.'), pending: true });
    throw error;
  }
}

/**
 * Called after a successful sign-in. A new account uploads local progress; an
 * existing account with saved progress and a learner who already has local
 * progress triggers a visible choice instead of guessing which copy to keep.
 */
async function doHandleSignIn() {
  if (!canSync()) return;
  const authId = authKey(getSessionSnapshot());
  // Sign-in publishes a session event and the auth dialog also calls this
  // explicitly. Handle that account once so a conflict is not reported twice.
  if (lastSignInHandled === authId) return;
  lastSignInHandled = authId;
  try {
    const remote = await sync.getState();
    const accountId = currentAccountId();
    const meta = getSyncMeta();
    const crossAccount = Boolean(meta.localOwner && meta.localOwner !== accountId);
    const localProgress = hasLocalProgress();

    if (!remote?.state) {
      if (crossAccount && localProgress) {
        await reportConflict({
          message: 'This device has progress saved under a different account. Choose which copy to keep.',
          revision: 0,
          updatedAt: null,
        });
      } else {
        await doPush({ silent: true });
      }
      return;
    }

    const revision = normalizeRevision(remote.revision);
    const matchesAccountCopy = meta.accountId === accountId && meta.revision === revision;
    if ((!localProgress && !crossAccount) || (!crossAccount && matchesAccountCopy)) {
      replaceStateFromServer(remote.state, {
        revision,
        lastSyncedAt: remote.updatedAt || new Date().toISOString(),
        accountId,
        localOwner: accountId,
        lastError: '',
      });
      publish({ status: 'synced', message: 'Restored your saved progress.', pending: false });
      return;
    }

    await reportConflict({
      message: crossAccount
        ? 'This device has progress from a different account. Choose which copy to keep.'
        : 'This device and your account both have progress. Choose which copy to keep.',
      revision,
      updatedAt: remote.updatedAt,
    });
  } catch (error) {
    lastSignInHandled = null;
    updateSyncMeta({ lastError: errorText(error, 'sign_in_sync_failed') });
    publish({ status: 'error', message: errorText(error, 'Could not check your saved progress.'), pending: true });
  }
}

/** Resolve a revision conflict with an explicit learner decision. */
async function doResolveConflict(choice) {
  if (choice !== 'server' && choice !== 'local') throw new Error('Choose which version to keep.');
  if (choice === 'server') return doDownload();
  // Keep this device: push without a revision guard, but only after the
  // learner has seen and accepted the overwrite warning.
  if (!canSync()) throw new Error('Sign in to sync your progress.');
  publish({ status: 'syncing', message: 'Replacing your account copy…' });
  try {
    const accountId = currentAccountId();
    const response = await sync.pushState(getSyncableState(), null);
    updateSyncMeta({
      revision: normalizeRevision(response?.revision),
      lastSyncedAt: response?.updatedAt || new Date().toISOString(),
      accountId,
      localOwner: accountId,
      lastError: '',
    });
    publish({ status: 'synced', message: 'This device is now your saved copy.', pending: false });
    return true;
  } catch (error) {
    publish({ status: 'error', message: errorText(error, 'Could not replace the saved copy.'), pending: true });
    throw error;
  }
}

async function doForgetRemote() {
  if (!canSync()) return false;
  await sync.deleteState();
  const accountId = currentAccountId();
  // Keep localOwner: the data still belongs to this account even though its
  // server copy is gone. Only the revision bookkeeping is reset.
  updateSyncMeta({ revision: 0, lastSyncedAt: null, lastError: '', accountId, localOwner: accountId });
  publish({ status: 'idle', message: 'Server-side progress deleted.', pending: false });
  return true;
}

export function pushLocalState(options = {}) {
  return runExclusive(() => doPush(options));
}

export function downloadRemoteState() {
  return runExclusive(() => doDownload());
}

export function handleSignIn() {
  return runExclusive(() => doHandleSignIn());
}

export function resolveConflict(choice) {
  return runExclusive(() => doResolveConflict(choice));
}

export function forgetRemoteState() {
  return runExclusive(() => doForgetRemote());
}

/** Sign-out/deletion: stop pending work but preserve the owner account id. */
export function noteSignedOut() {
  return runExclusive(() => {
    clearTimers();
    lastSignInHandled = null;
    updateSyncMeta({ lastError: '' });
    publish({ status: 'idle', message: '', pending: false });
  });
}

function authKey(session) {
  return session.authenticated && session.user ? session.user.id : 'guest';
}

export function initSync() {
  if (initialized) return;
  initialized = true;
  const meta = getSyncMeta();
  snapshot = { ...IDLE, revision: normalizeRevision(meta.revision), lastSyncedAt: meta.lastSyncedAt || null };
  subscribe((detail) => {
    // store.js also emits 'preferences' and 'reset'; neither is a data change.
    if (detail?.type !== 'state') return;
    scheduleAutoSync();
  });

  let lastAuthKey = authKey(getSessionSnapshot());
  subscribeSession((session) => {
    const nextKey = authKey(session);
    if (nextKey === lastAuthKey) return;
    lastAuthKey = nextKey;
    if (nextKey === 'guest') noteSignedOut();
    else handleSignIn();
  });

  window?.addEventListener?.('online', () => flushPending({ force: true }));
  flushPending({ force: hasLocalProgress() });
}
