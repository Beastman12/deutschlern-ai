/**
 * Milestone 6 — Pronunciation Trainer.
 *
 * Uses authored model sentences from the speaking bank, real microphone input
 * and a deterministic transcript comparison. It never invents a phonetic score:
 * the comparison is word-presence only, and any provider confidence is labelled
 * as recognition confidence, not pronunciation quality.
 */
import { getPromptsForLevel } from './content.js';
import { normalizeText, selectPrompt } from './exam.js';
import { friendlySpeechError, getSpeechStatus, sendSpeechAudio } from './speech-client.js';
import {
  audioPlaybackSupported,
  mediaCaptureSupported,
  recognitionSupported,
  SpeechError,
  startListening,
  startRecording,
} from './speech.js';
import {
  clearPronunciationHistory,
  getPronunciationLog,
  getState,
  recordPronunciationAttempt,
} from './store.js';
import {
  confirmDialog,
  emptyState,
  escapeHtml,
  formatDate,
  icon,
  speakGerman,
  stopSpeaking,
  toast,
} from './ui.js';

const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

function levelOptions(selected) {
  return LEVELS.map(
    (level) =>
      `<option value="${level}" ${level === selected ? 'selected' : ''}>${level.toUpperCase()}</option>`,
  ).join('');
}

/** Order-aware word comparison. This is not a phonetic or accent score. */
export function compareTranscript(target, transcript) {
  const targetWords = normalizeText(target).split(/\s+/).filter(Boolean);
  const spokenWords = normalizeText(transcript).split(/\s+/).filter(Boolean);
  const matchedWords = [];
  const missed = [];
  let cursor = 0;

  for (const word of targetWords) {
    const index = spokenWords.indexOf(word, cursor);
    if (index === -1) {
      missed.push(word);
      continue;
    }
    matchedWords.push(word);
    cursor = index + 1;
  }

  return { matched: matchedWords.length, total: targetWords.length, matchedWords, missed };
}

