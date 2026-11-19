/**
 * Authoring CLI for lesson bodies.
 *
 *   node tests/validate-lesson.mjs content/lessons/a1-m1-l1.json
 *   node tests/validate-lesson.mjs content/lessons            # validate every file
 *
 * Meant to be run while authoring; `npm test` runs the same checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLessonContent } from './checks/lesson-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const LESSONS = path.join(CONTENT, 'lessons');

const levelIds = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
const lessonMeta = new Map();
for (const levelId of levelIds) {
  const course = JSON.parse(fs.readFileSync(path.join(CONTENT, levelId, 'course.json'), 'utf8'));
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      lessonMeta.set(lesson.id, { lesson, levelId });
    }
  }
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node tests/validate-lesson.mjs <file-or-directory> [...]');
  process.exit(2);
}

const files = [];
for (const target of targets) {
  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) {
    console.error(`Missing path: ${resolved}`);
    process.exit(2);
  }
  if (fs.statSync(resolved).isDirectory()) {
    for (const name of fs.readdirSync(resolved)) {
      if (name.endsWith('.json')) files.push(path.join(resolved, name));
    }
  } else {
    files.push(resolved);
  }
}

let failures = 0;
for (const file of files.sort()) {
  const name = path.basename(file);
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`FAIL ${name} — invalid JSON: ${error.message}`);
    failures += 1;
    continue;
  }
  const meta = lessonMeta.get(doc.id);
  if (!meta) {
    console.error(`FAIL ${name} — id "${doc.id}" is not in the curriculum.`);
    failures += 1;
    continue;
  }
  const errors = validateLessonContent(doc, meta);
  if (errors.length) {
    failures += 1;
    console.error(`FAIL ${name} — ${errors.length} problem(s)`);
    for (const error of errors) console.error(`  - ${error}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

const expected = lessonMeta.size;
const present = fs.existsSync(LESSONS) ? fs.readdirSync(LESSONS).filter((name) => name.endsWith('.json')).length : 0;
console.log(`\n${present}/${expected} lesson bodies present.`);
if (failures) {
  console.error(`${failures} file(s) failed validation.`);
  process.exit(1);
}
