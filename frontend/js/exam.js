/**
 * Mock-exam selection, scoring and readiness logic.
 *
 * This module is pure so the same rules can be tested in Node and used in the
 * browser. It never invents questions: `buildExam` only samples the authored
 * exercise bank, and `scoreExam` only marks answers against authored keys.
 * Writing and speaking stay deliberately unscored until AI feedback exists.
 */
import { isCardLearned } from './srs.js';

export const PASS_PERCENT = 70;

export const EXAM_SECTIONS = Object.freeze([
  { id: 'reading', label: 'Reading & comprehension', skill: 'reading', count: 4, icon: 'book-open' },
  { id: 'listening', label: 'Listening', skill: 'listening', count: 4, icon: 'headphones' },
  { id: 'vocabulary', label: 'Vocabulary', skill: 'vocabulary', count: 3, icon: 'languages' },
  { id: 'grammar', label: 'Grammar', skill: 'grammar', count: 3, icon: 'layers' },
]);

export const EXAM_DURATION_MINUTES = Object.freeze({
  a1: 25,
  a2: 30,
  b1: 35,
  b2: 40,
  c1: 45,
  c2: 45,
});

export const EXAM_TOTAL_QUESTIONS = EXAM_SECTIONS.reduce((sum, section) => sum + section.count, 0);

const SKILL_LABELS = Object.freeze({
  reading: 'Reading',
  listening: 'Listening',
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  writing: 'Writing',
  speaking: 'Speaking',
});

export function getExamDuration(level) {
  return EXAM_DURATION_MINUTES[level] || 30;
}

export function getExamSections() {
  return EXAM_SECTIONS.map((section) => ({ ...section }));
}

export function skillLabel(skill) {
  return SKILL_LABELS[skill] || String(skill || 'Skill');
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededOrder(items, seed) {
  return [...items]
    .map((item) => ({ item, key: hashString(`${seed}:${item.id}`) }))
    .sort((a, b) => a.key - b.key || a.item.id.localeCompare(b.item.id))
    .map((entry) => entry.item);
}

/** Pick a stable, seeded sample of authored questions for one level. */
export function buildExam({ bank, level, seed = 'default' }) {
  if (!Array.isArray(bank) || !level) throw new Error('buildExam needs a bank and a level.');

  const picked = [];
  const used = new Set();

  for (const section of EXAM_SECTIONS) {
    const pool = bank.filter(
      (question) => question.level === level && question.skill === section.skill && !used.has(question.id),
    );
    if (pool.length < section.count) {
      throw new Error(`${level} has only ${pool.length} ${section.skill} questions; ${section.count} are required.`);
    }
    for (const question of seededOrder(pool, `${seed}:${section.id}`).slice(0, section.count)) {
      used.add(question.id);
      picked.push({ ...question, examSection: section.id });
    }
  }

  return {
    level,
    seed: String(seed),
    sections: getExamSections(),
    questions: picked,
  };
}

/** Choose one authored writing or speaking prompt for a mock-exam result. */
export function selectPrompt({ prompts, level, skill, seed = 'default' }) {
  const pool = (prompts || []).filter((prompt) => prompt.level === level && prompt.skill === skill);
  if (!pool.length) return null;
  return seededOrder(pool, `${seed}:prompt:${skill}`)[0];
}

export function normalizeText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('de-DE')
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
}

/** Convert stored answer values (index, text or token indices) for scoring. */
export function normaliseGiven(question, given) {
  if (given === null || given === undefined || given === '') return null;
  if (question.type === 'mcq') {
    const numeric = Number(given);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < (question.options?.length || 0)) return numeric;
    const text = normalizeText(given);
    return question.options.findIndex((option) => normalizeText(option) === text);
  }
  if (question.type === 'order' && Array.isArray(given)) {
    // Numeric entries are token indices in submission order; strings are words.
    const words = given.map((item) => (typeof item === 'number' ? question.tokens?.[item] : item));
    return words.filter((word) => word !== undefined && word !== null && String(word).trim()).join(' ');
  }
  return typeof given === 'string' ? given : String(given);
}

export function hasAnswer(question, given) {
  const normalized = normaliseGiven(question, given);
  if (normalized === null) return false;
  return question.type === 'mcq' ? normalized >= 0 : String(normalized).trim().length > 0;
}

export function isAnswerCorrect(question, given) {
  if (!hasAnswer(question, given)) return false;
  const normalized = normaliseGiven(question, given);
  if (question.type === 'mcq') return normalized === question.answer;
  if (question.type === 'gap') {
    return (question.answers || []).some((answer) => normalizeText(answer) === normalizeText(normalized));
  }
  return normalizeText(normalized) === normalizeText(question.answer);
}

function percentage(correct, total) {
  return total ? Math.round((correct / total) * 100) : null;
}

function addScore(target, key, result) {
  if (!target[key]) target[key] = { correct: 0, total: 0, answered: 0 };
  target[key].total += 1;
  target[key].correct += result.correct ? 1 : 0;
  target[key].answered += result.answered ? 1 : 0;
}

function finishScores(groups) {
  return Object.fromEntries(
    Object.entries(groups).map(([key, value]) => [
      key,
      { ...value, percent: percentage(value.correct, value.total) },
    ]),
  );
}

