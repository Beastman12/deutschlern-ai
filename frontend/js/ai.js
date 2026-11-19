/**
 * Browser client for the server-side AI endpoints.
 *
 * The browser never sees a provider key. Every call goes to the same origin,
 * and a missing configuration is reported honestly by the server rather than
 * being replaced with a local imitation.
 */
import { ApiError } from './api.js';

const TIMEOUT_MS = 20_000;

async function request(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'same-origin',
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // A non-JSON error body still becomes a readable ApiError below.
    }

    if (!response.ok) {
      throw new ApiError(payload.message || `Request failed with status ${response.status}.`, {
        status: response.status,
        url: path,
        code: payload.error || '',
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      throw new ApiError('The request was cancelled or timed out. Please try again.', {
        url: path,
        code: 'timeout',
      });
    }
    throw new ApiError('Could not reach the server. Check your connection and try again.', {
      url: path,
      code: 'network',
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function getAIStatus(signal) {
  return request('/api/ai/status', { signal });
}

export function sendAIChat(payload, signal) {
  return request('/api/ai/chat', { method: 'POST', body: payload, signal });
}

/** Turn an API error into a short, honest message for the conversation view. */
export function friendlyAIError(error) {
  if (error?.code === 'ai_not_configured') {
    return error.message || 'AI is not configured on the server yet.';
  }
  if (error?.code === 'rate_limited') return 'Too many messages at once. Wait a minute and try again.';
  if (error?.code === 'provider_timeout') return 'The AI took too long to answer. Please try again.';
  if (error?.code === 'provider_auth_failed') {
    return 'The AI provider rejected the server credentials. Ask the site owner to check the server configuration.';
  }
  if (error?.code === 'invalid_request') return error.message || 'Check your message and try again.';
  return error?.message || 'The AI could not answer right now. Please try again.';
}
