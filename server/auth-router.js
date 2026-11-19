/**
 * Milestone 7 — account routes.
 *
 * All credential handling is server-side. Registration, login and password
 * reset fail honestly when accounts are not configured; there is no fake
 * sign-in and no seeded account data.
 */
import express from 'express';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createAuthConfig,
  hashPassword,
  hashToken,
  newToken,
  normalizeEmail,
  publicAuthStatus,
  sessionCookie,
  signSessionId,
  sessionFromRequest,
  validateLogin,
  validatePassword,
  validateRegistration,
  verifyPassword,
  verifyPasswordUnknown,
} from './auth.js';
import { createRateLimitMiddleware, readRateLimits } from './rate-limit.js';

const JSON_BODY_LIMIT = '64kb';
const UNCONFIGURED_MESSAGE = 'Accounts are not configured on this server.';
const GENERIC_RESET_MESSAGE = 'If that email has an account, a reset link has been generated.';

function sendUnconfigured(res, config) {
  return res.status(503).json({
    error: config.reason || UNCONFIGURED_MESSAGE,
    code: 'auth_unavailable',
  });
}

function publicUser(auth) {
  return auth?.user || null;
}

const ATTEMPT_LIMIT_BODY = Object.freeze({
  error: 'Too many attempts. Please try again later.',
  code: 'rate_limited',
});

const WRITE_LIMIT_BODY = Object.freeze({
  error: 'Too many requests. Please try again later.',
  code: 'rate_limited',
});

/**
 * @param {{ db: object, config?: object, sessionTtlMs?: number, limits?: object }} options
 */
