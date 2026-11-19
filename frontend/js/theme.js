/**
 * Theme and accessibility preferences.
 * The pre-paint script (theme-boot.js) applies the initial theme; this module
 * keeps the UI in sync afterwards and listens for system changes.
 */
import { getPreferences, updatePreferences } from './store.js';

let mediaQuery = null;

function normalizeTheme(theme) {
  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
}

export function applyTheme(theme = getPreferences().theme) {
  const safeTheme = normalizeTheme(theme);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const isDark = safeTheme === 'dark' || (safeTheme !== 'light' && prefersDark);
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.documentElement.dataset.themePreference = safeTheme;

  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', isDark ? '#0a0c15' : '#f5f6fb');
}

export function setTheme(theme) {
  const safeTheme = normalizeTheme(theme);
  updatePreferences({ theme: safeTheme });
  applyTheme(safeTheme);
}

export function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  setTheme(isDark ? 'light' : 'dark');
}

export function applyAccessibility() {
  const preferences = getPreferences();
  const root = document.documentElement;
  if (preferences.reduceMotion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
  if (preferences.largeText) root.dataset.text = 'large';
  else delete root.dataset.text;
}

export function initTheme() {
  applyTheme();
  applyAccessibility();

  mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (getPreferences().theme === 'system') applyTheme('system');
  };
  if (mediaQuery?.addEventListener) {
    mediaQuery.addEventListener('change', onSystemChange);
  } else {
    // Older Safari only implements the deprecated addListener API.
    mediaQuery?.addListener?.(onSystemChange);
  }
}
