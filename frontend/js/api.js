/**
 * Browser-side API client.
 *
 * Every network call goes through this module. Credentials are sent only to
 * this app's own server with a same-origin, HttpOnly cookie; no secrets or
 * provider keys are ever exposed to the browser. Error bodies are surfaced as
 * ApiError instances with a stable `code` so views can show honest states.
 */

const DEFAULT_TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(message, { status = 0, url = '', code = '', ...details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.code = code;
    // Preserve server payload fields (e.g. revision, updatedAt on a 409) so
    // callers can report conflicts without a second request.
    Object.assign(this, details);
  }
}

/**
 * @param {string} url
 * @param {{
 *   method?: string,
 *   body?: unknown,
 *   timeout?: number,
 *   signal?: AbortSignal,
 *   headers?: Record<string,string>,
 * }} [options]
 */
export async function requestJSON(url, { method = 'GET', body, timeout = DEFAULT_TIMEOUT_MS, signal, headers = {} } = {}) {
  // An already-aborted signal must never reach fetch: addEventListener would
  // not fire for a past event, and a request could still be sent.
  if (signal?.aborted) {
    throw new ApiError('The request was cancelled.', { url, code: 'aborted' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeout);

  const abortFromCaller = () => controller.abort(signal?.reason);
  // addEventListener does not fire for an already-aborted signal: abort the
  // internal controller before fetch so no request is sent at all.
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const requestHeaders = { Accept: 'application/json', ...headers };
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'same-origin',
    });

    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = payload?.error || payload?.message || `Request failed with status ${response.status}.`;
      throw new ApiError(String(message), {
        ...(payload && typeof payload === 'object' ? payload : {}),
        status: response.status,
        url,
        code: String(payload?.code || ''),
      });
    }

    if (!contentType.includes('application/json')) {
      throw new ApiError('Expected a JSON response.', { status: response.status, url });
    }
    if (!payload || typeof payload !== 'object') {
      throw new ApiError('The server returned an empty response.', { status: response.status, url });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      const cancelledByCaller = Boolean(signal?.aborted);
      throw new ApiError(cancelledByCaller ? 'The request was cancelled.' : 'The request timed out.', {
        url,
        code: cancelledByCaller ? 'aborted' : 'timeout',
      });
    }
    throw new ApiError('Could not reach the server. Check your connection and try again.', {
      url,
      code: 'network',
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/** @param {string} url @param {object} [options] */
export function getJSON(url, options = {}) {
  return requestJSON(url, { ...options, method: 'GET' });
}

export const auth = {
  status: () => getJSON('/api/auth/status'),
  me: () => getJSON('/api/auth/me'),
  register: (details) => requestJSON('/api/auth/register', { method: 'POST', body: details }),
  login: (credentials) => requestJSON('/api/auth/login', { method: 'POST', body: credentials }),
  logout: () => requestJSON('/api/auth/logout', { method: 'POST' }),
  requestReset: (email) => requestJSON('/api/auth/password/request', { method: 'POST', body: { email } }),
  resetPassword: (details) => requestJSON('/api/auth/password/reset', { method: 'POST', body: details }),
  deleteAccount: () => requestJSON('/api/auth/account', { method: 'DELETE' }),
};

export const sync = {
  status: () => getJSON('/api/sync/status'),
  getState: () => getJSON('/api/sync/state'),
  pushState: (state, expectedRevision) =>
    requestJSON('/api/sync/state', { method: 'PUT', body: { state, expectedRevision } }),
  deleteState: () => requestJSON('/api/sync/state', { method: 'DELETE' }),
};

export const api = {
  health: () => getJSON('/api/health'),
  requestJSON,
  getJSON,
  auth,
  sync,
};
