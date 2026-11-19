/**
 * Small UI toolkit: escaping, icons, toasts, accessible modals, rings,
 * progress bars and browser speech synthesis.
 */
import { getPreferences } from './store.js';

/* -------------------------------------------------------------------------- */
/* Text & formatting                                                           */
/* -------------------------------------------------------------------------- */

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function icon(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true" focusable="false"><use href="#i-${escapeHtml(
    name,
  )}" /></svg>`;
}

export function initials(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'GU';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

export function pluralise(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function debounce(fn, wait = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Scroll respecting the learner's Reduce Motion preference. */
export function scrollToView(element, block = 'start') {
  if (!element || typeof element.scrollIntoView !== 'function') return;
  const reduceMotion = Boolean(getPreferences()?.reduceMotion);
  element.scrollIntoView({ block, behavior: reduceMotion ? 'auto' : 'smooth' });
}

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

const TOAST_ICONS = { success: 'check', error: 'info', warning: 'info', info: 'info' };

export function toast(message, { type = 'info', title = '', duration = 4400 } = {}) {
  const container = document.getElementById('toasts');
  if (!container) return;

  while (container.children.length >= 3) container.firstElementChild?.remove();

  const element = document.createElement('div');
  element.className = `toast toast--${type}`;
  element.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICONS[type] || 'info')}</span>
    <div class="toast__body">
      ${title ? `<strong class="toast__title">${escapeHtml(title)}</strong>` : ''}
      <p class="toast__message">${escapeHtml(message)}</p>
    </div>
    <button class="toast__close" type="button" aria-label="Dismiss notification">${icon('x')}</button>
  `;
  const remove = () => {
    element.classList.add('toast--out');
    setTimeout(() => element.remove(), 180);
  };
  element.querySelector('.toast__close').addEventListener('click', remove);
  container.append(element);
  if (duration > 0) {
    let remaining = duration;
    let startedAt = Date.now();
    let hovered = false;
    let timer = setTimeout(remove, duration);

    // Hovering pauses the countdown; leaving re-arms it for the time left, so
    // a toast cannot linger forever after the pointer passes over it.
    element.addEventListener('mouseenter', () => {
      if (hovered) return;
      hovered = true;
      clearTimeout(timer);
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
    });
    element.addEventListener('mouseleave', () => {
      if (!hovered) return;
      hovered = false;
      if (remaining <= 0) {
        remove();
        return;
      }
      startedAt = Date.now();
      timer = setTimeout(remove, remaining);
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Modals                                                                      */
/* -------------------------------------------------------------------------- */

let modalCounter = 0;
const openModals = [];

export function openModal({
  title,
  subtitle = '',
  content = '',
  footer = '',
  size = 'md',
  className = '',
  onMount,
  closeOnBackdrop = true,
} = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return () => {};

  const id = `modal-title-${++modalCounter}`;
  const previousFocus = document.activeElement;
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  layer.innerHTML = `
    <div class="modal modal--${escapeHtml(size)} ${className}" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1">
      <header class="modal__head">
        <div class="modal__heading">
          <h2 class="modal__title" id="${id}">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="modal__subtitle">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn modal__close" type="button" aria-label="Close dialog" data-modal-close>${icon('x')}</button>
      </header>
      <div class="modal__body">${content}</div>
      ${footer ? `<footer class="modal__foot">${footer}</footer>` : ''}
    </div>`;

  const modal = layer.querySelector('.modal');
  root.append(layer);
  document.body.classList.add('has-modal');
  openModals.push(layer);

  let closed = false;
  const close = (restoreFocus = true) => {
    if (closed) return;
    closed = true;
    layer.classList.add('modal-layer--out');
    setTimeout(() => {
      layer.remove();
      const index = openModals.indexOf(layer);
      if (index !== -1) openModals.splice(index, 1);
      if (openModals.length === 0) document.body.classList.remove('has-modal');
    }, 160);
    document.removeEventListener('keydown', onKeydown, true);
    if (restoreFocus && previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
      setTimeout(() => previousFocus.focus({ preventScroll: true }), 60);
    }
  };
  layer.__close = close;

  const focusable = () =>
    [...modal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')].filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const targets = focusable();
    if (targets.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeydown, true);
  layer.querySelector('[data-modal-close]')?.addEventListener('click', close);
  if (closeOnBackdrop) {
    layer.addEventListener('mousedown', (event) => {
      if (event.target === layer) close();
    });
  }

  if (typeof onMount === 'function') {
    try {
      onMount(modal, close);
    } catch (error) {
      console.error('[modal] onMount failed', error);
    }
  }

  setTimeout(() => {
    const autofocus = modal.querySelector('[autofocus]');
    const targets = focusable();
    (autofocus || targets[0] || modal).focus({ preventScroll: true });
  }, 30);

  return close;
}

/**
 * Close every open dialog. Called on route changes so a modal opened from a
 * deep link cannot survive navigation and block the next screen.
 */
export function closeAllModals() {
  for (const layer of [...openModals]) {
    layer.__close?.(false);
  }
}

export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
}) {
  let close = () => {};
  const footer = `
    <button class="btn btn--ghost" type="button" data-modal-close>${escapeHtml(cancelLabel)}</button>
    <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm>${escapeHtml(confirmLabel)}</button>`;

  close = openModal({
    title,
    content: `<p class="modal__text">${escapeHtml(message)}</p>`,
    footer,
    size: 'sm',
    onMount(modal, closeModal) {
      modal.querySelector('.modal__foot [data-modal-close]')?.addEventListener('click', closeModal);
      modal.querySelector('[data-confirm]')?.addEventListener('click', async () => {
        closeModal();
        await onConfirm?.();
      });
    },
  });

  return close;
}

/* -------------------------------------------------------------------------- */
/* Visual components                                                           */
/* -------------------------------------------------------------------------- */

export function ring(percent, { size = 132, stroke = 10, label = '', tone = 'brand', compact = false } = {}) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return `
    <span class="ring ring--${tone} ${compact ? 'ring--compact' : ''}" style="--ring-size:${size}px">
      <svg viewBox="0 0 120 120" role="img" aria-label="${escapeHtml(label || `${value} percent`)}">
        <circle class="ring__track" cx="60" cy="60" r="52" pathLength="100" />
        <circle class="ring__value" cx="60" cy="60" r="52" pathLength="100"
          stroke-dasharray="100" stroke-dashoffset="${100 - value}" />
      </svg>
      <span class="ring__label" aria-hidden="true">${value}<small>%</small></span>
    </span>`;
}

export function progressBar(value, { tone = 'brand', label = '', size = 'md' } = {}) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `
    <div class="progress progress--${size} progress--${tone}" role="progressbar"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(safe)}"
      ${label ? `aria-label="${escapeHtml(label)}"` : ''}>
      <span class="progress__bar" style="width:${safe}%"></span>
    </div>`;
}

export function emptyState({ iconName = 'compass', title, text, action = '' }) {
  return `
    <div class="empty">
      <span class="empty__icon">${icon(iconName)}</span>
      <h3 class="empty__title">${escapeHtml(title)}</h3>
      <p class="empty__text">${escapeHtml(text)}</p>
      ${action ? `<div class="empty__action">${action}</div>` : ''}
    </div>`;
}

export function statCard({ label, value, suffix = '', iconName = 'chart', hint = '', tone = 'brand', href = '' }) {
  const tag = href ? 'a' : 'div';
  return `
    <${tag} class="stat stat--${tone}" ${href ? `href="${escapeHtml(href)}"` : ''}>
      <span class="stat__icon">${icon(iconName)}</span>
      <span class="stat__label">${escapeHtml(label)}</span>
      <span class="stat__value">${escapeHtml(value)}${suffix ? `<small>${escapeHtml(suffix)}</small>` : ''}</span>
      ${hint ? `<span class="stat__hint">${hint}</span>` : ''}
    </${tag}>`;
}

export function levelBadge(level, { size = 'md', className = '' } = {}) {
  if (!level) return '';
  return `<span class="level-badge level-badge--${escapeHtml(size)} tone-${escapeHtml(
    level.color || 'indigo',
  )} ${className}">${escapeHtml(level.code)}</span>`;
}

