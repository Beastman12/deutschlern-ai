/**
 * Build content/exercise-bank.json from the authored lesson bodies and the
 * grammar drill sets.
 *
 * This is a derived artefact, not generated question text: every prompt,
 * option, answer and explanation already exists in a lesson or grammar file.
 * The build step only tags items with a skill and gives them stable IDs so the
 * Practice Exercises and Mock Examinations pages can sample them.
 *
 *   npm run build:exercises
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const LEVEL_IDS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(CONTENT, file), 'utf8'));

const SKILL_BY_TYPE = {
  mcq: 'reading',
  gap: 'vocabulary',
  order: 'grammar',
};

const levels = readJSON('levels.json').levels;
const grammarTopics = readJSON('grammar.json').topics;
const grammarDrills = readJSON('grammar-drills.json').topics;
const topicById = new Map(grammarTopics.map((topic) => [topic.id, topic]));

const questions = [];
const prompts = [];
const seenIds = new Set();

function addQuestion(question) {
  if (seenIds.has(question.id)) throw new Error(`Duplicate exercise id: ${question.id}`);
  seenIds.add(question.id);
  questions.push(question);
}

function addPrompt(prompt) {
  if (seenIds.has(prompt.id)) throw new Error(`Duplicate exercise id: ${prompt.id}`);
  seenIds.add(prompt.id);
  prompts.push(prompt);
}

function copyQuestion(question) {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    ...(question.options ? { options: [...question.options] } : {}),
    ...(Number.isInteger(question.answer) ? { answer: question.answer } : {}),
    ...(question.answers ? { answers: [...question.answers] } : {}),
    ...(question.tokens ? { tokens: [...question.tokens] } : {}),
    ...(question.answer && typeof question.answer === 'string' ? { answer: question.answer } : {}),
    explanation: question.explanation,
  };
}

for (const level of levels) {
  const course = readJSON(`${level.id}/course.json`);
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      const body = readJSON(`lessons/${lesson.id}.json`);
      const source = {
        level: level.id,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        topic: module.title,
      };

      for (const kind of ['mcq', 'gap', 'order']) {
        const section = body.sections.find((entry) => entry.type === kind);
        if (!section) continue;
        for (const question of section.exercises || []) {
          addQuestion({
            ...copyQuestion(question),
            id: `ex-l-${lesson.id}-${question.id}`,
            sourceId: question.id,
            sourceType: 'lesson-practice',
            sourceLabel: `${lesson.title} · ${section.title}`,
            skill: SKILL_BY_TYPE[kind],
            ...source,
          });
        }
      }

      const assessment = body.sections.find((entry) => entry.type === 'assessment');
      for (const question of assessment?.questions || []) {
        addQuestion({
          ...copyQuestion(question),
          id: `ex-a-${lesson.id}-${question.id}`,
          sourceId: question.id,
          sourceType: 'lesson-assessment',
          sourceLabel: `${lesson.title} · Lesson check`,
          skill: SKILL_BY_TYPE[question.type] || 'reading',
          ...source,
        });
      }

      const listening = body.sections.find((entry) => entry.type === 'listening');
      for (const question of listening?.questions || []) {
        addQuestion({
          ...copyQuestion(question),
          id: `ex-listen-${lesson.id}-${question.id}`,
          sourceId: question.id,
          sourceType: 'lesson-listening',
          sourceLabel: `${lesson.title} · Listening`,
          skill: 'listening',
          audioScript: (listening.script || []).map((line) => ({ ...line })),
          ...source,
        });
      }

      const speaking = body.sections.find((entry) => entry.type === 'speaking');
      if (speaking?.prompt) {
        addPrompt({
          id: `ex-prompt-speaking-${lesson.id}`,
          skill: 'speaking',
          level: level.id,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          topic: module.title,
          prompt: speaking.prompt,
          model: speaking.model ? { ...speaking.model } : null,
          tips: [...(speaking.tips || [])],
        });
        addPrompt({
          id: `ex-prompt-writing-${lesson.id}`,
          skill: 'writing',
          level: level.id,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          topic: module.title,
          prompt: `Write 4–6 sentences in German. ${speaking.prompt}`,
          keyPhrase: lesson.keyPhrase ? { ...lesson.keyPhrase } : null,
          checklist: [
            'Start each sentence with a capital letter.',
            'Capitalise every German noun.',
            'Check that the verb agrees with its subject.',
            ...(lesson.keyPhrase?.de ? [`Try to use: “${lesson.keyPhrase.de}”.`] : []),
          ],
        });
      }
    }
  }
}

for (const entry of grammarDrills) {
  const topic = topicById.get(entry.id);
  for (const drill of entry.drills) {
    addQuestion({
      ...copyQuestion(drill),
      id: `ex-g-${drill.id}`,
      sourceId: drill.id,
      sourceType: 'grammar-drill',
      sourceLabel: `${topic?.title || entry.id} · Grammar drill`,
      skill: 'grammar',
      level: topic?.level || entry.id.slice(0, 2),
      lessonId: null,
      lessonTitle: null,
      topic: topic?.title || entry.id,
      topicId: entry.id,
    });
  }
}

const countBy = (items, key) =>
  items.reduce((result, item) => {
    result[item[key]] = (result[item[key]] || 0) + 1;
    return result;
  }, {});

const bank = {
  schemaVersion: 1,
  description:
    'Authored exercise bank derived from the 72 lesson bodies and 30 grammar drill sets. No question text is invented at build time or in the browser.',
  skills: ['reading', 'listening', 'vocabulary', 'grammar', 'writing', 'speaking'],
  counts: {
    questions: questions.length,
    prompts: prompts.length,
    bySkill: countBy(questions, 'skill'),
    byLevel: countBy(questions, 'level'),
  },
  questions,
  prompts,
};

const output = path.join(CONTENT, 'exercise-bank.json');
fs.writeFileSync(output, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');

console.log(
  `Wrote ${questions.length} questions and ${prompts.length} prompts to ${path.relative(ROOT, output)}.`,
);
console.log(`By skill: ${JSON.stringify(bank.counts.bySkill)}`);
console.log(`By level: ${JSON.stringify(bank.counts.byLevel)}`);
