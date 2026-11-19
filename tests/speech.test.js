/**
 * Milestone 6 — server-side speech configuration, validation and parsing.
 * No real provider key or network call is needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSpeechConfig,
  parseTranscription,
  publicSpeechStatus,
  transcribeAudio,
  validateTranscriptionRequest,
} from '../server/speech.js';

test('speech config is honest when credentials are missing', () => {
  const config = loadSpeechConfig({});
  assert.equal(config.configured, false);
  assert.match(config.reason, /AZURE_SPEECH_KEY/);
  assert.equal(publicSpeechStatus(config).configured, false);
  assert.equal(publicSpeechStatus(config).provider, 'azure-speech');
});

test('speech config rejects malformed regions and keeps the key server-only', () => {
  const bad = loadSpeechConfig({ AZURE_SPEECH_KEY: 'test-value', AZURE_SPEECH_REGION: 'not a region' });
  assert.equal(bad.configured, false);
  assert.match(bad.reason, /REGION/);

  const good = loadSpeechConfig({ AZURE_SPEECH_KEY: 'test-value', AZURE_SPEECH_REGION: 'westeurope' });
  assert.equal(good.configured, true);
  assert.equal(good.key, 'test-value');
  const status = publicSpeechStatus(good);
  assert.equal(status.configured, true);
  assert.equal(status.region, 'westeurope');
  assert.ok(!JSON.stringify(status).includes('test-value'));
  assert.ok(!('key' in status));
});

test('transcription requests reject non-WAV and invalid audio envelopes', () => {
  assert.ok(validateTranscriptionRequest(null).error);
  assert.ok(validateTranscriptionRequest({ audio: '', sampleRate: 16000 }).error);
  assert.ok(validateTranscriptionRequest({ audio: 'UklGRg', sampleRate: 7000 }).error);

  const valid = validateTranscriptionRequest({
    audio: Buffer.from('RIFF0000WAVEfmt data').toString('base64'),
    sampleRate: 16000,
    language: 'de-DE',
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.sampleRate, 16000);
});

test('transcription requests reject recordings longer than 30 seconds', () => {
  const wav = (dataBytes, sampleRate = 16_000) => {
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataBytes, 40);
    return buffer;
  };
  const envelope = (buffer) => ({
    audio: buffer.toString('base64'),
    sampleRate: 16_000,
    language: 'de-DE',
  });

  assert.equal(validateTranscriptionRequest(envelope(wav(320_000))).error, undefined);
  assert.match(validateTranscriptionRequest(envelope(wav(992_000))).error, /30 seconds/);
});

test('parsing keeps only real transcript fields and honest reasons', () => {
  const success = parseTranscription({
    RecognitionStatus: 'Success',
    DisplayText: 'Ich heiße Anna',
    NBest: [{ Display: 'Ich heiße Anna', Confidence: 0.91, Words: [{ Word: 'Ich', Offset: 0, Duration: 100000 }] }],
  });
  assert.equal(success.transcript, 'Ich heiße Anna');
  assert.equal(success.confidence, 0.91);
  assert.equal(success.words[0].word, 'Ich');

  const empty = parseTranscription({ RecognitionStatus: 'NoMatch' });
  assert.equal(empty.transcript, '');
  assert.match(empty.reason, /No speech/);
});

test('transcribeAudio reports 503 without a key and never calls the provider', async () => {
  let called = false;
  await assert.rejects(
    () =>
      transcribeAudio({
        config: loadSpeechConfig({}),
        audio: Buffer.from('RIFF0000WAVE'),
        fetchImpl: async () => {
          called = true;
          throw new Error('should not be called');
        },
      }),
    (error) => error.code === 'speech_not_configured' && error.status === 503,
  );
  assert.equal(called, false);
});

test('transcribeAudio forwards only bounded data to the configured provider', async () => {
  let request = null;
  const config = loadSpeechConfig({ AZURE_SPEECH_KEY: 'secret-key', AZURE_SPEECH_REGION: 'westeurope' });
  const result = await transcribeAudio({
    config,
    audio: Buffer.from('RIFF0000WAVE'),
    sampleRate: 16000,
    language: 'de-DE',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ RecognitionStatus: 'Success', DisplayText: 'Hallo' }),
      };
    },
  });

  assert.equal(result.transcript, 'Hallo');
  assert.match(request.url, /westeurope\.stt\.speech\.microsoft\.com/);
  assert.equal(request.options.headers['Ocp-Apim-Subscription-Key'], 'secret-key');
  assert.match(request.options.headers['Content-Type'], /samplerate=16000/);
});