/* -------------------------------------------------------------------------- */
/* Speech synthesis                                                            */
/* -------------------------------------------------------------------------- */

let warnedAboutVoice = false;

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function primeVoices() {
  if (!speechSupported()) return;
  window.speechSynthesis.getVoices();
}

function germanVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === 'de-DE' && voice.localService) ||
    voices.find((voice) => voice.lang === 'de-DE') ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith('de')) ||
    null
  );
}

/**
 * Read German text aloud. Always triggered by a user gesture, never autoplayed
 * without one. Returns false when speech synthesis is unavailable.
 */
export function speakGerman(text, { rate, onEnd, onError } = {}) {
  if (!speechSupported()) {
    toast('Speech playback is not supported in this browser.', { type: 'warning' });
    return false;
  }

  const textValue = String(text || '').trim();
  if (!textValue) return false;

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(textValue);
  utterance.lang = 'de-DE';
  const preferences = getPreferences();
  const speed = Number(rate ?? preferences.speechRate) || 1;
  utterance.rate = Math.max(0.5, Math.min(1.6, speed));
  utterance.pitch = 1;

  const voice = germanVoice();
  if (voice) {
    utterance.voice = voice;
  } else if (!warnedAboutVoice) {
    warnedAboutVoice = true;
    toast('No German voice was found in this browser. Using the default voice.', {
      type: 'warning',
      title: 'Voice not available',
    });
  }

  utterance.onend = (event) => onEnd?.(event);
  utterance.onerror = (event) => {
    if (event.error !== 'interrupted' && event.error !== 'canceled') {
      onError?.(event);
      toast('Audio playback was interrupted or unavailable.', { type: 'warning' });
    }
  };

  synth.speak(utterance);
  return true;
}

/** Read several German lines in order (dialogue / listening scripts). */
export function speakGermanLines(lines, { rate, onEnd, onError } = {}) {
  if (!speechSupported()) {
    toast('Speech playback is not supported in this browser.', { type: 'warning' });
    return false;
  }

  const texts = (Array.isArray(lines) ? lines : [lines])
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  if (texts.length === 0) return false;

  const synth = window.speechSynthesis;
  synth.cancel();

  const preferences = getPreferences();
  const speed = Math.max(0.5, Math.min(1.6, Number(rate ?? preferences.speechRate) || 1));
  const voice = germanVoice();

  texts.forEach((text, index) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = speed;
    utterance.pitch = 1;
    if (voice) utterance.voice = voice;
    if (index === texts.length - 1) {
      utterance.onend = (event) => onEnd?.(event);
      utterance.onerror = (event) => {
        if (event.error !== 'interrupted' && event.error !== 'canceled') onError?.(event);
      };
    }
    synth.speak(utterance);
  });

  if (!voice && !warnedAboutVoice) {
    warnedAboutVoice = true;
    toast('No German voice was found in this browser. Using the default voice.', {
      type: 'warning',
      title: 'Voice not available',
    });
  }

  return true;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
