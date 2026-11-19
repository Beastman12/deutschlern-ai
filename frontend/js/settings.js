/**
 * Settings — appearance, accessibility, learning preferences and local data.
 * Everything here maps to a real stored preference; nothing is decorative.
 */
import { curriculum } from './content.js';
import {
  clearAllAIConversations,
  clearAllData,
  clearPronunciationHistory,
  clearSpeakingHistory,
  exportData,
  getPreferences,
  getState,
  resetProgress,
  updatePreferences,
  updateProfile,
} from './store.js';
import { EXAM_TOTAL_QUESTIONS } from './exam.js';
import { applyAccessibility, applyTheme, setTheme } from './theme.js';
import { confirmDialog, downloadJSON, escapeHtml, icon, toast } from './ui.js';

const THEME_CHOICES = [
  { value: 'light', label: 'Light', hint: 'Bright surfaces and crisp ink.' },
  { value: 'dark', label: 'Dark', hint: 'Low-glare study sessions at night.' },
  { value: 'system', label: 'System', hint: 'Follow your device setting.' },
];

const GOAL_CHOICES = [10, 20, 30, 45, 60];

function themeOptions(preferences) {
  return THEME_CHOICES.map(
    (choice) => `
      <button class="theme-option" type="button" data-theme-choice="${choice.value}"
        aria-pressed="${preferences.theme === choice.value}">
        <span class="theme-option__preview theme-option__preview--${choice.value}" aria-hidden="true">
          <span class="theme-option__chrome"></span>
          <span class="theme-option__body"><i></i><i></i><i></i></span>
        </span>
        <span class="theme-option__text">
          <strong>${choice.label}</strong>
          <small>${choice.hint}</small>
        </span>
        <span class="theme-option__check">${icon('check')}</span>
      </button>`,
  ).join('');
}

function switchRow({ id, label, hint, checked, pref, iconName }) {
  return `
    <label class="setting-row" for="${id}">
      <span class="setting-row__icon">${icon(iconName)}</span>
      <span class="setting-row__text">
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(hint)}</small>
      </span>
      <span class="switch">
        <input id="${id}" type="checkbox" data-pref-toggle="${pref}" ${checked ? 'checked' : ''} />
        <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
      </span>
    </label>`;
}

