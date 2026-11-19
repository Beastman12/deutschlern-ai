/**
 * DeutschLern AI — application server.
 *
 * Milestone 7 serves the vanilla-JS frontend, the curriculum JSON, the
 * seventeen-section lesson bodies, grammar drills, flashcards, the derived
 * exercise bank, the health endpoint, the server-side AI router, the optional
 * speech router and real local accounts with authenticated progress sync.
 * Credentials are read only inside their own server modules: the browser gets
 * an honest unavailable state when a service is not configured.
 */
import './env-loader.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { createAIRouter } from './ai-router.js';
import { createSpeechRouter } from './speech-router.js';
import { loadAuthConfig } from './auth.js';
import { createAuthRouter } from './auth-router.js';
import { createDatabase } from './db.js';
import { readRateLimits } from './rate-limit.js';
import { createSyncRouter } from './sync-router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const CONTENT_DIR = path.join(ROOT, 'content');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const VERSION = '1.0.0';
const MILESTONE = 9;
const STARTED_AT = Date.now();
const LIMITS = readRateLimits();

/**
 * Parse TRUST_PROXY for reverse-proxy deployments only. With no explicit
 * configuration Node is exposed directly and forwarded headers are ignored.
 */
export function readTrustProxy(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  const lowered = raw.toLowerCase();
  if (lowered === 'true' || lowered === '1') return 1;
  if (lowered === 'false' || lowered === '0') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw.includes(',')) {
    const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
    return entries.length ? entries : false;
  }
  // A single host, CIDR or unix socket path is also accepted by Express.
  return raw;
}

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', readTrustProxy(process.env.TRUST_PROXY));

/* -------------------------------------------------------------------------- */
/* Security headers                                                            */
/* -------------------------------------------------------------------------- */

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      // Inline *style* attributes are used for dynamic chart/ring values only.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  // API payloads can contain account and progress data; never let a shared
  // cache store them, and vary any cached representation by session cookie.
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');
  }
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Body parsing is router-local (auth 64kb, sync 1mb, AI/speech 3mb) so a large
// request cannot bypass a smaller per-route cap before it is validated.

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

// Accounts and sync need filesystem-backed setup. The promise is created once
// at module load and awaited by the relevant routes, so `app` stays a normal
// synchronous Express object for tests while no request can use half-built
// infrastructure.
let authState = null;
const ready = (async () => {
  const [config, db] = await Promise.all([
    loadAuthConfig({ dataDir: DATA_DIR }),
    createDatabase({ filePath: path.join(DATA_DIR, 'deutschlern-db.json') }),
  ]);
  const auth = createAuthRouter({ db, config, limits: LIMITS.auth });
  const sync = createSyncRouter({
    db,
    config,
    requireAuth: auth.requireAuth,
    getAuth: auth.getAuth,
    limits: LIMITS.sync,
  });
  authState = { config, db, auth, sync };
  return authState;
})();

// The routes below await `ready` and report the failure themselves; this
// handler only prevents an unhandled rejection from terminating the process.
ready.catch(() => {});

async function waitForAuth(req, res, next) {
  try {
    await ready;
    next();
  } catch (error) {
    next(error);
  }
}

app.get('/api/health', async (req, res) => {
  try {
    await ready;
  } catch {
    // Health still reports the service as up; auth status tells the truth.
  }
  res.json({
    status: 'ok',
    service: 'deutschlern-ai',
    version: VERSION,
    milestone: MILESTONE,
    auth: {
      configured: Boolean(authState?.config.configured),
      storage: authState?.config.storage || 'file',
    },
    uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// Liveness stays up above; readiness fails closed when the required account
// infrastructure is unavailable, so an orchestrator never sends traffic to a
// misconfigured production deployment. It never echoes a secret or key.
app.get('/api/health/ready', async (req, res) => {
  try {
    await ready;
  } catch {
    return res.status(503).json({
      status: 'not_ready',
      reason: 'Server storage failed to initialize.',
    });
  }
  if (!authState?.config.configured) {
    return res.status(503).json({
      status: 'not_ready',
      reason: authState?.config.reason || 'Accounts are not configured on this server.',
    });
  }
  res.json({
    status: 'ready',
    service: 'deutschlern-ai',
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
});

// The AI router reads its own configuration from the environment. It reports
// an explicit "not configured" status and 503 response when no key is present,
// so the browser never receives invented AI output.
app.use('/api/ai', createAIRouter({ limit: LIMITS.ai }));

// Optional Azure speech fallback. Browser recognition works without it; the
// status and 503 response are honest when no speech key is configured.
app.use('/api/speech', createSpeechRouter({ limit: LIMITS.speech }));

// Real accounts and authenticated progress. The delegating handlers are safe
// because waitForAuth has already resolved the initialization promise.
app.use('/api/auth', waitForAuth, (req, res, next) => authState.auth.router(req, res, next));
app.use('/api/sync', waitForAuth, (req, res, next) => authState.sync(req, res, next));

app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `No API route matches ${req.method} ${req.originalUrl}.`,
  });
});

/* -------------------------------------------------------------------------- */
/* Static content + frontend                                                   */
/* -------------------------------------------------------------------------- */

app.use(
  '/content',
  express.static(CONTENT_DIR, {
    maxAge: IS_PRODUCTION ? '1h' : 0,
    etag: true,
    index: false,
    dotfiles: 'deny',
  }),
);

app.use(
  express.static(FRONTEND_DIR, {
    maxAge: IS_PRODUCTION ? '1h' : 0,
    etag: true,
    index: 'index.html',
    dotfiles: 'deny',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

// Hash-based routing means deep links normally never reach the server, but
// this fallback keeps direct visits to unknown paths usable.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/content/')) return next();

  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send('Frontend not built: frontend/index.html is missing.');
  }
  res.sendFile(indexPath);
});

/* -------------------------------------------------------------------------- */
/* Error handling                                                              */
/* -------------------------------------------------------------------------- */

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) {
    console.error('[server] Unhandled error:', err);
  }
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      error: status >= 500 ? 'internal_error' : 'request_error',
      message: status >= 500 ? 'Something went wrong on the server.' : err.message,
    });
  }
  res.status(status).type('text').send(status >= 500 ? 'Internal server error' : err.message);
});

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

export function start({ port = Number(process.env.PORT) || 3000 } = {}) {
  const server = app.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`\n  DeutschLern AI · v${VERSION} · Milestone ${MILESTONE}`);
    console.log(`  → http://localhost:${actualPort}\n`);
  });

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received — shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) start();
