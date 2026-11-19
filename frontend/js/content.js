/**
 * Curriculum loader and in-memory index.
 *
 * Content is plain JSON under /content so it can later be generated from the
 * database without changing the frontend contract.
 */
import { getJSON } from './api.js';
import { validateLessonContent } from './lesson-schema.js';
import {
  createSkillIndex,
  findSkillTask as findIndexedSkillTask,
  getSkillTasks as selectSkillTasks,
  skillInventory,
} from './skill-content.js';

export const curriculum = {
  loaded: false,
  levels: [],
  courses: {},
  grammar: [],
  vocabulary: [],
  grammarDrills: [],
  vocabularyDeck: [],
  exerciseBank: [],
  prompts: [],
  skillPractice: null,
  totals: {
    lessons: 0,
    modules: 0,
    grammar: 0,
    words: 0,
    drills: 0,
    cards: 0,
    exercises: 0,
    prompts: 0,
    scenarios: 0,
    skillTasks: 0,
  },
};

const lessonIndex = new Map();
const grammarIndex = new Map();
const drillIndex = new Map();
const wordIndex = new Map();
const deckIndex = new Map();
const exerciseIndex = new Map();
const promptIndex = new Map();
let skillIndex = null;
const levelIndex = new Map();
const courseIndex = new Map();

const lessonBodyCache = new Map();
const lessonBodyRequests = new Map();

function assert(condition, message) {
  if (!condition) throw new Error(`Curriculum error: ${message}`);
}

function validateLevels(doc) {
  assert(doc && Array.isArray(doc.levels) && doc.levels.length === 6, 'levels.json must contain six levels.');
  const ids = new Set();
  for (const level of doc.levels) {
    assert(/^[abc][12]$/.test(level.id), `invalid level id "${level.id}".`);
    assert(!ids.has(level.id), `duplicate level id "${level.id}".`);
    assert(level.code && level.name && level.title, `level "${level.id}" is missing display fields.`);
    ids.add(level.id);
  }
  return doc.levels;
}

function validateCourse(course, level) {
  assert(course && course.id === level.id, `course ${level.id} has a mismatched id.`);
  assert(Array.isArray(course.modules) && course.modules.length > 0, `course ${level.id} has no modules.`);
  assert(Array.isArray(course.canDo) && course.canDo.length > 0, `course ${level.id} has no can-do statements.`);
  assert(
    Array.isArray(course.scenarios) && course.scenarios.length > 0,
    `course ${level.id} has no real-life scenarios.`,
  );
  for (const scenario of course.scenarios) {
    assert(scenario.title && scenario.titleDe, `course ${level.id} has an incomplete scenario.`);
  }

  for (const module of course.modules) {
    assert(module.id && module.title, `course ${level.id} contains an incomplete module.`);
    assert(Array.isArray(module.lessons) && module.lessons.length > 0, `module ${module.id} has no lessons.`);
    for (const lesson of module.lessons) {
      assert(lesson.id && lesson.title, `module ${module.id} contains an incomplete lesson.`);
      assert(Array.isArray(lesson.objectives) && lesson.objectives.length >= 2, `lesson ${lesson.id} needs objectives.`);
      assert(lesson.assessment && Number.isFinite(lesson.assessment.passScore), `lesson ${lesson.id} needs an assessment.`);
      assert(!lessonIndex.has(lesson.id), `duplicate lesson id "${lesson.id}".`);
      lessonIndex.set(lesson.id, {
        lesson,
        module,
        course,
        level,
        path: `#/courses/${level.id}/${lesson.id}`,
      });
    }
  }
}

