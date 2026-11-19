/**
 * Milestone 6 — Speaking Practice.
 *
 * Real microphone recognition (browser Web Speech API or the optional Azure
 * fallback), an editable transcript, model audio and a spoken reply from the
 * configured AI provider. Without credentials or browser support the relevant
 * control is disabled and the reason is shown; no transcript or reply is faked.
 */
import { getPromptsForLevel } from './content.js';
import { selectPrompt } from './exam.js';
import { friendlyAIError, getAIStatus, sendAIChat } from './ai.js';
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
  clearSpeakingHistory,
  getSpeakingAttempts,
  getState,
  recordSpeakingAttempt,
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

function splitTranslation(reply) {
  const text = String(reply || '');
  const marker = '\nEN:';
  const index = text.lastIndexOf(marker);
  if (index === -1) return { text: text.trim(), translation: '' };
  return {
    text: text.slice(0, index).trim(),
    translation: text.slice(index + marker.length).trim(),
  };
}

function statusRow({ hook, label, ready, message, checking = false }) {
  return `
    <div class="speech-status ${ready ? 'speech-status--ready' : 'speech-status--offline'}" data-${hook} role="status" aria-live="polite">
      <span class="chip ${ready ? 'chip--success' : checking ? 'chip--brand' : 'chip--warning'}">
        ${icon(ready ? 'check' : checking ? 'clock' : 'info')} ${escapeHtml(label)}
      </span>
      <span class="speech-status__text">${escapeHtml(message)}</span>
    </div>`;
}

