/**
 * Curriculum integrity tests.
 *
 * These run directly against the JSON files, without a browser or server, so a
 * broken lesson is caught before the UI ever tries to render it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillPractice } from '../frontend/js/skill-content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '..', 'content');
const LEVEL_IDS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
const COLORS = new Set(['indigo', 'sky', 'teal', 'amber', 'rose', 'violet']);

const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));

const levelsDoc = readJSON('levels.json');
const levels = levelsDoc.levels;
const courses = Object.fromEntries(LEVEL_IDS.map((id) => [id, readJSON(`${id}/course.json`)]));
const grammar = readJSON('grammar.json');
const vocabulary = readJSON('vocabulary.json');
const grammarDrills = readJSON('grammar-drills.json');
const vocabularyDeck = readJSON('vocabulary-deck.json');
const exerciseBank = readJSON('exercise-bank.json');

const allLessons = levels.flatMap((level) =>
  courses[level.id].modules.flatMap((module) =>
    module.lessons.map((lesson) => ({ lesson, module, level })),
  ),
);

test('levels.json defines the complete A1–C2 ladder in order', () => {
  assert.equal(levelsDoc.schemaVersion, 1);
  assert.ok(Array.isArray(levels), 'levels must be an array');
  assert.equal(levels.length, 6);
  assert.deepEqual(
    levels.map((level) => level.id),
    LEVEL_IDS,
  );

  for (const level of levels) {
    assert.match(level.code, /^[ABC][12]$/, `bad code for ${level.id}`);
    assert.equal(level.code.toLowerCase(), level.id);
    assert.ok(level.name.length > 2, `${level.id} needs a name`);
    assert.ok(level.title.length > 5, `${level.id} needs a title`);
    assert.ok(level.tagline.length > 20, `${level.id} needs a tagline`);
    assert.ok(COLORS.has(level.color), `${level.id} has an unknown colour "${level.color}"`);
    assert.ok(Number.isFinite(level.hours) && level.hours > 0, `${level.id} needs hours`);
  }
});

test('every level has a four-module course with three lessons per module', () => {
  for (const level of levels) {
    const course = courses[level.id];
    assert.equal(course.id, level.id);
    assert.equal(course.code, level.code);
    assert.ok(course.title && course.tagline && course.overview && course.levelGoal);
    assert.ok(Array.isArray(course.canDo) && course.canDo.length >= 4);
    assert.ok(Array.isArray(course.scenarios) && course.scenarios.length >= 5);
    assert.equal(course.modules.length, 4, `${level.id} should have four modules`);

    course.modules.forEach((module, moduleIndex) => {
      assert.equal(module.number, moduleIndex + 1, `${module.id} has a bad number`);
      assert.match(module.id, new RegExp(`^${level.id}-m${moduleIndex + 1}$`));
      assert.ok(module.title && module.titleDe && module.summary);
      assert.equal(module.lessons.length, 3, `${module.id} should have three lessons`);

      module.lessons.forEach((lesson, lessonIndex) => {
        assert.match(
          lesson.id,
          new RegExp(`^${level.id}-m${moduleIndex + 1}-l${lessonIndex + 1}$`),
          `unexpected lesson id ${lesson.id}`,
        );
        assert.equal(lesson.number, lessonIndex + 1);
        assert.ok(lesson.title.length > 5, `${lesson.id} needs a title`);
        assert.ok(lesson.titleDe.length > 3, `${lesson.id} needs a German title`);
        assert.ok(lesson.summary.length > 30, `${lesson.id} needs a summary`);
        assert.ok(Number.isFinite(lesson.minutes) && lesson.minutes >= 5, `${lesson.id} needs minutes`);
        assert.ok(Array.isArray(lesson.skills) && lesson.skills.length >= 1, `${lesson.id} needs skills`);
        assert.ok(
          Array.isArray(lesson.objectives) && lesson.objectives.length >= 2,
          `${lesson.id} needs at least two objectives`,
        );
        assert.ok(Array.isArray(lesson.vocab) && lesson.vocab.length >= 3, `${lesson.id} needs vocabulary`);
        assert.ok(lesson.keyPhrase?.de && lesson.keyPhrase?.en, `${lesson.id} needs a key phrase`);

        const assessment = lesson.assessment;
        assert.ok(assessment && typeof assessment === 'object', `${lesson.id} needs an assessment`);
        assert.ok(assessment.type.length > 3, `${lesson.id} assessment needs a type`);
        assert.ok(Number.isInteger(assessment.questions) && assessment.questions > 0);
        assert.ok(
          Number.isFinite(assessment.passScore) && assessment.passScore > 0 && assessment.passScore <= 100,
          `${lesson.id} pass score must be 1–100`,
        );
      });
    });

    for (const scenario of course.scenarios) {
      assert.ok(scenario.title && scenario.titleDe, `${level.id} scene needs both languages`);
    }
  }
});

test('lesson ids are globally unique and total 72', () => {
  const ids = allLessons.map(({ lesson }) => lesson.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate lesson id found');
  assert.equal(ids.length, 72);
  assert.equal(allLessons.length, 72);
});

test('grammar.json covers every level with complete explanations', () => {
  assert.ok(Array.isArray(grammar.topics));
  assert.equal(grammar.topics.length, 30);
  const ids = new Set();
  const perLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));

  for (const topic of grammar.topics) {
    assert.ok(!ids.has(topic.id), `duplicate grammar id ${topic.id}`);
    ids.add(topic.id);
    assert.ok(LEVEL_IDS.includes(topic.level), `topic ${topic.id} has an unknown level`);
    perLevel[topic.level] += 1;
    assert.ok(topic.title && topic.titleDe && topic.summary);
    assert.ok(Array.isArray(topic.points) && topic.points.length >= 2, `${topic.id} needs teaching points`);
    assert.ok(topic.example?.de && topic.example?.en, `${topic.id} needs a bilingual example`);
  }

  for (const id of LEVEL_IDS) {
    assert.ok(perLevel[id] >= 4, `${id} needs at least four grammar topics (has ${perLevel[id]})`);
  }
});

test('vocabulary.json has 48 complete, unique entries', () => {
  assert.ok(Array.isArray(vocabulary.words));
  assert.equal(vocabulary.words.length, 48);
  const ids = new Set();
  const germanWords = new Set();
  const perLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));

  for (const word of vocabulary.words) {
    assert.ok(!ids.has(word.id), `duplicate vocabulary id ${word.id}`);
    assert.ok(!germanWords.has(word.de), `duplicate German word ${word.de}`);
    ids.add(word.id);
    germanWords.add(word.de);
    assert.ok(LEVEL_IDS.includes(word.level), `${word.id} has an unknown level`);
    perLevel[word.level] += 1;
    assert.ok(word.de && word.en && word.pronunciation && word.pos && word.topic);
    assert.ok(word.example && word.exampleEn, `${word.id} needs a bilingual example`);
    if (word.pos === 'noun') {
      assert.ok(['der', 'die', 'das'].includes(word.article), `${word.id} needs a definite article`);
      assert.match(word.de, /^(der|die|das)\s+/, `${word.id} should include its article`);
      assert.ok(word.plural, `${word.id} needs a plural`);
    }
  }

  for (const id of LEVEL_IDS) {
    assert.ok(perLevel[id] >= 6, `${id} needs at least six words (has ${perLevel[id]})`);
  }
});

test('curriculum totals match the numbers shown in the UI', () => {
  assert.equal(allLessons.length, 72);
  assert.equal(Object.values(courses).reduce((sum, course) => sum + course.modules.length, 0), 24);
  assert.equal(grammar.topics.length, 30);
  assert.equal(vocabulary.words.length, 48);

  const scenarios = Object.values(courses).reduce((sum, course) => sum + course.scenarios.length, 0);
  assert.equal(scenarios, 35);
});

test('grammar-drills.json covers every grammar topic with valid tables and drills', () => {
  assert.ok(Array.isArray(grammarDrills.topics), 'grammar drills must be an array');
  const grammarIds = new Set(grammar.topics.map((topic) => topic.id));
  const drillTopicIds = new Set();
  const drillIds = new Set();
  let drillCount = 0;

  for (const entry of grammarDrills.topics) {
    assert.ok(grammarIds.has(entry.id), `${entry.id} has no grammar explanation`);
    assert.ok(!drillTopicIds.has(entry.id), `duplicate drill topic ${entry.id}`);
    drillTopicIds.add(entry.id);
    assert.ok(Array.isArray(entry.tables) && entry.tables.length >= 1, `${entry.id} needs a reference table`);

    for (const table of entry.tables) {
      assert.ok(table.title, `${entry.id} table needs a title`);
      assert.ok(Array.isArray(table.headers) && table.headers.length >= 2);
      assert.ok(Array.isArray(table.rows) && table.rows.length >= 1);
      for (const row of table.rows) {
        assert.equal(row.length, table.headers.length, `${entry.id} table row width mismatch`);
        assert.ok(
          row.every((cell) => typeof cell === 'string' && cell.trim().length > 0),
          `${entry.id} table has an empty cell`,
        );
      }
    }

    assert.ok(Array.isArray(entry.drills) && entry.drills.length >= 3, `${entry.id} needs three drills`);
    for (const drill of entry.drills) {
      drillCount += 1;
      assert.ok(drill.id && drill.prompt && drill.explanation, `${entry.id} has an incomplete drill`);
      assert.ok(!drillIds.has(drill.id), `duplicate drill id ${drill.id}`);
      drillIds.add(drill.id);

      if (drill.type === 'mcq') {
        assert.ok(Array.isArray(drill.options) && drill.options.length >= 3);
        assert.ok(Number.isInteger(drill.answer) && drill.answer >= 0 && drill.answer < drill.options.length);
        assert.equal(new Set(drill.options).size, drill.options.length, `${drill.id} repeats an option`);
      } else if (drill.type === 'gap') {
        assert.ok(Array.isArray(drill.answers) && drill.answers.length >= 1);
        assert.match(drill.prompt, /___/, `${drill.id} is missing a gap`);
      } else if (drill.type === 'order') {
        assert.ok(Array.isArray(drill.tokens) && drill.tokens.length >= 2);
        assert.ok(drill.answer, `${drill.id} needs an answer sentence`);
        const words = (value) =>
          String(value)
            .toLocaleLowerCase('de-DE')
            .replace(/[’‘]/g, "'")
            .replace(/[.!?]+$/g, '')
            .trim()
            .split(/\s+/)
            .sort();
        assert.deepEqual(
          words(drill.tokens.join(' ')),
          words(drill.answer),
          `${drill.id} cannot be solved with its tokens`,
        );
      } else {
        assert.fail(`${drill.id} has an unknown type ${drill.type}`);
      }
    }
  }

  for (const topic of grammar.topics) {
    assert.ok(drillTopicIds.has(topic.id), `${topic.id} has no drill set`);
  }
  assert.equal(drillCount, 90, `expected 90 grammar drills, found ${drillCount}`);
});

test('vocabulary-deck.json is a unique, sourced deck of curated and lesson words', () => {
  assert.ok(Array.isArray(vocabularyDeck.cards), 'vocabulary deck must be an array');
  assert.equal(vocabularyDeck.cards.length, 369);

  const curatedIds = new Set(vocabulary.words.map((word) => word.id));
  const lessonIds = new Set(allLessons.map(({ lesson }) => lesson.id));
  const cardIds = new Set();
  const words = new Set();
  const coveredCurated = new Set();
  const perLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));

  for (const card of vocabularyDeck.cards) {
    assert.ok(card.id && card.de && card.en, 'deck card is incomplete');
    assert.ok(!cardIds.has(card.id), `duplicate deck id ${card.id}`);
    cardIds.add(card.id);
    const key = card.de.toLocaleLowerCase('de-DE');
    assert.ok(!words.has(key), `duplicate deck word ${card.de}`);
    words.add(key);

    assert.ok(LEVEL_IDS.includes(card.level), `${card.id} has an unknown level`);
    perLevel[card.level] += 1;
    assert.ok(card.topic, `${card.id} needs a topic`);
    if (card.pronunciation) {
      assert.equal(typeof card.pronunciation, 'string');
      assert.ok(card.pronunciation.trim().length > 0, `${card.id} has an empty pronunciation`);
    }
    assert.ok(card.example && card.exampleEn, `${card.id} needs a bilingual example`);

    if (card.article) {
      assert.ok(['der', 'die', 'das'].includes(card.article), `${card.id} has an invalid article`);
      assert.ok(card.de.startsWith(`${card.article} `), `${card.id} does not start with its article`);
    }

    if (card.source === 'curated') {
      assert.ok(curatedIds.has(card.id), `${card.id} is not in vocabulary.json`);
      coveredCurated.add(card.id);
    } else if (card.source === 'lesson') {
      assert.ok(card.id.startsWith('deck-'), `${card.id} should use the lesson-card id prefix`);
      assert.ok(card.lessonId && lessonIds.has(card.lessonId), `${card.id} references an unknown lesson`);
      assert.ok(card.lessonTitle, `${card.id} needs its source lesson title`);
    } else {
      assert.fail(`${card.id} has an unknown source ${card.source}`);
    }
  }

  assert.equal(coveredCurated.size, 48, 'every curated word should be in the deck');
  for (const id of LEVEL_IDS) {
    assert.ok(perLevel[id] > 0, `${id} has no flashcards`);
  }
});

test('exercise-bank.json is a complete authored bank for practice and exams', () => {
  assert.ok(Array.isArray(exerciseBank.questions), 'exercise bank must have questions');
  assert.ok(Array.isArray(exerciseBank.prompts), 'exercise bank must have prompts');
  assert.equal(exerciseBank.questions.length, 1995);
  assert.equal(exerciseBank.prompts.length, 144);

  const lessonIds = new Set(allLessons.map(({ lesson }) => lesson.id));
  const topicIds = new Set(grammar.topics.map((topic) => topic.id));
  const ids = new Set();
  const skills = { reading: 0, listening: 0, vocabulary: 0, grammar: 0 };
  const perLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));
  const words = (value) =>
    String(value)
      .toLocaleLowerCase('de-DE')
      .normalize('NFC')
      .replace(/[’‘]/g, "'")
      .replace(/[.,!?;:„“”"]/g, '')
      .trim()
      .split(/\s+/)
      .sort()
      .join(' ');

  for (const question of exerciseBank.questions) {
    assert.ok(question.id && question.prompt && question.explanation, `${question.id} is incomplete`);
    assert.ok(!ids.has(question.id), `duplicate exercise id ${question.id}`);
    ids.add(question.id);
    assert.ok(LEVEL_IDS.includes(question.level), `${question.id} has an unknown level`);
    assert.ok(Object.hasOwn(skills, question.skill), `${question.id} has an unknown skill`);
    skills[question.skill] += 1;
    perLevel[question.level] += 1;

    assert.ok(
      ['lesson-practice', 'lesson-assessment', 'lesson-listening', 'grammar-drill'].includes(question.sourceType),
      `${question.id} has an unknown source type`,
    );
    if (question.lessonId) assert.ok(lessonIds.has(question.lessonId), `${question.id} has an unknown lesson`);
    if (question.topicId) assert.ok(topicIds.has(question.topicId), `${question.id} has an unknown grammar topic`);

    if (question.type === 'mcq') {
      assert.ok(question.options.length >= 3, `${question.id} needs options`);
      assert.ok(Number.isInteger(question.answer) && question.answer < question.options.length);
    } else if (question.type === 'gap') {
      assert.ok(question.answers.length > 0, `${question.id} needs answers`);
      assert.match(question.prompt, /___/, `${question.id} is missing its gap`);
    } else if (question.type === 'order') {
      assert.deepEqual(words(question.tokens.join(' ')), words(question.answer), `${question.id} is unsolvable`);
    } else {
      assert.fail(`${question.id} has an unknown type`);
    }

    if (question.skill === 'listening') {
      assert.ok(question.audioScript.length > 0, `${question.id} needs an audio script`);
    }
  }

  for (const prompt of exerciseBank.prompts) {
    assert.ok(prompt.id && prompt.prompt, 'prompt is incomplete');
    assert.ok(!ids.has(prompt.id), `duplicate prompt id ${prompt.id}`);
    ids.add(prompt.id);
    assert.ok(LEVEL_IDS.includes(prompt.level), `${prompt.id} has an unknown level`);
    assert.ok(['writing', 'speaking'].includes(prompt.skill), `${prompt.id} has an unknown skill`);
    if (prompt.skill === 'writing') assert.ok(prompt.checklist.length >= 3, `${prompt.id} needs a checklist`);
    if (prompt.skill === 'speaking') assert.ok(prompt.model?.de, `${prompt.id} needs a model answer`);
  }

  for (const [skill, count] of Object.entries(skills)) {
    assert.ok(count >= 100, `${skill} needs at least 100 questions (has ${count})`);
  }
  for (const id of LEVEL_IDS) {
    assert.ok(perLevel[id] >= 300, `${id} needs at least 300 questions (has ${perLevel[id]})`);
  }
  assert.deepEqual(exerciseBank.counts.bySkill, skills);
  assert.deepEqual(exerciseBank.counts.byLevel, perLevel);
});

test('every course can produce a usable first lesson', () => {
  for (const level of levels) {
    const first = courses[level.id].modules[0].lessons[0];
    assert.ok(first, `${level.id} has no first lesson`);
    assert.ok(first.objectives.length >= 2);
    assert.ok(first.assessment.questions > 0);
  }
});

test('skill-practice.json holds 36 complete authored tasks separate from the bank', () => {
  const doc = readJSON('skill-practice.json');
  assert.deepEqual(validateSkillPractice(doc), []);
  assert.equal(doc.tasks.length, 36);
  assert.deepEqual(doc.counts.bySkill, { reading: 12, listening: 12, writing: 12 });
  assert.deepEqual(doc.counts.byLevel, {
    a1: 6,
    a2: 6,
    b1: 6,
    b2: 6,
    c1: 6,
    c2: 6,
  });

  const bankIds = new Set(exerciseBank.questions.map((question) => question.id));
  for (const task of doc.tasks) {
    assert.ok(!bankIds.has(task.id), `${task.id} collides with an exercise-bank id`);
  }
  assert.equal(doc.tasks.filter((task) => task.skill === 'writing').length, 12);
  assert.equal(
    doc.tasks
      .filter((task) => task.skill === 'reading' || task.skill === 'listening')
      .reduce((sum, task) => sum + task.questions.length, 0),
    72,
  );
  assert.equal(
    doc.tasks
      .filter((task) => task.skill === 'listening')
      .reduce((sum, task) => sum + task.dictation.length, 0),
    24,
  );
});
