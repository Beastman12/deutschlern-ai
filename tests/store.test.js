/**
 * Milestone 9 — client state hardening.
 *
 * `normalizeState` is the trust boundary for localStorage and server sync.
 * Corrupt, stale or hostile payloads must degrade to safe defaults, keep the
 * schema version honest, bound every growing list and never invent progress.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSyncMeta,
  DEFAULT_STATE,
  getSyncMeta,
  normalizeState,
  updateSyncMeta,
} from '../frontend/js/store.js';

// Offline storage stub so sync-meta coercion can be exercised deterministically.
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

test('non-object input always yields a fresh default state at schema 7', () => {
  for (const bad of [null, undefined, 'corrupt', 42, true, ['a', 'b']]) {
    const state = normalizeState(bad);
    assert.equal(state.version, 7);
    assert.deepEqual(state.profile, DEFAULT_STATE.profile);
    assert.deepEqual(state.progress.completedLessons, {});
    assert.deepEqual(state.progress.practiceAttempts, []);
    assert.deepEqual(state.progress.writingDrafts, {});
    assert.deepEqual(state.progress.skills, DEFAULT_STATE.progress.skills);
  }
});

test('the schema version is forced to 7 regardless of stored value', () => {
  assert.equal(normalizeState({ version: 1 }).version, 7);
  assert.equal(normalizeState({ version: 999 }).version, 7);
  assert.equal(normalizeState({ version: 'x' }).version, 7);
});

test('profile defaults are merged without dropping unknown safe fields', () => {
  const state = normalizeState({ profile: { name: 'Anna', targetLevel: 'c1' } });
  assert.equal(state.profile.name, 'Anna');
  assert.equal(state.profile.targetLevel, 'c1');
  assert.equal(state.profile.nativeLanguage, DEFAULT_STATE.profile.nativeLanguage);
  assert.equal(state.profile.learningGoal, DEFAULT_STATE.profile.learningGoal);
});

test('wrong-type progress containers are replaced with empty safe defaults', () => {
  const state = normalizeState({
    progress: {
      completedLessons: ['not', 'an', 'object'],
      lessonSessions: 7,
      grammarDrills: null,
      flashcards: 'nope',
      examActive: [],
      skills: 'broken',
      quizAttempts: { not: 'an array' },
      favoriteWords: 'abc',
      studyLog: [1, 2, 3],
    },
  });
  assert.deepEqual(state.progress.completedLessons, {});
  assert.deepEqual(state.progress.lessonSessions, {});
  assert.deepEqual(state.progress.grammarDrills, {});
  assert.deepEqual(state.progress.flashcards, {});
  assert.deepEqual(state.progress.examActive, {});
  assert.deepEqual(state.progress.skills, DEFAULT_STATE.progress.skills);
  assert.deepEqual(state.progress.quizAttempts, []);
  assert.deepEqual(state.progress.favoriteWords, []);
  assert.deepEqual(state.progress.studyLog, {});
});

test('invalid array entries are dropped instead of being trusted', () => {
  const state = normalizeState({
    progress: {
      practiceAttempts: [
        null,
        'garbage',
        { id: 'missing-date' },
        { date: '2026-01-01T00:00:00.000Z' },
        { id: 'ok', date: '2026-01-02T00:00:00.000Z', total: 10, correct: 12 },
      ],
      grammarMistakes: [{}, { topicId: 't' }, { topicId: 't', drillId: 'd' }],
      flashcardLog: [{ cardId: 'c', grade: 'impossible' }, { cardId: 'c', grade: 'good' }],
      speakingAttempts: [
        { text: 'no id or date' },
        { id: 's', date: '2026-01-01T00:00:00.000Z', transcript: 'Hallo' },
      ],
    },
  });
  assert.equal(state.progress.practiceAttempts.length, 1);
  assert.equal(state.progress.practiceAttempts[0].id, 'ok');
  assert.equal(state.progress.practiceAttempts[0].correct, 10, 'correct must be clamped to total');
  assert.equal(state.progress.grammarMistakes.length, 0);
  assert.equal(state.progress.flashcardLog.length, 1);
  assert.equal(state.progress.speakingAttempts.length, 1);
});

test('completion records need a real boolean pass, not a truthy leftover', () => {
  const state = normalizeState({
    progress: {
      completedLessons: {
        'lesson-true': { passed: true },
        'lesson-false': { passed: false },
        'lesson-string': { passed: 'false' },
        'lesson-one': { passed: 1 },
        'lesson-legacy': true,
      },
    },
  });
  assert.equal(state.progress.completedLessons['lesson-true'].passed, true);
  assert.equal(state.progress.completedLessons['lesson-false'].passed, false);
  assert.equal(state.progress.completedLessons['lesson-string'].passed, false);
  assert.equal(state.progress.completedLessons['lesson-one'].passed, false);
  assert.equal(state.progress.completedLessons['lesson-legacy'].passed, true);
});

test('bounded lists keep the newest entries within their documented caps', () => {
  const attempts = Array.from({ length: 140 }, (_, index) => ({
    id: `a-${index}`,
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const mistakes = Array.from({ length: 260 }, (_, index) => ({
    topicId: 't', drillId: 'd', prompt: `p-${index}`,
  }));
  const examAttempts = Array.from({ length: 70 }, (_, index) => ({
    id: `e-${index}`,
    level: 'b1',
    completedAt: '2026-01-01T00:00:00.000Z',
  }));
  const state = normalizeState({
    progress: { practiceAttempts: attempts, grammarMistakes: mistakes, examAttempts },
  });
  assert.equal(state.progress.practiceAttempts.length, 100);
  assert.equal(state.progress.grammarMistakes.length, 200);
  assert.equal(state.progress.examAttempts.length, 50);
  assert.equal(state.progress.practiceAttempts.at(-1).id, 'a-139');
});

test('writing drafts are limited to the 24 most recently updated entries', () => {
  const drafts = {};
  for (let index = 0; index < 40; index += 1) {
    drafts[`task-${index}`] = {
      text: `Draft ${index}`,
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    };
  }
  const state = normalizeState({ progress: { writingDrafts: drafts } });
  const ids = Object.keys(state.progress.writingDrafts);
  assert.equal(ids.length, 24);
  assert.ok(ids.includes('task-39'), 'newest draft must survive');
  assert.ok(!ids.includes('task-0'), 'oldest draft must be dropped');
});

test('writing drafts with empty or non-object bodies are discarded', () => {
  const state = normalizeState({
    progress: {
      writingDrafts: {
        empty: { text: '   ', updatedAt: '2026-01-01T00:00:00.000Z' },
        broken: 'not an object',
        valid: { text: 'Mein Text', updatedAt: '2026-01-02T00:00:00.000Z' },
      },
    },
  });
  assert.deepEqual(Object.keys(state.progress.writingDrafts), ['valid']);
  assert.equal(state.progress.writingDrafts.valid.text, 'Mein Text');
});

test('normalization never mutates the caller payload or the shared defaults', () => {
  const payload = { progress: { practiceAttempts: [{ id: 'x', date: '2026-01-01T00:00:00.000Z' }] } };
  const snapshot = JSON.stringify(payload);
  const state = normalizeState(payload);
  assert.equal(JSON.stringify(payload), snapshot);
  state.progress.skills.reading = 99;
  assert.equal(DEFAULT_STATE.progress.skills.reading, 0);
});

test('quizAttempts are validated, clamped and capped instead of crashing views', () => {
  const attempts = Array.from({ length: 320 }, (_, index) => ({
    id: `q-${index}`,
    lessonId: `lesson-${index}`,
    date: '2026-01-01T00:00:00.000Z',
  }));
  const state = normalizeState({
    progress: {
      quizAttempts: [
        null,
        'garbage',
        {},
        { id: 'missing-lesson', date: '2026-01-01T00:00:00.000Z' },
        ...attempts,
      ],
    },
  });
  assert.equal(state.progress.quizAttempts.length, 300);
  assert.ok(state.progress.quizAttempts.every((attempt) => attempt && typeof attempt.id === 'string'));
  assert.equal(state.progress.quizAttempts.at(-1).id, 'q-319');

  const clamped = normalizeState({
    progress: {
      quizAttempts: [{
        id: 'ok',
        lessonId: 'lesson-1',
        date: '2026-01-02T00:00:00.000Z',
        score: 14,
        total: 10,
        percent: 999,
        passScore: 400,
      }],
    },
  });
  const first = clamped.progress.quizAttempts[0];
  assert.equal(first.score, 10, 'score is clamped to total');
  assert.equal(first.percent, 100);
  assert.equal(first.passScore, 100);
  assert.equal(first.lessonId, 'lesson-1');
});

test('unsafe map keys are dropped, lists are de-duplicated and maps are bounded', () => {
  const completedLessons = {};
  for (let index = 0; index < 320; index += 1) completedLessons[`lesson-${index}`] = { passed: true };
  const payload = JSON.stringify({
    progress: {
      completedLessons: {
        __proto__: { passed: true },
        constructor: { passed: true },
        prototype: { passed: true },
        'lesson-ok': { passed: true },
      },
      flashcards: { __proto__: { reps: 1 }, 'v-ok': { reps: 1 } },
      studyLog: { __proto__: 999, '2026-01-01': '20.9', '2026-01-02': -5 },
      skills: { __proto__: 80, reading: '88.6', unknown: 99 },
      favoriteWords: ['a', 'a', 3, null, 'b'],
      learnedWords: ['x', 'x', 'y'],
    },
  });
  const state = normalizeState(JSON.parse(payload));
  assert.deepEqual(Object.keys(state.progress.completedLessons), ['lesson-ok']);
  assert.deepEqual(Object.keys(state.progress.flashcards), ['v-ok']);
  assert.equal({}.passed, undefined, 'prototype must not be polluted');
  assert.deepEqual(state.progress.studyLog, { '2026-01-01': 21 });
  assert.equal(state.progress.skills.reading, 89);
  assert.deepEqual(state.progress.skills, {
    reading: 89,
    listening: 0,
    speaking: 0,
    writing: 0,
    grammar: 0,
    vocabulary: 0,
  });
  assert.deepEqual(state.progress.favoriteWords, ['a', 'b']);
  assert.deepEqual(state.progress.learnedWords, ['x', 'y']);

  const capped = normalizeState({ progress: { completedLessons } });
  assert.equal(Object.keys(capped.progress.completedLessons).length, 300);
});

test('sync metadata coerces revision to a non-negative integer and keeps the owner', () => {
  clearSyncMeta();
  storage.set('dl:sync:v1', JSON.stringify({ revision: '7.9', accountId: 'u1', localOwner: 'u1' }));
  assert.equal(getSyncMeta().revision, 7);
  assert.equal(getSyncMeta().localOwner, 'u1');
  assert.equal(updateSyncMeta({ revision: -4 }).revision, 0);
  assert.equal(updateSyncMeta({ revision: 1.8 }).revision, 1);
  assert.equal(getSyncMeta().localOwner, 'u1', 'logout must not erase the owner');
  clearSyncMeta();
});
