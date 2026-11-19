/**
 * Pure tests for mock-exam selection, scoring and readiness reporting.
 *
 * The exam module shares these functions with the browser; no DOM or server is
 * involved, so an incorrect score cannot hide behind UI behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXAM_DURATION_MINUTES,
  EXAM_SECTIONS,
  EXAM_TOTAL_QUESTIONS,
  PASS_PERCENT,
  buildExam,
  hasAnswer,
  isAnswerCorrect,
  normaliseGiven,
  readinessReport,
  scoreExam,
  selectPrompt,
} from '../frontend/js/exam.js';
import { EXAM_REMAINING_KEY, remainingMsFromActive } from '../frontend/js/exams.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'exercise-bank.json'), 'utf8')).questions;
const prompts = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'exercise-bank.json'), 'utf8')).prompts;

const questions = [
  {
    id: 'q-mcq',
    type: 'mcq',
    skill: 'reading',
    examSection: 'reading',
    prompt: 'Which word means “house”?',
    options: ['Haus', 'Hund', 'Buch'],
    answer: 0,
    explanation: 'Haus means house.',
  },
  {
    id: 'q-gap',
    type: 'gap',
    skill: 'vocabulary',
    examSection: 'vocabulary',
    prompt: 'Das ___ ist groß.',
    answers: ['Haus'],
    explanation: 'das Haus.',
  },
  {
    id: 'q-order',
    type: 'order',
    skill: 'grammar',
    examSection: 'grammar',
    prompt: 'Build the sentence.',
    tokens: ['geht', 'Wie', 'es'],
    answer: 'Wie geht es?',
    explanation: 'Question word first.',
  },
];

test('exam configuration covers scored skills only and provides level timings', () => {
  assert.equal(EXAM_TOTAL_QUESTIONS, 14);
  assert.deepEqual(
    EXAM_SECTIONS.map((section) => section.skill),
    ['reading', 'listening', 'vocabulary', 'grammar'],
  );
  assert.equal(PASS_PERCENT, 70);
  for (const level of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
    assert.ok(EXAM_DURATION_MINUTES[level] >= 25);
  }
});

test('buildExam samples the authored bank by section without repeating questions', () => {
  const exam = buildExam({ bank, level: 'a1', seed: 'fixed-seed' });
  assert.equal(exam.questions.length, EXAM_TOTAL_QUESTIONS);
  assert.equal(new Set(exam.questions.map((question) => question.id)).size, EXAM_TOTAL_QUESTIONS);

  for (const section of EXAM_SECTIONS) {
    const picked = exam.questions.filter((question) => question.examSection === section.id);
    assert.equal(picked.length, section.count);
    assert.ok(picked.every((question) => question.level === 'a1' && question.skill === section.skill));
  }

  const again = buildExam({ bank, level: 'a1', seed: 'fixed-seed' });
  assert.deepEqual(
    exam.questions.map((question) => question.id),
    again.questions.map((question) => question.id),
  );

  const changed = buildExam({ bank, level: 'a1', seed: 'different-seed' });
  assert.notDeepEqual(
    exam.questions.map((question) => question.id),
    changed.questions.map((question) => question.id),
  );
});

test('buildExam works for every CEFR level', () => {
  for (const level of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
    const exam = buildExam({ bank, level, seed: `level-${level}` });
    assert.equal(exam.questions.length, EXAM_TOTAL_QUESTIONS, `${level} has an incomplete exam`);
  }
});

test('answer normalisation accepts authored answer formats', () => {
  assert.equal(normaliseGiven(questions[0], '1'), 1);
  assert.equal(normaliseGiven(questions[0], 'Haus'), 0);
  assert.equal(normaliseGiven(questions[0], 'unknown'), -1);
  assert.equal(hasAnswer(questions[0], null), false);
  assert.equal(hasAnswer(questions[0], 0), true);
  assert.equal(isAnswerCorrect(questions[0], 0), true);
  assert.equal(isAnswerCorrect(questions[0], 1), false);
  assert.equal(isAnswerCorrect(questions[1], 'haus.'), true);
  assert.equal(isAnswerCorrect(questions[2], [1, 0, 2]), true);
  assert.equal(isAnswerCorrect(questions[2], ['Wie', 'geht', 'es']), true);
});

test('scoreExam returns section and skill scores without revealing answers', () => {
  const score = scoreExam({
    questions,
    answers: {
      'q-mcq': 0,
      'q-gap': 'falsch',
      'q-order': [1, 0, 2],
    },
  });

  assert.equal(score.total, 3);
  assert.equal(score.correct, 2);
  assert.equal(score.answered, 3);
  assert.equal(score.percent, 67);
  assert.equal(score.passed, false);
  assert.deepEqual(score.sections.reading, { correct: 1, total: 1, answered: 1, percent: 100 });
  assert.deepEqual(score.sections.vocabulary, { correct: 0, total: 1, answered: 1, percent: 0 });
  assert.deepEqual(score.skills.grammar, { correct: 1, total: 1, answered: 1, percent: 100 });

  const serialized = JSON.stringify(score);
  assert.ok(!serialized.includes('Haus'), 'scored result must not reveal the gap answer');
  assert.ok(!serialized.includes('Wie geht es'), 'scored result must not reveal the order answer');
});

test('selectPrompt picks one authored writing or speaking prompt', () => {
  const writing = selectPrompt({ prompts, level: 'b1', skill: 'writing', seed: 'prompt-test' });
  assert.ok(writing);
  assert.equal(writing.level, 'b1');
  assert.equal(writing.skill, 'writing');
  assert.ok(writing.checklist.length >= 3);

  const speaking = selectPrompt({ prompts, level: 'b1', skill: 'speaking', seed: 'prompt-test' });
  assert.equal(speaking?.skill, 'speaking');
  assert.ok(speaking.model.de);
});

test('readinessReport ignores unsubmitted attempts and never scores writing or speaking', () => {
  const progress = {
    completedLessons: {
      'a1-m1-l1': { passed: true },
      'a1-m1-l2': { passed: true },
    },
    grammarDrills: {
      'a1-sein-haben': { correct: 8, total: 10, attempts: 2 },
    },
    flashcards: {
      'v-apfel': { reps: 3, intervalDays: 7 },
    },
    examAttempts: [
      {
        id: 'running',
        level: 'a1',
        status: 'active',
        completedAt: null,
        sections: {},
      },
    ],
  };

  const empty = readinessReport({ level: 'a1', bank, prompts, deck: [], progress });
  assert.equal(empty.status, 'no-exam-evidence');
  assert.equal(empty.overall, null);
  assert.equal(empty.attempts, 0);
  assert.deepEqual(empty.unassessed, ['writing', 'speaking']);
  assert.equal(empty.skills.writing.percent, null);
  assert.equal(empty.skills.writing.assessed, false);
  assert.equal(empty.skills.speaking.percent, null);
  assert.equal(empty.skills.speaking.assessed, false);
  assert.equal(empty.evidence.lessons.completed, 2);

  const submitted = {
    ...progress,
    examAttempts: [
      ...progress.examAttempts,
      {
        id: 'done',
        level: 'a1',
        status: 'submitted',
        completedAt: '2026-05-02T10:00:00.000Z',
        sections: {
          reading: { percent: 75 },
          listening: { percent: 80 },
          vocabulary: { percent: 85 },
          grammar: { percent: 90 },
        },
      },
    ],
  };
  const report = readinessReport({
    level: 'a1',
    bank,
    prompts,
    deck: [{ id: 'v-apfel', level: 'a1' }],
    progress: submitted,
  });
  assert.equal(report.status, 'ready');
  assert.equal(report.overall, 83);
  assert.equal(report.attempts, 1);
  assert.equal(report.skills.listening.percent, 80);
  assert.equal(report.skills.writing.percent, null);
  assert.equal(report.skills.speaking.percent, null);
  assert.equal(report.evidence.flashcards.learned, 1);
  assert.equal(report.evidence.drills.accuracy, 80);
});

test('resuming a paper restores saved remaining time instead of a stale startedAt deadline', () => {
  const full = 30 * 60_000;
  const active = {
    id: 'exam-1',
    level: 'a1',
    // Historical metadata only: an old timestamp must not expire the paper.
    startedAt: '2020-01-01T00:00:00.000Z',
    durationMinutes: 30,
    answers: {},
  };

  assert.equal(remainingMsFromActive(active), full, 'legacy papers start with a full clock');
  assert.equal(
    remainingMsFromActive({ ...active, answers: { [EXAM_REMAINING_KEY]: 123_456 } }),
    123_456,
  );
  assert.equal(remainingMsFromActive({ ...active, answers: { [EXAM_REMAINING_KEY]: 0 } }), 0);

  // A missing, malformed or out-of-range value must not fabricate an expiry.
  assert.equal(remainingMsFromActive({ ...active, answers: { [EXAM_REMAINING_KEY]: null } }), full);
  assert.equal(remainingMsFromActive({ ...active, answers: { [EXAM_REMAINING_KEY]: '' } }), full);
  assert.equal(remainingMsFromActive({ ...active, answers: { [EXAM_REMAINING_KEY]: 'nope' } }), full);
  assert.equal(remainingMsFromActive({ ...active, answers: { [EXAM_REMAINING_KEY]: -5 } }), full);
  assert.equal(remainingMsFromActive({ ...active, answers: { [EXAM_REMAINING_KEY]: full + 1000 } }), full);
});
