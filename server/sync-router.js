/**
 * Milestone 7 — authenticated progress sync.
 *
 * Progress is stored server-side against the signed-in user. Clients send an
 * opaque state object plus the revision they last saw; the server rejects a
 * stale push with 409 so a second device cannot silently overwrite newer work.
 * No scores or progress are invented by the server.
 */
import express from 'express';
import { createRateLimitMiddleware, readRateLimits } from './rate-limit.js';

const JSON_BODY_LIMIT = '1mb';
const MAX_STATE_BYTES = 900_000;

function isValidState(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function stateTooLarge(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_STATE_BYTES;
  } catch {
    return true;
  }
}

/**
 * @param {{ db: object, config?: object, requireAuth: function, getAuth: function, limits?: object }} options
 */
export function createSyncRouter({
  db,
  config,
  requireAuth,
  getAuth,
  limits = readRateLimits().sync,
}) {
  const router = express.Router();
  const writeLimit = createRateLimitMiddleware({
    windowMs: limits.windowMs,
    max: limits.write,
    keyPrefix: 'sync-write',
    body: () => ({
      error: 'Too many sync writes. Please try again shortly.',
      code: 'rate_limited',
    }),
  });

  router.get('/status', (req, res) => {
    const auth = getAuth(req);
    res.json({
      status: 'ok',
      configured: Boolean(config?.configured),
      authenticated: Boolean(auth),
      storage: config?.storage || 'file',
      reason: config?.configured ? '' : config?.reason || 'Progress sync is not configured on this server.',
    });
  });

  router.get('/state', requireAuth, (req, res) => {
    const record = db.getProgress(req.auth.user.id);
    res.json({
      status: 'ok',
      state: record?.state || null,
      revision: record?.revision || 0,
      updatedAt: record?.updatedAt || null,
    });
  });

  router.put('/state', express.json({ limit: JSON_BODY_LIMIT }), requireAuth, writeLimit, async (req, res) => {
    const state = req.body?.state;
    const expectedRevision = req.body?.expectedRevision;
    if (!isValidState(state)) {
      res.status(400).json({ error: 'A valid state object is required.', code: 'invalid_state' });
      return;
    }
    if (stateTooLarge(state)) {
      res.status(413).json({ error: 'The progress state is too large to sync.', code: 'state_too_large' });
      return;
    }
    if (expectedRevision !== null && expectedRevision !== undefined && !Number.isInteger(expectedRevision)) {
      res.status(400).json({ error: 'expectedRevision must be a whole number.', code: 'invalid_revision' });
      return;
    }
    try {
      const conflictBody = (revision, updatedAt) => ({
        error: 'Your progress changed on another device. Review both versions before syncing.',
        code: 'revision_conflict',
        revision,
        updatedAt,
      });
      if (typeof db.saveProgressIfRevision === 'function') {
        // Check and write inside one queued mutation: no TOCTOU window between
        // reading the revision and saving the new state.
        const result = await db.saveProgressIfRevision(req.auth.user.id, { state }, expectedRevision);
        if (result.conflict) {
          res.status(409).json(conflictBody(result.revision, result.updatedAt));
          return;
        }
        res.json({ status: 'ok', revision: result.revision, updatedAt: result.updatedAt });
        return;
      }
      // Fallback for a mock db that only implements the legacy API.
      const current = db.getProgress(req.auth.user.id);
      const currentRevision = current?.revision || 0;
      if (expectedRevision !== null && expectedRevision !== undefined && expectedRevision !== currentRevision) {
        res.status(409).json(conflictBody(currentRevision, current?.updatedAt || null));
        return;
      }
      const saved = await db.saveProgress(req.auth.user.id, { state });
      res.json({ status: 'ok', revision: saved.revision, updatedAt: saved.updatedAt });
    } catch (error) {
      console.error('Progress sync failed:', error);
      res.status(500).json({ error: 'Could not save progress on the server.', code: 'sync_failed' });
    }
  });

  router.delete('/state', requireAuth, writeLimit, async (req, res) => {
    try {
      await db.deleteProgress(req.auth.user.id);
      res.json({ status: 'ok', message: 'Server-side progress deleted.' });
    } catch (error) {
      console.error('Progress deletion failed:', error);
      res.status(500).json({ error: 'Could not delete server-side progress.', code: 'sync_delete_failed' });
    }
  });

  return router;
}