export function renderPronunciation() {
  const savedLevel = getState().profile.targetLevel;
  let level = LEVELS.includes(savedLevel) ? savedLevel : 'a1';
  let prompts = getPromptsForLevel(level, 'speaking');
  let prompt = selectPrompt({ prompts, level, skill: 'speaking', seed: 'pronunciation-view' }) || prompts[0] || null;
  let speechStatus = null;
  let speechChecking = true;
  let busy = false;
  let recognizer = null;
  let recorder = null;
  let comparison = null;
  let providerNote = '';
  let lastSource = 'manual';

  const html = `
    <div class="page page--pronunciation" data-pronunciation>
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practise · Milestone 6</p>
          <h1 class="page-title">Pronunciation Trainer</h1>
          <p class="page-sub">Hear an authored model, say it aloud, then compare the recognised words. No invented accent score.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/roadmap">${icon('compass')} Roadmap</a>
        </div>
      </header>

      <div class="speech-layout">
        <aside class="card speech-setup" aria-labelledby="pronunciation-target-title">
          <header class="card__head">
            <p class="eyebrow">Target</p>
            <h2 class="card__title" id="pronunciation-target-title">Pick a model line</h2>
          </header>

          <div class="field">
            <label for="pronunciation-level">CEFR level</label>
            <span class="select-wrap">
              <select class="select" id="pronunciation-level" data-pronunciation-level>${levelOptions(level)}</select>
              ${icon('chevron-down')}
            </span>
          </div>

          <div class="speech-prompt" data-pronunciation-prompt aria-live="polite"></div>

          <div class="speech-prompt__actions">
            <button class="btn btn--soft btn--sm" type="button" data-pronunciation-next>${icon('rotate')} New line</button>
            <button class="btn btn--ghost btn--sm" type="button" data-pronunciation-play>${icon('play')} Hear model</button>
            <button class="btn btn--ghost btn--sm" type="button" data-pronunciation-slow>${icon('volume')} Slow</button>
          </div>

          <div class="speech-history">
            <div class="speech-history__head">
              <h3>Practice history</h3>
              <button class="btn btn--ghost btn--sm" type="button" data-pronunciation-clear hidden>Clear</button>
            </div>
            <div data-pronunciation-history></div>
          </div>
        </aside>

        <section class="card pronunciation-panel" aria-labelledby="pronunciation-work-title">
          <header class="card__head">
            <p class="eyebrow">Record & compare</p>
            <h2 class="card__title" id="pronunciation-work-title">Say the line</h2>
            <p class="card__sub">Word comparison comes only from a real transcript. It is practice feedback, not an exam result.</p>
          </header>

          <div data-pronunciation-status role="status" aria-live="polite"></div>
          <div class="speech-error" data-pronunciation-error role="alert" hidden></div>

          <div class="pronunciation-target" data-pronunciation-target aria-live="polite"></div>

          <div class="field speech-transcript-field">
            <label for="pronunciation-transcript">What was recognised</label>
            <textarea id="pronunciation-transcript" class="textarea" data-pronunciation-transcript rows="4"
              maxlength="1500" placeholder="Your recognised speech appears here…"></textarea>
            <small class="field__hint">Correct recognition mistakes here before comparing again.</small>
          </div>

          <div class="speech-controls" role="group" aria-label="Pronunciation recording controls">
            <button class="btn btn--primary" type="button" data-pronunciation-listen>${icon('mic')} Speak with browser</button>
            <button class="btn btn--soft" type="button" data-pronunciation-record>${icon('mic')} Record for server</button>
            <button class="btn btn--ghost" type="button" data-pronunciation-stop hidden>${icon('x')} Stop</button>
          </div>

          <div class="speech-actions" role="group" aria-label="Comparison controls">
            <button class="btn btn--primary" type="button" data-pronunciation-compare disabled>${icon('check')} Compare words</button>
            <button class="btn btn--ghost" type="button" data-pronunciation-play-mine disabled>${icon('play')} Hear my transcript</button>
          </div>

          <div class="pronunciation-result" data-pronunciation-result hidden aria-live="polite"></div>
        </section>
      </div>
    </div>`;

  return {
    title: 'Pronunciation Trainer',
    crumbs: [{ label: 'Practise' }, { label: 'Pronunciation Trainer' }],
    html,

    mount(root) {
      const host = root.querySelector('[data-pronunciation]');
      if (!host) return;

      const levelSelect = host.querySelector('[data-pronunciation-level]');
      const promptBox = host.querySelector('[data-pronunciation-prompt]');
      const targetBox = host.querySelector('[data-pronunciation-target]');
      const statusBox = host.querySelector('[data-pronunciation-status]');
      const errorBox = host.querySelector('[data-pronunciation-error]');
      const transcriptInput = host.querySelector('[data-pronunciation-transcript]');
      const listenButton = host.querySelector('[data-pronunciation-listen]');
      const recordButton = host.querySelector('[data-pronunciation-record]');
      const stopButton = host.querySelector('[data-pronunciation-stop]');
      const nextButton = host.querySelector('[data-pronunciation-next]');
      const modelButton = host.querySelector('[data-pronunciation-play]');
      const slowButton = host.querySelector('[data-pronunciation-slow]');
      const compareButton = host.querySelector('[data-pronunciation-compare]');
      const playMineButton = host.querySelector('[data-pronunciation-play-mine]');
      const resultBox = host.querySelector('[data-pronunciation-result]');
      const historyBox = host.querySelector('[data-pronunciation-history]');
      const clearHistoryButton = host.querySelector('[data-pronunciation-clear]');

      const guard = () => host.isConnected;

      function renderPrompt() {
        if (!guard()) return;
        if (!prompt) {
          promptBox.innerHTML = emptyState({
            iconName: 'volume',
            title: 'No model line available',
            text: 'Choose another level with authored speaking prompts.',
          });
          targetBox.innerHTML = '';
          return;
        }
        promptBox.innerHTML = `
          <span class="speech-prompt__topic">${escapeHtml(prompt.topic || prompt.lessonTitle || 'Pronunciation')}</span>
          <p class="speech-prompt__text" lang="de">${escapeHtml(prompt.model?.de || '')}</p>
          <small lang="en">${escapeHtml(prompt.model?.en || '')}</small>
          ${
            prompt.tips?.length
              ? `<ul class="speech-prompt__tips" role="list">${prompt.tips
                  .map((tip) => `<li>${escapeHtml(tip)}</li>`)
                  .join('')}</ul>`
              : ''
          }`;
        targetBox.innerHTML = `
          <span class="pronunciation-target__label">Target line</span>
          <p lang="de">${escapeHtml(prompt.model?.de || '')}</p>`;
      }

      function renderStatus() {
        if (!guard()) return;
        const browserReady = recognitionSupported();
        const serverReady = Boolean(speechStatus?.configured) && mediaCaptureSupported() && !speechChecking;
        const ready = browserReady || serverReady;
        let message;
        if (speechChecking) {
          message = 'Checking browser and server speech options…';
        } else if (browserReady && serverReady) {
          message = 'Browser recognition and the optional Azure fallback are both available.';
        } else if (browserReady) {
          message = `Browser recognition is available. Server fallback: ${
            speechStatus?.reason || 'not configured'
          }`;
        } else if (serverReady) {
          message = 'Use Record for server: browser speech recognition is unavailable here.';
        } else {
          message = 'No speech recognition is available here. You can type a transcript for word comparison.';
        }
        statusBox.innerHTML = `
          <div class="speech-status ${ready ? 'speech-status--ready' : 'speech-status--offline'}">
            <span class="chip ${ready ? 'chip--success' : speechChecking ? 'chip--brand' : 'chip--warning'}">
              ${icon(ready ? 'check' : speechChecking ? 'clock' : 'info')}
              ${escapeHtml(speechChecking ? 'Checking recognition…' : ready ? 'Recognition ready' : 'Recognition unavailable')}
            </span>
            <span class="speech-status__text">${escapeHtml(message)}</span>
          </div>`;
      }

      function renderControls() {
        if (!guard()) return;
        const hasText = Boolean(transcriptInput.value.trim());
        listenButton.disabled = busy || Boolean(recognizer) || Boolean(recorder) || !recognitionSupported();
        recordButton.disabled = busy || Boolean(recognizer) || Boolean(recorder) || !speechStatus?.configured || !mediaCaptureSupported();
        stopButton.hidden = !recognizer && !recorder;
        compareButton.disabled = busy || !hasText || !prompt?.model?.de;
        playMineButton.disabled = busy || !hasText || !audioPlaybackSupported();
        nextButton.disabled = busy;
      }

      function renderHistory() {
        if (!guard()) return;
        const entries = getPronunciationLog();
        clearHistoryButton.hidden = entries.length === 0;
        if (!entries.length) {
          historyBox.innerHTML = '<p class="speech-history__empty">No pronunciation attempts saved yet.</p>';
          return;
        }
        historyBox.innerHTML = `
          <ul class="speech-history__list" role="list">
            ${entries
              .slice(0, 8)
              .map(
                (entry) => `
                  <li class="speech-history__item">
                    <span class="chip chip--soft">${escapeHtml(entry.level.toUpperCase())}</span>
                    <span>
                      <strong>${escapeHtml(entry.target)}</strong>
                      <small>${escapeHtml(formatDate(entry.date))} · ${escapeHtml(
                        `${entry.matched}/${entry.total} words recognised`,
                      )}</small>
                    </span>
                  </li>`,
              )
              .join('')}
          </ul>`;
      }

      function renderResult() {
        if (!guard()) return;
        if (!comparison) {
          resultBox.hidden = true;
          resultBox.innerHTML = '';
          return;
        }
        resultBox.hidden = false;
        resultBox.innerHTML = `
          <div class="pronunciation-result__head">
            <h3>Word comparison</h3>
            <span class="chip chip--brand">${comparison.matched} of ${comparison.total} target words recognised</span>
          </div>
          <p class="pronunciation-result__note">
            ${icon('info')} This checks whether the transcript contains the target words in order. It is not a phonetic score, accent rating or exam result.
          </p>
          <ul class="word-compare" role="list">
            ${comparison.matchedWords
              .map((word) => `<li class="word-compare__item is-matched">${icon('check')} ${escapeHtml(word)}</li>`)
              .join('')}
            ${comparison.missed
              .map((word) => `<li class="word-compare__item is-missed">${icon('x')} ${escapeHtml(word)}</li>`)
              .join('')}
          </ul>
          ${providerNote ? `<p class="pronunciation-result__provider">${escapeHtml(providerNote)}</p>` : ''}`;
      }

      function showError(message) {
        if (!guard()) return;
        errorBox.hidden = false;
        errorBox.innerHTML = `
          <span class="speech-error__icon">${icon('info')}</span>
          <div><strong>Speech could not complete.</strong><p>${escapeHtml(message)}</p></div>`;
      }

      function clearError() {
        if (!guard()) return;
        errorBox.hidden = true;
        errorBox.innerHTML = '';
      }

      function renderAll() {
        renderPrompt();
        renderStatus();
        renderControls();
        renderHistory();
        renderResult();
      }

      function setPrompt(next) {
        prompts = getPromptsForLevel(level, 'speaking');
        if (!prompts.length) prompts = getPromptsForLevel('all', 'speaking');
        prompt = prompts[((next % prompts.length) + prompts.length) % prompts.length] || null;
        transcriptInput.value = '';
        comparison = null;
        providerNote = '';
        lastSource = 'manual';
        clearError();
        renderAll();
      }

      async function checkStatus() {
        try {
          speechStatus = await getSpeechStatus();
        } catch (error) {
          speechStatus = { configured: false, reason: friendlySpeechError(error) };
        }
        if (!guard()) return;
        speechChecking = false;
        renderStatus();
        renderControls();
      }

      async function listen() {
        if (busy || recognizer || !recognitionSupported()) return;
        clearError();
        stopSpeaking();
        busy = true;
        transcriptInput.value = '';
        comparison = null;
        providerNote = '';
        renderResult();
        renderControls();
        const session = startListening();
        recognizer = session;
        renderControls();
        try {
          const result = await session.promise;
          if (!guard()) return;
          transcriptInput.value = result.text;
          lastSource = 'browser';
          providerNote = '';
        } catch (error) {
          if (guard()) showError(error?.message || 'Speech recognition could not complete.');
        } finally {
          recognizer = null;
          busy = false;
          if (guard()) renderControls();
        }
      }

      async function record() {
        if (busy || recorder || !speechStatus?.configured || !mediaCaptureSupported()) return;
        clearError();
        stopSpeaking();
        busy = true;
        transcriptInput.value = '';
        comparison = null;
        providerNote = '';
        renderResult();
        renderControls();
        try {
          recorder = await startRecording();
          if (!guard()) {
            // A late permission grant must not activate a detached view's mic.
            recorder.cancel().catch(() => {});
            return;
          }
          renderControls();
          const wav = await recorder.stop();
          if (!guard()) return;
          if (!wav) {
            showError('No audio was recorded. Please try again.');
            return;
          }
          const result = await sendSpeechAudio({
            audio: wav.audio,
            sampleRate: wav.sampleRate,
            language: 'de-DE',
          });
          if (!guard()) return;
          transcriptInput.value = String(result.transcript || '');
          lastSource = 'azure';
          // Number(null) === 0: only a present, finite 0–1 value is a real
          // recognition confidence. Missing values must not invent "0.00".
          const rawConfidence = result.confidence;
          const confidence =
            rawConfidence === undefined || rawConfidence === null || rawConfidence === ''
              ? NaN
              : Number(rawConfidence);
          providerNote = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
            ? `Azure recognition confidence: ${confidence.toFixed(2)}. This is not a pronunciation score.`
            : '';
          if (!result.transcript) showError(result.reason || 'Azure Speech returned no transcript.');
        } catch (error) {
          if (guard()) showError(error instanceof SpeechError ? error.message : friendlySpeechError(error));
        } finally {
          recorder = null;
          busy = false;
          if (guard()) renderControls();
        }
      }

      function compare() {
        const text = transcriptInput.value.trim();
        if (!text || !prompt?.model?.de) return;
        comparison = compareTranscript(prompt.model.de, text);
        const saved = recordPronunciationAttempt({
          level,
          promptId: prompt.id,
          focus: prompt.topic || prompt.lessonTitle || '',
          target: prompt.model.de,
          transcript: text,
          matched: comparison.matched,
          total: comparison.total,
          missed: comparison.missed,
          source: lastSource,
        });
        if (saved && guard()) renderHistory();
        if (guard()) renderResult();
      }

      levelSelect?.addEventListener('change', () => {
        if (busy) return;
        level = levelSelect.value;
        setPrompt(0);
      });
      nextButton?.addEventListener('click', () => {
        if (busy) return;
        setPrompt(1);
      });
      modelButton?.addEventListener('click', () => speakGerman(prompt?.model?.de || ''));
      slowButton?.addEventListener('click', () => speakGerman(prompt?.model?.de || '', { rate: 0.7 }));
      listenButton?.addEventListener('click', listen);
      recordButton?.addEventListener('click', record);
      stopButton?.addEventListener('click', () => {
        recognizer?.abort();
        recorder?.cancel().catch(() => {});
        showError('Recording or listening was stopped.');
      });
      transcriptInput?.addEventListener('input', () => {
        lastSource = 'manual';
        renderControls();
      });
      compareButton?.addEventListener('click', compare);
      playMineButton?.addEventListener('click', () => speakGerman(transcriptInput.value));
      clearHistoryButton?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear pronunciation history?',
          message: 'Saved practice entries will be removed from this device. Lessons and progress stay.',
          confirmLabel: 'Clear history',
          danger: true,
          onConfirm: () => {
            clearPronunciationHistory();
            renderHistory();
            toast('Pronunciation history cleared.', { type: 'success' });
          },
        });
      });

      renderAll();
      checkStatus();
    },

    destroy() {
      recognizer?.abort();
      recorder?.cancel().catch(() => {});
      stopSpeaking();
    },
  };
}
