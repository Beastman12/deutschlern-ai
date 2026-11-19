/**
 * Milestone 6 — browser-safe speech API.
 *
 * GET  /api/speech/status     configuration only, never a key
 * POST /api/speech/transcribe optional Azure fallback for recorded WAV audio
 */
import express from 'express';
import {
  loadSpeechConfig,
  publicSpeechStatus,
  transcribeAudio,
  validateTranscriptionRequest,
} from './speech.js';
import { createSlidingWindow, rateLimitFromEnv, setRateLimitHeaders } from './rate-limit.js';

const DEFAULT_LIMIT = Object.freeze({ windowMs: 60_000, max: 12 });
const JSON_BODY_LIMIT = '3mb';

/**
 * @param {{ config?: object, fetchImpl?: Function, limit?: {windowMs:number,max:number} }} [options]
 */
export function createSpeechRouter({
  config = loadSpeechConfig(),
  fetchImpl = fetch,
  limit = rateLimitFromEnv('SPEECH', DEFAULT_LIMIT),
} = {}) {
  const router = express.Router();
  const limiter = createSlidingWindow(limit);

  router.get('/status', (req, res) => {
    res.json({ status: 'ok', ...publicSpeechStatus(config) });
  });

  router.post('/transcribe', express.json({ limit: JSON_BODY_LIMIT }), async (req, res) => {
    if (!config.configured) {
      return res.status(503).json({
        error: 'speech_not_configured',
        configured: false,
        message: config.reason || 'Speech recognition is not configured on the server.',
      });
    }

    const rateState = limiter.check(limiter.keyFor(req, 'speech-transcribe'));
    setRateLimitHeaders(res, rateState);
    if (rateState.limited) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many recordings in a short time. Wait a minute and try again.',
      });
    }

    const { value, error } = validateTranscriptionRequest(req.body);
    if (error) {
      return res.status(400).json({ error: 'invalid_audio', message: error });
    }

    try {
      const result = await transcribeAudio({
        config,
        audio: value.audio,
        sampleRate: value.sampleRate,
        language: value.language,
        fetchImpl,
      });
      return res.json({ ...result, provider: 'azure-speech', model: 'azure-speech-to-text' });
    } catch (caught) {
      return res.status(Number(caught?.status) || 502).json({
        error: caught?.code || 'speech_unavailable',
        message: caught?.message || 'Speech recognition could not be completed.',
      });
    }
  });

  return router;
}
