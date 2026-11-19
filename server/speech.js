/**
 * Milestone 6 — optional server-side speech configuration and Azure proxy.
 *
 * Browser Web Speech API is the primary recognition engine. This module adds
 * an optional Azure Speech-to-Text fallback. The subscription key is read only
 * on the server and is never included in a public status response or sent to
 * the browser. Without credentials the endpoints report an honest 503 rather
 * than fabricating a transcript or a pronunciation score.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const REGION_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function loadSpeechConfig(env = process.env) {
  const key = String(env.AZURE_SPEECH_KEY || '').trim();
  const region = String(env.AZURE_SPEECH_REGION || '').trim();

  if (!key) {
    return {
      configured: false,
      provider: 'azure-speech',
      region: '',
      reason: 'AZURE_SPEECH_KEY is not set on the server.',
    };
  }
  if (!region) {
    return {
      configured: false,
      provider: 'azure-speech',
      region: '',
      reason: 'AZURE_SPEECH_REGION is not set on the server.',
    };
  }
  if (!REGION_RE.test(region)) {
    return {
      configured: false,
      provider: 'azure-speech',
      region: '',
      reason: 'AZURE_SPEECH_REGION is not a valid Azure region name.',
    };
  }

  return {
    configured: true,
    provider: 'azure-speech',
    region,
    reason: '',
    key,
  };
}

export function publicSpeechStatus(config) {
  return {
    configured: Boolean(config?.configured),
    provider: 'azure-speech',
    region: config?.configured ? config.region : '',
    reason: config?.configured ? '' : config?.reason || 'Speech recognition is not configured on the server.',
    capabilities: ['speech-to-text'],
    maxAudioBytes: 1_800_000,
  };
}

/** Best-effort WAV duration from the fmt/data chunks, or null if unparseable. */
function wavDurationSeconds(buffer) {
  try {
    let offset = 12;
    let byteRate = 0;
    let dataBytes = null;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString('ascii', offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      const body = offset + 8;
      if (body + size > buffer.length) return null;
      if (id === 'fmt ' && size >= 16) byteRate = buffer.readUInt32LE(body + 8);
      else if (id === 'data') dataBytes = size;
      offset = body + size + (size % 2);
    }
    return byteRate > 0 && dataBytes !== null ? dataBytes / byteRate : null;
  } catch {
    return null;
  }
}

/** Validate the small, bounded JSON envelope sent by the browser. */
export function validateTranscriptionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'A JSON object is required.' };
  }

  const audio = body.audio;
  if (typeof audio !== 'string' || !audio.trim()) {
    return { error: 'Recorded audio is missing.' };
  }
  if (audio.length > 2_500_000) {
    return { error: 'The recording is too long. Speak for at most 30 seconds.' };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    return { error: 'The recording is not valid base64 audio.' };
  }

  const sampleRate = Number(body.sampleRate);
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) {
    return { error: 'The recording has an unsupported sample rate.' };
  }

  const language = String(body.language || 'de-DE');
  if (!LANGUAGE_RE.test(language)) {
    return { error: 'The recognition language is invalid.' };
  }

  const buffer = Buffer.from(audio, 'base64');
  if (!buffer.length || buffer.length > 1_800_000) {
    return { error: 'The recording is empty or too long.' };
  }
  // Minimal RIFF/WAVE sanity check. Azure rejects other formats anyway; this
  // gives the browser a clear error before spending a provider request.
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return { error: 'The recording must be 16-bit PCM WAV audio.' };
  }
  // The browser limits capture to 30 seconds; enforce it server-side too so a
  // crafted payload cannot spend provider time on a long recording.
  const durationSeconds = wavDurationSeconds(buffer);
  if (durationSeconds !== null && durationSeconds > 30.5) {
    return { error: 'The recording is too long. Speak for at most 30 seconds.' };
  }

  return {
    value: { audio: buffer, sampleRate, language },
  };
}