/**
 * Score a submitted exam. Correct answers are never included in the result —
 * the browser only receives counts, so mock papers cannot become answer keys.
 */
export function scoreExam({ questions, answers = {}, sections = EXAM_SECTIONS }) {
  const sectionGroups = {};
  const skillGroups = {};
  const results = [];
  let correct = 0;
  let answered = 0;

  for (const question of questions) {
    const given = answers[question.id];
    const isCorrect = isAnswerCorrect(question, given);
    const isAnswered = hasAnswer(question, given);
    const result = {
      questionId: question.id,
      section: question.examSection || question.skill,
      skill: question.skill,
      answered: isAnswered,
      correct: isCorrect,
    };
    results.push(result);
    if (isCorrect) correct += 1;
    if (isAnswered) answered += 1;
    addScore(sectionGroups, result.section, result);
    addScore(skillGroups, result.skill, result);
  }

  const total = questions.length;
  const percent = percentage(correct, total);

  return {
    correct,
    total,
    answered,
    percent,
    passed: percent !== null && percent >= PASS_PERCENT,
    sections: finishScores(sectionGroups),
    skills: finishScores(skillGroups),
    // Optional metadata only; no per-question answer or explanation.
    results: results.map(({ questionId, section, skill, answered: wasAnswered }) => ({
      questionId,
      section,
      skill,
      answered: wasAnswered,
    })),
  };
}

function accuracy(stat) {
  if (!stat || !Number(stat.total)) return null;
  return Math.round((Number(stat.correct) / Number(stat.total)) * 100);
}

/**
 * Build an honest readiness report from recorded mock exams and local progress.
 * Writing and speaking are always reported as unassessed: no AI feedback exists
 * yet and this function must not pretend otherwise.
 */
export function readinessReport({ level, bank = [], prompts = [], deck = [], progress = {}, now = new Date() }) {
  const attempts = (Array.isArray(progress.examAttempts) ? progress.examAttempts : [])
    .filter((attempt) => attempt?.level === level && attempt.status === 'submitted')
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));

  const bestSections = {};
  for (const section of EXAM_SECTIONS) {
    const scores = attempts
      .map((attempt) => attempt.sections?.[section.id]?.percent)
      .filter((value) => Number.isFinite(value));
    if (scores.length) bestSections[section.id] = Math.max(...scores);
  }

  const available = Object.values(bestSections);
  const overall = available.length === EXAM_SECTIONS.length
    ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length)
    : null;

  const levelQuestions = bank.filter((question) => question.level === level);
  const lessonTotal = new Set(levelQuestions.filter((question) => question.lessonId).map((question) => question.lessonId)).size;
  const lessonsCompleted = Object.entries(progress.completedLessons || {}).filter(
    ([id, record]) => id.startsWith(`${level}-`) && record?.passed !== false,
  ).length;

  const topicIds = new Set(levelQuestions.filter((question) => question.topicId).map((question) => question.topicId));
  const drillStats = Object.entries(progress.grammarDrills || {}).filter(([id]) => topicIds.has(id));
  const drillCorrect = drillStats.reduce((sum, [, stat]) => sum + (Number(stat.correct) || 0), 0);
  const drillTotal = drillStats.reduce((sum, [, stat]) => sum + (Number(stat.total) || 0), 0);
  const drillAttempts = drillStats.reduce((sum, [, stat]) => sum + (Number(stat.attempts) || 0), 0);

  const levelDeck = deck.filter((card) => card.level === level);
  const levelDeckIds = new Set(levelDeck.map((card) => card.id));
  const flashcardsLearned = Object.entries(progress.flashcards || {}).filter(
    ([id, record]) => levelDeckIds.has(id) && isCardLearned(record, now),
  ).length;

  const status = overall === null
    ? 'no-exam-evidence'
    : overall >= 80
      ? 'ready'
      : overall >= PASS_PERCENT
        ? 'building'
        : 'needs-work';

  return {
    level,
    status,
    overall,
    passPercent: PASS_PERCENT,
    attempts: attempts.length,
    lastAttemptAt: attempts[0]?.completedAt || null,
    skills: Object.fromEntries(
      EXAM_SECTIONS.map((section) => [
        section.skill,
        {
          label: skillLabel(section.skill),
          percent: Number.isFinite(bestSections[section.id]) ? bestSections[section.id] : null,
          assessed: true,
        },
      ]).concat(
        ['writing', 'speaking'].map((skill) => [
          skill,
          { label: skillLabel(skill), percent: null, assessed: false },
        ]),
      ),
    ),
    unassessed: ['writing', 'speaking'],
    evidence: {
      lessons: { completed: lessonsCompleted, total: lessonTotal },
      drills: { accuracy: accuracy({ correct: drillCorrect, total: drillTotal }), attempts: drillAttempts },
      flashcards: { learned: flashcardsLearned, total: levelDeck.length },
      prompts: {
        writing: prompts.filter((prompt) => prompt.level === level && prompt.skill === 'writing').length,
        speaking: prompts.filter((prompt) => prompt.level === level && prompt.skill === 'speaking').length,
      },
    },
    note:
      overall === null
        ? 'No submitted mock exam yet. Supporting practice is shown below, but it is not converted into an invented readiness score.'
        : 'Based only on your best recorded section scores in local mock exams. Writing and speaking are not included.',
  };
}
