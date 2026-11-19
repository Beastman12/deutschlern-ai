/**
 * Milestone 2 lesson engine.
 *
 * Loads one validated lesson body, renders its seventeen sections in a
 * step-by-step player, saves the learner's position, scores the final
 * assessment and applies sequential gating through gating.js.
 */
import { findLesson, getCourseLessons, getLevel, loadLessonBody } from './content.js';
import {
  formatDate,
  icon,
  levelBadge,
  progressBar,
  scrollToView,
  speakGerman,
  speakGermanLines,
  stopSpeaking,
  toast,
} from './ui.js';
import { getLessonAccess } from './gating.js';
import {
  getLessonAttempts,
  getLessonSession,
  getState,
  markLessonSection,
  recordQuizAttempt,
} from './store.js';
import { renderNotFound } from './notfound.js';

const SECTION_TOTAL = 17;

/* -------------------------------------------------------------------------- */
/* Small rendering helpers                                                     */
/* -------------------------------------------------------------------------- */

function normalizeAnswer(value) {
  return String(value ?? '')
    .toLocaleLowerCase('de-DE')
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function speakButton(text, label, className = 'icon-btn icon-btn--sm') {
  return `<button class="${className}" type="button" data-speak="${escapeAttr(text)}" aria-label="${escapeAttr(
    label || `Hear “${text}”`,
  )}" title="${escapeAttr(label || `Hear “${text}”`)}">${icon('volume')}</button>`;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Kept local so the engine does not need the full UI module for escaping.
function escapeHtml(value) {
  return escapeAttr(value);
}

function articleBadge(item) {
  if (!item?.article) return '';
  return `<span class="article article--${escapeAttr(item.article)}">${escapeHtml(item.article)}</span>`;
}

function renderBlocks(blocks = []) {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'list':
          return `<ul class="content-list">${block.items
            .map((item) => `<li>${icon('check')}<span>${escapeHtml(item)}</span></li>`)
            .join('')}</ul>`;
        case 'table':
          return `<div class="table-wrap"><table class="content-table">
            <thead><tr>${block.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>${block.rows
              .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
              .join('')}</tbody>
          </table></div>`;
        case 'note':
          return `<aside class="content-note">
            <span class="content-note__icon">${icon('info')}</span>
            <div>${block.title ? `<strong>${escapeHtml(block.title)}</strong>` : ''}<p>${escapeHtml(block.text)}</p></div>
          </aside>`;
        case 'de':
          return `<div class="de-line">
            <p lang="de">${escapeHtml(block.text)}</p>
            <p class="de-line__en">${escapeHtml(block.en)}</p>
            ${speakButton(block.text, `Hear “${block.text}”`, 'icon-btn icon-btn--sm')}
          </div>`;
        default:
          return `<p>${escapeHtml(block.text)}</p>`;
      }
    })
    .join('');
}

/* -------------------------------------------------------------------------- */
/* Exercise rendering                                                          */
/* -------------------------------------------------------------------------- */