function validateGrammarDrills(doc) {
  assert(doc && Array.isArray(doc.topics), 'grammar-drills.json has no topics.');
  for (const entry of doc.topics) {
    assert(entry && entry.id, 'grammar drill topic is missing an id.');
    assert(grammarIndex.has(entry.id), `grammar drill topic "${entry.id}" has no grammar explanation.`);
    assert(Array.isArray(entry.tables) && entry.tables.length > 0, `grammar drill topic "${entry.id}" has no reference tables.`);
    for (const table of entry.tables) {
      assert(
        Array.isArray(table.headers) && table.headers.length >= 2 && Array.isArray(table.rows) && table.rows.length >= 1,
        `grammar drill topic "${entry.id}" has an incomplete table.`,
      );
      for (const row of table.rows) {
        assert(row.length === table.headers.length, `grammar drill topic "${entry.id}" has a table row with the wrong width.`);
      }
    }
    assert(Array.isArray(entry.drills) && entry.drills.length >= 3, `grammar drill topic "${entry.id}" needs at least three drills.`);
    for (const drill of entry.drills) {
      assert(drill.id && drill.prompt && drill.explanation, `grammar drill in "${entry.id}" is incomplete.`);
      assert(!drillIndex.has(drill.id), `duplicate grammar drill id "${drill.id}".`);
      if (drill.type === 'mcq') {
        assert(Array.isArray(drill.options) && drill.options.length >= 3, `grammar drill "${drill.id}" needs three options.`);
        assert(
          Number.isInteger(drill.answer) && drill.answer >= 0 && drill.answer < drill.options.length,
          `grammar drill "${drill.id}" has an invalid answer index.`,
        );
      } else if (drill.type === 'gap') {
        assert(Array.isArray(drill.answers) && drill.answers.length >= 1, `grammar drill "${drill.id}" needs answers.`);
        assert(drill.prompt.includes('___'), `grammar drill "${drill.id}" needs a ___ gap.`);
      } else if (drill.type === 'order') {
        assert(Array.isArray(drill.tokens) && drill.tokens.length >= 2, `grammar drill "${drill.id}" needs tokens.`);
        assert(drill.answer, `grammar drill "${drill.id}" needs an answer sentence.`);
      } else {
        assert(false, `grammar drill "${drill.id}" has an unknown type "${drill.type}".`);
      }
      drillIndex.set(drill.id, { drill, topicId: entry.id });
    }
  }
}

function validateVocabularyDeck(doc, levels) {
  assert(doc && Array.isArray(doc.cards), 'vocabulary-deck.json has no cards.');
  const levelIds = new Set(levels.map((level) => level.id));
  const seenWords = new Set();
  for (const card of doc.cards) {
    assert(card.id && card.de && card.en, 'vocabulary deck card is incomplete.');
    assert(levelIds.has(card.level), `vocabulary card "${card.id}" references an unknown level.`);
    assert(!deckIndex.has(card.id), `duplicate vocabulary deck id "${card.id}".`);
    const key = card.de.toLocaleLowerCase('de-DE');
    assert(!seenWords.has(key), `duplicate vocabulary deck word "${card.de}".`);
    seenWords.add(key);
    deckIndex.set(card.id, card);
  }
}

function wordBag(value) {
  return String(value)
    .toLocaleLowerCase('de-DE')
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:„“”"]/g, '')
    .trim()
    .split(/\s+/)
    .sort()
    .join(' ');
}

function validateExerciseBank(doc, levels) {
  assert(doc && Array.isArray(doc.questions), 'exercise-bank.json has no questions.');
  assert(Array.isArray(doc.prompts), 'exercise-bank.json has no prompts.');
  const levelIds = new Set(levels.map((level) => level.id));
  const skills = new Set(['reading', 'listening', 'vocabulary', 'grammar', 'writing', 'speaking']);
  const types = new Set(['mcq', 'gap', 'order']);
  const sources = new Set(['lesson-practice', 'lesson-assessment', 'lesson-listening', 'grammar-drill']);

  for (const question of doc.questions) {
    assert(question.id && question.prompt && question.explanation, `exercise "${question.id}" is incomplete.`);
    assert(!exerciseIndex.has(question.id), `duplicate exercise id "${question.id}".`);
    assert(levelIds.has(question.level), `exercise "${question.id}" has an unknown level.`);
    assert(skills.has(question.skill), `exercise "${question.id}" has an unknown skill.`);
    assert(sources.has(question.sourceType), `exercise "${question.id}" has an unknown source.`);
    assert(types.has(question.type), `exercise "${question.id}" has an unknown type.`);
    if (question.lessonId) {
      assert(lessonIndex.has(question.lessonId), `exercise "${question.id}" references an unknown lesson.`);
    }
    if (question.topicId) {
      assert(grammarIndex.has(question.topicId), `exercise "${question.id}" references an unknown grammar topic.`);
    }
    if (question.type === 'mcq') {
      assert(Array.isArray(question.options) && question.options.length >= 3, `exercise "${question.id}" needs options.`);
      assert(
        Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length,
        `exercise "${question.id}" has an invalid answer.`,
      );
    } else if (question.type === 'gap') {
      assert(Array.isArray(question.answers) && question.answers.length > 0, `exercise "${question.id}" needs answers.`);
      assert(question.prompt.includes('___'), `exercise "${question.id}" is missing its gap.`);
    } else {
      assert(Array.isArray(question.tokens) && question.tokens.length >= 2, `exercise "${question.id}" needs tokens.`);
      assert(question.answer, `exercise "${question.id}" needs an answer.`);
      assert(
        wordBag(question.tokens.join(' ')) === wordBag(question.answer),
        `exercise "${question.id}" cannot be solved with its tokens.`,
      );
    }
    if (question.skill === 'listening') {
      assert(Array.isArray(question.audioScript) && question.audioScript.length > 0, `listening exercise "${question.id}" has no script.`);
    }
    exerciseIndex.set(question.id, question);
  }

  for (const prompt of doc.prompts) {
    assert(prompt.id && prompt.prompt, `prompt "${prompt.id}" is incomplete.`);
    assert(!promptIndex.has(prompt.id), `duplicate prompt id "${prompt.id}".`);
    assert(levelIds.has(prompt.level), `prompt "${prompt.id}" has an unknown level.`);
    assert(['writing', 'speaking'].includes(prompt.skill), `prompt "${prompt.id}" has an unknown skill.`);
    if (prompt.lessonId) {
      assert(lessonIndex.has(prompt.lessonId), `prompt "${prompt.id}" references an unknown lesson.`);
    }
    promptIndex.set(prompt.id, prompt);
  }
}