export function renderSettings(ctx) {
  const preferences = getPreferences();
  const state = getState();
  const profile = state.profile;
  const wordsSaved = state.progress.learnedWords.length;
  const favorites = state.progress.favoriteWords.length;
  const completed = Object.keys(state.progress.completedLessons).length;
  const conversations = state.progress.aiConversations.length;
  const speakingAttempts = state.progress.speakingAttempts.length;
  const pronunciationEntries = state.progress.pronunciationLog.length;

  const html = `
    <div class="page page--settings">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Settings</p>
          <h1 class="page-title">Make it yours.</h1>
          <p class="page-sub">Appearance, accessibility, daily rhythm and the data stored on this device — all in one place.</p>
        </div>
        <div class="page-head__actions">
          <span class="chip chip--soft" id="settings-saved">${icon('check')} Saved automatically</span>
        </div>
      </header>

      <div class="settings-layout">
        <div class="settings-main">
          <section class="card settings-section" aria-labelledby="appearance-title">
            <header class="card__head">
              <p class="eyebrow">Appearance</p>
              <h2 class="card__title" id="appearance-title">Colour theme</h2>
              <p class="card__sub">Your choice is applied immediately and remembered before the next page paints.</p>
            </header>
            <div class="theme-options" role="group" aria-label="Colour theme">
              ${themeOptions(preferences)}
            </div>
          </section>

          <section class="card settings-section" aria-labelledby="accessibility-title">
            <header class="card__head">
              <p class="eyebrow">Accessibility</p>
              <h2 class="card__title" id="accessibility-title">Comfort while you learn</h2>
            </header>
            <div class="setting-list">
              ${switchRow({
                id: 'pref-motion',
                label: 'Reduce motion',
                hint: 'Turns off page transitions, hover lifts and chart animations. Your system preference is respected by default.',
                checked: preferences.reduceMotion,
                pref: 'reduceMotion',
                iconName: 'zap',
              })}
              ${switchRow({
                id: 'pref-text',
                label: 'Larger text',
                hint: 'Increases the base font size and spacing so long explanations are easier to read.',
                checked: preferences.largeText,
                pref: 'largeText',
                iconName: 'languages',
              })}
            </div>
          </section>

          <section class="card settings-section" aria-labelledby="learning-title">
            <header class="card__head">
              <p class="eyebrow">Learning</p>
              <h2 class="card__title" id="learning-title">Your daily rhythm</h2>
            </header>
            <div class="setting-list">
              <div class="setting-row">
                <span class="setting-row__icon">${icon('clock')}</span>
                <span class="setting-row__text">
                  <strong>Daily study goal</strong>
                  <small>Used for your dashboard ring and weekly target. It is a target, not a limit.</small>
                </span>
                <span class="select-wrap select-wrap--compact">
                  <label class="sr-only" for="pref-goal">Daily study goal in minutes</label>
                  <select class="select" id="pref-goal">
                    ${GOAL_CHOICES.map(
                      (minutes) =>
                        `<option value="${minutes}" ${minutes === preferences.dailyGoal ? 'selected' : ''}>${minutes} min</option>`,
                    ).join('')}
                  </select>
                  ${icon('chevron-down')}
                </span>
              </div>

              <div class="setting-row">
                <span class="setting-row__icon">${icon('target')}</span>
                <span class="setting-row__text">
                  <strong>Target CEFR level</strong>
                  <small>Guides your dashboard goal and recommendations. It never locks or skips curriculum.</small>
                </span>
                <span class="select-wrap select-wrap--compact">
                  <label class="sr-only" for="pref-target">Target CEFR level</label>
                  <select class="select" id="pref-target">
                    ${curriculum.levels
                      .map(
                        (level) =>
                          `<option value="${level.id}" ${level.id === profile.targetLevel ? 'selected' : ''}>${escapeHtml(
                            level.code,
                          )} · ${escapeHtml(level.name)}</option>`,
                      )
                      .join('')}
                  </select>
                  ${icon('chevron-down')}
                </span>
              </div>

              <div class="setting-row setting-row--stack">
                <span class="setting-row__icon">${icon('volume')}</span>
                <span class="setting-row__text">
                  <strong>Pronunciation playback speed</strong>
                  <small>The rate used by “Listen” buttons. Individual players still offer a slow option.</small>
                </span>
                <span class="range-wrap">
                  <label class="sr-only" for="pref-rate">Pronunciation playback speed</label>
                  <input class="range" id="pref-rate" type="range" min="0.6" max="1.3" step="0.1"
                    value="${Number(preferences.speechRate) || 1}" aria-describedby="pref-rate-value" />
                  <output class="range__value" id="pref-rate-value">${(Number(preferences.speechRate) || 1).toFixed(1)}×</output>
                </span>
              </div>
            </div>
          </section>

          <section class="card settings-section" aria-labelledby="data-title">
            <header class="card__head">
              <p class="eyebrow">Your data</p>
              <h2 class="card__title" id="data-title">Local data & privacy</h2>
              <p class="card__sub">Progress stays in this browser. When AI is enabled, only the messages you choose to send go through this server to the configured provider.</p>
            </header>

            <div class="data-summary">
              <div><strong>${completed}</strong><span>lessons recorded</span></div>
              <div><strong>${wordsSaved}</strong><span>words learned</span></div>
              <div><strong>${favorites}</strong><span>favourites</span></div>
              <div><strong>${Object.keys(state.progress.studyLog).length}</strong><span>study days logged</span></div>
              <div><strong>${conversations}</strong><span>AI conversations</span></div>
              <div><strong>${speakingAttempts}</strong><span>speaking attempts</span></div>
              <div><strong>${pronunciationEntries}</strong><span>pronunciation entries</span></div>
            </div>

            <div class="setting-list">
              ${switchRow({
                id: 'pref-demo',
                label: 'Preview demo data',
                hint: 'Shows illustrative progress for design review. It never writes demo numbers into your real records and is labelled everywhere it appears.',
                checked: preferences.demoData,
                pref: 'demoData',
                iconName: 'sparkles',
              })}
            </div>

            <div class="data-actions">
              <button class="btn btn--soft" type="button" data-export>${icon('download')} Export JSON</button>
              <button class="btn btn--ghost" type="button" data-clear-ai>${icon('message')} Clear AI chats</button>
              <button class="btn btn--ghost" type="button" data-clear-speaking>${icon('mic')} Clear speaking</button>
              <button class="btn btn--ghost" type="button" data-clear-pronunciation>${icon('volume')} Clear pronunciation</button>
              <button class="btn btn--ghost" type="button" data-reset-progress>${icon('rotate')} Reset progress</button>
              <button class="btn btn--danger-ghost" type="button" data-reset-all>${icon('x')} Delete all local data</button>
            </div>
            <p class="card__note">${icon('info')} Clearing browser storage also removes this data. Export a copy first if it matters to you.</p>
          </section>

          <section class="card settings-section about-card" aria-labelledby="about-title">
            <header class="card__head">
              <p class="eyebrow">About</p>
              <h2 class="card__title" id="about-title">DeutschLern AI · Milestone 9</h2>
            </header>
            <dl class="fact-list">
              <div><dt>Product stage</dt><dd>All milestones delivered · v1.0.0</dd></div>
              <div><dt>Curriculum</dt><dd>${curriculum.totals.lessons} lessons · ${curriculum.totals.grammar} grammar topics · ${curriculum.totals.words} words · ${curriculum.totals.drills} drills · ${curriculum.totals.cards} flashcards</dd></div>
              <div><dt>Assessment</dt><dd>${curriculum.totals.exercises.toLocaleString()} authored questions · ${EXAM_TOTAL_QUESTIONS}-question mock papers</dd></div>
              <div><dt>Conversation</dt><dd>${curriculum.totals.scenarios} authored scenarios · text tutor · local transcript history</dd></div>
              <div><dt>Storage</dt><dd>Local-first in this browser, with optional server sync when signed in</dd></div>
              <div><dt>AI & speech</dt><dd>AI proxy requires server credentials; browser recognition works without a key, Azure fallback is optional</dd></div>
              <div><dt>Accounts</dt><dd>Available — sign in from the profile menu to sync your progress</dd></div>
            </dl>
            <div class="callout callout--info">
              <span class="callout__icon">${icon('shield')}</span>
              <p>CEFR-aligned curriculum, not an official certificate. DeutschLern AI is not affiliated with Goethe-Institut, telc or TestDaF.</p>
            </div>
          </section>
        </div>

        <aside class="settings-side">
          <section class="card settings-summary" aria-labelledby="summary-title">
            <p class="eyebrow">Current setup</p>
            <h2 class="card__title" id="summary-title">At a glance</h2>
            <dl class="fact-list">
              <div><dt>Theme</dt><dd id="summary-theme">${escapeHtml(preferences.theme)}</dd></div>
              <div><dt>Daily goal</dt><dd id="summary-goal">${preferences.dailyGoal} min</dd></div>
              <div><dt>Target level</dt><dd id="summary-target">${escapeHtml(profile.targetLevel.toUpperCase())}</dd></div>
              <div><dt>Demo preview</dt><dd id="summary-demo">${preferences.demoData ? 'On' : 'Off'}</dd></div>
            </dl>
            <a class="btn btn--soft btn--block" href="#/profile">Open profile ${icon('arrow-right')}</a>
          </section>

          <section class="card settings-help">
            <span class="settings-help__icon">${icon('info')}</span>
            <h2 class="card__title">Good to know</h2>
            <p>Audio uses your browser's built-in German voice. If none is installed, playback falls back to the default voice and tells you.</p>
            <p>Preferences save as you change them. No “apply” button exists because there is nothing staged.</p>
            <a class="link-arrow" href="#/progress">See the effect on your report ${icon('arrow-right')}</a>
          </section>
        </aside>
      </div>
    </div>`;

  return {
    title: 'Settings',
    crumbs: [{ label: 'Settings' }],
    html,
    mount(root) {
      const summaryTheme = root.querySelector('#summary-theme');
      const summaryGoal = root.querySelector('#summary-goal');
      const summaryTarget = root.querySelector('#summary-target');
      const summaryDemo = root.querySelector('#summary-demo');

      const savedChip = () => {
        const chip = root.querySelector('#settings-saved');
        if (!chip) return;
        chip.classList.add('is-pulsing');
        setTimeout(() => chip.classList.remove('is-pulsing'), 900);
      };

      root.querySelectorAll('[data-theme-choice]').forEach((button) => {
        button.addEventListener('click', () => {
          const { themeChoice } = button.dataset;
          setTheme(themeChoice);
          root.querySelectorAll('[data-theme-choice]').forEach((other) => {
            other.setAttribute('aria-pressed', String(other === button));
          });
          applyAccessibility();
          if (summaryTheme) summaryTheme.textContent = themeChoice;
          savedChip();
          toast(`Theme set to ${themeChoice}.`, { type: 'success', duration: 1800 });
        });
      });

      root.querySelectorAll('[data-pref-toggle]').forEach((input) => {
        input.addEventListener('change', () => {
          const pref = input.dataset.prefToggle;
          const checked = input.checked;
          updatePreferences({ [pref]: checked });
          if (pref === 'reduceMotion' || pref === 'largeText') applyAccessibility();
          if (pref === 'demoData') {
            applyTheme();
            if (summaryDemo) summaryDemo.textContent = checked ? 'On' : 'Off';
            toast(
              checked
                ? 'Demo preview is on. Figures are illustrative and clearly labelled.'
                : 'Demo preview is off. Showing your real local activity.',
              { type: checked ? 'warning' : 'success', duration: 3200 },
            );
          } else {
            toast('Preference saved.', { type: 'success', duration: 1600 });
          }
          savedChip();
        });
      });

      root.querySelector('#pref-goal')?.addEventListener('change', (event) => {
        const goal = Number(event.target.value);
        updatePreferences({ dailyGoal: goal });
        if (summaryGoal) summaryGoal.textContent = `${goal} min`;
        savedChip();
        toast(`Daily goal set to ${goal} minutes.`, { type: 'success', duration: 2000 });
      });

      root.querySelector('#pref-target')?.addEventListener('change', (event) => {
        const target = String(event.target.value);
        updateProfile({ targetLevel: target });
        if (summaryTarget) summaryTarget.textContent = target.toUpperCase();
        savedChip();
        toast(`Target level set to ${target.toUpperCase()}.`, { type: 'success', duration: 2000 });
      });

      const rate = root.querySelector('#pref-rate');
      const rateValue = root.querySelector('#pref-rate-value');
      rate?.addEventListener('input', () => {
        if (rateValue) rateValue.textContent = `${Number(rate.value).toFixed(1)}×`;
      });
      rate?.addEventListener('change', () => {
        updatePreferences({ speechRate: Number(rate.value) });
        savedChip();
      });

      root.querySelector('[data-export]')?.addEventListener('click', () => {
        const date = new Date().toISOString().slice(0, 10);
        downloadJSON(`deutschlern-data-${date}.json`, exportData());
        toast('Your data was exported as JSON.', { type: 'success', duration: 2600 });
      });

      root.querySelector('[data-clear-ai]')?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear AI conversations?',
          message: 'This removes every saved tutor and role-play transcript from this browser. Your lessons and other progress stay.',
          confirmLabel: 'Clear AI chats',
          danger: true,
          onConfirm() {
            clearAllAIConversations();
            toast('AI conversation history was cleared.', { type: 'success' });
            ctx.refresh();
          },
        });
      });

      root.querySelector('[data-clear-speaking]')?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear speaking history?',
          message: 'Saved speaking attempts will be removed from this browser. Lessons and other progress stay.',
          confirmLabel: 'Clear speaking',
          danger: true,
          onConfirm() {
            clearSpeakingHistory();
            toast('Speaking history was cleared.', { type: 'success' });
            ctx.refresh();
          },
        });
      });

      root.querySelector('[data-clear-pronunciation]')?.addEventListener('click', () => {
        confirmDialog({
          title: 'Clear pronunciation history?',
          message: 'Saved pronunciation entries will be removed from this browser. Lessons and other progress stay.',
          confirmLabel: 'Clear pronunciation',
          danger: true,
          onConfirm() {
            clearPronunciationHistory();
            toast('Pronunciation history was cleared.', { type: 'success' });
            ctx.refresh();
          },
        });
      });

      root.querySelector('[data-reset-progress]')?.addEventListener('click', () => {
        confirmDialog({
          title: 'Reset all progress?',
          message:
            'This clears completed lessons, assessment history, favourites, learned words, AI conversations and study minutes. Your profile and preferences stay.',
          confirmLabel: 'Reset progress',
          danger: true,
          onConfirm() {
            resetProgress();
            toast('Progress reset. Your profile and preferences were kept.', { type: 'success' });
            ctx.refresh();
          },
        });
      });

      root.querySelector('[data-reset-all]')?.addEventListener('click', () => {
        confirmDialog({
          title: 'Delete all local data?',
          message:
            'This removes your profile, preferences, progress and favourites from this browser. It cannot be undone.',
          confirmLabel: 'Delete everything',
          danger: true,
          onConfirm() {
            clearAllData();
            window.location.hash = '#/dashboard';
            window.location.reload();
          },
        });
      });
    },
  };
}
