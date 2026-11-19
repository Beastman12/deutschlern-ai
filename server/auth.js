/**
 * Milestone 7 — local account authentication helpers.
 *
 * Passwords are hashed with scrypt and a per-user salt. Sessions are opaque,
 * server-side records; the cookie contains only a signed session id, never a
 * password, JWT or personal data. In production a real SESSION_SECRET is
 * required. Development generates a persistent random secret in DATA_DIR so
 * local testing is real without asking for a credential.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const scrypt = promisify(crypto.scrypt);

export const SESSION_COOKIE = 'dl_session';
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const RESET_MAX_AGE_MS = 30 * 60 * 1000;
const SECRET_BYTES = 32;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

export function validEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Include at least one letter and one number.';
  }
  return '';
}

export function validateRegistration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'A JSON object is required.' };
  }
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return { error: 'Enter a valid email address.' };
  const passwordError = validatePassword(body.password);
  if (passwordError) return { error: passwordError };
  const name = String(body.name || '').trim().slice(0, 60);
  return { value: { email, password: String(body.password), name } };
}

export function validateLogin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'A JSON object is required.' };
  }
  const email = normalizeEmail(body.email);
  if (!validEmail(email) || typeof body.password !== 'string' || !body.password) {
    return { error: 'Enter a valid email address and password.' };
  }
  return { value: { email, password: body.password } };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: derived.toString('hex') };
}

export async function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash || typeof password !== 'string') return false;
  try {
    const derived = await scrypt(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

let dummyPasswordPromise = null;

function dummyPasswordRecord() {
  if (!dummyPasswordPromise) {
    dummyPasswordPromise = (async () => {
      const salt = crypto.randomBytes(16).toString('hex');
      const derived = await scrypt('deutschlern-dummy-password', salt, 64);
      return { salt, hash: derived.toString('hex') };
    })();
  }
  return dummyPasswordPromise;
}

/**
 * Unknown emails must cost the same as a real scrypt check, otherwise login
 * timing reveals which addresses have accounts.
 */
export async function verifyPasswordUnknown(password) {
  const { salt, hash } = await dummyPasswordRecord();
  return verifyPassword(password, salt, hash);
}

// Start preparing the dummy record at module load so the first login is not
// measurably slower than later ones.
dummyPasswordRecord();

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function signSessionId(id, secret) {
  return `${id}.${hmac(id, secret)}`;
}

export function verifySessionCookie(value, secret) {
  const raw = String(value || '');
  const split = raw.lastIndexOf('.');
  if (split <= 0) return null;
  const id = raw.slice(0, split);
  const signature = raw.slice(split + 1);
  const expected = hmac(id, secret);
  if (signature.length !== expected.length) return null;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      // A malformed escape must not turn an ordinary cookie into a 500.
      cookies[key] = value;
    }
  }
  return cookies;
}

export function sessionFromRequest(req, config, db) {
  if (!config.configured) return null;
  const id = verifySessionCookie(parseCookies(req.headers.cookie)[SESSION_COOKIE], config.secret);
  if (!id) return null;
  const found = db.getSession(hashToken(id));
  if (!found || Date.parse(found.session.expiresAt) <= Date.now()) return null;
  return {
    session: found.session,
    user: {
      id: found.user.id,
      email: found.user.email,
      name: found.user.name || '',
      createdAt: found.user.createdAt,
    },
  };
}

export function sessionCookie(value, config) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.floor(config.sessionMaxAgeMs / 1000)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (config.isProduction) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(config) {
  return [
    `${SESSION_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(config.isProduction ? ['Secure'] : []),
  ].join('; ');
}

async function loadOrCreateDevSecret(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, 'dev-session-secret');
  try {
    const secret = (await fs.readFile(secretPath, 'utf8')).trim();
    if (secret.length >= 32) return secret;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');
  await fs.writeFile(secretPath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

/**
 * @param {{ env?: object, dataDir?: string }} [options]
 */
export async function loadAuthConfig({ env = process.env, dataDir } = {}) {
  const isProduction = env.NODE_ENV === 'production';
  const explicit = String(env.SESSION_SECRET || '').trim();
  let secret = explicit;
  let reason = '';

  if (!secret) {
    if (isProduction) {
      reason = 'SESSION_SECRET is required in production. Set it on the server to enable accounts.';
    } else {
      secret = await loadOrCreateDevSecret(dataDir || path.join(process.cwd(), 'data'));
    }
  } else if (isProduction && secret.length < 32) {
    reason = 'SESSION_SECRET must be at least 32 characters in production. Set it on the server to enable accounts.';
    // Never keep a weak secret in the config, and never echo it in the reason.
    secret = '';
  }

  const allowDevTokens = !isProduction && String(env.ALLOW_DEV_RESET_TOKENS || '').toLowerCase() === 'true';

  return {
    configured: Boolean(secret),
    reason,
    secret,
    provider: 'local-session',
    storage: 'file',
    isProduction,
    sessionMaxAgeMs: SESSION_MAX_AGE_MS,
    resetMaxAgeMs: RESET_MAX_AGE_MS,
    allowDevTokens,
    // Optional JWT_SECRET is reserved for a future token transport; current
    // sessions are opaque server records and do not need it.
    jwtConfigured: Boolean(String(env.JWT_SECRET || '').trim()),
  };
}

export function publicAuthStatus(config, auth) {
  const user = auth?.user || null;
  return {
    status: 'ok',
    configured: Boolean(config?.configured),
    provider: config?.provider || 'local-session',
    storage: config?.storage || 'file',
    authenticated: Boolean(user),
    user,
    reason: config?.configured ? '' : config?.reason || 'Accounts are not configured on this server.',
    passwordReset: {
      available: Boolean(config?.allowDevTokens),
      reason: config?.allowDevTokens
        ? 'Development tokens are returned in the API response for manual testing.'
        : 'Email delivery is not configured on this server.',
    },
    sessionMaxAgeSeconds: Math.floor((config?.sessionMaxAgeMs || SESSION_MAX_AGE_MS) / 1000),
  };
}

/** Test-friendly config factory; no filesystem access. */
export function createAuthConfig({ secret = 'test-session-secret-with-enough-entropy', ...rest } = {}) {
  return {
    configured: Boolean(secret),
    reason: secret ? '' : 'SESSION_SECRET is not set on the server.',
    secret,
    provider: 'local-session',
    storage: 'file',
    isProduction: false,
    sessionMaxAgeMs: SESSION_MAX_AGE_MS,
    resetMaxAgeMs: RESET_MAX_AGE_MS,
    allowDevTokens: true,
    jwtConfigured: false,
    ...rest,
  };
}
