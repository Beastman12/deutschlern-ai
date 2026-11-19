/**
 * Milestone 8 — local-first analytics.
 *
 * Every figure is derived from records written by the skill views. Authored
 * content counts come from the validated skill index. With no activity the
 * report returns zeroes and null accuracies; it never fills in sample data.
 */
import { LEVEL_IDS, SKILL_IDS } from './skill-content.js';

const emptyBucket = (authored = 0) => ({
  authored,
  attempts: 0,
  evaluated: 0,
  met: 0,
  accuracy: null,
  practicedTasks: 0,
  lastAt: null,
});

function addAttempt(bucket, attempt, taskIds) {
  bucket.attempts += 1;
  bucket.evaluated += Math.max(0, Number(attempt.total) || 0);
  bucket.met += Math.max(0, Number(attempt.correct) || 0);
  taskIds.add(String(attempt.taskId));
  if (!bucket.lastAt || String(attempt.date) > String(bucket.lastAt)) {
    bucket.lastAt = String(attempt.date);
  }
}

function finishBucket(bucket) {
  bucket.practicedTasks = 0;
  return bucket;
}

function summary(bucket, taskIds) {
  bucket.practicedTasks = taskIds.size;
  bucket.accuracy = bucket.evaluated ? Math.round((bucket.met / bucket.evaluated) * 100) : null;
  return bucket;
}

export function getSkillAttempts(state) {
  return Array.isArray(state?.progress?.skillAttempts) ? state.progress.skillAttempts : [];
}

export function getWritingDrafts(state) {
  const drafts = state?.progress?.writingDrafts;
  return drafts && typeof drafts === 'object' && !Array.isArray(drafts) ? Object.values(drafts) : [];
}

export function getTaskHistory(attempts, taskId) {
  return (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => attempt?.taskId === taskId)
    .slice(-8)
    .reverse();
}

/** Build the report consumed by My Progress and the skill views. */
export function buildAnalyticsReport(state, skillIndex) {
  const attempts = getSkillAttempts(state);
  const taskIds = {
    all: new Set(),
    ...Object.fromEntries(SKILL_IDS.map((skill) => [skill, new Set()])),
    ...Object.fromEntries(LEVEL_IDS.map((level) => [level, new Set()])),
  };

  const authoredTotal = skillIndex?.tasks?.length || 0;
  const overall = finishBucket(emptyBucket(authoredTotal));
  const bySkill = Object.fromEntries(
    SKILL_IDS.map((skill) => [skill, finishBucket(emptyBucket(skillIndex?.bySkill?.[skill]?.length || 0))]),
  );
  const byLevel = Object.fromEntries(
    LEVEL_IDS.map((level) => [level, finishBucket(emptyBucket(skillIndex?.byLevel?.[level]?.length || 0))]),
  );

  for (const attempt of attempts) {
    if (!attempt || !SKILL_IDS.includes(attempt.skill)) continue;
    addAttempt(overall, attempt, taskIds.all);
    addAttempt(bySkill[attempt.skill], attempt, taskIds[attempt.skill]);
    if (LEVEL_IDS.includes(attempt.level)) addAttempt(byLevel[attempt.level], attempt, taskIds[attempt.level]);
  }

  summary(overall, taskIds.all);
  for (const skill of SKILL_IDS) summary(bySkill[skill], taskIds[skill]);
  for (const level of LEVEL_IDS) summary(byLevel[level], taskIds[level]);

  return {
    skillPractice: {
      ...overall,
      attempts: attempts.length,
      drafts: getWritingDrafts(state).length,
      recent: attempts
        .slice(-6)
        .reverse()
        .map((attempt) => ({
          id: attempt.id,
          date: attempt.date,
          skill: attempt.skill,
          level: attempt.level,
          taskId: attempt.taskId,
          correct: attempt.correct,
          total: attempt.total,
          percent: attempt.percent,
          mode: attempt.mode,
        })),
    },
    bySkill,
    byLevel,
  };
}

export function hasSkillActivity(report) {
  return Boolean(report?.skillPractice?.attempts || report?.skillPractice?.drafts);
}