function questionBody(question, mode) {
  if (question.type === 'mcq') {
    const promptId = `prompt-${escapeAttr(question.id)}`;
    return `
      <fieldset class="exercise" data-question="${escapeAttr(question.id)}" data-type="mcq" aria-labelledby="${promptId}">
        <legend class="exercise__prompt" id="${promptId}">
          <span class="exercise__prompt-text">${escapeHtml(question.prompt)}</span>
        </legend>
        <div class="exercise__options">
          ${question.options
            .map(
              (option, index) => `
              <label class="option">
                <input type="radio" name="q-${escapeAttr(question.id)}" value="${index}" />
                <span class="option__mark" aria-hidden="true"></span>
                <span class="option__text">${escapeHtml(option)}</span>
              </label>`,
            )
            .join('')}
        </div>
        ${mode === 'practice' ? '<div class="exercise__actions"><button class="btn btn--soft btn--sm" type="button" data-check-exercise>Check answer</button></div>' : ''}
        <div class="exercise__feedback" data-feedback hidden></div>
      </fieldset>`;
  }

  if (question.type === 'gap') {
    const promptId = `prompt-${escapeAttr(question.id)}`;
    return `
      <div class="exercise" data-question="${escapeAttr(question.id)}" data-type="gap" role="group" aria-labelledby="${promptId}">
        <p class="exercise__prompt" id="${promptId}"><span class="exercise__prompt-text">${escapeHtml(question.prompt)}</span></p>
        <label class="gap-field">
          <span class="sr-only">Your answer</span>
          <input class="gap-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
            data-answer-input placeholder="Type the missing word" />
        </label>
        ${mode === 'practice' ? '<div class="exercise__actions"><button class="btn btn--soft btn--sm" type="button" data-check-exercise>Check answer</button></div>' : ''}
        <div class="exercise__feedback" data-feedback hidden></div>
      </div>`;
  }

  const promptId = `prompt-${escapeAttr(question.id)}`;
  return `
    <div class="exercise" data-question="${escapeAttr(question.id)}" data-type="order" role="group" aria-labelledby="${promptId}">
      <p class="exercise__prompt" id="${promptId}"><span class="exercise__prompt-text">${escapeHtml(question.prompt)}</span></p>
      <div class="order-builder" data-order>
        <div class="order-builder__answer" data-order-answer aria-live="polite">
          <span class="order-builder__placeholder">Click the words below in the correct order.</span>
        </div>
        <div class="order-builder__tokens" data-order-tokens aria-label="Word tokens">
          ${question.tokens
            .map(
              (token, index) => `<button class="order-token" type="button" data-token="${index}">${escapeHtml(
                token,
              )}</button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="exercise__actions">
        <button class="btn btn--ghost btn--sm" type="button" data-order-clear>Clear</button>
        ${mode === 'practice' ? '<button class="btn btn--soft btn--sm" type="button" data-check-exercise>Check answer</button>' : ''}
      </div>
      <div class="exercise__feedback" data-feedback hidden></div>
    </div>`;
}

function correctAnswerText(question) {
  if (question.type === 'mcq') return question.options[question.answer] || '';
  if (question.type === 'gap') return question.answers[0] || '';
  return question.answer;
}

function feedbackHtml(question, correct) {
  const answer = correctAnswerText(question);
  return `
    <span class="exercise__feedback-icon">${icon(correct ? 'check' : 'info')}</span>
    <div>
      <strong>${correct ? 'Correct' : 'Not quite'}</strong>
      ${correct ? '' : `<p>Correct answer: <span lang="de">${escapeHtml(answer)}</span></p>`}
      <p>${escapeHtml(question.explanation)}</p>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Section content                                                             */
/* -------------------------------------------------------------------------- */

function renderSectionContent(section, lesson) {
  switch (section.type) {
    case 'warmup':
      return `
        <div class="warmup">
          <p class="warmup__prompt">${escapeHtml(section.prompt)}</p>
          <div class="warmup__lines">
            ${section.items
              .map(
                (item) => `<button class="warmup__line" type="button" data-speak="${escapeAttr(item)}">
                  <span lang="de">${escapeHtml(item)}</span>${icon('volume')}
                </button>`,
              )
              .join('')}
          </div>
          <p class="card__note">${icon('info')} No score, no pressure — just say the words aloud.</p>
        </div>`;

    case 'objectives':
      return `
        <div class="objectives-runner">
          <ul class="check-list check-list--large">
            ${lesson.objectives.map((objective) => `<li>${icon('target')}<span>${escapeHtml(objective)}</span></li>`).join('')}
          </ul>
          <div class="key-phrase-card">
            <p class="eyebrow">Key phrase</p>
            <p class="key-phrase-card__de" lang="de">${escapeHtml(lesson.keyPhrase.de)}</p>
            <p class="key-phrase-card__en">${escapeHtml(lesson.keyPhrase.en)}</p>
            ${speakButton(lesson.keyPhrase.de, 'Hear the key phrase', 'btn btn--soft btn--sm')}
          </div>
        </div>`;

    case 'vocabulary':
      return `
        <div class="word-cards">
          ${section.items
            .map(
              (item) => `
              <article class="word-card">
                <div class="word-card__head">
                  <div class="word-card__de">${articleBadge(item)}<strong lang="de">${escapeHtml(
                    item.de.replace(/^(der|die|das)\s+/, ''),
                  )}</strong></div>
                  ${speakButton(item.de, `Hear ${item.de}`)}
                </div>
                <p class="word-card__en">${escapeHtml(item.en)}</p>
                ${item.pronunciation ? `<p class="word-card__pron">[${escapeHtml(item.pronunciation)}]</p>` : ''}
                ${item.plural ? `<p class="word-card__plural"><span>Plural</span> ${escapeHtml(item.plural)}</p>` : ''}
                <p class="word-card__example" lang="de">${escapeHtml(item.example)}</p>
                <p class="word-card__example-en">${escapeHtml(item.exampleEn)}</p>
              </article>`,
            )
            .join('')}
        </div>`;

    case 'examples':
      return `
        <div class="example-list">
          ${section.items
            .map(
              (item) => `
              <article class="example-card">
                <p class="example-card__de" lang="de">${escapeHtml(item.de)}</p>
                <p class="example-card__en">${escapeHtml(item.en)}</p>
                ${item.note ? `<p class="example-card__note">${escapeHtml(item.note)}</p>` : ''}
                ${speakButton(item.de, `Hear “${item.de}”`)}
              </article>`,
            )
            .join('')}
        </div>`;

    case 'pronunciation':
      return `
        <div class="pronunciation-list">
          ${section.items
            .map(
              (item) => `
              <article class="pronunciation-card">
                <div class="pronunciation-card__head">
                  <strong lang="de">${escapeHtml(item.de)}</strong>
                  ${item.en ? `<span>${escapeHtml(item.en)}</span>` : ''}
                  ${speakButton(item.de, `Hear ${item.de}`)}
                </div>
                <p>${escapeHtml(item.hint)}</p>
              </article>`,
            )
            .join('')}
        </div>`;

    case 'culture':
      return `<div class="culture-card"><h3>${escapeHtml(section.heading)}</h3>${renderBlocks(section.blocks)}</div>`;

    case 'dialogue':
      return `
        <div class="dialogue">
          <div class="dialogue__head">
            <p class="dialogue__setting">${icon('message')} ${escapeHtml(section.setting)}</p>
            <button class="btn btn--soft btn--sm" type="button" data-play-dialogue>${icon('play')} Play the dialogue</button>
          </div>
          <div class="dialogue__lines">
            ${section.lines
              .map(
                (line) => `
                <div class="dialogue__line">
                  <span class="dialogue__speaker">${escapeHtml(line.speaker)}</span>
                  <div class="dialogue__bubble">
                    <p lang="de">${escapeHtml(line.de)}</p>
                    <p class="dialogue__en">${escapeHtml(line.en)}</p>
                  </div>
                  ${speakButton(line.de, `Hear ${line.speaker}: ${line.de}`)}
                </div>`,
              )
              .join('')}
          </div>
        </div>`;

    case 'listening':
      return `
        <div class="listening">
          <div class="listening__head">
            <button class="btn btn--soft btn--sm" type="button" data-play-listening>${icon('play')} Play the audio</button>
            <button class="btn btn--ghost btn--sm" type="button" data-reveal-transcript aria-expanded="false" aria-controls="lesson-transcript">
              ${icon('book-open')} Show transcript
            </button>
            ${section.speaker ? `<span class="listening__speaker">${escapeHtml(section.speaker)}</span>` : ''}
          </div>
          <div class="listening__transcript" id="lesson-transcript" hidden>
            ${section.script
              .map(
                (line) => `
                <div class="transcript-line">
                  ${line.speaker ? `<span class="transcript-line__speaker">${escapeHtml(line.speaker)}</span>` : ''}
                  <span lang="de">${escapeHtml(line.de)}</span>
                  <span class="transcript-line__en">${escapeHtml(line.en)}</span>
                </div>`,
              )
              .join('')}
          </div>
          <p class="card__note">${icon('headphones')} Play once for the gist, once for detail. Then answer without the transcript.</p>
          <div class="exercise-stack">
            ${section.questions.map((question, index) => renderQuestion(question, index, 'practice')).join('')}
          </div>
        </div>`;

    case 'speaking':
      return `
        <div class="speaking-task">
          <div class="speaking-task__prompt">
            <span class="speaking-task__icon">${icon('mic')}</span>
            <div>
              <h3>Your task</h3>
              <p>${escapeHtml(section.prompt)}</p>
            </div>
          </div>
          <div class="speaking-task__model">
            <p class="eyebrow">Model answer</p>
            <p class="speaking-task__de" lang="de">${escapeHtml(section.model.de)}</p>
            <p class="speaking-task__en">${escapeHtml(section.model.en)}</p>
            ${speakButton(section.model.de, 'Hear the model answer', 'btn btn--soft btn--sm')}
          </div>
          <div class="speaking-task__tips">
            <h3>Make it work</h3>
            <ul class="content-list">${section.tips.map((tip) => `<li>${icon('check')}<span>${escapeHtml(tip)}</span></li>`).join('')}</ul>
          </div>
          <fieldset class="self-check">
            <legend>Self-check</legend>
            <label class="option option--check"><input type="checkbox" /><span class="option__mark" aria-hidden="true"></span><span class="option__text">I said it aloud without reading word by word.</span></label>
            <label class="option option--check"><input type="checkbox" /><span class="option__mark" aria-hidden="true"></span><span class="option__text">My word order and verb ending were correct.</span></label>
            <label class="option option--check"><input type="checkbox" /><span class="option__mark" aria-hidden="true"></span><span class="option__text">I would understand this if someone said it to me.</span></label>
          </fieldset>
          <p class="card__note">${icon('info')} This is honest self-assessment, not a pronunciation score. Use Speaking Practice to hear and review your spoken German.</p>
        </div>`;

    case 'mistakes':
      return `
        <div class="mistake-list">
          ${section.items
            .map(
              (item) => `
              <article class="mistake-card">
                <div class="mistake-card__pair">
                  <p class="mistake-card__wrong"><span>${icon('x')} Often written</span><del lang="de">${escapeHtml(item.wrong)}</del></p>
                  <p class="mistake-card__right"><span>${icon('check')} Better</span><ins lang="de">${escapeHtml(item.right)}</ins></p>
                </div>
                <p class="mistake-card__why">${escapeHtml(item.why)}</p>
              </article>`,
            )
            .join('')}
        </div>`;

    case 'grammar':
      return `
        <div class="grammar-spotlight">
          <h3>${escapeHtml(section.heading)}</h3>
          ${renderBlocks(section.blocks)}
          ${section.tip ? `<p class="grammar-spotlight__tip">${icon('sparkles')}<span>${escapeHtml(section.tip)}</span></p>` : ''}
        </div>`;

    default:
      return renderBlocks(section.blocks || []);
  }
}

function renderQuestion(question, index, mode) {
  const number = `<span class="exercise__number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>`;
  const body = questionBody(question, mode);
  if (body.startsWith('\n      <fieldset')) {
    return body.replace('<legend class="exercise__prompt"', `${number}<legend class="exercise__prompt"`);
  }
  return body.replace('<p class="exercise__prompt"', `${number}<p class="exercise__prompt"`);
}

/* -------------------------------------------------------------------------- */
/* Assessment                                                                  */
/* -------------------------------------------------------------------------- */

function renderAssessment(section) {
  return `
    <div class="assessment-runner">
      <div class="assessment-runner__meta">
        <span class="chip chip--warning">${icon('trophy')} ${section.questions.length} questions</span>
        <span class="chip chip--soft">${section.passScore}% to pass</span>
        <span class="chip chip--soft">Unlimited retakes</span>
      </div>
      <div data-assessment-result></div>
      <form class="assessment-form" data-assessment-form novalidate>
        <div class="exercise-stack">
          ${section.questions.map((question, index) => renderQuestion(question, index, 'assessment')).join('')}
        </div>
        <div class="assessment-submit">
          <p>Your score is saved locally. A passed check unlocks the next lesson.</p>
          <button class="btn btn--primary btn--lg" type="submit" data-submit-assessment>${icon('trophy')} Submit assessment</button>
        </div>
      </form>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Page rendering                                                              */
/* -------------------------------------------------------------------------- */

function statusChip(access, record) {
  if (access.completed) {
    const score = Number(record?.bestScore);
    return `<span class="status status--done">${icon('check')} Completed${Number.isFinite(score) ? ` · ${score}%` : ''}</span>`;
  }
  if (!access.unlocked) return `<span class="status status--locked">${icon('lock')} Locked</span>`;
  return `<span class="status status--next">${icon('play')} Ready to learn</span>`;
}

function renderLocked(ctx, level, lesson, module, access) {
  const prerequisite = access.prerequisite;
  return {
    title: `${lesson.title} · ${level.code}`,
    crumbs: [
      { label: 'German Courses', href: '#/courses' },
      { label: level.code, href: `#/courses/${level.id}` },
      { label: lesson.title },
    ],
    html: `
      <div class="page page--lesson">
        <a class="back-link" href="#/courses/${level.id}">${icon('arrow-left')} ${escapeHtml(level.code)} · Course overview</a>
        <header class="lesson-hero lesson-hero--locked tone-${escapeAttr(level.color)}">
          <div class="lesson-hero__main">
            <div class="lesson-hero__meta">
              ${levelBadge(level)}
              <span class="chip chip--soft">${escapeHtml(module.title)}</span>
              <span class="status status--locked">${icon('lock')} Locked</span>
            </div>
            <h1 class="lesson-hero__title">${escapeHtml(lesson.title)}</h1>
            <p class="lesson-hero__de">${escapeHtml(lesson.titleDe)}</p>
            <p class="lesson-hero__summary">${escapeHtml(lesson.summary)}</p>
          </div>
          <aside class="lesson-hero__panel">
            <p class="eyebrow">Unlock requirement</p>
            <p class="lesson-hero__translation">Pass the previous lesson check with ${lesson.assessment.passScore}% or more.</p>
          </aside>
        </header>

        <section class="card locked-card">
          <span class="locked-card__icon">${icon('lock')}</span>
          <div class="locked-card__body">
            <p class="eyebrow">Sequential path</p>
            <h2 class="card__title">This lesson is locked</h2>
            <p class="card__sub">
              ${
                prerequisite
                  ? `Finish <strong>${escapeHtml(prerequisite.title)}</strong> first. Its assessment opens this lesson automatically.`
                  : 'Complete the previous lesson to unlock this one.'
              }
            </p>
            <p class="card__note">${icon('rotate')} Revisions are always open, and you can retake an assessment as often as you need.</p>
            <div class="locked-card__actions">
              ${
                prerequisite
                  ? `<a class="btn btn--primary" href="#/courses/${level.id}/${prerequisite.id}">${icon('arrow-left')} Open ${escapeHtml(
                      prerequisite.title,
                    )}</a>`
                  : ''
              }
              <a class="btn btn--soft" href="#/courses/${level.id}">Course overview</a>
            </div>
          </div>
        </section>
      </div>`,
    mount(root) {
      root.querySelectorAll('[data-speak]').forEach((button) => {
        button.addEventListener('click', () => {
          const spoken = speakGerman(button.dataset.speak);
          if (!spoken) toast('Speech playback is unavailable in this browser.', { type: 'warning' });
        });
      });
    },
    destroy() {
      stopSpeaking();
    },
  };
}