export async function loadCurriculum() {
  const levelsDoc = await getJSON('/content/levels.json');
  const levels = validateLevels(levelsDoc);

  const [courseDocs, grammarDoc, vocabularyDoc, drillsDoc, deckDoc, exerciseDoc, skillDoc] = await Promise.all([
    Promise.all(levels.map((level) => getJSON(`/content/${level.id}/course.json`))),
    getJSON('/content/grammar.json'),
    getJSON('/content/vocabulary.json'),
    getJSON('/content/grammar-drills.json'),
    getJSON('/content/vocabulary-deck.json'),
    getJSON('/content/exercise-bank.json'),
    getJSON('/content/skill-practice.json'),
  ]);

  assert(grammarDoc && Array.isArray(grammarDoc.topics), 'grammar.json has no topics.');
  assert(vocabularyDoc && Array.isArray(vocabularyDoc.words), 'vocabulary.json has no words.');

  curriculum.levels = levels;
  curriculum.courses = {};
  curriculum.grammar = grammarDoc.topics;
  curriculum.vocabulary = vocabularyDoc.words;
  curriculum.grammarDrills = drillsDoc.topics;
  curriculum.vocabularyDeck = deckDoc.cards;
  curriculum.exerciseBank = exerciseDoc.questions;
  curriculum.prompts = exerciseDoc.prompts;
  curriculum.skillPractice = null;
  curriculum.loaded = false;

  levelIndex.clear();
  courseIndex.clear();
  grammarIndex.clear();
  drillIndex.clear();
  wordIndex.clear();
  deckIndex.clear();
  exerciseIndex.clear();
  promptIndex.clear();
  skillIndex = null;
  lessonIndex.clear();
  lessonBodyCache.clear();
  lessonBodyRequests.clear();

  let totalLessons = 0;
  let totalModules = 0;
  let totalScenarios = 0;

  levels.forEach((level, index) => {
    const course = courseDocs[index];
    validateCourse(course, level);
    curriculum.courses[level.id] = course;
    levelIndex.set(level.id, level);
    courseIndex.set(level.id, course);
    totalModules += course.modules.length;
    totalLessons += course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
    totalScenarios += course.scenarios.length;
  });

  for (const topic of curriculum.grammar) {
    assert(topic.id && topic.title && topic.level, `grammar topic is incomplete.`);
    assert(levelIndex.has(topic.level), `grammar topic ${topic.id} references an unknown level.`);
    assert(!grammarIndex.has(topic.id), `duplicate grammar topic id "${topic.id}".`);
    grammarIndex.set(topic.id, topic);
  }

  const levelOrder = new Map(levels.map((level, index) => [level.id, index]));
  const seenWords = new Set();
  for (const word of curriculum.vocabulary) {
    assert(word.id && word.de && word.en, 'vocabulary entry is incomplete.');
    assert(levelIndex.has(word.level), `word ${word.id} references an unknown level.`);
    assert(word.pos, `word ${word.id} has no part of speech.`);
    assert(!wordIndex.has(word.id), `duplicate vocabulary id "${word.id}".`);
    assert(!seenWords.has(word.de), `duplicate German word "${word.de}".`);
    seenWords.add(word.de);
    wordIndex.set(word.id, word);
  }

  validateGrammarDrills(drillsDoc);
  validateVocabularyDeck(deckDoc, levels);
  validateExerciseBank(exerciseDoc, levels);
  skillIndex = createSkillIndex(skillDoc);
  curriculum.skillPractice = skillDoc;

  curriculum.grammar.sort(
    (a, b) => levelOrder.get(a.level) - levelOrder.get(b.level) || a.title.localeCompare(b.title),
  );
  curriculum.vocabulary.sort(
    (a, b) => levelOrder.get(a.level) - levelOrder.get(b.level) || a.de.localeCompare(b.de, 'de'),
  );

  curriculum.totals = {
    lessons: totalLessons,
    modules: totalModules,
    grammar: curriculum.grammar.length,
    words: curriculum.vocabulary.length,
    drills: drillIndex.size,
    cards: deckIndex.size,
    exercises: exerciseIndex.size,
    prompts: promptIndex.size,
    scenarios: totalScenarios,
    skillTasks: skillIndex.tasks.length,
  };
  curriculum.loaded = true;

  return curriculum;
}

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

