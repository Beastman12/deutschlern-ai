/**
 * Unit tests for the spaced-repetition scheduler used by flashcards.
 *
 * The module is dependency-free, so it runs in Node exactly as it does in the
 * browser. Dates are passed explicitly to keep the tests deterministic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  FLASHCARD_GRADES,
  cardState,
  createCardRecord,
  describeCardDue,
  isCardDue,
  isCardLearned,
  normalizeCardRecord,
  pickSessionCards,
  scheduleCard,
  summariseDeck,
} from '../frontend/js/srs.js';

const NOW = new Date('2026-05-01T09:00:00.000Z');

const cards = [
  { id: 'v-apfel', de: 'der Apfel', level: 'a1' },
  { id: 'v-haus', de: 'das Haus', level: 'a1' },
  { id: 'deck-alphabet', de: 'das Alphabet', level: 'a1' },
  { id: 'deck-satz', de: 'der Satz', level: 'a2' },
];

test('a new card is due immediately and is not learned', () => {
  const record = createCardRecord(NOW);
  assert.equal(record.due, NOW.toISOString());
  assert.equal(record.reps, 0);
  assert.equal(record.reviews, 0);
  assert.equal(isCardDue(record, NOW), true);
  assert.equal(cardState(record, NOW), 'due');
  assert.equal(isCardLearned(record), false);
  assert.equal(cardState(null, NOW), 'new');
  assert.equal(describeCardDue(null, NOW), 'New card');
});

test('every grade advances the review count and schedules a valid date', () => {
  for (const grade of FLASHCARD_GRADES) {
    const next = scheduleCard(null, grade, NOW);
    assert.equal(next.reviews, 1);
    assert.equal(next.lastGrade, grade);
    assert.equal(next.lastReviewedAt, NOW.toISOString());
    assert.ok(next.ease >= 1.3 && next.ease <= 3.2, `${grade} produced an invalid ease`);
    assert.ok(!Number.isNaN(Date.parse(next.due)), `${grade} produced an invalid due date`);
  }
});

test('again keeps the card due now, records a lapse and lowers ease', () => {
  const next = scheduleCard(null, 'again', NOW);
  assert.equal(next.due, NOW.toISOString());
  assert.equal(next.intervalDays, 0);
  assert.equal(next.reps, 0);
  assert.equal(next.lapses, 1);
  assert.ok(next.ease < 2.5);
  assert.equal(isCardDue(next, NOW), true);
});

test('first reviews use short authored intervals', () => {
  assert.equal(scheduleCard(null, 'hard', NOW).intervalDays, 1);
  assert.equal(scheduleCard(null, 'good', NOW).intervalDays, 1);
  assert.equal(scheduleCard(null, 'easy', NOW).intervalDays, 4);
});

test('three good reviews produce a learned card', () => {
  const first = scheduleCard(null, 'good', NOW);
  const second = scheduleCard(first, 'good', new Date(NOW.getTime() + DAY_MS));
  const third = scheduleCard(second, 'good', new Date(NOW.getTime() + 4 * DAY_MS));

  assert.equal(first.intervalDays, 1);
  assert.equal(second.intervalDays, 3);
  assert.equal(third.reps, 3);
  assert.ok(third.intervalDays >= 7);
  assert.equal(isCardLearned(third), true);
  assert.equal(cardState(third, NOW), 'scheduled');
  assert.equal(describeCardDue(third, NOW).startsWith('Due in'), true);
});

test('hard reviews grow more slowly than easy reviews', () => {
  const base = { ...createCardRecord(NOW), reps: 2, intervalDays: 10, ease: 2.5 };
  const hard = scheduleCard(base, 'hard', NOW);
  const good = scheduleCard(base, 'good', NOW);
  const easy = scheduleCard(base, 'easy', NOW);

  assert.ok(hard.intervalDays < good.intervalDays);
  assert.ok(good.intervalDays < easy.intervalDays);
  assert.ok(hard.ease < good.ease);
  assert.ok(easy.ease > good.ease);
});

test('the scheduler clamps hostile stored values', () => {
  const normalized = normalizeCardRecord(
    { due: 'not-a-date', intervalDays: 9999, ease: 99, reps: -3, reviews: 'x', lastGrade: 'nope' },
    NOW,
  );
  assert.equal(normalized.due, NOW.toISOString());
  assert.equal(normalized.intervalDays, 365);
  assert.equal(normalized.ease, 3.2);
  assert.equal(normalized.reps, 0);
  assert.equal(normalized.reviews, 0);
  assert.equal(normalized.lastGrade, null);
  assert.equal(normalizeCardRecord('broken'), null);
});

test('describeCardDue reports due now, tomorrow and further out', () => {
  assert.equal(describeCardDue(null, NOW), 'New card');
  assert.equal(describeCardDue({ due: NOW.toISOString() }, NOW), 'Due now');
  assert.equal(describeCardDue({ due: new Date(NOW.getTime() + DAY_MS).toISOString() }, NOW), 'Due tomorrow');
  assert.equal(describeCardDue({ due: new Date(NOW.getTime() + 5 * DAY_MS).toISOString() }, NOW), 'Due in 5 days');
});

test('describeCardDue shows hours and minutes for sub-day gaps', () => {
  assert.equal(describeCardDue({ due: new Date(NOW.getTime() + 30 * 60_000).toISOString() }, NOW), 'Due in 30 minutes');
  assert.equal(describeCardDue({ due: new Date(NOW.getTime() + 2 * 60 * 60_000).toISOString() }, NOW), 'Due in 2 hours');
  assert.equal(describeCardDue({ due: new Date(NOW.getTime() + DAY_MS).toISOString() }, NOW), 'Due tomorrow');
  assert.equal(describeCardDue({ due: new Date(NOW.getTime() + 5 * DAY_MS).toISOString() }, NOW), 'Due in 5 days');
});

test('pickSessionCards mixes due cards before new cards and respects the level', () => {
  const records = {
    'v-apfel': { ...createCardRecord(NOW), due: new Date(NOW.getTime() - DAY_MS).toISOString() },
    'v-haus': { ...createCardRecord(NOW), due: new Date(NOW.getTime() + 3 * DAY_MS).toISOString(), reps: 2, intervalDays: 3 },
  };

  const mixed = pickSessionCards(cards, records, { limit: 3, now: NOW });
  assert.deepEqual(
    mixed.map((card) => card.id),
    ['v-apfel', 'deck-alphabet', 'deck-satz'],
  );

  const a1 = pickSessionCards(cards, records, { limit: 10, level: 'a1', now: NOW });
  assert.ok(a1.every((card) => card.level === 'a1'));

  const fresh = pickSessionCards(cards, records, { limit: 10, scope: 'new', now: NOW });
  assert.ok(fresh.every((card) => card.id !== 'v-apfel' && card.id !== 'v-haus'));

  const all = pickSessionCards(cards, records, { limit: 10, scope: 'all', now: NOW });
  assert.equal(all.length, cards.length);
  assert.equal(all[0].id, 'v-apfel');
});

test('summariseDeck separates new, due, scheduled and learned cards', () => {
  const records = {
    'v-apfel': { ...createCardRecord(NOW), due: new Date(NOW.getTime() - DAY_MS).toISOString() },
    'v-haus': {
      ...createCardRecord(NOW),
      due: new Date(NOW.getTime() + 10 * DAY_MS).toISOString(),
      reps: 3,
      intervalDays: 10,
    },
  };

  const summary = summariseDeck(cards, records, NOW);
  assert.deepEqual(summary, { total: 4, fresh: 2, due: 1, scheduled: 1, learned: 1 });
});
