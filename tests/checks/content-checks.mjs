/**
 * Curriculum invariants shared by the verifier.
 * Mirrors the important assertions in tests/content.test.js without node:test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillPractice } from '../../frontend/js/skill-content.js';
import { evaluateWriting } from '../../frontend/js/writing-feedback.js';

const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');
const LEVEL_IDS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

const read = (file) => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));

function expect(condition, message) {
  if (!condition) throw new Error(message);
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

export function curriculumChecks() {
  const levels = read('levels.json').levels;
  expect(Array.isArray(levels) && levels.length === 6, 'expected six CEFR levels');
  expect(
    levels.map((level) => level.id).join(',') === LEVEL_IDS.join(','),
    'levels must be ordered A1–C2',
  );

  let modules = 0;
  let lessons = 0;
  let scenarios = 0;
  const lessonIds = new Set();

  for (const level of levels) {
    const course = read(`${level.id}/course.json`);
    expect(course.id === level.id, `${level.id}: course id mismatch`);
    expect(Array.isArray(course.canDo) && course.canDo.length >= 4, `${level.id}: needs can-do statements`);
    expect(Array.isArray(course.scenarios) && course.scenarios.length >= 5, `${level.id}: needs scenarios`);
    expect(course.modules.length === 4, `${level.id}: expected four modules`);

    for (const module of course.modules) {
      modules += 1;
      expect(module.lessons.length === 3, `${module.id}: expected three lessons`);
      for (const lesson of module.lessons) {
        lessons += 1;
        expect(!lessonIds.has(lesson.id), `duplicate lesson ${lesson.id}`);
        lessonIds.add(lesson.id);
        expect(lesson.objectives.length >= 2, `${lesson.id}: needs objectives`);
        expect(lesson.assessment?.passScore > 0, `${lesson.id}: needs an assessment pass score`);
        expect(Array.isArray(lesson.vocab) && lesson.vocab.length >= 3, `${lesson.id}: needs vocabulary`);
        expect(Boolean(lesson.keyPhrase?.de && lesson.keyPhrase?.en), `${lesson.id}: needs a key phrase`);
      }
    }
    scenarios += course.scenarios.length;
  }

  const grammar = read('grammar.json').topics;
  expect(Array.isArray(grammar) && grammar.length === 30, 'expected 30 grammar topics');
  const grammarIds = new Set();
  const grammarPerLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));
  for (const topic of grammar) {
    expect(!grammarIds.has(topic.id), `duplicate grammar topic ${topic.id}`);
    grammarIds.add(topic.id);
    expect(LEVEL_IDS.includes(topic.level), `${topic.id}: unknown level`);
    grammarPerLevel[topic.level] += 1;
    expect(topic.points?.length >= 2, `${topic.id}: needs teaching points`);
    expect(Boolean(topic.example?.de && topic.example?.en), `${topic.id}: needs an example`);
  }
  for (const id of LEVEL_IDS) {
    expect(grammarPerLevel[id] >= 4, `${id}: needs at least four grammar topics`);
  }

  const words = read('vocabulary.json').words;
  expect(Array.isArray(words) && words.length === 48, 'expected 48 vocabulary entries');
  const wordIds = new Set();
  const germanWords = new Set();
  const wordsPerLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));
  for (const word of words) {
    expect(!wordIds.has(word.id), `duplicate word ${word.id}`);
    expect(!germanWords.has(word.de), `duplicate German word ${word.de}`);
    wordIds.add(word.id);
    germanWords.add(word.de);
    expect(LEVEL_IDS.includes(word.level), `${word.id}: unknown level`);
    wordsPerLevel[word.level] += 1;
    expect(Boolean(word.en && word.pronunciation && word.pos && word.topic), `${word.id}: incomplete`);
    expect(Boolean(word.example && word.exampleEn), `${word.id}: needs examples`);
    if (word.pos === 'noun') {
      expect(['der', 'die', 'das'].includes(word.article), `${word.id}: noun needs an article`);
      expect(Boolean(word.plural), `${word.id}: noun needs a plural`);
    }
  }
  for (const id of LEVEL_IDS) {
    expect(wordsPerLevel[id] >= 6, `${id}: needs at least six words`);
  }

  const drills = read('grammar-drills.json').topics;
  expect(Array.isArray(drills) && drills.length === grammar.length, 'expected one drill set per grammar topic');
  const drillTopicIds = new Set();
  const drillIds = new Set();
  let drillCount = 0;
  for (const entry of drills) {
    expect(grammarIds.has(entry.id), `${entry.id}: drill set has no grammar topic`);
    expect(!drillTopicIds.has(entry.id), `duplicate drill set ${entry.id}`);
    drillTopicIds.add(entry.id);
    expect(Array.isArray(entry.tables) && entry.tables.length >= 1, `${entry.id}: needs a reference table`);
    for (const table of entry.tables) {
      expect(Array.isArray(table.headers) && table.headers.length >= 2, `${entry.id}: incomplete table`);
      expect(Array.isArray(table.rows) && table.rows.length >= 1, `${entry.id}: empty table`);
      for (const row of table.rows) {
        expect(row.length === table.headers.length, `${entry.id}: table row width mismatch`);
      }
    }
    expect(Array.isArray(entry.drills) && entry.drills.length >= 3, `${entry.id}: needs three drills`);
    for (const drill of entry.drills) {
      drillCount += 1;
      expect(Boolean(drill.id && drill.prompt && drill.explanation), `${entry.id}: incomplete drill`);
      expect(!drillIds.has(drill.id), `duplicate drill ${drill.id}`);
      drillIds.add(drill.id);
      if (drill.type === 'mcq') {
        expect(Array.isArray(drill.options) && drill.options.length >= 3, `${drill.id}: needs options`);
        expect(
          Number.isInteger(drill.answer) && drill.answer >= 0 && drill.answer < drill.options.length,
          `${drill.id}: invalid answer`,
        );
      } else if (drill.type === 'gap') {
        expect(Array.isArray(drill.answers) && drill.answers.length >= 1, `${drill.id}: needs answers`);
        expect(drill.prompt.includes('___'), `${drill.id}: missing gap`);
      } else if (drill.type === 'order') {
        expect(Array.isArray(drill.tokens) && drill.tokens.length >= 2, `${drill.id}: needs tokens`);
        expect(wordBag(drill.tokens.join(' ')) === wordBag(drill.answer), `${drill.id}: unsolvable order drill`);
      } else {
        expect(false, `${drill.id}: unknown drill type`);
      }
    }
  }
  expect(drillCount === 90, `expected 90 grammar drills, found ${drillCount}`);

  const deck = read('vocabulary-deck.json').cards;
  expect(Array.isArray(deck) && deck.length === 369, 'expected 369 flashcards');
  const deckIds = new Set();
  const deckWords = new Set();
  const coveredCurated = new Set();
  for (const card of deck) {
    expect(Boolean(card.id && card.de && card.en && card.topic), `${card.id}: incomplete card`);
    expect(!deckIds.has(card.id), `duplicate deck id ${card.id}`);
    deckIds.add(card.id);
    const key = card.de.toLocaleLowerCase('de-DE');
    expect(!deckWords.has(key), `duplicate deck word ${card.de}`);
    deckWords.add(key);
    expect(LEVEL_IDS.includes(card.level), `${card.id}: unknown level`);
    expect(Boolean(card.example && card.exampleEn), `${card.id}: needs examples`);
    if (card.article) {
      expect(['der', 'die', 'das'].includes(card.article), `${card.id}: invalid article`);
      expect(card.de.startsWith(`${card.article} `), `${card.id}: article mismatch`);
    }
    if (card.source === 'curated') {
      expect(wordIds.has(card.id), `${card.id}: not in vocabulary.json`);
      coveredCurated.add(card.id);
    } else {
      expect(card.source === 'lesson' && Boolean(card.lessonId), `${card.id}: unknown source`);
    }
  }
  expect(coveredCurated.size === words.length, 'deck must include every curated word');

  const bank = read('exercise-bank.json');
  expect(Array.isArray(bank.questions) && bank.questions.length === 1995, 'expected 1995 bank questions');
  expect(Array.isArray(bank.prompts) && bank.prompts.length === 144, 'expected 144 bank prompts');
  const exerciseIds = new Set();
  const bankSkills = { reading: 0, listening: 0, vocabulary: 0, grammar: 0 };
  const bankPerLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));
  for (const question of bank.questions) {
    expect(Boolean(question.id && question.prompt && question.explanation), `${question.id}: incomplete exercise`);
    expect(!exerciseIds.has(question.id), `duplicate exercise id ${question.id}`);
    exerciseIds.add(question.id);
    expect(LEVEL_IDS.includes(question.level), `${question.id}: unknown level`);
    expect(Object.hasOwn(bankSkills, question.skill), `${question.id}: unknown skill`);
    bankSkills[question.skill] += 1;
    bankPerLevel[question.level] += 1;
    if (question.lessonId) expect(lessonIds.has(question.lessonId), `${question.id}: unknown lesson`);
    if (question.topicId) expect(grammarIds.has(question.topicId), `${question.id}: unknown grammar topic`);
    if (question.type === 'mcq') {
      expect(Array.isArray(question.options) && question.options.length >= 3, `${question.id}: needs options`);
      expect(
        Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length,
        `${question.id}: invalid answer`,
      );
    } else if (question.type === 'gap') {
      expect(Array.isArray(question.answers) && question.answers.length >= 1, `${question.id}: needs answers`);
      expect(question.prompt.includes('___'), `${question.id}: missing gap`);
    } else if (question.type === 'order') {
      expect(Array.isArray(question.tokens) && question.tokens.length >= 2, `${question.id}: needs tokens`);
      expect(wordBag(question.tokens.join(' ')) === wordBag(question.answer), `${question.id}: unsolvable order`);
    } else {
      expect(false, `${question.id}: unknown exercise type`);
    }
    if (question.skill === 'listening') {
      expect(Array.isArray(question.audioScript) && question.audioScript.length > 0, `${question.id}: needs a script`);
    }
  }
  for (const prompt of bank.prompts) {
    expect(Boolean(prompt.id && prompt.prompt), `${prompt.id}: incomplete prompt`);
    expect(!exerciseIds.has(prompt.id), `duplicate prompt id ${prompt.id}`);
    exerciseIds.add(prompt.id);
    expect(LEVEL_IDS.includes(prompt.level), `${prompt.id}: unknown level`);
    expect(['writing', 'speaking'].includes(prompt.skill), `${prompt.id}: unknown skill`);
  }
  expect(Object.entries(bankSkills).every(([skill, count]) => bank.counts.bySkill[skill] === count), 'bank skill counts mismatch');
  expect(LEVEL_IDS.every((id) => bank.counts.byLevel[id] === bankPerLevel[id]), 'bank level counts mismatch');

  const skills = read('skill-practice.json');
  const skillErrors = validateSkillPractice(skills);
  expect(skillErrors.length === 0, `skill content: ${skillErrors.slice(0, 3).join(' ')}`);
  for (const task of skills.tasks.filter((entry) => entry.skill === 'writing')) {
    const result = evaluateWriting(task, task.modelAnswer.join(' '));
    expect(result.complete, `${task.id}: model answer does not meet its own checklist`);
  }

  expect(lessons === 72, `expected 72 lessons, found ${lessons}`);
  expect(modules === 24, `expected 24 modules, found ${modules}`);
  expect(scenarios === 35, `expected 35 scenarios, found ${scenarios}`);

  return {
    summary: `${levels.length} levels · ${modules} modules · ${lessons} lessons · ${grammar.length} grammar · ${words.length} words · ${drillCount} drills · ${deck.length} cards · ${bank.questions.length} exercises · ${scenarios} scenarios · ${skills.tasks.length} skill tasks`,
  };
}
