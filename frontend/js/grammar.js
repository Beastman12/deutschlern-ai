/**
 * Grammar Academy — explanations, reference tables and scored practice.
 *
 * Every topic combines the authored explanation from grammar.json with the
 * reference tables and drills from grammar-drills.json. Practice results and
 * mistakes are stored locally; nothing here is generated or simulated.
 */
import { curriculum, findGrammarTopic, getCourse, getGrammarDrillTopic } from './content.js';
import { getGrammarDrillStat, getGrammarMistakes, getState, recordDrillAttempt } from './store.js';
import { createDrillSession } from './practice.js';
import { escapeHtml, icon, levelBadge, openModal, speakGerman, toast } from './ui.js';

function grammarAccuracy(progress) {
  const stats = Object.values(progress.grammarDrills || {});
  const correct = stats.reduce((sum, stat) => sum + (Number(stat.correct) || 0), 0);
  const total = stats.reduce((sum, stat) => sum + (Number(stat.total) || 0), 0);
  return {
    percent: total ? Math.round((correct / total) * 100) : 0,
    attempts: stats.reduce((sum, stat) => sum + (Number(stat.attempts) || 0), 0),
    practised: stats.length,
  };
}

function statLabel(topicId, drillCount) {
  const stat = getGrammarDrillStat(topicId);
  if (!stat) return { text: `${drillCount} drills`, tone: 'new' };
  const percent = stat.bestPercent ?? stat.lastPercent ?? 0;
  return {
    text: `Best ${percent}% · ${stat.attempts} ${stat.attempts === 1 ? 'attempt' : 'attempts'}`,
    tone: percent >= 80 ? 'strong' : percent >= 60 ? 'building' : 'shaky',
  };
}

function topicMistakes(topicId) {
  return getGrammarMistakes().filter((mistake) => mistake.topicId === topicId);
}

function practiseQuestions(topicId) {
  const entry = getGrammarDrillTopic(topicId);
  if (!entry) return [];
  const mistakes = topicMistakes(topicId);
  const mistakeIds = new Set(mistakes.map((mistake) => mistake.drillId));
  return [...entry.drills].sort(
    (a, b) => Number(mistakeIds.has(b.id)) - Number(mistakeIds.has(a.id)),
  );
}

