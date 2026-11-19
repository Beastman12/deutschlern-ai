/**
 * Browser client for the optional server-side speech fallback.
 * Keys stay on the server. This module only sends bounded WAV recordings to
 * the same-origin `/api/speech` router.
 */
import { ApiError } from './api.js';

const TIMEOUT_MS = 25_000;

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
      // Non-JSON failures still become readable ApiError instances below.
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
      throw new ApiError('Speech recognition timed out. Please try again.', { url: path, code: 'timeout' });
    }
    throw new ApiError('Could not reach the speech service. Check your connection and try again.', {
      url: path,
      code: 'network',
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function getSpeechStatus(signal) {
  return request('/api/speech/status', { signal });
}

export function sendSpeechAudio({ audio, sampleRate, language = 'de-DE' }, signal) {
  return request('/api/speech/transcribe', {
    method: 'POST',
    body: { audio, sampleRate, language },
    signal,
  });
}

export function friendlySpeechError(error) {
  if (error?.code === 'speech_not_configured') {
    return error.message || 'Server speech recognition is not configured.';
  }
  if (error?.code === 'rate_limited') return 'Too many recordings at once. Wait a minute and try again.';
  if (error?.code === 'speech_timeout') return 'Speech recognition took too long. Please try again.';
  if (error?.code === 'speech_auth_failed') {
    return 'The speech provider rejected the server credentials. Ask the site owner to check the configuration.';
  }
  if (error?.code === 'invalid_audio') return error.message || 'The recording could not be read.';
  if (error?.code === 'timeout') return 'Speech recognition timed out. Please try again.';
  return error?.message || 'Speech recognition is unavailable right now.';
}
