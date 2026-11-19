/**
 * Vocabulary flashcards with local spaced repetition.
 *
 * The deck is derived from the curated word list and every authored lesson
 * vocabulary section. Reviews never leave the browser; accounts and sync arrive
 * with Milestone 7.
 */
import { escapeHtml, icon, levelBadge, speakGerman, toast } from './ui.js';
import { addStudyMinutes, getFlashcardRecords, reviewFlashcard } from './store.js';
import {
  describeCardDue,
  pickSessionCards,
  scheduleCard,
  summariseDeck,
} from './srs.js';

const SESSION_SIZE = 15;
const GRADES = [
  { id: 'again', label: 'Again', tone: 'again', hint: 'Could not recall it' },
  { id: 'hard', label: 'Hard', tone: 'hard', hint: 'Recalled with effort' },
  { id: 'good', label: 'Good', tone: 'good', hint: 'Recalled correctly' },
  { id: 'easy', label: 'Easy', tone: 'easy', hint: 'Immediate and confident' },
];

function intervalLabel(days) {
  if (!days || days < 1) return 'today';
  if (days === 1) return 'in 1 day';
  return `in ${days} days`;
}

function articleBadge(card) {
  if (!card.article) return '';
  return `<span class="article article--${escapeHtml(card.article)}">${escapeHtml(card.article)}</span>`;
}

function displayWord(card) {
  return card.article ? card.de.replace(/^(der|die|das)\s+/, '') : card.de;
}

function deckStatsMarkup(deck, records) {
  const summary = summariseDeck(deck, records);
  return `
    <div class="flashcard-stats" role="list" aria-label="Flashcard status">
      <div class="flashcard-stat" role="listitem"><strong data-fc-due>${summary.due}</strong><span>due now</span></div>
      <div class="flashcard-stat" role="listitem"><strong data-fc-new>${summary.fresh}</strong><span>new</span></div>
      <div class="flashcard-stat" role="listitem"><strong data-fc-learned>${summary.learned}</strong><span>learned</span></div>
      <div class="flashcard-stat" role="listitem"><strong>${summary.total}</strong><span>cards in deck</span></div>
    </div>`;
}

function startScreenMarkup(deck, records, levels, level) {
  const pool = level === 'all' ? deck : deck.filter((card) => card.level === level);
  const summary = summariseDeck(pool, records);
  const ready = summary.due + summary.fresh;
  const nextDue = Object.values(records)
    .map((record) => new Date(record.due).getTime())
    .filter((time) => Number.isFinite(time) && time > Date.now())
    .sort((a, b) => a - b)[0];

  return `
    <div class="flashcard-empty">
      <span class="flashcard-empty__icon">${icon('layers')}</span>
      <div>
        <h3>${ready ? `${ready} card${ready === 1 ? '' : 's'} ready for review` : 'Nothing is due right now'}</h3>
        <p>
          ${
            ready
              ? `${summary.due} due now and ${summary.fresh} new. A session mixes them and asks you to grade your recall.`
              : `You have reviewed every due card in this filter. ${
                  nextDue ? `The next scheduled card returns ${describeCardDue({ due: new Date(nextDue).toISOString() }, new Date())}.` : 'Start a new-card session or browse the word library.'
                }`
          }
        </p>
        <p class="card__note">${icon('info')} Grades are saved immediately. A card marked “Again” stays due for the next session; “Good” and “Easy” push it further out.</p>
      </div>
    </div>`;
}

/**
 * @param {HTMLElement} container element that receives the panel
 * @param {{deck: Array, levels: Array, onChange?: () => void}} options
 */
