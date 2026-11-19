/**
 * Milestone 8 — authored skill-practice content.
 *
 * This module only indexes and validates the static JSON produced by
 * `tools/build-skill-practice.mjs`. It never generates a passage, question,
 * answer or score at runtime.
 */

export const LEVEL_IDS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
export const SKILL_IDS = ['reading', 'listening', 'writing'];
export const TASKS_PER_LEVEL_PER_SKILL = 2;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTranslationPair = (value) =>
  (Array.isArray(value) && value.length === 2 && value.every((part) => isText(part))) ||
  (isObject(value) && isText(value.de) && isText(value.en));

function validateQuestions(task, errors) {
  if (!Array.isArray(task.questions) || task.questions.length !== 3) {
    errors.push(`${task.id}: needs exactly three comprehension questions.`);
    return;
  }
  task.questions.forEach((question, index) => {
    const label = `${task.id}: question ${index + 1}`;
    if (!isObject(question) || !isText(question.prompt) || !isText(question.explanation)) {
      errors.push(`${label} needs a prompt and an explanation.`);
      return;
    }
    if (question.type !== 'mcq' || !Array.isArray(question.options) || question.options.length < 3) {
      errors.push(`${label} needs at least three multiple-choice options.`);
      return;
    }
    if (!question.options.every(isText)) errors.push(`${label} has an empty option.`);
    if (
      !Number.isInteger(question.answer) ||
      question.answer < 0 ||
      question.answer >= question.options.length
    ) {
      errors.push(`${label} has an invalid answer index.`);
    }
  });
}

function validateChecks(task, errors) {
  if (!Array.isArray(task.checks) || task.checks.length < 3) {
    errors.push(`${task.id}: needs at least three deterministic writing checks.`);
    return;
  }
  const allowed = new Set(['wordCount', 'includes', 'keywords', 'sentences']);
  const ids = new Set();
  for (const check of task.checks) {
    if (!isObject(check) || !isText(check.id) || !isText(check.label)) {
      errors.push(`${task.id}: a writing check is incomplete.`);
      continue;
    }
    if (ids.has(check.id)) errors.push(`${task.id}: duplicate check id "${check.id}".`);
    ids.add(check.id);
    if (!allowed.has(check.type)) {
      errors.push(`${task.id}: unknown check type "${check.type}".`);
    } else if (check.type === 'wordCount') {
      if (
        !Number.isInteger(check.min) ||
        !Number.isInteger(check.max) ||
        check.min <= 0 ||
        check.max < check.min
      ) {
        errors.push(`${task.id}: invalid word-count range.`);
      }
    } else if (check.type === 'sentences') {
      if (!Number.isInteger(check.min) || check.min <= 0) {
        errors.push(`${task.id}: invalid sentence minimum.`);
      }
    } else if (check.type === 'keywords') {
      if (!Array.isArray(check.values) || !check.values.every(isText)) {
        errors.push(`${task.id}: keyword checks need non-empty values.`);
      }
      if (!Number.isInteger(check.min) || check.min < 1 || check.min > check.values?.length) {
        errors.push(`${task.id}: invalid keyword minimum.`);
      }
    } else if (!isText(check.value)) {
      errors.push(`${task.id}: an "includes" check needs a phrase.`);
    }
  }
}

