/**
 * Small dependency-free chart components (CSS + inline height only).
 */
import { escapeHtml, progressBar } from './ui.js';

const SKILL_LABELS = {
  reading: 'Reading',
  listening: 'Listening',
  speaking: 'Speaking',
  writing: 'Writing',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
};

const SKILL_ORDER = ['reading', 'listening', 'speaking', 'writing', 'grammar', 'vocabulary'];

export function skillBarsHTML(skills, { showEmptyHint = false } = {}) {
  const rows = SKILL_ORDER.map((key) => {
    const value = Math.max(0, Math.min(100, Number(skills?.[key]) || 0));
    return `
      <div class="skill-row">
        <div class="skill-row__head">
          <span class="skill-row__label">${SKILL_LABELS[key]}</span>
          <span class="skill-row__value">${value}%</span>
        </div>
        ${progressBar(value, { tone: key === 'grammar' || key === 'vocabulary' ? 'brand' : 'sky', label: SKILL_LABELS[key], size: 'sm' })}
      </div>`;
  }).join('');

  const allZero = SKILL_ORDER.every((key) => !Number(skills?.[key]));
  return `
    <div class="skills">
      ${rows}
      ${
        allZero && showEmptyHint
          ? '<p class="card__note skills__empty">No skill activity recorded yet. These start at zero and update as you practise.</p>'
          : ''
      }
    </div>`;
}

export function weekChartHTML(week, { goal = 20 } = {}) {
  const maxMinutes = Math.max(0, ...week.map((day) => day.minutes));
  const plotMax = Math.max(goal * 1.5, maxMinutes * 1.15, 15);
  const goalPct = Math.min(100, Math.round((goal / plotMax) * 100));
  const total = week.reduce((sum, day) => sum + day.minutes, 0);
  const activeDays = week.filter((day) => day.minutes > 0).length;
  const description = week
    .map((day) => `${day.label}: ${day.minutes} minutes`)
    .join(', ');

  const bars = week
    .map((day, index) => {
      const pct = Math.round((day.minutes / plotMax) * 100);
      const isToday = index === week.length - 1;
      const isGoalMet = day.minutes >= goal;
      return `
        <div class="week-chart__col ${isToday ? 'is-today' : ''}">
          <div class="week-chart__bar-area">
            <span class="week-chart__value ${day.minutes === 0 ? 'is-zero' : ''}">${day.minutes}</span>
            <div class="week-chart__bar ${day.minutes === 0 ? 'is-zero' : ''} ${isGoalMet ? 'is-goal' : ''}"
              style="height:${Math.max(day.minutes === 0 ? 2 : 6, pct)}%"
              title="${escapeHtml(day.label)} · ${day.minutes} min"></div>
          </div>
          <span class="week-chart__label">${escapeHtml(day.label)}</span>
          <span class="week-chart__dot ${day.minutes > 0 ? 'is-active' : ''}" aria-hidden="true"></span>
        </div>`;
    })
    .join('');

  return `
    <div class="week-chart">
      <div class="week-chart__plot" role="img" aria-label="Study minutes this week. ${escapeHtml(description)}. Daily goal ${goal} minutes.">
        <div class="week-chart__grid" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="week-chart__goal" style="bottom:${goalPct}%" aria-hidden="true">
          <span>${goal} min goal</span>
        </div>
        <div class="week-chart__bars">${bars}</div>
      </div>
      <div class="week-chart__summary">
        <span><strong>${total}</strong> min this week</span>
        <span class="week-chart__summary-muted">${activeDays} active ${activeDays === 1 ? 'day' : 'days'} of 7</span>
      </div>
    </div>`;
}
