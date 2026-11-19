/**
 * Cached view of the server-side session.
 *
 * The cookie itself is HttpOnly and never read by JavaScript. This module only
 * holds the public status returned by /api/auth/status so every screen can show
 * the same honest account state without an extra request per render.
 */
import { auth } from './api.js';

const STALE_AFTER_MS = 60_000;

const UNKNOWN = Object.freeze({
  status: 'unknown',
  configured: false,
  authenticated: false,
  user: null,
  reason: '',
  passwordReset: { available: false, reason: '' },
  sessionMaxAgeSeconds: 0,
  checkedAt: null,
  error: '',
});

let snapshot = { ...UNKNOWN };
let lastChecked = 0;
let inflight = null;
const listeners = new Set();

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function publish(next) {
  snapshot = next;
  for (const listener of listeners) {
    try {
      listener(getSessionSnapshot());
    } catch (error) {
      console.error('[session] listener failed.', error);
    }
  }
}

export function getSessionSnapshot() {
  return copy(snapshot);
}

export function isAuthenticated() {
  return snapshot.authenticated && Boolean(snapshot.user);
}

export function subscribeSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshSession({ force = false } = {}) {
  // A forced refresh must not return an in-flight request's stale answer.
  // Wait for it, then issue a fresh request when force is true.
  while (inflight) await inflight;
  if (!force && snapshot.status !== 'unknown' && Date.now() - lastChecked < STALE_AFTER_MS) {
    return getSessionSnapshot();
  }

  inflight = (async () => {
    try {
      const data = await auth.status();
      publish({
        status: 'ok',
        configured: Boolean(data.configured),
        authenticated: Boolean(data.authenticated),
        user: data.user || null,
        reason: String(data.reason || ''),
        passwordReset: data.passwordReset && typeof data.passwordReset === 'object'
          ? { available: Boolean(data.passwordReset.available), reason: String(data.passwordReset.reason || '') }
          : copy(UNKNOWN.passwordReset),
        sessionMaxAgeSeconds: Number(data.sessionMaxAgeSeconds) || 0,
        checkedAt: new Date().toISOString(),
        error: '',
      });
    } catch (error) {
      // A network hiccup is not proof that accounts are disabled. Keep the
      // last known configuration/auth state and report the honest error.
      const message = error?.message || 'Account status could not be checked.';
      publish({
        ...copy(snapshot),
        status: 'error',
        reason: message,
        error: message,
        checkedAt: new Date().toISOString(),
      });
    } finally {
      lastChecked = Date.now();
      inflight = null;
    }
    return getSessionSnapshot();
  })();

  return inflight;
}

/** Update the cache immediately after a successful login or registration. */
export function setSignedIn(user) {
  lastChecked = Date.now();
  publish({
    ...copy(snapshot),
    status: 'ok',
    configured: true,
    authenticated: Boolean(user),
    user: user || null,
    reason: '',
    error: '',
    checkedAt: new Date().toISOString(),
  });
}

/** Update the cache immediately after logout or account deletion. */
export function setSignedOut() {
  lastChecked = Date.now();
  publish({
    ...copy(snapshot),
    status: 'ok',
    authenticated: false,
    user: null,
    reason: '',
    error: '',
    checkedAt: new Date().toISOString(),
  });
}

/** Mark the cache as unconfigured when the server reports 503 or an error. */
export function setSessionUnavailable(reason) {
  lastChecked = Date.now();
  publish({
    ...copy(snapshot),
    status: 'error',
    configured: false,
    authenticated: false,
    user: null,
    reason: String(reason || 'Accounts are unavailable on this server.'),
    error: String(reason || ''),
    checkedAt: new Date().toISOString(),
  });
}
