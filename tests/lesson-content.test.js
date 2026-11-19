/**
 * Lesson-body invariants. Runs with `npm test`.
 *
 * Every curriculum lesson must have exactly one content file, and every file
 * must satisfy the seventeen-section contract in tests/checks/lesson-checks.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLessonContent, SECTION_TYPES } from './checks/lesson-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const LESSON_DIR = path.join(CONTENT, 'lessons');
const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const courses = Object.fromEntries(
  LEVELS.map((levelId) => [levelId, readJson(path.join(CONTENT, levelId, 'course.json'))]),
);

const curriculumLessons = [];
for (const levelId of LEVELS) {
  for (const module of courses[levelId].modules) {
    for (const lesson of module.lessons) {
      curriculumLessons.push({ lesson, module, levelId });
    }
  }
}

const files = fs.existsSync(LESSON_DIR)
  ? fs.readdirSync(LESSON_DIR).filter((name) => name.endsWith('.json')).sort()
  : [];

test('every curriculum lesson has one lesson body', () => {
  assert.equal(curriculumLessons.length, 72, 'the curriculum should still contain 72 lessons');
  const fileIds = new Set(files.map((name) => path.basename(name, '.json')));
  const missing = curriculumLessons.filter(({ lesson }) => !fileIds.has(lesson.id)).map(({ lesson }) => lesson.id);
  const extras = [...fileIds].filter((id) => !curriculumLessons.some(({ lesson }) => lesson.id === id));
  assert.deepEqual(missing, [], `missing lesson bodies: ${missing.join(', ')}`);
  assert.deepEqual(extras, [], `lesson bodies without a curriculum lesson: ${extras.join(', ')}`);
  assert.equal(files.length, 72);
});

test('every lesson body follows the seventeen-section contract', () => {
  const problems = [];
  for (const name of files) {
    const doc = readJson(path.join(LESSON_DIR, name));
    const meta = curriculumLessons.find(({ lesson }) => lesson.id === doc.id);
    if (!meta) continue;
    const errors = validateLessonContent(doc, meta);
    if (errors.length) problems.push(`${name}: ${errors.join(' | ')}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('lesson sections use the documented order and positive durations', () => {
  for (const name of files) {
    const doc = readJson(path.join(LESSON_DIR, name));
    assert.deepEqual(
      doc.sections.map((section) => section.type),
      SECTION_TYPES,
      `${name} has the wrong section order`,
    );
    const totalMinutes = doc.sections.reduce((sum, section) => sum + section.minutes, 0);
    assert.ok(totalMinutes >= 20 && totalMinutes <= 120, `${name} has an implausible duration (${totalMinutes} min)`);
  }
});

test('assessments match the curriculum question count and mix question types', () => {
  for (const name of files) {
    const doc = readJson(path.join(LESSON_DIR, name));
    const meta = curriculumLessons.find(({ lesson }) => lesson.id === doc.id);
    const assessment = doc.sections[16];
    assert.equal(assessment.type, 'assessment');
    assert.equal(assessment.questions.length, meta.lesson.assessment.questions, `${name} question count`);
    assert.equal(assessment.passScore, meta.lesson.assessment.passScore, `${name} pass score`);
    const types = new Set(assessment.questions.map((question) => question.type));
    assert.ok(types.size >= 2, `${name} should mix question types`);
    for (const question of assessment.questions) {
      if (question.type === 'mcq') {
        assert.ok(question.options[question.answer], `${name}/${question.id} has an invalid answer index`);
      }
    }
  }
});

test('practice sections provide enough active recall', () => {
  for (const name of files) {
    const doc = readJson(path.join(LESSON_DIR, name));
    const mcq = doc.sections.find((section) => section.type === 'mcq');
    const gap = doc.sections.find((section) => section.type === 'gap');
    const order = doc.sections.find((section) => section.type === 'order');
    assert.ok(mcq.exercises.length >= 4, `${name} needs at least four MCQs`);
    assert.ok(gap.exercises.length >= 4, `${name} needs at least four gap fills`);
    assert.ok(order.exercises.length >= 3, `${name} needs at least three sentence-building tasks`);
  }
});

test('word-order exercises are buildable from their tokens', () => {
  const strip = (value) =>
    String(value)
      .toLocaleLowerCase('de-DE')
      .normalize('NFC')
      .replace(/[.,!?;:„“”"]/g, '');
  const bag = (words) =>
    words
      .map(strip)
      .filter(Boolean)
      .sort()
      .join('|');

  const problems = [];
  for (const name of files) {
    const doc = readJson(path.join(LESSON_DIR, name));
    for (const section of doc.sections) {
      for (const question of section.exercises || section.questions || []) {
        if (question.type !== 'order') continue;
        if (bag(String(question.answer).split(/\s+/)) !== bag(question.tokens)) {
          problems.push(`${name}/${question.id}: tokens cannot form the answer`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