export function createAuthRouter({ db, config = createAuthConfig(), sessionTtlMs, limits = readRateLimits().auth }) {
  const router = express.Router();
  const activeConfig = { ...config };
  if (sessionTtlMs) activeConfig.sessionMaxAgeMs = sessionTtlMs;
  const authLimit = (max, keyPrefix, body = ATTEMPT_LIMIT_BODY) =>
    createRateLimitMiddleware({ windowMs: limits.windowMs, max, keyPrefix, body });
  const registerLimit = authLimit(limits.register, 'auth-register');
  const loginLimit = authLimit(limits.login, 'auth-login');
  const passwordRequestLimit = authLimit(limits.password, 'auth-password-request', WRITE_LIMIT_BODY);
  const passwordResetLimit = authLimit(limits.password, 'auth-password-reset', WRITE_LIMIT_BODY);
  const logoutLimit = authLimit(limits.login, 'auth-logout', WRITE_LIMIT_BODY);
  const accountDeleteLimit = authLimit(limits.accountDelete, 'auth-account-delete', WRITE_LIMIT_BODY);

  function getAuth(req) {
    return sessionFromRequest(req, activeConfig, db);
  }

  function requireConfigured(req, res, next) {
    if (!activeConfig.configured) {
      sendUnconfigured(res, activeConfig);
      return;
    }
    next();
  }

  function requireAuth(req, res, next) {
    const auth = getAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Sign in to continue.', code: 'auth_required' });
      return;
    }
    req.auth = auth;
    next();
  }

  router.get('/status', (req, res) => {
    res.json(publicAuthStatus(activeConfig, getAuth(req)));
  });

  router.get('/me', (req, res) => {
    const auth = getAuth(req);
    if (!auth) {
      res.status(401).json({
        error: activeConfig.configured ? 'You are not signed in.' : activeConfig.reason || UNCONFIGURED_MESSAGE,
        code: activeConfig.configured ? 'auth_required' : 'auth_unavailable',
      });
      return;
    }
    res.json({ status: 'ok', authenticated: true, user: publicUser(auth) });
  });

  router.post('/register', express.json({ limit: JSON_BODY_LIMIT }), registerLimit, requireConfigured, async (req, res) => {
    const parsed = validateRegistration(req.body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error, code: 'invalid_registration' });
      return;
    }
    try {
      if (db.getUserByEmail(parsed.value.email)) {
        res.status(409).json({ error: 'An account with that email already exists.', code: 'email_taken' });
        return;
      }
      const password = await hashPassword(parsed.value.password);
      const user = await db.createUser({
        id: newToken(18),
        email: parsed.value.email,
        name: parsed.value.name,
        passwordSalt: password.salt,
        passwordHash: password.hash,
      });
      const sessionId = newToken(32);
      await db.createSession({
        id: sessionId,
        tokenHash: hashToken(sessionId),
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + activeConfig.sessionMaxAgeMs).toISOString(),
      });
      res.setHeader(
        'Set-Cookie',
        sessionCookie(signSessionId(sessionId, activeConfig.secret), activeConfig),
      );
      res.status(201).json({ status: 'ok', authenticated: true, user });
    } catch (error) {
      if (error?.code === 'email_taken') {
        res.status(409).json({ error: error.message, code: 'email_taken' });
        return;
      }
      console.error('Registration failed:', error);
      res.status(500).json({ error: 'Could not create the account. Please try again.', code: 'register_failed' });
    }
  });

  router.post('/login', express.json({ limit: JSON_BODY_LIMIT }), loginLimit, requireConfigured, async (req, res) => {
    const parsed = validateLogin(req.body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error, code: 'invalid_login' });
      return;
    }
    try {
      const record = db.getUserByEmail(parsed.value.email);
      const valid = record
        ? await verifyPassword(parsed.value.password, record.passwordSalt, record.passwordHash)
        : await verifyPasswordUnknown(parsed.value.password);
      if (!record || !valid) {
        res.status(401).json({ error: 'Incorrect email or password.', code: 'invalid_credentials' });
        return;
      }
      const sessionId = newToken(32);
      await db.createSession({
        id: sessionId,
        tokenHash: hashToken(sessionId),
        userId: record.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + activeConfig.sessionMaxAgeMs).toISOString(),
      });
      res.setHeader(
        'Set-Cookie',
        sessionCookie(signSessionId(sessionId, activeConfig.secret), activeConfig),
      );
      res.json({
        status: 'ok',
        authenticated: true,
        user: { id: record.id, email: record.email, name: record.name || '', createdAt: record.createdAt },
      });
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Could not sign in. Please try again.', code: 'login_failed' });
    }
  });

  router.post('/logout', requireAuth, logoutLimit, async (req, res) => {
    await db.deleteSession(req.auth.session.id);
    res.setHeader('Set-Cookie', clearSessionCookie(activeConfig));
    res.json({ status: 'ok', authenticated: false });
  });

  router.post(
    '/password/request',
    express.json({ limit: JSON_BODY_LIMIT }),
    passwordRequestLimit,
    requireConfigured,
    async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      if (!email) {
        res.status(400).json({ error: 'Enter your account email.', code: 'invalid_email' });
        return;
      }
      try {
        const user = db.getUserByEmail(email);
        // Do not reveal whether an account exists: perform a queued no-op write
        // so the unknown-email path has the same persisted-write cost as the
        // known-email path.
        if (!user) {
          await db.noOpWrite?.();
          res.json({ status: 'ok', message: GENERIC_RESET_MESSAGE, token: null });
          return;
        }
        const token = newToken(32);
        await db.createReset({
          id: newToken(18),
          userId: user.id,
          tokenHash: hashToken(token),
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + activeConfig.resetMaxAgeMs).toISOString(),
          usedAt: null,
        });
        res.json({
          status: 'ok',
          message: GENERIC_RESET_MESSAGE,
          token: activeConfig.allowDevTokens ? token : null,
        });
      } catch (error) {
        console.error('Password reset request failed:', error);
        res.status(500).json({ error: 'Could not start a password reset.', code: 'reset_request_failed' });
      }
    },
  );

  router.post(
    '/password/reset',
    express.json({ limit: JSON_BODY_LIMIT }),
    passwordResetLimit,
    requireConfigured,
    async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const token = String(req.body?.token || '').trim();
      const passwordError = validatePassword(req.body?.password);
      if (!email || !token || passwordError) {
        res.status(400).json({ error: passwordError || 'Email, token and a valid new password are required.', code: 'invalid_reset' });
        return;
      }
      try {
        // Hash before consuming the token: a hashing failure must not burn a
        // valid reset token without changing the password.
        const password = await hashPassword(req.body.password);
        const user = db.getUserByEmail(email);
        let applied = false;
        if (user) {
          if (typeof db.resetPassword === 'function') {
            applied = await db.resetPassword({
              userId: user.id,
              tokenHash: hashToken(token),
              passwordRecord: password,
            });
          } else if (await db.consumeReset({ userId: user.id, tokenHash: hashToken(token) })) {
            // Fallback for a mock db without the atomic method.
            await db.updateUserPassword(user.id, password);
            await db.deleteSessionsForUser(user.id);
            applied = true;
          }
        }
        if (!applied) {
          res.status(400).json({ error: 'That reset link is invalid or has expired.', code: 'invalid_reset_token' });
          return;
        }
        res.setHeader('Set-Cookie', clearSessionCookie(activeConfig));
        res.json({ status: 'ok', message: 'Password updated. Please sign in again.' });
      } catch (error) {
        console.error('Password reset failed:', error);
        res.status(500).json({ error: 'Could not reset the password.', code: 'reset_failed' });
      }
    },
  );

  router.delete('/account', requireConfigured, requireAuth, accountDeleteLimit, async (req, res) => {
    await db.deleteAccount(req.auth.user.id);
    res.setHeader('Set-Cookie', clearSessionCookie(activeConfig));
    res.json({ status: 'ok', message: 'Account and server-side progress deleted.' });
  });

  return { router, requireAuth, getAuth };
}
