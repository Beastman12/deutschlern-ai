/**
 * Milestone 5 — AI API routes.
 *
 * Every credential-bearing call goes through this server-side router. The
 * browser only ever sees `/api/ai/status` and `/api/ai/chat`; API keys, provider
 * URLs and raw provider error bodies never leave the server.
 */
import express from 'express';
import {
  REQUEST_TIMEOUT_MS,
  buildChatMessages,
  loadAIConfig,
  parseAIResponse,
  publicStatus,
  validateChatRequest,
} from './ai.js';
import { createSlidingWindow, rateLimitFromEnv, setRateLimitHeaders } from './rate-limit.js';

const DEFAULT_LIMIT = Object.freeze({ windowMs: 60_000, max: 20 });
const JSON_BODY_LIMIT = '3mb';

function providerError(status) {
  if (status === 401 || status === 403) {
    return {
      status: 502,
      body: {
        error: 'provider_auth_failed',
        message: 'The AI provider rejected the server credentials. Check the server configuration.',
      },
    };
  }
  if (status === 429) {
    return {
      status: 502,
      body: {
        error: 'provider_busy',
        message: 'The AI provider is busy right now. Please try again shortly.',
      },
    };
  }
  return {
    status: 502,
    body: {
      error: 'provider_error',
      message: 'The AI provider could not complete the request. Please try again.',
    },
  };
}

/**
 * @param {{ config?: object, fetchImpl?: Function, limit?: {windowMs:number,max:number} }} [options]
 */
export function createAIRouter({
  config = loadAIConfig(),
  fetchImpl = fetch,
  limit = rateLimitFromEnv('AI', DEFAULT_LIMIT),
} = {}) {
  const router = express.Router();
  const limiter = createSlidingWindow(limit);

  router.get('/status', (req, res) => {
    res.json({ status: 'ok', ...publicStatus(config) });
  });

  router.post('/chat', express.json({ limit: JSON_BODY_LIMIT }), async (req, res) => {
    if (!config.configured) {
      return res.status(503).json({
        error: 'ai_not_configured',
        configured: false,
        message: config.reason || 'AI is not configured on the server.',
      });
    }

    const rateState = limiter.check(limiter.keyFor(req, 'ai-chat'));
    setRateLimitHeaders(res, rateState);
    if (rateState.limited) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many messages in a short time. Wait a minute and try again.',
      });
    }

    const { value, error } = validateChatRequest(req.body);
    if (error) {
      return res.status(400).json({ error: 'invalid_request', message: error });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: buildChatMessages(value),
          temperature: 0.7,
          max_tokens: 600,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Release the connection before returning a public error so repeated
        // provider failures cannot accumulate undici sockets.
        try { await response.body?.cancel?.(); } catch { /* already closed */ }
        const failure = providerError(response.status);
        return res.status(failure.status).json(failure.body);
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      const parsed = parseAIResponse(content);
      if (!parsed.reply) {
        return res.status(502).json({
          error: 'empty_reply',
          message: 'The AI provider returned an empty reply. Please try again.',
        });
      }

      return res.json({
        reply: parsed.reply,
        correction: parsed.correction,
        explanation: parsed.explanation,
        mode: value.mode,
        level: value.level,
        model: config.model,
      });
    } catch (caught) {
      if (caught?.name === 'AbortError') {
        return res.status(504).json({
          error: 'provider_timeout',
          message: 'The AI provider took too long to answer. Please try again.',
        });
      }
      console.error('[ai] Provider request failed:', caught?.message || caught);
      return res.status(502).json({
        error: 'provider_unavailable',
        message: 'The AI provider could not be reached. Please try again later.',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  return router;
}