export function mountFlashcardPanel(container, { deck, levels, onChange }) {
  if (!container) return null;

  let activeLevel = 'all';
  let scope = 'mixed';
  let records = getFlashcardRecords();
  let session = null;
  let sessionTimer = 0;

  container.innerHTML = `
    <section class="card flashcard-panel" aria-labelledby="flashcard-title">
      <div class="flashcard-panel__head">
        <div class="flashcard-panel__intro">
          <p class="eyebrow">Spaced repetition</p>
          <h2 class="card__title" id="flashcard-title">Flashcards</h2>
          <p>Every card comes from the word library or an authored lesson. Grade your recall honestly and the schedule does the rest.</p>
        </div>
        ${deckStatsMarkup(deck, records)}
      </div>

      <div class="flashcard-controls">
        <div class="filter-row" role="group" aria-label="Filter flashcards by CEFR level">
          <button class="filter-chip is-active" type="button" data-fc-level="all" aria-pressed="true">
            All <span>${deck.length}</span>
          </button>
          ${levels
            .map((level) => {
              const count = deck.filter((card) => card.level === level.id).length;
              return `<button class="filter-chip" type="button" data-fc-level="${level.id}" aria-pressed="false">
                ${escapeHtml(level.code)} <span>${count}</span>
              </button>`;
            })
            .join('')}
        </div>
        <div class="flashcard-controls__right">
          <label class="select-wrap">
            <span class="sr-only">Choose what to review</span>
            <select class="select" data-fc-scope>
              <option value="mixed">Due + new</option>
              <option value="new">New cards only</option>
              <option value="all">All cards (ahead of schedule)</option>
            </select>
            ${icon('chevron-down')}
          </label>
          <button class="btn btn--primary btn--sm" type="button" data-fc-start>${icon('play')} Start review</button>
        </div>
      </div>

      <div class="flashcard-stage" data-fc-stage></div>
    </section>`;

  const stage = container.querySelector('[data-fc-stage]');
  const startButton = container.querySelector('[data-fc-start]');
  const scopeSelect = container.querySelector('[data-fc-scope]');
  const levelButtons = [...container.querySelectorAll('[data-fc-level]')];

  const refreshStats = () => {
    const summary = summariseDeck(activeLevel === 'all' ? deck : deck.filter((card) => card.level === activeLevel), records);
    const due = container.querySelector('[data-fc-due]');
    const fresh = container.querySelector('[data-fc-new]');
    const learned = container.querySelector('[data-fc-learned]');
    if (due) due.textContent = String(summary.due);
    if (fresh) fresh.textContent = String(summary.fresh);
    if (learned) learned.textContent = String(summary.learned);
    onChange?.();
  };

  const showStart = () => {
    session = null;
    stage.innerHTML = startScreenMarkup(deck, records, levels, activeLevel);
    startButton.disabled = false;
  };

  const gradePreview = (card, grade) => {
    const now = new Date();
    return intervalLabel(scheduleCard(records[card.id] || null, grade, now).intervalDays);
  };

  const renderCard = () => {
    const card = session.queue[session.index];
    if (!card) {
      finishSession();
      return;
    }
    const level = levels.find((item) => item.id === card.level);
    const record = records[card.id] || null;
    const example = card.example
      ? `<div class="example-box flashcard__example">
          <p class="example-box__label">In context</p>
          <p class="example-box__de" lang="de">${escapeHtml(card.example)}</p>
          ${card.exampleEn ? `<p class="example-box__en">${escapeHtml(card.exampleEn)}</p>` : ''}
        </div>`
      : '';

    stage.innerHTML = `
      <div class="flashcard-session" data-fc-session>
        <div class="drill-session__bar">
          <span class="drill-session__count">Card ${session.index + 1} of ${session.queue.length}</span>
          <div class="progress drill-session__progress" role="progressbar" aria-label="Flashcard session progress"
            aria-valuemin="0" aria-valuemax="${session.queue.length}" aria-valuenow="${session.index + 1}">
            <span class="progress__bar" style="width: ${Math.round(((session.index + 1) / session.queue.length) * 100)}%"></span>
          </div>
        </div>

        <article class="flashcard">
          <div class="flashcard__meta">
            ${levelBadge(level, { size: 'sm' })}
            <span class="chip chip--soft">${escapeHtml(card.topic)}</span>
            <span class="flashcard__status">${escapeHtml(describeCardDue(record, new Date()))}</span>
          </div>

          <div class="flashcard__front">
            <div class="flashcard__word">
              ${articleBadge(card)}
              <strong lang="de">${escapeHtml(displayWord(card))}</strong>
            </div>
            ${card.pronunciation ? `<p class="flashcard__pron">[${escapeHtml(card.pronunciation)}]</p>` : ''}
            <button class="btn btn--ghost btn--sm" type="button" data-fc-speak>${icon('volume')} Hear it</button>
          </div>

          <div class="flashcard__reveal" data-fc-reveal>
            <button class="btn btn--soft" type="button" data-fc-show>${icon('book-open')} Show answer</button>
            <p>Say the meaning${card.article ? ', article and plural' : ''} out loud first.</p>
          </div>

          <div class="flashcard__back" data-fc-back hidden>
            <p class="flashcard__meaning">${escapeHtml(card.en)}</p>
            <dl class="fact-list flashcard__facts">
              ${card.article ? `<div><dt>Article</dt><dd>${escapeHtml(card.article)}</dd></div>` : ''}
              <div><dt>Plural</dt><dd>${card.plural ? escapeHtml(card.plural) : 'No plural form'}</dd></div>
              <div><dt>Word type</dt><dd>${escapeHtml(card.pos || 'expression')}</dd></div>
              ${card.lessonTitle ? `<div><dt>Source lesson</dt><dd>${escapeHtml(card.lessonTitle)}</dd></div>` : ''}
            </dl>
            ${example}
          </div>
        </article>

        <div class="flashcard__grade" data-fc-grade hidden>
          <p class="flashcard__grade-label">How well did you recall it?</p>
          <div class="grade-grid" role="group" aria-label="Grade your recall">
            ${GRADES.map(
              (grade) => `
                <button class="grade-button grade-button--${grade.tone}" type="button" data-fc-grade-button="${grade.id}">
                  <strong>${grade.label}</strong>
                  <span>${escapeHtml(grade.hint)} · ${gradePreview(card, grade.id)}</span>
                </button>`,
            ).join('')}
          </div>
        </div>
      </div>`;

    stage.querySelector('[data-fc-speak]')?.addEventListener('click', () => {
      const spoken = speakGerman(card.de);
      if (!spoken) toast('Speech playback is unavailable in this browser.', { type: 'warning' });
    });

    stage.querySelector('[data-fc-show]')?.addEventListener('click', () => {
      stage.querySelector('[data-fc-reveal]').hidden = true;
      stage.querySelector('[data-fc-back]').hidden = false;
      stage.querySelector('[data-fc-grade]').hidden = false;
      stage.querySelector('[data-fc-grade-button="good"]')?.focus({ preventScroll: true });
    });

    stage.querySelectorAll('[data-fc-grade-button]').forEach((button) => {
      button.addEventListener('click', () => {
        const grade = button.dataset.fcGradeButton;
        const now = new Date();
        const scheduled = reviewFlashcard(card.id, grade, now);
        if (scheduled) records = { ...records, [card.id]: scheduled };
        session.grades[grade] = (session.grades[grade] || 0) + 1;
        session.reviewed += 1;
        session.index += 1;
        refreshStats();
        if (session.index >= session.queue.length) {
          finishSession();
        } else {
          renderCard();
        }
      });
    });

    stage.querySelector('[data-fc-show]')?.focus({ preventScroll: true });
  };

  const finishSession = () => {
    if (!session) return;
    const minutes = Math.max(1, Math.round((Date.now() - sessionTimer) / 60000));
    addStudyMinutes(minutes);
    const reviewed = session.reviewed;
    const summary = summariseDeck(
      activeLevel === 'all' ? deck : deck.filter((card) => card.level === activeLevel),
      records,
    );
    const distribution = GRADES.map(
      (grade) =>
        `<span class="grade-count grade-count--${grade.tone}"><strong>${session.grades[grade.id] || 0}</strong> ${grade.label}</span>`,
    ).join('');

    stage.innerHTML = `
      <div class="flashcard-summary" role="status">
        <span class="flashcard-summary__icon">${icon('award')}</span>
        <div class="flashcard-summary__body">
          <p class="eyebrow">Review complete</p>
          <h3>${reviewed} card${reviewed === 1 ? '' : 's'} reviewed</h3>
          <p>${minutes} minute${minutes === 1 ? '' : 's'} recorded. ${summary.learned} cards are now learned in this filter, ${summary.due} are due now and ${summary.fresh} are still new.</p>
          <div class="flashcard-summary__grades">${distribution}</div>
          <div class="flashcard-summary__actions">
            <button class="btn btn--primary btn--sm" type="button" data-fc-again>${icon('rotate')} Start another session</button>
            <button class="btn btn--ghost btn--sm" type="button" data-fc-done>Back to deck</button>
          </div>
        </div>
      </div>`;

    stage.querySelector('[data-fc-again]')?.addEventListener('click', beginSession);
    stage.querySelector('[data-fc-done]')?.addEventListener('click', showStart);
    refreshStats();
    session = null;
  };

  const beginSession = () => {
    const currentRecords = getFlashcardRecords();
    records = currentRecords;
    const queue = pickSessionCards(deck, currentRecords, {
      limit: SESSION_SIZE,
      level: activeLevel,
      scope,
      now: new Date(),
    });

    if (!queue.length) {
      toast(
        scope === 'new'
          ? 'No unseen cards left in this filter. Try “All cards” or another level.'
          : 'Nothing is due in this filter. Try “All cards (ahead of schedule)” or choose another level.',
        { type: 'info', duration: 3600 },
      );
      showStart();
      return;
    }

    session = {
      queue,
      index: 0,
      reviewed: 0,
      grades: Object.fromEntries(GRADES.map((grade) => [grade.id, 0])),
    };
    sessionTimer = Date.now();
    renderCard();
  };

  levelButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeLevel = button.dataset.fcLevel;
      levelButtons.forEach((other) => {
        const isActive = other === button;
        other.classList.toggle('is-active', isActive);
        other.setAttribute('aria-pressed', String(isActive));
      });
      showStart();
      refreshStats();
    });
  });

  scopeSelect.addEventListener('change', () => {
    scope = scopeSelect.value;
  });

  startButton.addEventListener('click', beginSession);

  showStart();
  refreshStats();

  return {
    start: beginSession,
    refresh: refreshStats,
  };
}