export function getLevel(levelId) {
  return levelIndex.get(levelId) || null;
}

export function getCourse(levelId) {
  return courseIndex.get(levelId) || null;
}

export function findLesson(lessonId) {
  return lessonIndex.get(lessonId) || null;
}

/**
 * Load and validate one lesson body. Bodies are fetched on demand and cached
 * for the session, so opening a lesson costs one small JSON request.
 */
export async function loadLessonBody(lessonId) {
  if (lessonBodyCache.has(lessonId)) return lessonBodyCache.get(lessonId);

  const entry = lessonIndex.get(lessonId);
  if (!entry) throw new Error(`Unknown lesson "${lessonId}".`);

  if (lessonBodyRequests.has(lessonId)) return lessonBodyRequests.get(lessonId);

  const request = getJSON(`/content/lessons/${encodeURIComponent(lessonId)}.json`)
    .then((doc) => {
      const errors = validateLessonContent(doc, {
        lesson: entry.lesson,
        levelId: entry.level.id,
      });
      if (errors.length) {
        throw new Error(
          `Lesson content for "${lessonId}" does not match the contract: ${errors.slice(0, 4).join(' ')}`,
        );
      }
      lessonBodyCache.set(lessonId, doc);
      return doc;
    })
    .finally(() => lessonBodyRequests.delete(lessonId));

  lessonBodyRequests.set(lessonId, request);
  return request;
}

/** Cached body, or null when the learner has not opened the lesson yet. */
export function getCachedLessonBody(lessonId) {
  return lessonBodyCache.get(lessonId) || null;
}

export function findGrammarTopic(topicId) {
  return grammarIndex.get(topicId) || null;
}

/** Authored Milestone 8 tasks, filtered by skill and optional CEFR level. */
export function getSkillTasks({ skill, level = 'all' } = {}) {
  return selectSkillTasks(skillIndex, { skill, level });
}

export function findSkillTask(taskId) {
  return findIndexedSkillTask(skillIndex, taskId);
}

export function getSkillInventory() {
  return skillInventory(skillIndex);
}

/** The validated index used by analytics. Null before loadContent() resolves. */
export function getSkillIndex() {
  return skillIndex;
}

export function findWord(wordId) {
  return wordIndex.get(wordId) || null;
}

export function getGrammarDrillTopic(topicId) {
  return curriculum.grammarDrills.find((entry) => entry.id === topicId) || null;
}

export function findDrill(drillId) {
  return drillIndex.get(drillId) || null;
}

export function getGrammarDrillCount() {
  return drillIndex.size;
}

export function getVocabularyDeck() {
  return curriculum.vocabularyDeck;
}

export function findDeckCard(cardId) {
  return deckIndex.get(cardId) || null;
}

export function getDeckForLevel(levelId) {
  if (!levelId || levelId === 'all') return curriculum.vocabularyDeck;
  return curriculum.vocabularyDeck.filter((card) => card.level === levelId);
}

export function getDeckTopics() {
  return [...new Set(curriculum.vocabularyDeck.map((card) => card.topic))].sort((a, b) => a.localeCompare(b));
}

export function getExerciseBank() {
  return curriculum.exerciseBank;
}

export function getPrompts() {
  return curriculum.prompts;
}

export function findExercise(questionId) {
  return exerciseIndex.get(questionId) || null;
}

/**
 * Filter the authored exercise bank. Passing 'all' (or omitting a filter) keeps
 * every item for that dimension; results keep the deterministic build order.
 */
