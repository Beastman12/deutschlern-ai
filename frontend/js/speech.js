/**
 * Milestone 6 — browser speech capabilities.
 *
 * Two real recognition paths are supported:
 *   1. Web Speech API (SpeechRecognition / webkitSpeechRecognition), no key.
 *   2. Optional same-origin Azure fallback via a recorded PCM WAV upload.
 *
 * An unsupported browser never sees a fake transcript. It gets a clear reason
 * and can still type the transcript manually.
 */

export class SpeechError extends Error {
  constructor(message, { code = 'speech_error' } = {}) {
    super(message);
    this.name = 'SpeechError';
    this.code = code;
  }
}

export function recognitionSupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function mediaCaptureSupported() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      typeof window !== 'undefined' &&
      (window.MediaRecorder || window.webkitMediaRecorder) &&
      (window.AudioContext || window.webkitAudioContext),
  );
}

export function audioPlaybackSupported() {
  return (
    typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  );
}

const RECOGNITION_ERRORS = {
  'not-allowed': ['Microphone access was denied. Allow it in your browser settings to speak.', 'permission_denied'],
  'service-not-allowed': ['Speech recognition is blocked by this browser or device.', 'service_blocked'],
  'audio-capture': ['No working microphone was found.', 'no_microphone'],
  'no-speech': ['No speech was detected. Move closer to the microphone and try again.', 'no_speech'],
  network: ['The browser speech service could not be reached.', 'network'],
  aborted: ['Speech recognition was stopped.', 'aborted'],
};

function mapRecognitionError(event) {
  const [message, code] = RECOGNITION_ERRORS[event?.error] || [
    'Speech recognition could not complete. You can type the transcript instead.',
    'recognition_failed',
  ];
  return new SpeechError(message, { code });
}

/**
 * Start one German utterance with the Web Speech API.
 * The returned Promise resolves with a real transcript; `.stop()` lets the UI
 * finish early. `onInterim` receives partial text while the learner speaks.
 */
export function startListening({ onInterim } = {}) {
  if (!recognitionSupported()) {
    const promise = Promise.reject(
      new SpeechError('This browser does not support speech recognition. You can type the transcript instead.', {
        code: 'unsupported',
      }),
    );
    return { promise, stop() {}, abort() {} };
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let settled = false;

  const promise = new Promise((resolve, reject) => {
    try {
      recognizer = new Recognition();
    } catch (error) {
      reject(new SpeechError('Speech recognition could not start in this browser.', { code: 'unsupported' }));
      return;
    }

    recognizer.lang = 'de-DE';
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;

    recognizer.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript || '';
        if (result?.isFinal) finalText += `${text} `;
        else interimText += `${text} `;
      }
      if (finalText.trim()) {
        settled = true;
        resolve({ text: finalText.replace(/\s+/g, ' ').trim(), source: 'browser' });
        // Final results have arrived; do not let the recognizer keep listening.
        try {
          recognizer.stop();
        } catch {
          // Already stopped — nothing to clean up.
        }
      } else if (interimText.trim()) {
        onInterim?.(interimText.replace(/\s+/g, ' ').trim());
      }
    };

    recognizer.onerror = (event) => {
      if (settled && event?.error === 'aborted') return;
      settled = true;
      reject(mapRecognitionError(event));
    };

    recognizer.onend = () => {
      if (settled) return;
      settled = true;
      reject(new SpeechError('Listening ended without a transcript. Try again or type what you said.', {
        code: 'no_transcript',
      }));
    };

    try {
      recognizer.start();
    } catch {
      settled = true;
      reject(new SpeechError('Speech recognition is already running or could not be started.', {
        code: 'already_running',
      }));
    }
  });

  return {
    promise,
    stop() {
      try {
        recognizer?.stop();
      } catch {
        // The recognizer may already have ended.
      }
    },
    abort() {
      try {
        recognizer?.abort();
      } catch {
        // The recognizer may already have ended.
      }
    },
  };
}

function preferredMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

/** Decode the browser recording and encode 16-bit mono PCM WAV for Azure. */
async function encodeWav(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  try {
    const source = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(source);
    const channel = decoded.getChannelData(0);
    const sampleRate = decoded.sampleRate;
    const dataBytes = channel.length * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);

    const writeText = (offset, text) => {
      for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
    };

    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let index = 0; index < channel.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channel[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return {
      audio: toBase64(buffer),
      sampleRate,
      bytes: buffer.byteLength,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Record microphone audio for the optional server fallback.
 * Call `.stop()` to receive a bounded WAV payload, or `.cancel()` to discard it.
 */
export async function startRecording({ maxMs = 30_000 } = {}) {
  if (!mediaCaptureSupported()) {
    throw new SpeechError('This browser cannot record microphone audio for server recognition.', {
      code: 'unsupported',
    });
  }

  const MediaRecorderClass = window.MediaRecorder || window.webkitMediaRecorder;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false,
    });
  } catch (error) {
    const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
    throw new SpeechError(
      denied
        ? 'Microphone access was denied. Allow it in your browser settings to record audio.'
        : 'No microphone was available for recording.',
      { code: denied ? 'permission_denied' : 'no_microphone' },
    );
  }

  const cleanup = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  let recorder = null;
  const chunks = [];
  const mimeType = preferredMimeType();
  try {
    recorder = mimeType ? new MediaRecorderClass(stream, { mimeType }) : new MediaRecorderClass(stream);
  } catch (error) {
    cleanup();
    throw new SpeechError('This browser could not start an audio recording.', { code: 'recording_failed' });
  }

  let stopResolve = null;
  let stopReject = null;
  const stopped = new Promise((resolve, reject) => {
    stopResolve = resolve;
    stopReject = reject;
  });

  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  recorder.onerror = () => {
    cleanup();
    stopReject(new SpeechError('The recording failed. Please try again.', { code: 'recording_failed' }));
  };
  recorder.onstop = () => stopResolve();

  const maxTimer = window.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, maxMs);

  try {
    recorder.start();
  } catch (error) {
    // A failed start must not leave the mic stream live or the cap timer armed.
    window.clearTimeout(maxTimer);
    cleanup();
    throw new SpeechError('This browser could not start an audio recording.', { code: 'recording_failed' });
  }

  let finished = false;
  const finish = async (discard) => {
    if (finished) return null;
    finished = true;
    window.clearTimeout(maxTimer);
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    cleanup();
    if (discard || !chunks.length) return null;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
    const wav = await encodeWav(blob);
    if (wav.bytes > 1_800_000) {
      throw new SpeechError('The recording is too long. Speak for at most 30 seconds.', {
        code: 'too_long',
      });
    }
    return wav;
  };

  return {
    stop: () => finish(false),
    cancel: () => finish(true),
  };
}