function tablesHtml(tables = []) {
  return tables
    .map(
      (table) => `
        <div class="grammar-table">
          <h4 class="grammar-table__title">${escapeHtml(table.title || 'Reference table')}</h4>
          <div class="table-wrap">
            <table class="content-table">
              <thead><tr>${table.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
              <tbody>
                ${table.rows
                  .map(
                    (row) =>
                      `<tr>${row
                        .map(
                          (cell, index) =>
                            `<${index === 0 ? 'th scope="row"' : 'td'} lang="de">${escapeHtml(cell)}</${
                              index === 0 ? 'th' : 'td'
                            }>`,
                        )
                        .join('')}</tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>`,
    )
    .join('');
}

export function renderGrammar(ctx) {
  const { stats } = ctx;
  const levels = curriculum.levels;
  const topics = curriculum.grammar;
  const progress = getState().progress;
  const accuracy = grammarAccuracy(progress);
  const mistakes = getGrammarMistakes();
  const drillCount = curriculum.totals.drills;

  const cards = topics
    .map((topic) => {
      const level = levels.find((item) => item.id === topic.level);
      const entry = getGrammarDrillTopic(topic.id);
      const drills = entry?.drills.length || 0;
      const stat = statLabel(topic.id, drills);
      const haystack = `${topic.title} ${topic.titleDe} ${topic.summary} ${topic.points.join(' ')} ${topic.example.de} ${topic.example.en} ${level.code} ${level.name}`;
      return `
        <button class="grammar-card tone-${escapeHtml(level.color)}" type="button"
          data-topic="${escapeHtml(topic.id)}" data-level="${escapeHtml(topic.level)}"
          data-search="${escapeHtml(haystack.toLowerCase())}">
          <span class="grammar-card__head">
            ${levelBadge(level, { size: 'sm' })}
            <span class="grammar-card__meta">${escapeHtml(topic.points.length)} key rules</span>
            <span class="grammar-card__arrow">${icon('arrow-right')}</span>
          </span>
          <span class="grammar-card__title">${escapeHtml(topic.title)}</span>
          <span class="grammar-card__de">${escapeHtml(topic.titleDe)}</span>
          <span class="grammar-card__summary">${escapeHtml(topic.summary)}</span>
          <span class="grammar-card__example">${icon('quote')}<span>${escapeHtml(topic.example.de)}</span></span>
          <span class="grammar-card__foot">
            <span class="grammar-card__stat grammar-card__stat--${stat.tone}" data-topic-stat="${escapeHtml(topic.id)}">
              ${escapeHtml(stat.text)}
            </span>
            <span class="grammar-card__drills">${drills} drills · ${entry?.tables.length || 0} tables</span>
          </span>
        </button>`;
    })
    .join('');

  const levelFilters = levels
    .map((level) => {
      const count = topics.filter((topic) => topic.level === level.id).length;
      return `<button class="filter-chip" type="button" data-level-filter="${level.id}" aria-pressed="false">
        ${escapeHtml(level.code)} <span>${count}</span>
      </button>`;
    })
    .join('');

  const html = `
    <div class="page page--grammar">
      <header class="page-head">
        <div class="page-head__main">
          <p class="eyebrow">Grammar Academy</p>
          <h1 class="page-title">The rules, without the fog.</h1>
          <p class="page-sub">Every topic pairs a plain-English explanation with real German examples, reference tables and a short drill set that scores itself.</p>
        </div>
        <div class="page-head__actions">
          <span class="chip chip--soft">${icon('layers')} ${topics.length} topics · ${drillCount} drills</span>
        </div>
      </header>

      <div class="summary-strip" role="list" aria-label="Grammar summary">
        <div class="summary-strip__item" role="listitem">${icon('layers')}<strong>${topics.length}</strong><span>topics</span></div>
        <div class="summary-strip__item" role="listitem">${icon('zap')}<strong>${drillCount}</strong><span>authored drills</span></div>
        <div class="summary-strip__item" role="listitem">${icon('target')}<strong data-summary-accuracy>${accuracy.percent}%</strong><span>drill accuracy</span></div>
        <div class="summary-strip__item" role="listitem">${icon('rotate')}<strong data-summary-mistakes>${mistakes.length}</strong><span>saved mistakes</span></div>
      </div>

      ${
        mistakes.length
          ? `<div class="notice notice--warning" role="note">
              <span class="notice__icon">${icon('rotate')}</span>
              <div>
                <strong>${mistakes.length} answer${mistakes.length === 1 ? '' : 's'} to revisit.</strong>
                <p>Mistakes are saved per drill and queued first the next time you practise that topic. Correct answers remove them automatically.</p>
              </div>
              <button class="btn btn--soft btn--sm" type="button" data-review-mistakes>Review mistakes</button>
            </div>`
          : `<div class="notice notice--info" role="note">
              <span class="notice__icon">${icon('info')}</span>
              <div>
                <strong>Read the rule, then prove it.</strong>
                <p>Each topic has a reference table and three scored drills with explanations. Results are stored on this device and feed the mistake queue.</p>
              </div>
              <span class="chip chip--soft">M3</span>
            </div>`
      }

      <section class="card grammar-browser" aria-labelledby="grammar-browser-title">
        <div class="browser-toolbar">
          <div class="field field--search">
            <label class="sr-only" for="grammar-search">Search grammar topics</label>
            <span class="field__icon">${icon('search')}</span>
            <input id="grammar-search" class="input" type="search" placeholder="Search topics, e.g. dative, word order, Konjunktiv…" autocomplete="off" />
            <button class="field__clear" type="button" data-clear-search aria-label="Clear search" hidden>${icon('x')}</button>
          </div>
          <div class="filter-row" role="group" aria-label="Filter by CEFR level">
            <button class="filter-chip is-active" type="button" data-level-filter="all" aria-pressed="true">
              All <span>${topics.length}</span>
            </button>
            ${levelFilters}
          </div>
        </div>

        <div class="browser-summary">
          <h2 class="browser-summary__title" id="grammar-browser-title">Grammar library</h2>
          <p class="browser-summary__count" id="grammar-count" aria-live="polite">${topics.length} topics</p>
        </div>

        <div class="grammar-grid" id="grammar-results">${cards}</div>

        <div class="empty" id="grammar-empty" hidden>
          <span class="empty__icon">${icon('search')}</span>
          <h3 class="empty__title">No grammar topics match those filters</h3>
          <p class="empty__text">Try a different search term, or reset to all levels.</p>
          <div class="empty__action"><button class="btn btn--soft" type="button" data-reset-filters>Reset filters</button></div>
        </div>
      </section>

      <section class="grammar-help card">
        <div>
          <p class="eyebrow">A note on method</p>
          <h2 class="card__title">Grammar is a map, not a maze.</h2>
          <p>Each explanation starts from meaning: what are you trying to say, and which structure helps you say it precisely? The drill set checks one pattern at a time, so a wrong answer points to a rule you can re-read immediately.</p>
        </div>
        <a class="btn btn--soft" href="#/courses/${stats.currentLevel.id}">See ${escapeHtml(stats.currentLevel.code)} in context ${icon('arrow-right')}</a>
      </section>
    </div>`;

  return {
    title: 'Grammar Academy',
    crumbs: [{ label: 'Grammar Academy' }],
    html,
    mount(root) {
      const search = root.querySelector('#grammar-search');
      const clear = root.querySelector('[data-clear-search]');
      const results = root.querySelector('#grammar-results');
      const empty = root.querySelector('#grammar-empty');
      const count = root.querySelector('#grammar-count');
      const cardsList = [...results.querySelectorAll('[data-topic]')];
      const filterButtons = [...root.querySelectorAll('[data-level-filter]')];
      let activeLevel = 'all';

      const setStat = (topicId, text, tone) => {
        const node = root.querySelector(`[data-topic-stat="${CSS.escape(topicId)}"]`);
        if (!node) return;
        node.textContent = text;
        node.className = `grammar-card__stat grammar-card__stat--${tone}`;
      };

      const refreshSummary = () => {
        const current = getState().progress;
        const summary = grammarAccuracy(current);
        const mistakeCount = getGrammarMistakes().length;
        const accuracyNode = root.querySelector('[data-summary-accuracy]');
        const mistakeNode = root.querySelector('[data-summary-mistakes]');
        if (accuracyNode) accuracyNode.textContent = `${summary.percent}%`;
        if (mistakeNode) mistakeNode.textContent = String(mistakeCount);
      };

      const openTopic = (topicId, initialTab = 'learn') => {
        const topic = findGrammarTopic(topicId);
        if (!topic) return;
        const level = levels.find((item) => item.id === topic.level);
        const course = getCourse(topic.level);
        const entry = getGrammarDrillTopic(topic.id);
        const drills = entry?.drills || [];
        const tables = entry?.tables || [];
        const mistakesForTopic = topicMistakes(topic.id);
        const stat = getGrammarDrillStat(topic.id);
        let practiceStarted = false;

        const modalId = `grammar-${topic.id}`;
        openModal({
          title: topic.title,
          subtitle: `${level.code} · ${topic.titleDe}`,
          size: 'lg',
          className: `grammar-modal tone-${level.color}`,
          content: `
            <div class="grammar-detail__head">
              ${levelBadge(level)}
              <span class="chip chip--soft">${escapeHtml(level.name)}</span>
              ${
                stat
                  ? `<span class="chip chip--success">Best ${stat.bestPercent ?? stat.lastPercent ?? 0}%</span>`
                  : `<span class="chip chip--soft">Not practised yet</span>`
              }
              <button class="icon-btn icon-btn--sm" type="button" data-speak-topic aria-label="Hear the example sentence" title="Hear the example">
                ${icon('volume')}
              </button>
            </div>

            <div class="grammar-tabs" role="tablist" aria-label="Topic sections">
              <button class="grammar-tab is-active" type="button" role="tab" id="${modalId}-tab-learn"
                aria-selected="true" aria-controls="${modalId}-panel-learn" data-grammar-tab="learn">
                ${icon('book-open')} Learn
              </button>
              <button class="grammar-tab" type="button" role="tab" id="${modalId}-tab-practice"
                aria-selected="false" aria-controls="${modalId}-panel-practice" data-grammar-tab="practice" tabindex="-1">
                ${icon('zap')} Practise <span class="grammar-tab__count">${drills.length}</span>
              </button>
            </div>

            <div class="grammar-panel" role="tabpanel" id="${modalId}-panel-learn" aria-labelledby="${modalId}-tab-learn" data-grammar-panel="learn">
              <p class="grammar-detail__summary">${escapeHtml(topic.summary)}</p>
              <h3 class="grammar-detail__heading">The rules that matter</h3>
              <ul class="check-list check-list--large">
                ${topic.points.map((point) => `<li>${icon('check')}<span>${escapeHtml(point)}</span></li>`).join('')}
              </ul>

              ${
                tables.length
                  ? `<h3 class="grammar-detail__heading">Reference tables</h3>${tablesHtml(tables)}`
                  : ''
              }

              <div class="example-box">
                <p class="example-box__label">German example</p>
                <p class="example-box__de" lang="de">${escapeHtml(topic.example.de)}</p>
                <p class="example-box__en">${escapeHtml(topic.example.en)}</p>
                <button class="btn btn--soft btn--sm" type="button" data-speak-topic>${icon('volume')} Listen</button>
              </div>

              ${
                mistakesForTopic.length
                  ? `<div class="callout callout--warn">
                      <span class="callout__icon">${icon('rotate')}</span>
                      <p>${mistakesForTopic.length} saved mistake${mistakesForTopic.length === 1 ? '' : 's'} for this topic. Open Practise to retry ${mistakesForTopic.length === 1 ? 'it' : 'them'} first.</p>
                    </div>`
                  : `<div class="callout callout--info">
                      <span class="callout__icon">${icon('zap')}</span>
                      <p>${drills.length} authored drills are ready for this topic. Each answer includes the rule behind it.</p>
                    </div>`
              }
            </div>

            <div class="grammar-panel" role="tabpanel" id="${modalId}-panel-practice" aria-labelledby="${modalId}-tab-practice" data-grammar-panel="practice" hidden>
              <div class="grammar-practice__head">
                <div>
                  <p class="eyebrow">Targeted practice</p>
                  <h3>${escapeHtml(topic.title)}</h3>
                  <p>${drills.length} questions. Answer, check, then read the explanation before moving on.</p>
                </div>
                <div class="grammar-practice__facts">
                  <span>${icon('target')} ${stat ? `Best ${stat.bestPercent ?? stat.lastPercent ?? 0}%` : 'First attempt'}</span>
                  <span>${icon('rotate')} ${mistakesForTopic.length} to revisit</span>
                </div>
              </div>
              <div data-drill-mount></div>
            </div>`,
          footer: `
            <button class="btn btn--ghost" type="button" data-modal-dismiss>Close</button>
            <a class="btn btn--primary" href="#/courses/${topic.level}">${escapeHtml(level.code)} course ${icon('arrow-right')}</a>`,
          onMount(modal, close) {
            const tabs = [...modal.querySelectorAll('[data-grammar-tab]')];
            const panels = [...modal.querySelectorAll('[data-grammar-panel]')];
            const drillMount = modal.querySelector('[data-drill-mount]');

            const activate = (name) => {
              tabs.forEach((tab) => {
                const isActive = tab.dataset.grammarTab === name;
                tab.classList.toggle('is-active', isActive);
                tab.setAttribute('aria-selected', String(isActive));
                tab.tabIndex = isActive ? 0 : -1;
              });
              panels.forEach((panel) => {
                panel.hidden = panel.dataset.grammarPanel !== name;
              });
              if (name === 'practice' && !practiceStarted) {
                practiceStarted = true;
                createDrillSession({
                  container: drillMount,
                  questions: practiseQuestions(topic.id),
                  intro: mistakesForTopic.length
                    ? 'Your saved mistakes are queued first. Correcting one removes it from the review list.'
                    : 'One pattern at a time. The explanation stays visible after each answer.',
                  onFinish({ results, correct, total, minutes }) {
                    const score = recordDrillAttempt({
                      topicId: topic.id,
                      levelId: topic.level,
                      results,
                      minutes,
                    });
                    const tone = score.percent >= 80 ? 'strong' : score.percent >= 60 ? 'building' : 'shaky';
                    const latest = getGrammarDrillStat(topic.id);
                    setStat(
                      topic.id,
                      `Best ${latest?.bestPercent ?? score.percent}% · ${latest?.attempts || 1} attempt${
                        (latest?.attempts || 1) === 1 ? '' : 's'
                      }`,
                      tone,
                    );
                    refreshSummary();
                    toast(
                      `${correct} of ${total} correct — ${score.percent}%. ${correct === total ? 'Mistake list cleared for these drills.' : 'Saved mistakes are now first in line.'}`,
                      { type: correct === total ? 'success' : 'info', duration: 3600 },
                    );
                  },
                });
              }
            };

            tabs.forEach((tab, index) => {
              tab.addEventListener('click', () => activate(tab.dataset.grammarTab));
              tab.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const direction = event.key === 'ArrowRight' ? 1 : -1;
                const next = tabs[(index + direction + tabs.length) % tabs.length];
                next.focus();
                activate(next.dataset.grammarTab);
              });
            });

            modal.querySelector('[data-modal-dismiss]')?.addEventListener('click', close);
            modal.querySelectorAll('[data-speak-topic]').forEach((button) => {
              button.addEventListener('click', () => {
                const spoken = speakGerman(topic.example.de);
                if (!spoken) toast('Speech playback is unavailable in this browser.', { type: 'warning' });
              });
            });
            if (course) modal.querySelector('a[href^="#/courses"]')?.addEventListener('click', close);
            if (initialTab === 'practice') activate('practice');
          },
        });
      };

      const openMistakes = () => {
        const entries = getGrammarMistakes().slice().reverse();
        if (!entries.length) {
          toast('No saved mistakes right now — practise a topic first.', { type: 'info' });
          return;
        }
        const closeMistakes = openModal({
          title: 'Mistake review',
          subtitle: `${entries.length} saved answer${entries.length === 1 ? '' : 's'}`,
          size: 'lg',
          className: 'mistake-review',
          content: `
            <p class="modal__text">These answers were marked wrong in Grammar Academy. Read the correction, then open the topic to retry the exact drill. A correct retry removes the item automatically.</p>
            <div class="mistake-review__list">
              ${entries
                .map((mistake) => {
                  const topic = findGrammarTopic(mistake.topicId);
                  return `
                    <article class="mistake-review__item">
                      <div class="mistake-review__head">
                        <strong>${escapeHtml(topic?.title || mistake.topicId)}</strong>
                        <span class="chip chip--soft">${escapeHtml(mistake.type.toUpperCase())}</span>
                      </div>
                      <p class="mistake-review__prompt">${escapeHtml(mistake.prompt)}</p>
                      <p class="mistake-review__answer"><span>Your answer</span> <del lang="de">${escapeHtml(
                        mistake.given || 'No answer',
                      )}</del> <span>Correct</span> <ins lang="de">${escapeHtml(mistake.answer)}</ins></p>
                      <p class="mistake-review__why">${escapeHtml(mistake.explanation)}</p>
                      <button class="btn btn--soft btn--sm" type="button" data-practise-topic="${escapeHtml(mistake.topicId)}">
                        ${icon('zap')} Practise this topic
                      </button>
                    </article>`;
                })
                .join('')}
            </div>`,
          footer: `<button class="btn btn--ghost" type="button" data-modal-dismiss>Close</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-modal-dismiss]')?.addEventListener('click', close);
            modal.querySelectorAll('[data-practise-topic]').forEach((button) => {
              button.addEventListener('click', () => {
                const topicId = button.dataset.practiseTopic;
                close();
                window.setTimeout(() => openTopic(topicId, 'practice'), 200);
              });
            });
          },
        });
        return closeMistakes;
      };

      const applyFilters = () => {
        const query = (search.value || '').trim().toLowerCase();
        let visible = 0;
        for (const card of cardsList) {
          const matchesLevel = activeLevel === 'all' || card.dataset.level === activeLevel;
          const matchesQuery = !query || card.dataset.search.includes(query);
          const show = matchesLevel && matchesQuery;
          card.hidden = !show;
          if (show) visible += 1;
        }
        count.textContent = `${visible} topic${visible === 1 ? '' : 's'}`;
        empty.hidden = visible !== 0;
        results.hidden = visible === 0;
        clear.hidden = query.length === 0;
      };

      search.addEventListener('input', applyFilters);
      clear.addEventListener('click', () => {
        search.value = '';
        search.focus();
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
        search.value = '';
        filterButtons.forEach((button) => {
          const isActive = button.dataset.levelFilter === 'all';
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-pressed', String(isActive));
        });
        applyFilters();
      });

      root.querySelector('[data-review-mistakes]')?.addEventListener('click', openMistakes);

      results.addEventListener('click', (event) => {
        const card = event.target.closest('[data-topic]');
        if (card) openTopic(card.dataset.topic);
      });

      const requested = ctx.query?.topic;
      if (requested && findGrammarTopic(requested)) {
        openTopic(requested, ctx.query?.tab === 'practice' ? 'practice' : 'learn');
      }
    },
  };
}