export function renderSpeaking() {
  const savedLevel = getState().profile.targetLevel;
  let level = LEVELS.includes(savedLevel) ? savedLevel : 'a1';
  let prompts = getPromptsForLevel(level, 'speaking');
  let prompt = selectPrompt({ prompts, level, skill: 'speaking', seed: 'speaking-view' }) || prompts[0] || null;
  let transcript = '';
  let source = 'manual';
  let aiStatus = null;
  let speechStatus = null;
  let aiChecking = true;
  let speechChecking = true;
  let busy = false;
  let reply = null;
  let errorMessage = '';
  let recognizer = null;
  let recorder = null;
  let controller = null;

  const html = `
    <div class="page page--speaking" data-speaking>
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Practise · Milestone 6</p>
          <h1 class="page-title">Speaking Practice</h1>
          <p class="page-sub">Say an authored prompt, read back what was recognised, then hear a real reply from the configured AI tutor.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/roadmap">${icon('compass')} Roadmap</a>
        </div>
      </header>

      <div class="speech-layout">
        <aside class="card speech-setup" aria-labelledby="speaking-prompt-title">
          <header class="card__head">
            <p class="eyebrow">Your turn</p>
            <h2 class="card__title" id="speaking-prompt-title">Choose a prompt</h2>
          </header>

          <div class="field">
            <label for="speaking-level">CEFR level</label>
            <span class="select-wrap">
              <select class="select" id="speaking-level" data-speaking-level>${levelOptions(level)}</select>
              ${icon('chevron-down')}
            </span>
          </div>

          <div class="speech-prompt" data-speaking-prompt aria-live="polite"></div>

          <div class="speech-prompt__actions">
            <button class="btn btn--soft btn--sm" type="button" data-speaking-next>${icon('rotate')} New prompt</button>
            <button class="btn btn--ghost btn--sm" type="button" data-model-play>${icon('play')} Hear model</button>
            <button class="btn btn--ghost btn--sm" type="button" data-model-slow>${icon('volume')} Slow</button>
          </div>

          <div class="speech-history">
            <div class="speech-history__head">
              <h3>Saved attempts</h3>
              <button class="btn btn--ghost btn--sm" type="button" data-speaking-clear hidden>Clear</button>
            </div>
            <div data-speaking-history></div>
          </div>
        </aside>

        <section class="card speaking-panel" aria-labelledby="speaking-work-title">
          <header class="card__head">
            <p class="eyebrow">Voice loop</p>
            <h2 class="card__title" id="speaking-work-title">Speak, check, reply</h2>
            <p class="card__sub">Recognition happens in this browser or through the optional server provider. Text is never invented.</p>
          </header>

          ${statusRow({
            hook: 'speaking-ai-status',
            label: 'Checking AI…',
            ready: false,
            checking: true,
            message: 'Checking whether a real AI provider is configured on the server…',
          })}
          ${statusRow({
            hook: 'speaking-recognition-status',
            label: 'Checking recognition…',
            ready: false,
            checking: true,
            message: 'Checking browser and server speech options…',
          })}

          <div class="speech-error" data-speaking-error role="alert" hidden></div>

          <div class="field speech-transcript-field">
            <label for="speaking-transcript">Your transcript</label>
            <textarea id="speaking-transcript" class="textarea" data-speaking-transcript rows="5"
              maxlength="1500" placeholder="Speak, or type what you said…">${escapeHtml(transcript)}</textarea>
            <small class="field__hint">You can correct recognition errors before asking for a reply.</small>
          </div>

          <div class="speech-controls" role="group" aria-label="Speech controls">
            <button class="btn btn--primary" type="button" data-listen-start>${icon('mic')} Speak with browser</button>
            <button class="btn btn--soft" type="button" data-record-start>${icon('mic')} Record for server</button>
            <button class="btn btn--ghost" type="button" data-speech-stop hidden>${icon('x')} Stop</button>
            <button class="btn btn--ghost" type="button" data-transcript-clear>${icon('rotate')} Clear</button>
            <button class="btn btn--ghost" type="button" data-transcript-play>${icon('play')} Hear it</button>
          </div>

          <div class="speech-actions" role="group" aria-label="Save and reply">
            <button class="btn btn--primary" type="button" data-speaking-ask disabled>${icon('sparkles')} Ask tutor to reply</button>
            <button class="btn btn--soft" type="button" data-speaking-save disabled>${icon('check')} Save attempt</button>
          </div>

          <div class="speech-reply" data-speaking-reply hidden aria-live="polite"></div>
        </section>
      </div>
    </div>`;

  return {
    title: 'Speaking Practice',
    crumbs: [{ label: 'Practise' }, { label: 'Speaking Practice' }],
    html,

    mount(root) {
      const host = root.querySelector('[data-speaking]');
      if (!host) return;

      const levelSelect = host.querySelector('[data-speaking-level]');
      const promptBox = host.querySelector('[data-speaking-prompt]');
      const nextButton = host.querySelector('[data-speaking-next]');
      const modelButton = host.querySelector('[data-model-play]');
      const slowButton = host.querySelector('[data-model-slow]');
      const historyBox = host.querySelector('[data-speaking-history]');
      const clearHistoryButton = host.querySelector('[data-speaking-clear]');
      const aiStatusBox = host.querySelector('[data-speaking-ai-status]');
      const recognitionStatusBox = host.querySelector('[data-speaking-recognition-status]');
      const errorBox = host.querySelector('[data-speaking-error]');
      const transcriptInput = host.querySelector('[data-speaking-transcript]');
      const listenButton = host.querySelector('[data-listen-start]');
      const recordButton = host.querySelector('[data-record-start]');
      const stopButton = host.querySelector('[data-speech-stop]');
      const clearButton = host.querySelector('[data-transcript-clear]');
      const playButton = host.querySelector('[data-transcript-play]');
      const askButton = host.querySelector('[data-speaking-ask]');
      const saveButton = host.querySelector('[data-speaking-save]');
      const replyBox = host.querySelector('[data-speaking-reply]');

      const guard = () => host.isConnected;

      function renderPrompt() {
        if (!guard() || !prompt) {
          if (guard()) promptBox.innerHTML = emptyState({
            iconName: 'mic',
            title: 'No prompt available',
            text: 'This level has no authored speaking prompt. Choose another level.',
          });
          return;
        }
        promptBox.innerHTML = `
          <span class="speech-prompt__topic">${escapeHtml(prompt.topic || prompt.lessonTitle || 'Speaking')}</span>
          <p class="speech-prompt__text" lang="en">${escapeHtml(prompt.prompt)}</p>
          <div class="speech-prompt__model">
            <span class="speech-prompt__label">Model answer</span>
            <p lang="de">${escapeHtml(prompt.model?.de || '')}</p>
            <small lang="en">${escapeHtml(prompt.model?.en || '')}</small>
          </div>
          ${
            prompt.tips?.length
              ? `<ul class="speech-prompt__tips" role="list">${prompt.tips
                  .map((tip) => `<li>${escapeHtml(tip)}</li>`)
                  .join('')}</ul>`
              : ''
          }`;
      }

      function renderHistory() {
        if (!guard()) return;
        const attempts = getSpeakingAttempts();
        clearHistoryButton.hidden = attempts.length === 0;
        if (!attempts.length) {
          historyBox.innerHTML = '<p class="speech-history__empty">No attempts saved on this device yet.</p>';
          return;
        }
        historyBox.innerHTML = `
          <ul class="speech-history__list" role="list">
            ${attempts
              .slice(0, 8)
              .map(
                (attempt) => `
                  <li class="speech-history__item">
                    <span class="chip chip--soft">${escapeHtml(attempt.level.toUpperCase())}</span>
                    <span>
                      <strong>${escapeHtml(attempt.transcript)}</strong>
                      <small>${escapeHtml(formatDate(attempt.date))} · ${escapeHtml(attempt.source)}${
                        attempt.reply ? ' · AI reply saved' : ''
                      }</small>
                    </span>
                  </li>`,
              )
              .join('')}
          </ul>`;
      }

      function renderReply() {
        if (!guard()) return;
        if (!reply) {
          replyBox.hidden = true;
          replyBox.innerHTML = '';
          return;
        }
        replyBox.hidden = false;
        replyBox.innerHTML = `
          <span class="speech-reply__label">${icon('sparkles')} Real AI reply · ${escapeHtml(reply.model || 'configured provider')}</span>
          <p class="speech-reply__text" lang="de">${escapeHtml(reply.text)}</p>
          ${
            reply.translation
              ? `<div class="speech-reply__note"><strong>English</strong><p lang="en">${escapeHtml(
                  reply.translation,
                )}</p></div>`
              : ''
          }
          ${
            reply.correction
              ? `<div class="speech-reply__note"><strong>Correction</strong><p lang="de">${escapeHtml(
                  reply.correction,
                )}</p></div>`
              : ''
          }
          ${
            reply.explanation
              ? `<div class="speech-reply__note"><strong>Why</strong><p lang="en">${escapeHtml(
                  reply.explanation,
                )}</p></div>`
              : ''
          }
          <button class="btn btn--soft btn--sm" type="button" data-reply-play>${icon('volume')} Hear reply</button>
          <button class="btn btn--ghost btn--sm" type="button" data-reply-slow>${icon('play')} Slow reply</button>`;
      }

      function renderStatus() {
        if (!guard()) return;
        const aiReady = Boolean(aiStatus?.configured) && !aiChecking;
        const browserReady = recognitionSupported();
        const serverReady = Boolean(speechStatus?.configured) && mediaCaptureSupported() && !speechChecking;
        const recognitionReady = browserReady || serverReady;
        const aiMessage = aiChecking
          ? 'Checking whether a real AI provider is configured on the server…'
          : aiReady
            ? `${aiStatus.provider || 'Server AI'}${aiStatus.model ? ` · ${aiStatus.model}` : ''} is configured. Replies come only from that provider.`
            : aiStatus?.reason || 'AI is not configured on the server.';

        let recognitionMessage;
        if (speechChecking) {
          recognitionMessage = 'Checking browser and server speech options…';
        } else if (browserReady && serverReady) {
          recognitionMessage = 'Browser speech recognition is ready; the optional Azure fallback is also configured.';
        } else if (browserReady) {
          recognitionMessage = 'Browser speech recognition is ready. Azure fallback: ' + (speechStatus?.reason || 'not configured.');
        } else if (serverReady) {
          recognitionMessage = 'Browser recognition is unavailable here; Azure fallback is configured. Use Record for server.';
        } else {
          recognitionMessage = 'No speech recognition is available here. You can still type or paste a transcript.';
        }

        aiStatusBox.className = `speech-status ${aiReady ? 'speech-status--ready' : 'speech-status--offline'}`;
        aiStatusBox.innerHTML = `
          <span class="chip ${aiReady ? 'chip--success' : aiChecking ? 'chip--brand' : 'chip--warning'}">
            ${icon(aiReady ? 'check' : aiChecking ? 'clock' : 'info')}
            ${escapeHtml(aiChecking ? 'Checking AI…' : aiReady ? 'AI connected' : 'AI unavailable')}
          </span>
          <span class="speech-status__text">${escapeHtml(aiMessage)}</span>`;

        recognitionStatusBox.className = `speech-status ${recognitionReady ? 'speech-status--ready' : 'speech-status--offline'}`;
        recognitionStatusBox.innerHTML = `
          <span class="chip ${recognitionReady ? 'chip--success' : speechChecking ? 'chip--brand' : 'chip--warning'}">
            ${icon(recognitionReady ? 'check' : speechChecking ? 'clock' : 'info')}
            ${escapeHtml(speechChecking ? 'Checking recognition…' : recognitionReady ? 'Recognition ready' : 'Recognition unavailable')}
          </span>
          <span class="speech-status__text">${escapeHtml(recognitionMessage)}</span>`;
      }

      function renderControls() {
        if (!guard()) return;
        const hasText = Boolean(transcriptInput.value.trim());
        const listening = Boolean(recognizer);
        const recording = Boolean(recorder);
        listenButton.disabled = busy || listening || recording || !recognitionSupported();
        listenButton.title = recognitionSupported()
          ? 'Use the browser Web Speech API'
          : 'This browser does not expose SpeechRecognition';
        recordButton.disabled = busy || listening || recording || !speechStatus?.configured || !mediaCaptureSupported();
        recordButton.title = !mediaCaptureSupported()
          ? 'This browser cannot record microphone audio'
          : !speechStatus?.configured
            ? speechStatus?.reason || 'Server speech recognition is not configured'
            : 'Record audio and send it to the configured provider';
        stopButton.hidden = !listening && !recording;
        clearButton.disabled = busy || !hasText;
        playButton.disabled = busy || !hasText || !audioPlaybackSupported();
        askButton.disabled = busy || !hasText || !aiStatus?.configured || aiChecking;
        saveButton.disabled = busy || !hasText;
        nextButton.disabled = busy;
      }

      function showError(message) {
        if (!guard()) return;
        errorMessage = message;
        errorBox.hidden = false;
        errorBox.innerHTML = `
          <span class="speech-error__icon">${icon('info')}</span>
          <div><strong>Speech could not complete.</strong><p>${escapeHtml(message)}</p></div>`;
      }

      function clearError() {
        if (!guard()) return;
        errorMessage = '';
        errorBox.hidden = true;
        errorBox.innerHTML = '';
      }

      function renderAll() {
        renderPrompt();
        renderStatus();
        renderControls();
        renderHistory();
        renderReply();
      }

      function setPrompt(next) {
        prompts = getPromptsForLevel(level, 'speaking');
        if (!prompts.length) prompts = getPromptsForLevel('all', 'speaking');
        prompt = prompts[((next % prompts.length) + prompts.length) % prompts.length] || null;
        transcript = '';
        source = 'manual';
        reply = null;
        transcriptInput.value = '';
        clearError();
        renderAll();
      }

      async function checkStatuses() {
        const [ai, speech] = await Promise.allSettled([getAIStatus(), getSpeechStatus()]);
        if (!guard()) return;
        if (ai.status === 'fulfilled') aiStatus = ai.value;
        else aiStatus = { configured: false, reason: friendlyAIError(ai.reason) };
        if (speech.status === 'fulfilled') speechStatus = speech.value;
        else speechStatus = { configured: false, reason: friendlySpeechError(speech.reason) };
        aiChecking = false;
        speechChecking = false;
        renderStatus();
        renderControls();
      }

      async function listenWithBrowser() {
        if (busy || recognizer || !recognitionSupported()) return;
        clearError();
        stopSpeaking();
        busy = true;
        transcriptInput.value = '';
        renderControls();
        const session = startListening({
          onInterim: (text) => {
            if (!guard()) return;
            transcriptInput.value = text;
            renderControls();
          },
        });
        recognizer = session;
        renderControls();
        try {
          const result = await session.promise;
          if (!guard()) return;
          transcript = result.text;
          source = result.source;
          transcriptInput.value = transcript;
          reply = null;
        } catch (error) {
          if (guard()) showError(error?.message || 'Speech recognition could not complete.');
        } finally {
          recognizer = null;
          busy = false;
          if (guard()) renderControls();
        }
      }

      async function recordForServer() {
        if (busy || recorder || !speechStatus?.configured || !mediaCaptureSupported()) return;
        clearError();
        stopSpeaking();
        busy = true;
        renderControls();
        try {
          recorder = await startRecording();
          if (!guard()) {
            // Permission can be granted after navigation. Never leave a live
            // microphone running on a view the learner has already left.
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
          transcript = String(result.transcript || '').trim();
          source = 'azure';
          transcriptInput.value = transcript;
          reply = null;
          if (!transcript) showError(result.reason || 'Azure Speech returned no transcript.');
        } catch (error) {
          if (guard()) showError(error instanceof SpeechError ? error.message : friendlySpeechError(error));
        } finally {
          recorder = null;
          busy = false;
          if (guard()) renderControls();
        }
      }

      function stopActive() {
        recognizer?.abort();
        recorder?.cancel().catch(() => {});
        controller?.abort();
      }

      async function askTutor() {
        const text = transcriptInput.value.trim();
        if (busy || !text || !aiStatus?.configured || aiChecking) return;
        clearError();
        stopSpeaking();
        busy = true;
        reply = null;
        renderReply();
        renderControls();
        controller = new AbortController();
        try {
          const result = await sendAIChat(
            {
              mode: 'tutor',
              level,
              scenario: '',
              messages: [{ role: 'user', text }],
              showTranslation: false,
            },
            controller.signal,
          );
          if (!guard()) return;
          const parts = splitTranslation(result.reply);
          reply = {
            text: parts.text,
            translation: parts.translation,
            correction: result.correction || '',
            explanation: result.explanation || '',
            model: result.model || '',
          };
          const saved = recordSpeakingAttempt({
            level,
            promptId: prompt?.id || '',
            prompt: prompt?.prompt || '',
            model: prompt?.model?.de || '',
            transcript: text,
            source,
            reply: reply.text,
            correction: reply.correction,
            explanation: reply.explanation,
          });
          if (saved) renderHistory();
        } catch (error) {
          if (guard()) showError(friendlyAIError(error));
        } finally {
          controller = null;
          busy = false;
          if (guard()) {
            renderReply();
            renderControls();
          }
        }
      }

      function saveAttempt() {
        const text = transcriptInput.value.trim();
        if (!text) return;
        const saved = recordSpeakingAttempt({
          level,
          promptId: prompt?.id || '',
          prompt: prompt?.prompt || '',
          model: prompt?.model?.de || '',
          transcript: text,
          source,
          reply: reply?.text || '',
          correction: reply?.correction || '',
          explanation: reply?.explanation || '',
        });
        if (!saved) return;
        renderHistory();
        toast('Speaking attempt saved on this device.', { type: 'success', title: 'Saved' });
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
      listenButton?.addEventListener('click', listenWithBrowser);
      recordButton?.addEventListener('click', recordForServer);
      stopButton?.addEventListener('click', () => {
        stopActive();
        showError('Recording or listening was stopped.');
      });

      clearButton?.addEventListener('click', () => {
        transcript = '';
        transcriptInput.value = '';
        reply = null;
        clearError();
        renderReply();
        renderControls();
      });

      transcriptInput?.addEventListener('input', () => {
        transcript = transcriptInput.value;
        clearError();
        renderControls();
      });

      playButton?.addEventListener('click', () => speakGerman(transcriptInput.value));
      askButton?.addEventListener('click', askTutor);
      saveButton?.addEventListener('click', saveAttempt);

      replyBox?.addEventListener('click', (event) => {
        const play = event.target.closest('[data-reply-play], [data-reply-slow]');
        if (!play || !reply?.text) return;
        speakGerman(reply.text, { rate: play.hasAttribute('data-reply-slow') ? 0.7 : 1 });
      });

      clearHistoryButton?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear speaking history?',
          message: 'Saved speaking attempts will be removed from this device. Your lessons and progress stay.',
          confirmLabel: 'Clear attempts',
          danger: true,
          onConfirm: () => {
            clearSpeakingHistory();
            renderHistory();
            toast('Speaking history cleared.', { type: 'success' });
          },
        });
      });

      renderAll();
      checkStatuses();
    },

    destroy() {
      recognizer?.abort();
      recorder?.cancel().catch(() => {});
      controller?.abort();
      stopSpeaking();
    },
  };
}