export async function renderLesson(ctx) {
  const { levelId, lessonId } = ctx.params;
  const level = getLevel(levelId);
  const entry = findLesson(lessonId);

  if (!level || !entry || entry.level.id !== level.id) {
    return renderNotFound(ctx, {
      title: 'Lesson not found',
      message: 'That lesson does not exist in this course. Use the course page to choose a lesson from the curriculum.',
    });
  }

  const { lesson, module, course } = entry;
  const courseLessons = getCourseLessons(level.id);
  const progress = getState().progress;
  const access = getLessonAccess(lesson.id, progress);

  if (!access.unlocked) {
    return renderLocked(ctx, level, lesson, module, access);
  }

  const body = await loadLessonBody(lesson.id);
  const session = getLessonSession(lesson.id);
  const startIndex = Math.max(
    0,
    body.sections.findIndex((section) => section.id === session?.sectionId),
  );
  const record = progress.completedLessons?.[lesson.id] || null;

  const html = `
    <div class="page page--lesson page--lesson-runner" data-lesson-id="${escapeAttr(lesson.id)}">
      <a class="back-link" href="#/courses/${level.id}">${icon('arrow-left')} ${escapeHtml(level.code)} · ${escapeHtml(
        course.title,
      )}</a>

      <header class="lesson-hero tone-${escapeAttr(level.color)}">
        <div class="lesson-hero__main">
          <div class="lesson-hero__meta">
            ${levelBadge(level)}
            <span class="chip chip--soft">${escapeHtml(module.title)}</span>
            <span class="chip chip--soft">Lesson ${lesson.number} of ${courseLessons.length}</span>
            <span data-lesson-status>${statusChip(access, record)}</span>
          </div>
          <h1 class="lesson-hero__title">${escapeHtml(lesson.title)}</h1>
          <p class="lesson-hero__de">${escapeHtml(lesson.titleDe)}</p>
          <p class="lesson-hero__summary">${escapeHtml(lesson.summary)}</p>
          <ul class="lesson-hero__facts" role="list">
            <li>${icon('clock')} About ${lesson.minutes} min guided</li>
            <li>${icon('layers')} ${SECTION_TOTAL} sections</li>
            <li>${icon('trophy')} ${lesson.assessment.questions}-question check</li>
            <li>${icon('check')} ${lesson.assessment.passScore}% to pass</li>
          </ul>
        </div>
        <aside class="lesson-hero__panel">
          <p class="eyebrow">Key phrase</p>
          <p class="lesson-hero__phrase" lang="de">${escapeHtml(lesson.keyPhrase.de)}</p>
          <p class="lesson-hero__translation">${escapeHtml(lesson.keyPhrase.en)}</p>
          <button class="btn btn--soft btn--block" type="button" data-speak="${escapeAttr(lesson.keyPhrase.de)}">
            ${icon('volume')} Hear it in German
          </button>
          <p class="lesson-hero__panel-note">Your place in this lesson is saved automatically.</p>
        </aside>
      </header>

      <div class="lesson-runner">
        <aside class="card lesson-map" aria-label="Lesson sections">
          <div class="lesson-map__head">
            <div>
              <p class="eyebrow">Lesson map</p>
              <h2 class="card__title">Your route</h2>
            </div>
            <span class="lesson-map__count" data-section-count>${SECTION_TOTAL} sections</span>
          </div>
          <div class="lesson-map__progress" data-section-progress>
            ${progressBar(0, { size: 'sm', label: 'Lesson sections visited' })}
          </div>
          <ol class="lesson-map__list" data-section-list></ol>
          <div class="lesson-map__history" data-attempt-list>${renderAttemptHistory(lesson.id)}</div>
        </aside>

        <div class="lesson-stage-wrap">
          <section class="card lesson-stage" id="lesson-stage" aria-live="polite"></section>
          <nav class="lesson-controls" aria-label="Section navigation">
            <div data-section-controls></div>
          </nav>
        </div>
      </div>
    </div>`;

  return {
    title: `${lesson.title} · ${level.code}`,
    crumbs: [
      { label: 'German Courses', href: '#/courses' },
      { label: level.code, href: `#/courses/${level.id}` },
      { label: lesson.title },
    ],
    html,
    mount(root) {
      mountLessonRunner(root, {
        lesson,
        module,
        level,
        course,
        body,
        courseLessons,
        startIndex,
      });
    },
    destroy() {
      // Dialogue and listening lines queue several utterances; stop them all
      // when the learner leaves this screen.
      stopSpeaking();
    },
  };
}