/** Return every contract violation without throwing. */
export function validateSkillPractice(doc) {
  const errors = [];
  if (!isObject(doc)) return ['skill-practice.json must be an object.'];
  if (doc.schemaVersion !== 1) errors.push('skill-practice.json must use schemaVersion 1.');
  if (
    !Array.isArray(doc.levels) ||
    doc.levels.join(',') !== LEVEL_IDS.join(',')
  ) {
    errors.push('skill-practice.json must list the six CEFR levels in order.');
  }
  if (!Array.isArray(doc.tasks)) {
    errors.push('skill-practice.json needs a tasks array.');
    return errors;
  }

  const expectedCounts = {
    bySkill: Object.fromEntries(SKILL_IDS.map((skill) => [skill, TASKS_PER_LEVEL_PER_SKILL * LEVEL_IDS.length])),
    byLevel: Object.fromEntries(LEVEL_IDS.map((level) => [level, SKILL_IDS.length * TASKS_PER_LEVEL_PER_SKILL])),
  };
  if (JSON.stringify(doc.counts) !== JSON.stringify(expectedCounts)) {
    errors.push('skill-practice.json counts do not match 36 authored tasks (two per skill and level).');
  }

  const seen = new Set();
  const actual = {
    bySkill: Object.fromEntries(SKILL_IDS.map((skill) => [skill, 0])),
    byLevel: Object.fromEntries(LEVEL_IDS.map((level) => [level, 0])),
  };

  for (const task of doc.tasks) {
    if (!isObject(task) || !isText(task.id) || !isText(task.title) || !isText(task.topic)) {
      errors.push('Every skill task needs an id, title and topic.');
      continue;
    }
    if (seen.has(task.id)) errors.push(`Duplicate skill task id "${task.id}".`);
    seen.add(task.id);
    if (!LEVEL_IDS.includes(task.level)) errors.push(`${task.id}: unknown level "${task.level}".`);
    if (!SKILL_IDS.includes(task.skill)) errors.push(`${task.id}: unknown skill "${task.skill}".`);
    if (!Number.isFinite(Number(task.minutes)) || Number(task.minutes) <= 0) {
      errors.push(`${task.id}: invalid minute estimate.`);
    }
    if (actual.bySkill[task.skill] !== undefined) actual.bySkill[task.skill] += 1;
    if (actual.byLevel[task.level] !== undefined) actual.byLevel[task.level] += 1;

    if (task.skill === 'reading' || task.skill === 'listening') {
      if (!isText(task.focus)) errors.push(`${task.id}: missing focus statement.`);
      if (
        !Array.isArray(task.lines) ||
        !task.lines.length ||
        !task.lines.every(isText) ||
        !Array.isArray(task.translation) ||
        task.translation.length !== task.lines.length ||
        !task.translation.every(isText)
      ) {
        errors.push(`${task.id}: German lines and English translations must be aligned.`);
      }
      if (!Array.isArray(task.glossary) || !task.glossary.length || !task.glossary.every(isTranslationPair)) {
        errors.push(`${task.id}: glossary entries need German and English text.`);
      }
      validateQuestions(task, errors);
    }

    if (task.skill === 'listening') {
      if (
        !Array.isArray(task.dictation) ||
        !task.dictation.length ||
        !task.dictation.every(
          (line) => isObject(line) && isText(line.id) && isText(line.text) && isText(line.hint),
        )
      ) {
        errors.push(`${task.id}: dictation lines are incomplete.`);
      }
    }

    if (task.skill === 'writing') {
      const requiredText = [
        'prompt',
        'promptEn',
        'situation',
        'register',
        'modelNotes',
      ];
      for (const field of requiredText) {
        if (!isText(task[field])) errors.push(`${task.id}: missing ${field}.`);
      }
      if (!['informal', 'neutral', 'formal'].includes(task.register)) {
        errors.push(`${task.id}: unknown register "${task.register}".`);
      }
      if (
        !isObject(task.targetWords) ||
        !Number.isInteger(task.targetWords.min) ||
        !Number.isInteger(task.targetWords.max) ||
        task.targetWords.min <= 0 ||
        task.targetWords.max < task.targetWords.min
      ) {
        errors.push(`${task.id}: invalid target word range.`);
      }
      if (!Array.isArray(task.requiredPoints) || !task.requiredPoints.length || !task.requiredPoints.every(isText)) {
        errors.push(`${task.id}: required points are incomplete.`);
      }
      if (!Array.isArray(task.checklist) || !task.checklist.length || !task.checklist.every(isText)) {
        errors.push(`${task.id}: learner checklist is incomplete.`);
      }
      if (!Array.isArray(task.keyPhrases) || !task.keyPhrases.every(isTranslationPair)) {
        errors.push(`${task.id}: key phrases are incomplete.`);
      }
      if (!Array.isArray(task.modelAnswer) || !task.modelAnswer.length || !task.modelAnswer.every(isText)) {
        errors.push(`${task.id}: missing authored model answer.`);
      }
      validateChecks(task, errors);
      const wordCheck = task.checks?.find((check) => check.type === 'wordCount');
      if (
        wordCheck &&
        isObject(task.targetWords) &&
        (wordCheck.min !== task.targetWords.min || wordCheck.max !== task.targetWords.max)
      ) {
        errors.push(`${task.id}: word-count check does not match targetWords.`);
      }
    }
  }

  for (const skill of SKILL_IDS) {
    if (actual.bySkill[skill] !== expectedCounts.bySkill[skill]) {
      errors.push(`Expected ${expectedCounts.bySkill[skill]} ${skill} tasks, found ${actual.bySkill[skill]}.`);
    }
  }
  for (const level of LEVEL_IDS) {
    if (actual.byLevel[level] !== expectedCounts.byLevel[level]) {
      errors.push(`Expected ${expectedCounts.byLevel[level]} ${level} tasks, found ${actual.byLevel[level]}.`);
    }
  }
  return errors;
}

/** Build the lookup index used by the three skill views. */
export function createSkillIndex(doc) {
  const errors = validateSkillPractice(doc);
  if (errors.length) throw new Error(`Skill content contract: ${errors.slice(0, 5).join(' ')}`);
  const bySkill = Object.fromEntries(SKILL_IDS.map((skill) => [skill, []]));
  const byLevel = Object.fromEntries(LEVEL_IDS.map((level) => [level, []]));
  const byId = Object.create(null);
  for (const task of doc.tasks) {
    bySkill[task.skill].push(task);
    byLevel[task.level].push(task);
    byId[task.id] = task;
  }
  return { document: doc, tasks: doc.tasks, bySkill, byLevel, byId, counts: doc.counts };
}

export function getSkillTasks(index, { skill, level = 'all' } = {}) {
  if (!index || !SKILL_IDS.includes(skill)) return [];
  const source = level === 'all' ? index.bySkill[skill] : index.byLevel[level];
  return (source || []).filter((task) => task.skill === skill);
}

export function findSkillTask(index, id) {
  return index?.byId?.[id] || null;
}

/** A compact, honest summary for navigation cards: authored counts only. */
export function skillInventory(index) {
  return {
    reading: index?.bySkill?.reading?.length || 0,
    listening: index?.bySkill?.listening?.length || 0,
    writing: index?.bySkill?.writing?.length || 0,
    levels: LEVEL_IDS.length,
  };
}