function pickTranscript(payload) {
  const candidates = [];
  if (Array.isArray(payload?.NBest)) {
    for (const item of payload.NBest) {
      if (item?.Display && String(item.Display).trim()) candidates.push(item);
    }
  }
  if (payload?.DisplayText && String(payload.DisplayText).trim()) {
    candidates.push({ Display: String(payload.DisplayText).trim(), Confidence: payload.Confidence });
  }
  return candidates[0] || null;
}

/** Keep only browser-safe fields; never copy raw provider errors or headers. */
export function parseTranscription(payload) {
  const status = String(payload?.RecognitionStatus || '');
  if (status && status !== 'Success') {
    if (status === 'NoMatch') {
      return { transcript: '', confidence: null, words: [], reason: 'No speech was recognised. Try again closer to the microphone.' };
    }
    if (status === 'InitialSilenceTimeout') {
      return { transcript: '', confidence: null, words: [], reason: 'Only silence was detected. Start speaking sooner.' };
    }
    return { transcript: '', confidence: null, words: [], reason: 'Azure Speech could not recognise that recording.' };
  }

  const picked = pickTranscript(payload);
  if (!picked) {
    return { transcript: '', confidence: null, words: [], reason: 'Azure Speech returned an empty transcript.' };
  }

  const confidence = Number.isFinite(Number(picked.Confidence)) ? Number(picked.Confidence) : null;
  const words = Array.isArray(picked.Words)
    ? picked.Words
        .filter((word) => typeof word?.Word === 'string' && word.Word.trim())
        .slice(0, 120)
        .map((word) => ({
          word: String(word.Word).slice(0, 80),
          offset: Number.isFinite(Number(word.Offset)) ? Number(word.Offset) : null,
          duration: Number.isFinite(Number(word.Duration)) ? Number(word.Duration) : null,
        }))
    : [];

  return {
    transcript: String(picked.Display).replace(/\s+/g, ' ').trim().slice(0, 1500),
    confidence,
    words,
    reason: '',
  };
}

/**
 * POST a 16-bit PCM WAV buffer to Azure's conversation transcription endpoint.
 * `fetchImpl` is injectable so the proxy can be tested without a real key.
 */
export async function transcribeAudio({
  config,
  audio,
  sampleRate = 16000,
  language = 'de-DE',
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!config?.configured) {
    const error = new Error(config?.reason || 'Speech recognition is not configured on the server.');
    error.code = 'speech_not_configured';
    error.status = 503;
    throw error;
  }

  const url =
    `https://${config.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(language)}&format=detailed`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.key,
        'Content-Type': `audio/wav; codec=audio/pcm; samplerate=${sampleRate}`,
        Accept: 'application/json',
      },
      body: audio,
      signal: controller.signal,
    });

    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch { /* already closed */ }
    }
    if (response.status === 401 || response.status === 403) {
      const error = new Error('The speech provider rejected the server credentials. Check the server configuration.');
      error.code = 'speech_auth_failed';
      error.status = 502;
      throw error;
    }
    if (response.status === 429) {
      const error = new Error('The speech provider is busy right now. Please try again shortly.');
      error.code = 'speech_busy';
      error.status = 502;
      throw error;
    }
    if (!response.ok) {
      const error = new Error('The speech provider could not recognise this recording. Please try again.');
      error.code = 'speech_provider_error';
      error.status = 502;
      throw error;
    }

    return parseTranscription(await response.json());
  } catch (error) {
    if (error?.code) throw error;
    if (error?.name === 'AbortError') {
      const timeout = new Error('Speech recognition took too long. Please try again.');
      timeout.code = 'speech_timeout';
      timeout.status = 504;
      throw timeout;
    }
    const unavailable = new Error('The speech provider could not be reached. Please try again later.');
    unavailable.code = 'speech_unavailable';
    unavailable.status = 502;
    throw unavailable;
  } finally {
    clearTimeout(timer);
  }
}
