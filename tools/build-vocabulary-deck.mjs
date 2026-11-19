/**
 * Build content/vocabulary-deck.json from the curated vocabulary list plus the
 * vocabulary sections of all 72 lesson bodies.
 *
 * The deck is a derived artefact: every card comes from content the learner can
 * already see elsewhere, so flashcards can never drift into invented words.
 *
 *   npm run build:deck
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const LEVEL_IDS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(CONTENT, file), 'utf8'));

function fold(text) {
  return String(text)
    .normalize('NFC')
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('Ä', 'Ae')
    .replaceAll('Ö', 'Oe')
    .replaceAll('Ü', 'Ue')
    .replaceAll('ß', 'ss');
}

function slug(text) {
  return fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44) || 'card';
}

function normalizeKey(german) {
  return String(german)
    .normalize('NFC')
    .toLocaleLowerCase('de-DE')
    .replace(/^(der|die|das)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leadingArticle(german) {
  const match = String(german).match(/^(der|die|das)\s+/i);
  return match ? match[1].toLowerCase() : null;
}

const levels = readJSON('levels.json').levels;
const vocabulary = readJSON('vocabulary.json').words;

const cards = [];
const seen = new Map();

function addCard(card, key) {
  if (seen.has(key)) return false;
  let id = card.id;
  let suffix = 2;
  while (cards.some((existing) => existing.id === id)) {
    id = `${card.id}-${suffix}`;
    suffix += 1;
  }
  seen.set(key, id);
  cards.push({ ...card, id });
  return true;
}

for (const word of vocabulary) {
  addCard(
    {
      id: word.id,
      de: word.de,
      en: word.en,
      article: word.article || leadingArticle(word.de),
      plural: word.plural || null,
      pronunciation: word.pronunciation || '',
      pos: word.pos || '',
      example: word.example,
      exampleEn: word.exampleEn,
      level: word.level,
      topic: word.topic,
      lessonId: null,
      lessonTitle: null,
      source: 'curated',
    },
    normalizeKey(word.de),
  );
}

let lessonEntries = 0;
for (const level of levels) {
  const course = readJSON(`${level.id}/course.json`);
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      const body = readJSON(`lessons/${lesson.id}.json`);
      const section = body.sections.find((item) => item.type === 'vocabulary');
      if (!section) continue;
      for (const item of section.items) {
        lessonEntries += 1;
        const key = normalizeKey(item.de);
        const added = addCard(
          {
            id: `deck-${slug(key)}`,
            de: item.de,
            en: item.en,
            article: item.article || leadingArticle(item.de),
            plural: item.plural || null,
            pronunciation: item.pronunciation || '',
            pos: item.article ? 'noun' : '',
            example: item.example,
            exampleEn: item.exampleEn,
            level: level.id,
            topic: module.title,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            source: 'lesson',
          },
          key,
        );
        if (!added) continue;
      }
    }
  }
}

const deck = {
  schemaVersion: 1,
  description:
    'Derived flashcard deck: 48 curated vocabulary entries plus every unique vocabulary item from the 72 lesson bodies.',
  counts: {
    cards: cards.length,
    curated: cards.filter((card) => card.source === 'curated').length,
    fromLessons: cards.filter((card) => card.source === 'lesson').length,
    lessonEntries,
  },
  cards,
};

const output = path.join(CONTENT, 'vocabulary-deck.json');
fs.writeFileSync(output, `${JSON.stringify(deck, null, 2)}\n`, 'utf8');

console.log(
  `Wrote ${cards.length} cards to ${path.relative(ROOT, output)} (${deck.counts.curated} curated, ${deck.counts.fromLessons} from lessons, ${lessonEntries} lesson entries before dedupe).`,
);
