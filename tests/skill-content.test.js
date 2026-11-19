/**
 * Milestone 8 — pure skill content, writing checklist and analytics tests.
 *
 * These modules have no DOM dependency, so every figure and rule can be
 * verified in Node before a browser ever renders it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSkillIndex,
  findSkillTask,
  getSkillTasks,
  skillInventory,
  validateSkillPractice,
} from '../frontend/js/skill-content.js';
import {
  countSentences,
  countWords,
  evaluateWriting,
  FEEDBACK_LABEL,
  normalizeWritingText,
  writingResultToDetails,
} from '../frontend/js/writing-feedback.js';
import { buildAnalyticsReport, getSkillAttempts, getTaskHistory } from '../frontend/js/analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'skill-practice.json'), 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('the authored skill file satisfies the full content contract', () => {
  assert.deepEqual(validateSkillPractice(doc), []);
  const index = createSkillIndex(doc);
  assert.equal(index.tasks.length, 36);
  assert.deepEqual(skillInventory(index), {
    reading: 12,
    listening: 12,
    writing: 12,
    levels: 6,
  });
  for (const level of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
    assert.equal(getSkillTasks(index, { skill: 'reading', level }).length, 2);
    assert.equal(getSkillTasks(index, { skill: 'listening', level }).length, 2);
    assert.equal(getSkillTasks(index, { skill: 'writing', level }).length, 2);
  }
  assert.equal(findSkillTask(index, doc.tasks[0].id), doc.tasks[0]);
  assert.equal(findSkillTask(index, 'does-not-exist'), null);
  assert.deepEqual(getSkillTasks(index, { skill: 'unknown' }), []);
});

test('every listening dictation target matches an exact spoken sentence', () => {
  // Same whitespace normalisation the authoring builder applies to every line.
  const normalize = (value) => String(value).replace(/\s+/g, ' ').trim();
  // The authored script is split into sentences; an em dash starts a new
  // speaker turn and therefore a new sentence. This is the documented
  // normalized form that every dictation answer must match exactly.
  const spokenSentences = (lines) =>
    lines.flatMap((line) =>
      normalize(line)
        .split(/(?<=[.!?])\s*(?:—\s*)?/)
        .map(normalize)
        .filter(Boolean),
    );

  const listening = doc.tasks.filter((task) => task.skill === 'listening');
  assert.equal(listening.length, 12);
  let checked = 0;
  for (const task of listening) {
    const spoken = new Set(spokenSentences(task.lines));
    assert.ok(spoken.size > 0, `${task.id} has no spoken sentences`);
    for (const item of task.dictation) {
      const expected = normalize(item.text);
      assert.ok(
        spoken.has(expected),
        `${item.id} expects "${expected}", which is not an exact spoken sentence in ${task.id}`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 24);
});

test('the skill validator rejects broken counts, missing content and duplicate ids', () => {
  const missingTask = clone(doc);
  missingTask.tasks.pop();
  assert.ok(validateSkillPractice(missingTask).some((error) => error.includes('Expected 12 writing tasks, found 11')));

  const duplicate = clone(doc);
  duplicate.tasks[1].id = duplicate.tasks[0].id;
  assert.ok(validateSkillPractice(duplicate).some((error) => error.includes('Duplicate skill task id')));

  const badQuestion = clone(doc);
  delete badQuestion.tasks[0].questions[0].explanation;
  assert.ok(validateSkillPractice(badQuestion).some((error) => error.includes('needs a prompt and an explanation')));

  const badWriting = clone(doc);
  badWriting.tasks.find((task) => task.skill === 'writing').checks = [];
  assert.ok(validateSkillPractice(badWriting).some((error) => error.includes('deterministic writing checks')));

  const badVersion = clone(doc);
  badVersion.schemaVersion = 2;
  assert.ok(validateSkillPractice(badVersion).some((error) => error.includes('schemaVersion 1')));
});

test('every authored writing model answer passes its own deterministic checks', () => {
  const writing = doc.tasks.filter((task) => task.skill === 'writing');
  assert.equal(writing.length, 12);
  for (const task of writing) {
    const result = evaluateWriting(task, task.modelAnswer.join(' '));
    assert.equal(result.complete, true, `${task.id} does not meet its own checks`);
    assert.equal(result.label, FEEDBACK_LABEL);
    assert.deepEqual(result.checks.map((check) => check.passed), result.checks.map(() => true));
    assert.equal(result.percent, 100);
    assert.equal(writingResultToDetails(result).length, result.total);
  }
});

test('writing text normalisation ignores case, punctuation and hyphens', () => {
  assert.equal(normalizeWritingText('Ich heiße Anna!'), 'ich heiße anna');
  assert.equal(countWords('Ich heiße Anna.'), 3);
  assert.equal(countWords('   '), 0);
  assert.equal(countSentences('Ersten Satz. Zweiten Satz! Dritten?'), 3);
  assert.equal(countSentences(''), 0);
});

test('writing feedback reports only the authored checks and never invents grammar advice', () => {
  const task = doc.tasks.find((entry) => entry.skill === 'writing');
  const result = evaluateWriting(task, 'Kurzer Text.');
  assert.equal(result.complete, false);
  assert.equal(result.taskId, task.id);
  assert.ok(result.checks.some((check) => !check.passed));
  for (const check of result.checks) {
    assert.ok(check.detail.length > 0);
    assert.ok(!/grammar score|AI/i.test(check.label));
  }
  assert.equal(result.label, FEEDBACK_LABEL);

  const prefixTask = doc.tasks.find((entry) => entry.id === 'write-a2-1');
  const prefixResult = evaluateWriting(prefixTask, prefixTask.modelAnswer.join(' '));
  assert.equal(prefixResult.complete, true, 'a final-word prefix match must satisfy an includes check');
});

test('analytics returns honest zeroes for a learner with no skill activity', () => {
  const index = createSkillIndex(doc);
  const report = buildAnalyticsReport({ progress: {} }, index);
  assert.equal(report.skillPractice.attempts, 0);
  assert.equal(report.skillPractice.authored, 36);
  assert.equal(report.skillPractice.practicedTasks, 0);
  assert.equal(report.skillPractice.accuracy, null);
  assert.equal(report.skillPractice.drafts, 0);
  assert.deepEqual(report.skillPractice.recent, []);
  for (const skill of ['reading', 'listening', 'writing']) {
    assert.equal(report.bySkill[skill].authored, 12);
    assert.equal(report.bySkill[skill].attempts, 0);
    assert.equal(report.bySkill[skill].accuracy, null);
  }
  for (const level of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
    assert.equal(report.byLevel[level].authored, 6);
  }
});

test('analytics derives figures only from saved attempts and bounded drafts', () => {
  const index = createSkillIndex(doc);
  const state = {
    progress: {
      skillAttempts: [
        {
          id: 'skill-1',
          date: '2026-11-01T10:00:00.000Z',
          skill: 'reading',
          level: 'a1',
          taskId: 'read-a1-1',
          mode: 'comprehension',
          correct: 2,
          total: 3,
          percent: 67,
        },
        {
          id: 'skill-2',
          date: '2026-11-02T10:00:00.000Z',
          skill: 'writing',
          level: 'b1',
          taskId: 'write-b1-1',
          mode: 'checklist',
          correct: 4,
          total: 4,
          percent: 100,
        },
      ],
      writingDrafts: {
        'write-b1-1': { taskId: 'write-b1-1', text: 'Draft text', updatedAt: '2026-11-02T10:00:00.000Z' },
      },
    },
  };
  const report = buildAnalyticsReport(state, index);
  assert.equal(report.skillPractice.attempts, 2);
  assert.equal(report.skillPractice.drafts, 1);
  assert.equal(report.skillPractice.practicedTasks, 2);
  assert.equal(report.skillPractice.evaluated, 7);
  assert.equal(report.skillPractice.met, 6);
  assert.equal(report.skillPractice.accuracy, 86);
  assert.equal(report.bySkill.reading.practicedTasks, 1);
  assert.equal(report.bySkill.listening.practicedTasks, 0);
  assert.equal(report.bySkill.writing.accuracy, 100);
  assert.equal(report.byLevel.b1.attempts, 1);
  assert.equal(report.skillPractice.recent[0].id, 'skill-2');
  assert.equal(getSkillAttempts(state).length, 2);
  assert.equal(getTaskHistory(state.progress.skillAttempts, 'read-a1-1')[0].id, 'skill-1');
  assert.equal(getTaskHistory(state.progress.skillAttempts, 'unknown').length, 0);
});