function renderAttemptHistory(lessonId) {
  const attempts = getLessonAttempts(lessonId).slice(0, 4);
  if (!attempts.length) {
    return `<p class="lesson-map__history-empty">${icon('trophy')} No attempt yet. The pass mark is in the assessment.</p>`;
  }
  return `
    <div class="attempt-history">
      <p class="eyebrow">Recent checks</p>
      <ul class="attempt-history__list">
        ${attempts
          .map(
            (attempt) => `
            <li class="attempt-history__item ${attempt.passed ? 'is-passed' : 'is-failed'}">
              <span class="attempt-history__score">${attempt.percent}%</span>
              <span class="attempt-history__meta">
                <strong>${attempt.passed ? 'Passed' : 'Not passed'}</strong>
                <small>${formatDate(attempt.date, { day: 'numeric', month: 'short' })} · ${attempt.score}/${attempt.total}</small>
              </span>
              ${icon(attempt.passed ? 'check' : 'rotate')}
            </li>`,
          )
          .join('')}
      </ul>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Runtime                                                                     */
/* -------------------------------------------------------------------------- */

function sectionTitle(section, index) {
  return `${String(index + 1).padStart(2, '0')} · ${section.title}`;
}

function mapHtml(body, currentIndex, visited) {
  return body.sections
    .map((section, index) => {
      const isCurrent = index === currentIndex;
      const isVisited = visited.has(section.id);
      return `
        <li>
          <button class="lesson-map__item ${isCurrent ? 'is-current' : ''} ${isVisited ? 'is-visited' : ''}"
            type="button" data-section="${index}" ${isCurrent ? 'aria-current="step"' : ''}>
            <span class="lesson-map__num">${isVisited && !isCurrent ? icon('check') : String(index + 1).padStart(2, '0')}</span>
            <span class="lesson-map__text"><strong>${escapeHtml(section.title)}</strong><small>${section.minutes} min</small></span>
            ${section.type === 'assessment' ? `<span class="lesson-map__badge">${icon('trophy')}</span>` : ''}
          </button>
        </li>`;
    })
    .join('');
}

function controlsHtml(index) {
  return `
    <button class="btn btn--soft" type="button" data-prev ${index === 0 ? 'disabled' : ''}>
      ${icon('arrow-left')} Previous
    </button>
    <span class="lesson-controls__label">Section ${index + 1} of ${SECTION_TOTAL}</span>
    <button class="btn btn--primary" type="button" data-next ${index === SECTION_TOTAL - 1 ? 'disabled' : ''}>
      Next ${icon('arrow-right')}
    </button>`;
}

function mountLessonRunner(
  root,
  { lesson, module, level, course, body, courseLessons, startIndex },
) {
  const page = root.querySelector('.page--lesson-runner');
  const stage = page?.querySelector('#lesson-stage');
  const list = page?.querySelector('[data-section-list]');
  const progressSlot = page?.querySelector('[data-section-progress]');
  const controls = page?.querySelector('[data-section-controls]');
  const count = page?.querySelector('[data-section-count]');
  const attemptSlot = page?.querySelector('[data-attempt-list]');
  if (!page || !stage || !list || !controls) return;

  const session = getLessonSession(lesson.id);
  const visited = new Set(session?.visited || []);
  let currentIndex = Math.min(Math.max(startIndex, 0), SECTION_TOTAL - 1);
  let questionIndex = new Map();
  let assessmentQuestions = new Map();

  function exerciseMapFor(section) {
    questionIndex = new Map();
    assessmentQuestions = new Map();
    if (['mcq', 'gap', 'order'].includes(section.type)) {
      for (const exercise of section.exercises) questionIndex.set(exercise.id, exercise);
    }
    if (section.type === 'listening') {
      for (const question of section.questions) questionIndex.set(question.id, question);
    }
    if (section.type === 'assessment') {
      for (const question of section.questions) assessmentQuestions.set(question.id, question);
    }
  }

  function updateChrome() {
    list.innerHTML = mapHtml(body, currentIndex, visited);
    const percent = Math.round((visited.size / SECTION_TOTAL) * 100);
    if (progressSlot) {
      progressSlot.innerHTML = progressBar(percent, {
        size: 'sm',
        label: `Lesson sections visited: ${percent} percent`,
      });
    }
    if (count) count.textContent = `${visited.size}/${SECTION_TOTAL} visited`;
    if (controls) controls.innerHTML = controlsHtml(currentIndex);
  }

  function showSection(index, { focus = true, persist = true } = {}) {
    const safeIndex = Math.min(Math.max(Number(index) || 0, 0), body.sections.length - 1);
    const section = body.sections[safeIndex];
    currentIndex = safeIndex;
    exerciseMapFor(section);

    const isAssessment = section.type === 'assessment';
    const content = isAssessment ? renderAssessment(section) : renderSectionContent(section, lesson);

    stage.innerHTML = `
      <header class="section-head">
        <p class="eyebrow">Section ${safeIndex + 1} of ${SECTION_TOTAL} · ${section.minutes} min</p>
        <h2 class="section-heading" tabindex="-1">${escapeHtml(section.title)}</h2>
        ${section.lede ? `<p class="section-lede">${escapeHtml(section.lede)}</p>` : ''}
      </header>
      <div class="section-body">${content}</div>`;

    visited.add(section.id);
    if (persist) markLessonSection(lesson.id, section.id, safeIndex);
    updateChrome();

    if (focus) {
      scrollToView(stage);
      stage.querySelector('.section-heading')?.focus({ preventScroll: true });
    }
  }

  function selectedOrderAnswer(questionElement) {
    const answer = questionElement.querySelector('[data-order-answer]');
    return [...(answer?.querySelectorAll('[data-token]') || [])].map((button) => button.textContent).join(' ');
  }

  function evaluateQuestion(question, element) {
    const type = question.type;
    if (type === 'mcq') {
      const selected = element.querySelector('input[type="radio"]:checked');
      return selected ? Number(selected.value) === question.answer : false;
    }
    if (type === 'gap') {
      const value = element.querySelector('[data-answer-input]')?.value || '';
      const accepted = question.answers.map(normalizeAnswer);
      return accepted.includes(normalizeAnswer(value));
    }
    return normalizeAnswer(selectedOrderAnswer(element)) === normalizeAnswer(question.answer);
  }

  function showPracticeFeedback(element, question) {
    const correct = evaluateQuestion(question, element);
    const feedback = element.querySelector('[data-feedback]');
    if (!feedback) return;
    feedback.hidden = false;
    feedback.className = `exercise__feedback exercise__feedback--${correct ? 'correct' : 'incorrect'}`;
    feedback.innerHTML = feedbackHtml(question, correct);
  }

  function toggleTranscript(button) {
    const transcript = page.querySelector('#lesson-transcript');
    if (!transcript) return;
    const open = transcript.hidden;
    transcript.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.innerHTML = `${icon('book-open')} ${open ? 'Hide transcript' : 'Show transcript'}`;
  }

  function playLines(kind) {
    const section = body.sections.find((item) => item.type === kind);
    const lines =
      kind === 'dialogue'
        ? section?.lines?.map((line) => line.de)
        : section?.script?.map((line) => line.de);
    if (!lines?.length) return;
    const spoken = speakGermanLines(lines);
    if (!spoken) toast('Speech playback is unavailable in this browser.', { type: 'warning' });
  }

  function submitAssessment(form) {
    const section = body.sections[16];
    if (!form || form.dataset.submitted === 'true') return;

    let score = 0;
    const review = [];
    for (const question of section.questions) {
      const element = form.querySelector(`[data-question="${CSS.escape(question.id)}"]`);
      if (!element) continue;
      const correct = evaluateQuestion(question, element);
      if (correct) score += 1;
      element.classList.add(correct ? 'is-correct' : 'is-wrong');
      const feedback = element.querySelector('[data-feedback]');
      if (feedback) {
        feedback.hidden = false;
        feedback.className = `exercise__feedback exercise__feedback--${correct ? 'correct' : 'incorrect'}`;
        feedback.innerHTML = feedbackHtml(question, correct);
      }
      review.push({ question, correct });
    }

    form.dataset.submitted = 'true';
    form.classList.add('is-submitted');
    form.querySelectorAll('input, button').forEach((control) => {
      control.disabled = true;
    });

    const total = section.questions.length;
    const percent = Math.round((score / total) * 100);
    const passed = percent >= section.passScore;
    const session = getLessonSession(lesson.id);
    const elapsedMinutes = session?.startedAt
      ? Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000))
      : 0;

    const { firstPass } = recordQuizAttempt({
      lessonId: lesson.id,
      levelId: level.id,
      lessonTitle: lesson.title,
      score,
      total,
      passScore: section.passScore,
      skills: lesson.skills,
      minutes: elapsedMinutes,
    });

    const nextLesson = courseLessons[currentIndexOfLesson() + 1] || null;
    const resultSlot = page.querySelector('[data-assessment-result]');
    if (resultSlot) {
      resultSlot.innerHTML = `
        <div class="assessment-result assessment-result--${passed ? 'pass' : 'fail'}" role="status" tabindex="-1">
          <span class="assessment-result__icon">${icon(passed ? 'award' : 'rotate')}</span>
          <div class="assessment-result__body">
            <p class="eyebrow">${passed ? 'Assessment passed' : 'Not passed yet'}</p>
            <h2>${passed ? `${percent}% — lesson complete` : `${percent}% — ${section.passScore}% needed`}</h2>
            <p>
              ${passed
                ? `You answered ${score} of ${total} correctly.${firstPass ? ' The next lesson is now unlocked.' : ' Your best score has been saved.'}`
                : `You answered ${score} of ${total} correctly. Review the explanations and try again — there is no limit.`}
            </p>
          </div>
          <div class="assessment-result__score" aria-label="${percent} percent">
            <strong>${percent}<small>%</small></strong>
            <span>${score}/${total}</span>
          </div>
          <div class="assessment-result__actions">
            ${
              passed && nextLesson
                ? `<a class="btn btn--primary" href="#/courses/${level.id}/${nextLesson.id}">Next lesson ${icon('arrow-right')}</a>`
                : ''
            }
            ${
              passed && !nextLesson
                ? `<a class="btn btn--primary" href="#/courses/${level.id}">Course complete ${icon('award')}</a>`
                : ''
            }
            ${
              !passed
                ? `<button class="btn btn--primary" type="button" data-retake>${icon('rotate')} Retake assessment</button>`
                : ''
            }
            <a class="btn btn--soft" href="#/courses/${level.id}">Back to course</a>
          </div>
        </div>`;
      resultSlot.querySelector('.assessment-result')?.focus({ preventScroll: true });
    }

    if (attemptSlot) attemptSlot.innerHTML = renderAttemptHistory(lesson.id);
    const statusSlot = page.querySelector('[data-lesson-status]');
    if (statusSlot) {
      const updated = getState().progress.completedLessons?.[lesson.id] || null;
      statusSlot.innerHTML = statusChip({ unlocked: true, completed: Boolean(updated?.passed) }, updated);
    }

    if (passed) {
      toast(firstPass ? 'Assessment passed — next lesson unlocked.' : 'Assessment passed again. Best score saved.', {
        type: 'success',
      });
    } else {
      toast(`You scored ${percent}%. Review the feedback and retake when ready.`, { type: 'warning' });
    }
  }

  function currentIndexOfLesson() {
    return courseLessons.findIndex((item) => item.id === lesson.id);
  }

  page.addEventListener('click', (event) => {
    const target = event.target.closest('button, a');
    if (!target) return;

    if (target.matches('[data-speak]')) {
      event.preventDefault();
      const spoken = speakGerman(target.dataset.speak);
      if (!spoken) toast('Speech playback is unavailable in this browser.', { type: 'warning' });
      return;
    }
    if (target.matches('[data-play-dialogue]')) {
      playLines('dialogue');
      return;
    }
    if (target.matches('[data-play-listening]')) {
      playLines('listening');
      return;
    }
    if (target.matches('[data-reveal-transcript]')) {
      toggleTranscript(target);
      return;
    }
    if (target.matches('[data-section]')) {
      showSection(Number(target.dataset.section));
      return;
    }
    if (target.matches('[data-prev]') && currentIndex > 0) {
      showSection(currentIndex - 1);
      return;
    }
    if (target.matches('[data-next]') && currentIndex < SECTION_TOTAL - 1) {
      showSection(currentIndex + 1);
      return;
    }
    if (target.matches('[data-check-exercise]')) {
      const element = target.closest('[data-question]');
      const question = element ? questionIndex.get(element.dataset.question) : null;
      if (element && question) showPracticeFeedback(element, question);
      return;
    }
    if (target.matches('[data-token]')) {
      const builder = target.closest('[data-order]');
      if (!builder || builder.dataset.disabled === 'true') return;
      const answer = builder.querySelector('[data-order-answer]');
      const tokens = builder.querySelector('[data-order-tokens]');
      const inAnswer = target.closest('[data-order-answer]');
      if (inAnswer) tokens.append(target);
      else answer.append(target);
      const placeholder = answer.querySelector('.order-builder__placeholder');
      if (placeholder && answer.querySelector('[data-token]')) placeholder.remove();
      if (!answer.querySelector('[data-token]') && !placeholder) {
        answer.innerHTML = '<span class="order-builder__placeholder">Click the words below in the correct order.</span>';
      }
      return;
    }
    if (target.matches('[data-order-clear]')) {
      const builder = target.closest('[data-order]');
      if (!builder) return;
      const answer = builder.querySelector('[data-order-answer]');
      const tokens = builder.querySelector('[data-order-tokens]');
      for (const token of [...answer.querySelectorAll('[data-token]')]) tokens.append(token);
      answer.innerHTML = '<span class="order-builder__placeholder">Click the words below in the correct order.</span>';
      return;
    }
    if (target.matches('[data-retake]')) {
      showSection(16, { focus: true, persist: false });
      return;
    }
  });

  page.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-assessment-form]');
    if (!form) return;
    event.preventDefault();
    submitAssessment(form);
  });

  showSection(currentIndex, { focus: false, persist: false });
}
