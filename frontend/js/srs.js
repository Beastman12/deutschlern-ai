/**
 * Spaced repetition for vocabulary flashcards.
 *
 * The scheduler is deliberately small, deterministic and dependency-free so it
 * can be shared by the browser store and the Node test suite. It uses an
 * SM-2-style ease factor with four grades: again, hard, good and easy.
 */

export const FLASHCARD_GRADES = ['again', 'hard', 'good', 'easy'];

export const DAY_MS = 86_400_000;

const MIN_EASE = 1.3;
const MAX_EASE = 3.2;
const MAX_INTERVAL = 365;

export function createCardRecord(now = new Date()) {
  return {
    due: now.toISOString(),
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    reviews: 0,
    lastReviewedAt: null,
    lastGrade: null,
  };
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Normalise a stored record without trusting it. */
export function normalizeCardRecord(record, now = new Date()) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const due = record.due && !Number.isNaN(new Date(record.due).getTime()) ? new Date(record.due).toISOString() : now.toISOString();
  return {
    due,
    intervalDays: clamp(numberOr(record.intervalDays, 0), 0, MAX_INTERVAL),
    ease: clamp(numberOr(record.ease, 2.5), MIN_EASE, MAX_EASE),
    reps: Math.max(0, Math.round(numberOr(record.reps, 0))),
    lapses: Math.max(0, Math.round(numberOr(record.lapses, 0))),
    reviews: Math.max(0, Math.round(numberOr(record.reviews, 0))),
    lastReviewedAt:
      record.lastReviewedAt && !Number.isNaN(new Date(record.lastReviewedAt).getTime())
        ? new Date(record.lastReviewedAt).toISOString()
        : null,
    lastGrade: FLASHCARD_GRADES.includes(record.lastGrade) ? record.lastGrade : null,
  };
}

/**
 * Apply one review grade.
 * - again: the card is due immediately, ease drops and the lapse counter rises.
 * - hard: a short interval, a small ease penalty.
 * - good: the standard interval.
 * - easy: a longer interval and a small ease bonus.
 */
export function scheduleCard(record, grade, now = new Date()) {
  if (!FLASHCARD_GRADES.includes(grade)) {
    throw new Error(`Unknown flashcard grade "${grade}".`);
  }

  const current = normalizeCardRecord(record, now) || createCardRecord(now);
  const next = {
    ...current,
    reviews: current.reviews + 1,
    lastReviewedAt: now.toISOString(),
    lastGrade: grade,
    lapses: current.lapses + (grade === 'again' ? 1 : 0),
  };

  if (grade === 'again') {
    next.intervalDays = 0;
    next.ease = Math.max(MIN_EASE, current.ease - 0.2);
    next.due = now.toISOString();
    return next;
  }

  let interval;
  if (current.reps === 0) {
    interval = grade === 'hard' ? 1 : grade === 'good' ? 1 : 4;
  } else if (grade === 'hard') {
    interval = Math.max(1, Math.round(current.intervalDays * 1.2));
  } else if (grade === 'good') {
    interval = Math.max(2, Math.round(current.intervalDays * current.ease));
  } else {
    interval = Math.max(3, Math.round(current.intervalDays * current.ease * 1.3));
  }

  next.reps = current.reps + 1;
  next.intervalDays = clamp(interval, 1, MAX_INTERVAL);
  next.ease = clamp(
    current.ease + (grade === 'hard' ? -0.15 : grade === 'easy' ? 0.15 : 0),
    MIN_EASE,
    MAX_EASE,
  );
  next.due = new Date(now.getTime() + next.intervalDays * DAY_MS).toISOString();
  return next;
}

/** A card is "learned" once it has survived three reviews or a one-week gap. */
export function isCardLearned(record) {
  const normalized = normalizeCardRecord(record);
  if (!normalized) return false;
  return normalized.reps >= 3 || normalized.intervalDays >= 7;
}

export function isCardDue(record, now = new Date()) {
  const normalized = normalizeCardRecord(record, now);
  if (!normalized) return false;
  return new Date(normalized.due).getTime() <= now.getTime();
}

/** "new" | "due" | "scheduled" — the three states a deck card can be in. */
export function cardState(record, now = new Date()) {
  const normalized = normalizeCardRecord(record, now);
  if (!normalized) return 'new';
  return isCardDue(normalized, now) ? 'due' : 'scheduled';
}

export function describeCardDue(record, now = new Date()) {
  const normalized = normalizeCardRecord(record, now);
  if (!normalized) return 'New card';
  if (isCardDue(normalized, now)) return 'Due now';
  const remaining = new Date(normalized.due).getTime() - now.getTime();
  if (remaining < DAY_MS) {
    // Sub-day gaps deserve a finer label than "tomorrow".
    const minutes = Math.max(1, Math.ceil(remaining / 60_000));
    if (minutes < 60) return `Due in ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.ceil(minutes / 60);
    return `Due in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.ceil(remaining / DAY_MS);
  if (days <= 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/**
 * Pick a review session.
 *
 * `scope`:
 * - `mixed` (default): due cards first, then new cards.
 * - `new`: unseen cards only.
 * - `all`: due, then new, then scheduled cards brought forward.
 *
 * Cards keep their deck order inside each bucket, so a session is stable and
 * the same deck always produces the same queue on the same day.
 */
export function pickSessionCards(cards, records = {}, { limit = 15, level = 'all', scope = 'mixed', now = new Date() } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Math.round(Number(limit) || 15)));
  const pool = cards.filter((card) => level === 'all' || card.level === level);

  const due = [];
  const fresh = [];
  const scheduled = [];

  for (const card of pool) {
    const record = records[card.id] || null;
    const state = cardState(record, now);
    if (state === 'new') fresh.push(card);
    else if (state === 'due') due.push({ card, due: new Date(record.due).getTime() });
    else scheduled.push({ card, due: new Date(record.due).getTime() });
  }

  due.sort((a, b) => a.due - b.due);
  scheduled.sort((a, b) => a.due - b.due);

  const ordered = [];
  if (scope === 'new') {
    ordered.push(...fresh);
  } else if (scope === 'all') {
    ordered.push(...due.map((item) => item.card), ...fresh, ...scheduled.map((item) => item.card));
  } else {
    ordered.push(...due.map((item) => item.card), ...fresh);
  }

  return ordered.slice(0, safeLimit);
}

/** Deck-level counters used by the vocabulary screen. */
export function summariseDeck(cards, records = {}, now = new Date()) {
  let fresh = 0;
  let due = 0;
  let scheduled = 0;
  let learned = 0;

  for (const card of cards) {
    const record = records[card.id] || null;
    const state = cardState(record, now);
    if (state === 'new') fresh += 1;
    else if (state === 'due') due += 1;
    else scheduled += 1;
    if (isCardLearned(record)) learned += 1;
  }

  return { total: cards.length, fresh, due, scheduled, learned };
}