export function getExercises({ level, skill, type, sourceType } = {}) {
  return curriculum.exerciseBank.filter((question) => {
    if (level && level !== 'all' && question.level !== level) return false;
    if (skill && skill !== 'all' && question.skill !== skill) return false;
    if (type && type !== 'all' && question.type !== type) return false;
    if (sourceType && sourceType !== 'all' && question.sourceType !== sourceType) return false;
    return true;
  });
}

export function getPromptsForLevel(levelId, skill) {
  return curriculum.prompts.filter(
    (prompt) => (!levelId || levelId === 'all' || prompt.level === levelId) && (!skill || prompt.skill === skill),
  );
}

export function getGrammarForLevel(levelId) {
  return curriculum.grammar.filter((topic) => topic.level === levelId);
}

export function getWordsForLevel(levelId) {
  return curriculum.vocabulary.filter((word) => word.level === levelId);
}

export function allLessons() {
  return [...lessonIndex.values()];
}

export function getTotalLessons() {
  return curriculum.totals.lessons;
}

export function getFirstLesson(levelId) {
  const course = getCourse(levelId);
  return course?.modules[0]?.lessons[0] ? findLesson(course.modules[0].lessons[0].id) : null;
}

/** Flat, ordered list of lessons for a course. */
export function getCourseLessons(levelId) {
  const course = getCourse(levelId);
  if (!course) return [];
  return course.modules.flatMap((module) =>
    module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id, moduleTitle: module.title })),
  );
}

/** The authored real-life scenarios for one CEFR course. */
export function getScenarios(levelId) {
  return getCourse(levelId)?.scenarios || [];
}

/** The next uncompleted lesson, preferring the learner's target level. */
export function getNextLesson(progress, levelId) {
  const startIndex = Math.max(
    0,
    curriculum.levels.findIndex((level) => level.id === levelId),
  );
  const orderedLevels = [...curriculum.levels.slice(startIndex), ...curriculum.levels.slice(0, startIndex)];
  for (const level of orderedLevels) {
    for (const item of getCourseLessons(level.id)) {
      if (!progress.completedLessons[item.id]) return findLesson(item.id);
    }
  }
  return getFirstLesson('a1');
}

/** "Word of the day" is deterministic for a given date. */
export function getWordOfDay(date = new Date()) {
  const words = curriculum.vocabulary;
  if (!words.length) return null;
  const dayNumber = Math.floor(date.getTime() / 86_400_000);
  return words[dayNumber % words.length];
}

/** Weighted search across lessons, grammar and vocabulary. */
export function searchCurriculum(query, limit = 24) {
  const raw = query.trim().toLowerCase();
  if (raw.length < 2) return [];
  const terms = raw.split(/\s+/).filter(Boolean);

  const results = [];
  const score = (haystack, primary) => {
    const text = haystack.toLowerCase();
    let points = 0;
    for (const term of terms) {
      const index = text.indexOf(term);
      if (index === -1) return -1;
      points += index === 0 ? 8 : index < 12 ? 4 : 1;
      if (primary.toLowerCase().startsWith(term)) points += 12;
    }
    return points;
  };

  for (const { lesson, level, path } of lessonIndex.values()) {
    const primary = lesson.title;
    const points = score(`${lesson.title} ${lesson.titleDe} ${lesson.summary} ${level.code}`, primary);
    if (points >= 0) {
      results.push({
        type: 'Lesson',
        badge: level.code,
        title: lesson.title,
        subtitle: `${level.code} · ${lesson.titleDe}`,
        href: path,
        points: points + 2,
        icon: 'book',
      });
    }
  }

  for (const topic of grammarIndex.values()) {
    const points = score(
      `${topic.title} ${topic.titleDe} ${topic.summary} ${topic.level}`,
      topic.title,
    );
    if (points >= 0) {
      results.push({
        type: 'Grammar',
        badge: topic.level.toUpperCase(),
        title: topic.title,
        subtitle: topic.summary,
        href: `#/grammar?topic=${encodeURIComponent(topic.id)}`,
        points,
        icon: 'layers',
      });
    }
  }

  for (const word of wordIndex.values()) {
    const points = score(
      `${word.de} ${word.en} ${word.topic} ${word.level}`,
      word.de,
    );
    if (points >= 0) {
      results.push({
        type: 'Word',
        badge: word.level.toUpperCase(),
        title: word.de,
        subtitle: `${word.en} · ${word.topic}`,
        href: `#/vocabulary?word=${encodeURIComponent(word.id)}`,
        points: points + 1,
        icon: 'languages',
      });
    }
  }

  return results.sort((a, b) => b.points - a.points || a.title.localeCompare(b.title)).slice(0, limit);
}
