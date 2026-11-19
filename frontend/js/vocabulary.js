/**
 * Vocabulary Builder — searchable word library plus a spaced-repetition deck.
 *
 * The library contains the 48 curated entries. Flashcards use the larger
 * derived deck (curated words plus every unique lesson vocabulary item), so a
 * review can never introduce a word the curriculum does not contain.
 */
import { curriculum, findWord } from './content.js';
import {
  getFlashcardRecord,
  getState,
  isFavoriteWord,
  toggleFavoriteWord,
} from './store.js';
import { describeCardDue, summariseDeck } from './srs.js';
import { mountFlashcardPanel } from './flashcards.js';
import { escapeHtml, icon, levelBadge, openModal, speakGerman, toast } from './ui.js';

function articleBadge(word) {
  if (!word.article) return '<span class="article article--none">—</span>';
  return `<span class="article article--${escapeHtml(word.article)}">${escapeHtml(word.article)}</span>`;
}

function wordHaystack(word) {
  return `${word.de} ${word.en} ${word.topic} ${word.pos} ${word.example} ${word.exampleEn} ${word.level}`.toLowerCase();
}

export function renderVocabulary(ctx) {
  const words = curriculum.vocabulary;
  const levels = curriculum.levels;
  const deck = curriculum.vocabularyDeck;
  const topics = [...new Set(words.map((word) => word.topic))].sort((a, b) => a.localeCompare(b));
  const favorites = getState().progress.favoriteWords;
  const favoriteSet = new Set(favorites);
  const deckSummary = summariseDeck(deck, getState().progress.flashcards);

  const rows = words
    .map((word) => {
      const level = levels.find((item) => item.id === word.level);
      const isFav = favoriteSet.has(word.id);
      return `
        <article class="word-row tone-${escapeHtml(level.color)}" data-word="${escapeHtml(word.id)}"
          data-level="${escapeHtml(word.level)}" data-topic="${escapeHtml(word.topic)}"
          data-favorite-state="${isFav}" data-search="${escapeHtml(wordHaystack(word))}">
          <div class="word-row__word">
            ${articleBadge(word)}
            <button class="word-row__open" type="button" data-open-word="${escapeHtml(word.id)}">
              <span class="word-row__de">${escapeHtml(word.article ? word.de.replace(/^(der|die|das)\s+/, '') : word.de)}</span>
              <span class="word-row__pron">[${escapeHtml(word.pronunciation)}] · ${escapeHtml(word.pos)}</span>
              <span class="sr-only"> — open word details</span>
            </button>
          </div>
          <div class="word-row__meaning">
            <span class="word-row__en">${escapeHtml(word.en)}</span>
            <span class="word-row__plural">${word.plural ? `Plural: ${escapeHtml(word.plural)}` : 'No plural form'}</span>
          </div>
          <div class="word-row__topic">
            <span class="chip chip--soft">${escapeHtml(word.topic)}</span>
            ${levelBadge(level, { size: 'sm' })}
          </div>
          <div class="word-row__actions">
            <button class="icon-btn icon-btn--sm" type="button" data-speak-word="${escapeHtml(word.de)}"
              aria-label="Hear ${escapeHtml(word.de)}" title="Hear pronunciation">${icon('volume')}</button>
            <button class="icon-btn icon-btn--sm ${isFav ? 'is-favorite' : ''}" type="button"
              data-favorite="${escapeHtml(word.id)}" aria-pressed="${isFav}"
              aria-label="${isFav ? 'Remove' : 'Save'} ${escapeHtml(word.de)} ${isFav ? 'from' : 'to'} favourites"
              title="${isFav ? 'Remove from favourites' : 'Save to favourites'}">${icon('star')}</button>
          </div>
        </article>`;
    })
    .join('');

  const topicOptions = topics
    .map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`)
    .join('');

  const levelFilters = levels
    .map((level) => {
      const count = words.filter((word) => word.level === level.id).length;
      return `<button class="filter-chip" type="button" data-level-filter="${level.id}" aria-pressed="false">
        ${escapeHtml(level.code)} <span>${count}</span>
      </button>`;
    })
    .join('');

  const html = `
    <div class="page page--vocabulary">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Vocabulary Builder</p>
          <h1 class="page-title">Words that stay with you.</h1>
          <p class="page-sub">Search the library for articles, plurals, pronunciation and context — then lock the words in with spaced-repetition flashcards built from the curriculum.</p>
        </div>
        <div class="page-head__actions">
          <span class="chip chip--soft">${icon('languages')} ${words.length} library words · ${deck.length} cards</span>
        </div>
      </header>

      <div class="summary-strip summary-strip--compact" role="list" aria-label="Vocabulary summary">
        <div class="summary-strip__item" role="listitem">${icon('star')}<strong data-summary-favorites>${favorites.length}</strong><span>favourites</span></div>
        <div class="summary-strip__item" role="listitem">${icon('layers')}<strong>${deck.length}</strong><span>flashcards</span></div>
        <div class="summary-strip__item" role="listitem">${icon('rotate')}<strong data-summary-due>${deckSummary.due}</strong><span>due now</span></div>
        <div class="summary-strip__item" role="listitem">${icon('award')}<strong data-summary-learned>${deckSummary.learned}</strong><span>learned</span></div>
      </div>

      <div class="notice notice--info" role="note">
        <span class="notice__icon">${icon('info')}</span>
        <div>
          <strong>Search, listen, save — and review on a schedule.</strong>
          <p>Flashcards grade your recall with four buttons and store the next review date on this device. No word is invented: the deck comes from the curated list and all 72 lessons.</p>
        </div>
        <span class="chip chip--soft">M3</span>
      </div>

      <div class="vocab-tabs" role="tablist" aria-label="Vocabulary views">
        <button class="vocab-tab is-active" type="button" role="tab" id="vocab-tab-library"
          aria-selected="true" aria-controls="vocab-panel-library" data-vocab-tab="library">
          ${icon('search')} Word library <span class="vocab-tab__count">${words.length}</span>
        </button>
        <button class="vocab-tab" type="button" role="tab" id="vocab-tab-flashcards"
          aria-selected="false" aria-controls="vocab-panel-flashcards" data-vocab-tab="flashcards" tabindex="-1">
          ${icon('layers')} Flashcards <span class="vocab-tab__count" data-flashcard-ready>${deckSummary.due + deckSummary.fresh}</span>
        </button>
      </div>

      <div class="vocab-panel" role="tabpanel" id="vocab-panel-library" aria-labelledby="vocab-tab-library" data-vocab-panel="library">
        <section class="card word-browser" aria-labelledby="word-browser-title">
          <div class="browser-toolbar">
            <div class="field field--search">
              <label class="sr-only" for="vocab-search">Search vocabulary</label>
              <span class="field__icon">${icon('search')}</span>
              <input id="vocab-search" class="input" type="search" placeholder="Search a German word, meaning or topic…" autocomplete="off" />
              <button class="field__clear" type="button" data-clear-search aria-label="Clear search" hidden>${icon('x')}</button>
            </div>
            <div class="toolbar-row">
              <div class="filter-row" role="group" aria-label="Filter by CEFR level">
                <button class="filter-chip is-active" type="button" data-level-filter="all" aria-pressed="true">
                  All <span>${words.length}</span>
                </button>
                ${levelFilters}
              </div>
              <div class="toolbar-row__right">
                <label class="select-wrap">
                  <span class="sr-only">Filter by topic</span>
                  <select class="select" id="vocab-topic">
                    <option value="all">All topics</option>
                    ${topicOptions}
                  </select>
                  ${icon('chevron-down')}
                </label>
                <button class="toggle-chip" type="button" data-favorites-only aria-pressed="false">
                  ${icon('star')} Favourites <span>${favorites.length}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="browser-summary">
            <h2 class="browser-summary__title" id="word-browser-title">Word library</h2>
            <p class="browser-summary__count" id="vocab-count" aria-live="polite">${words.length} words</p>
          </div>

          <div class="word-list" id="vocab-results">
            <div class="word-list__head" aria-hidden="true">
              <span>Word</span><span>Meaning</span><span>Topic & level</span><span>Listen</span>
            </div>
            ${rows}
          </div>

          <div class="empty" id="vocab-empty" hidden>
            <span class="empty__icon">${icon('search')}</span>
            <h3 class="empty__title">No words match those filters</h3>
            <p class="empty__text">Try a shorter search, another level, or clear the favourites filter.</p>
            <div class="empty__action"><button class="btn btn--soft" type="button" data-reset-filters>Reset filters</button></div>
          </div>
        </section>
      </div>

      <div class="vocab-panel" role="tabpanel" id="vocab-panel-flashcards" aria-labelledby="vocab-tab-flashcards" data-vocab-panel="flashcards" hidden>
        <div data-flashcard-root></div>
      </div>
    </div>`;

  return {
    title: 'Vocabulary Builder',
    crumbs: [{ label: 'Vocabulary Builder' }],
    html,
    mount(root) {
      const search = root.querySelector('#vocab-search');
      const clear = root.querySelector('[data-clear-search]');
      const results = root.querySelector('#vocab-results');
      const empty = root.querySelector('#vocab-empty');
      const count = root.querySelector('#vocab-count');
      const topicSelect = root.querySelector('#vocab-topic');
      const favoritesToggle = root.querySelector('[data-favorites-only]');
      const filterButtons = [...root.querySelectorAll('[data-level-filter]')];
      const rowsList = [...root.querySelectorAll('[data-word]')];
      const tabs = [...root.querySelectorAll('[data-vocab-tab]')];
      const panels = [...root.querySelectorAll('[data-vocab-panel]')];
      let activeLevel = 'all';
      let favoritesOnly = false;
      let flashcardPanel = null;

      const refreshFavoriteCount = () => {
        const total = getState().progress.favoriteWords.length;
        const badge = favoritesToggle?.querySelector('span');
        if (badge) badge.textContent = String(total);
        const summary = root.querySelector('[data-summary-favorites]');
        if (summary) summary.textContent = String(total);
      };

      const updateRowFavorite = (wordId, isFav) => {
        const row = results.querySelector(`[data-word="${CSS.escape(wordId)}"]`);
        if (!row) return;
        row.dataset.favoriteState = String(isFav);
        const button = row.querySelector('[data-favorite]');
        if (!button) return;
        button.classList.toggle('is-favorite', isFav);
        button.setAttribute('aria-pressed', String(isFav));
        button.setAttribute(
          'aria-label',
          `${isFav ? 'Remove' : 'Save'} ${findWord(wordId)?.de || 'word'} ${isFav ? 'from' : 'to'} favourites`,
        );
      };

      const applyFilters = () => {
        const query = (search.value || '').trim().toLowerCase();
        const topic = topicSelect.value;
        let visible = 0;

        for (const row of rowsList) {
          const matchesLevel = activeLevel === 'all' || row.dataset.level === activeLevel;
          const matchesTopic = topic === 'all' || row.dataset.topic === topic;
          const matchesQuery = !query || row.dataset.search.includes(query);
          const matchesFavorite = !favoritesOnly || row.dataset.favoriteState === 'true';
          const show = matchesLevel && matchesTopic && matchesQuery && matchesFavorite;
          row.hidden = !show;
          if (show) visible += 1;
        }

        count.textContent = `${visible} word${visible === 1 ? '' : 's'}`;
        empty.hidden = visible !== 0;
        results.hidden = visible === 0;
        clear.hidden = query.length === 0;
      };

      const activateTab = (name) => {
        tabs.forEach((tab) => {
          const isActive = tab.dataset.vocabTab === name;
          tab.classList.toggle('is-active', isActive);
          tab.setAttribute('aria-selected', String(isActive));
          tab.tabIndex = isActive ? 0 : -1;
        });
        panels.forEach((panel) => {
          panel.hidden = panel.dataset.vocabPanel !== name;
        });
      };

      const openWord = (wordId) => {
        const word = findWord(wordId);
        if (!word) return;
        const level = levels.find((item) => item.id === word.level);
        const isFav = isFavoriteWord(word.id);
        const cardRecord = getFlashcardRecord(word.id);

        openModal({
          title: word.de,
          subtitle: `${word.en} · ${word.topic}`,
          size: 'md',
          className: `word-modal tone-${level.color}`,
          content: `
            <div class="word-detail">
              <div class="word-detail__head">
                ${levelBadge(level)}
                <span class="chip chip--soft">${escapeHtml(word.pos)}</span>
                ${word.article ? `<span class="article article--${escapeHtml(word.article)}">${escapeHtml(word.article)}</span>` : ''}
                <button class="icon-btn ${isFav ? 'is-favorite' : ''}" type="button" data-modal-favorite
                  aria-pressed="${isFav}" aria-label="Toggle favourite">${icon('star')}</button>
              </div>

              <p class="word-detail__pron">[${escapeHtml(word.pronunciation)}]</p>
              <p class="word-detail__meaning">${escapeHtml(word.en)}</p>

              <dl class="fact-list">
                ${word.article ? `<div><dt>Article</dt><dd>${escapeHtml(word.article)}</dd></div>` : ''}
                ${word.plural ? `<div><dt>Plural</dt><dd>${escapeHtml(word.plural)}</dd></div>` : ''}
                <div><dt>Part of speech</dt><dd>${escapeHtml(word.pos)}</dd></div>
                <div><dt>Topic</dt><dd>${escapeHtml(word.topic)}</dd></div>
                <div><dt>CEFR level</dt><dd>${escapeHtml(level.code)} · ${escapeHtml(level.name)}</dd></div>
                <div><dt>Flashcard</dt><dd>${escapeHtml(describeCardDue(cardRecord, new Date()))}</dd></div>
              </dl>

              <div class="example-box">
                <p class="example-box__label">In context</p>
                <p class="example-box__de" lang="de">${escapeHtml(word.example)}</p>
                <p class="example-box__en">${escapeHtml(word.exampleEn)}</p>
              </div>

              <div class="word-detail__audio">
                <button class="btn btn--soft btn--sm" type="button" data-speak-normal>${icon('volume')} Normal speed</button>
                <button class="btn btn--ghost btn--sm" type="button" data-speak-slow>${icon('volume')} Slow</button>
              </div>
            </div>`,
          footer: `
            <button class="btn btn--ghost" type="button" data-modal-dismiss>Close</button>
            <a class="btn btn--primary" href="#/courses/${word.level}">Open ${escapeHtml(level.code)} course ${icon('arrow-right')}</a>`,
          onMount(modal, close) {
            modal.querySelector('[data-modal-dismiss]')?.addEventListener('click', close);
            const favButton = modal.querySelector('[data-modal-favorite]');
            favButton?.addEventListener('click', () => {
              const nowFav = toggleFavoriteWord(word.id);
              favButton.classList.toggle('is-favorite', nowFav);
              favButton.setAttribute('aria-pressed', String(nowFav));
              updateRowFavorite(word.id, nowFav);
              toast(nowFav ? `Saved “${word.de}” to favourites.` : `Removed “${word.de}” from favourites.`, {
                type: 'success',
                duration: 2200,
              });
              refreshFavoriteCount();
              if (favoritesOnly) applyFilters();
            });
            modal.querySelector('[data-speak-normal]')?.addEventListener('click', () => speakGerman(word.de));
            modal.querySelector('[data-speak-slow]')?.addEventListener('click', () => speakGerman(word.de, { rate: 0.7 }));
            modal.querySelector('a[href^="#/courses"]')?.addEventListener('click', close);
          },
        });
      };

      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activateTab(tab.dataset.vocabTab));
        tab.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const next = tabs[(index + direction + tabs.length) % tabs.length];
          next.focus();
          activateTab(next.dataset.vocabTab);
        });
      });

      flashcardPanel = mountFlashcardPanel(root.querySelector('[data-flashcard-root]'), {
        deck,
        levels,
        onChange() {
          const current = summariseDeck(deck, getState().progress.flashcards);
          const due = root.querySelector('[data-summary-due]');
          const learned = root.querySelector('[data-summary-learned]');
          const ready = root.querySelector('[data-flashcard-ready]');
          if (due) due.textContent = String(current.due);
          if (learned) learned.textContent = String(current.learned);
          if (ready) ready.textContent = String(current.due + current.fresh);
        },
      });

      search.addEventListener('input', applyFilters);
      clear.addEventListener('click', () => {
        search.value = '';
        search.focus();
        applyFilters();
      });
      topicSelect.addEventListener('change', applyFilters);

      favoritesToggle.addEventListener('click', () => {
        favoritesOnly = !favoritesOnly;
        favoritesToggle.classList.toggle('is-active', favoritesOnly);
        favoritesToggle.setAttribute('aria-pressed', String(favoritesOnly));
        applyFilters();
      });

      filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
          activeLevel = button.dataset.levelFilter;
          filterButtons.forEach((other) => {
            const isActive = other === button;
            other.classList.toggle('is-active', isActive);
            other.setAttribute('aria-pressed', String(isActive));
          });
          applyFilters();
        });
      });

      root.querySelector('[data-reset-filters]')?.addEventListener('click', () => {
        activeLevel = 'all';
        favoritesOnly = false;
        search.value = '';
        topicSelect.value = 'all';
        favoritesToggle.classList.remove('is-active');
        favoritesToggle.setAttribute('aria-pressed', 'false');
        filterButtons.forEach((button) => {
          const isActive = button.dataset.levelFilter === 'all';
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-pressed', String(isActive));
        });
        applyFilters();
      });

      results.addEventListener('click', (event) => {
        const speak = event.target.closest('[data-speak-word]');
        if (speak) {
          const spoken = speakGerman(speak.dataset.speakWord);
          if (!spoken) toast('Speech playback is unavailable in this browser.', { type: 'warning' });
          return;
        }

        const favorite = event.target.closest('[data-favorite]');
        if (favorite) {
          const wordId = favorite.dataset.favorite;
          const nowFav = toggleFavoriteWord(wordId);
          const word = findWord(wordId);
          updateRowFavorite(wordId, nowFav);
          refreshFavoriteCount();
          if (favoritesOnly) applyFilters();
          toast(nowFav ? `Saved “${word.de}” to favourites.` : `Removed “${word.de}” from favourites.`, {
            type: 'success',
            duration: 2200,
          });
          return;
        }

        const open = event.target.closest('[data-open-word]');
        if (open) openWord(open.dataset.openWord);
      });

      const requestedTab = ctx.query?.tab;
      if (requestedTab === 'flashcards' || ctx.query?.flashcards === '1') {
        activateTab('flashcards');
        if (ctx.query?.start === '1') flashcardPanel?.start();
      }

      const requested = ctx.query?.word;
      if (requested && findWord(requested)) {
        openWord(requested);
      }
    },
  };
}
