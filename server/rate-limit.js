/**
 * Milestone 9 — shared rate limiting for every writable API.
 *
 * A single bounded sliding-window implementation replaces the three separate
 * in-memory limiters. Counters stay process-local (this build is single-instance
 * by design), are keyed by the socket peer or a validated proxy hop, and are
 * capped without evicting active counters. Standard `RateLimit-*` and `Retry-After`
 * headers make throttling visible instead of returning an opaque 429.
 */
import net from 'node:net';

const MIN_WINDOW_MS = 1_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REQUESTS = 100_000;
const MAX_TRACKED_KEYS = 1_000;

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/** Read one RATE_* pair, ignoring hostile or malformed environment values. */
export function rateLimitFromEnv(prefix, fallback) {
  return Object.freeze({
    windowMs: clampInt(
      process.env[`RATE_${prefix}_WINDOW_MS`],
      fallback.windowMs,
      MIN_WINDOW_MS,
      MAX_WINDOW_MS,
    ),
    max: clampInt(process.env[`RATE_${prefix}_MAX`], fallback.max, 1, MAX_REQUESTS),
  });
}

/** All limits used by the server, with safe documented defaults. */
export function readRateLimits() {
  return Object.freeze({
    ai: rateLimitFromEnv('AI', { windowMs: 60_000, max: 20 }),
    speech: rateLimitFromEnv('SPEECH', { windowMs: 60_000, max: 12 }),
    auth: Object.freeze({
      windowMs: clampInt(process.env.RATE_AUTH_WINDOW_MS, 15 * 60 * 1000, MIN_WINDOW_MS, MAX_WINDOW_MS),
      register: clampInt(process.env.RATE_REGISTER_MAX, 20, 1, MAX_REQUESTS),
      login: clampInt(process.env.RATE_LOGIN_MAX, 30, 1, MAX_REQUESTS),
      password: clampInt(process.env.RATE_PASSWORD_MAX, 10, 1, MAX_REQUESTS),
      accountDelete: clampInt(process.env.RATE_ACCOUNT_DELETE_MAX, 5, 1, MAX_REQUESTS),
    }),
    sync: Object.freeze({
      windowMs: clampInt(process.env.RATE_SYNC_WINDOW_MS, 60_000, MIN_WINDOW_MS, MAX_WINDOW_MS),
      write: clampInt(process.env.RATE_SYNC_WRITE_MAX, 60, 1, MAX_REQUESTS),
    }),
  });
}

function isLoopback(address) {
  const ip = String(address || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}

/**
 * Cloudflare Tunnel connects to this server over loopback and sets
 * CF-Connecting-IP to the real visitor. X-Forwarded-For can be spoofed by the
 * client, so prefer Cloudflare's dedicated header only for loopback peers.
 */
function cloudflareVisitorIp(req) {
  const raw = req.get?.('cf-connecting-ip') || req.headers?.['cf-connecting-ip'];
  const value = String(Array.isArray(raw) ? raw[0] : raw || '').split(',')[0].trim();
  return net.isIP(value) ? value : null;
}

/**
 * Create a sliding-window counter. `check(key)` always consumes one request
 * unless the caller is already over the limit, and returns the state needed for
 * response headers. The map is swept periodically and hard-capped.
 */
export function createSlidingWindow({ windowMs = 60_000, max = 20 } = {}) {
  const hits = new Map();
  let lastSweep = 0;

  function pruneExpired(now) {
    for (const [key, times] of hits) {
      const recent = times.filter((time) => now - time < windowMs);
      if (recent.length) {
        if (recent.length !== times.length) hits.set(key, recent);
      } else {
        hits.delete(key);
      }
    }
  }

  function sweep(now) {
    if (now - lastSweep >= Math.max(windowMs, 60_000)) {
      lastSweep = now;
      pruneExpired(now);
    }
  }

  return {
    keyFor(req, prefix) {
      const direct = req.socket?.remoteAddress || 'unknown';
      // Direct exposure deliberately keys on the socket peer: forwarded headers
      // are untrusted. Behind a validated proxy, use Express's `req.ip`, which
      // applies the configured hop count / trusted hosts to X-Forwarded-For.
      // Boolean `true` is rejected because it would trust every forwarded hop.
      const trustProxy = typeof req.app?.get === 'function' ? req.app.get('trust proxy') : false;
      const validatedProxy =
        (typeof trustProxy === 'number' && trustProxy > 0) ||
        Array.isArray(trustProxy) ||
        (typeof trustProxy === 'string' && trustProxy.length > 0);
      let peer = validatedProxy ? req.ip || direct : direct;
      // Cloudflare Tunnel is a loopback proxy: without this, every public
      // visitor would share one bucket. Its CF-Connecting-IP header is set by
      // Cloudflare itself and is safer than the client-influenced XFF list.
      if (validatedProxy && isLoopback(direct)) {
        peer = cloudflareVisitorIp(req) || peer;
      }
      return `${prefix}:${peer}`;
    },
    check(key) {
      const now = Date.now();
      sweep(now);
      const existing = hits.get(key);
      const recent = (existing || []).filter((time) => now - time < windowMs);
      if (!existing && hits.size >= MAX_TRACKED_KEYS) {
        // At capacity, reclaim only expired counters. Evicting an active key
        // would hand a throttled client a fresh allowance, so new keys are
        // refused until a window actually expires.
        pruneExpired(now);
        lastSweep = now;
        if (hits.size >= MAX_TRACKED_KEYS) {
          return Object.freeze({
            limited: true,
            max,
            remaining: 0,
            resetAt: now + windowMs,
            retryAfterSeconds: Math.ceil(windowMs / 1000),
            saturated: true,
          });
        }
      }
      const limited = recent.length >= max;
      if (!limited) recent.push(now);
      hits.set(key, recent);
      const resetAt = (recent[0] ?? now) + windowMs;
      return Object.freeze({
        limited,
        max,
        remaining: Math.max(0, max - recent.length),
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      });
    },
    get size() {
      return hits.size;
    },
  };
}

/** Apply RFC 9333-style headers plus Retry-After to a throttled response. */
export function setRateLimitHeaders(res, state) {
  res.setHeader('RateLimit-Limit', String(state.max));
  res.setHeader('RateLimit-Remaining', String(state.remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));
  if (state.limited) res.setHeader('Retry-After', String(state.retryAfterSeconds));
}

/** Express middleware for routes that can be limited before validation. */
export function createRateLimitMiddleware({
  windowMs = 60_000,
  max = 20,
  keyPrefix = 'limit',
  message = 'Too many requests. Please try again shortly.',
  body,
} = {}) {
  const window = createSlidingWindow({ windowMs, max });
  return function rateLimit(req, res, next) {
    const state = window.check(window.keyFor(req, keyPrefix));
    setRateLimitHeaders(res, state);
    if (!state.limited) return next();
    return res.status(429).json(
      typeof body === 'function'
        ? body(state)
        : { error: 'rate_limited', code: 'rate_limited', message },
    );
  };
}
