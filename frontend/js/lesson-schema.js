/**
 * Shared lesson-content contract.
 *
 * Every lesson body lives in content/lessons/<lessonId>.json and must contain
 * the same seventeen sections in the same order. Keeping the checks in one
 * module means the runtime loader, the authoring CLI and the test suite all
 * reject the same broken files.
 */

export const SECTION_TYPES = [
  'warmup',
  'objectives',
  'explanation',
  'rules',
  'vocabulary',
  'examples',
  'pronunciation',
  'culture',
  'dialogue',
  'grammar',
  'mcq',
  'gap',
  'order',
  'listening',
  'speaking',
  'mistakes',
  'assessment',
];

export const SECTION_TITLES = {
  warmup: 'Warm-up',
  objectives: 'Learning objectives',
  explanation: 'The big picture',
  rules: 'Rules & patterns',
  vocabulary: 'Vocabulary',
  examples: 'Example sentences',
  pronunciation: 'Pronunciation',
  culture: 'Cultural note',
  dialogue: 'Dialogue in context',
  grammar: 'Grammar spotlight',
  mcq: 'Choose the right answer',
  gap: 'Complete the sentence',
  order: 'Build the sentence',
  listening: 'Listening',
  speaking: 'Speaking',
  mistakes: 'Common mistakes',
  assessment: 'Lesson assessment',
};

const BLOCK_KINDS = new Set(['p', 'list', 'table', 'note', 'de']);
const ANSWER_TYPES = new Set(['mcq', 'gap', 'order']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTextArray = (value, min = 1) =>
  Array.isArray(value) && value.length >= min && value.every(isText);

function checkBlocks(blocks, path, errors, { min = 1 } = {}) {
  if (!Array.isArray(blocks) || blocks.length < min) {
    errors.push(`${path} must contain at least ${min} content block(s).`);
    return;
  }
  blocks.forEach((block, index) => {
    const where = `${path}[${index}]`;
    if (!isObject(block)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    if (!BLOCK_KINDS.has(block.kind)) {
      errors.push(`${where}.kind "${block.kind}" is not supported.`);
      return;
    }
    if (block.kind === 'list') {
      if (!isTextArray(block.items, 1)) errors.push(`${where}.items must be a non-empty string array.`);
    } else if (block.kind === 'table') {
      if (!isTextArray(block.headers, 2)) errors.push(`${where}.headers must contain at least two columns.`);
      if (!Array.isArray(block.rows) || block.rows.length < 1) {
        errors.push(`${where}.rows must contain at least one row.`);
      } else {
        block.rows.forEach((row, rowIndex) => {
          if (!Array.isArray(row) || row.length !== block.headers.length || !row.every(isText)) {
            errors.push(`${where}.rows[${rowIndex}] must have ${block.headers.length} text cells.`);
          }
        });
      }
    } else if (block.kind === 'note') {
      if (!isText(block.text)) errors.push(`${where}.text is required.`);
    } else if (block.kind === 'de') {
      if (!isText(block.text)) errors.push(`${where}.text is required.`);
      if (!isText(block.en)) errors.push(`${where}.en is required.`);
    } else if (!isText(block.text)) {
      errors.push(`${where}.text is required.`);
    }
  });
}

function checkQuestion(question, path, errors, seenIds) {
  if (!isObject(question)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (!isText(question.id)) errors.push(`${path}.id is required.`);
  else if (seenIds.has(question.id)) errors.push(`${path}.id "${question.id}" is duplicated.`);
  else seenIds.add(question.id);
  if (!isText(question.prompt)) errors.push(`${path}.prompt is required.`);
  if (!isText(question.explanation)) errors.push(`${path}.explanation is required.`);

  if (!ANSWER_TYPES.has(question.type)) {
    errors.push(`${path}.type must be mcq, gap or order.`);
    return;
  }

  if (question.type === 'mcq') {
    if (!Array.isArray(question.options) || question.options.length < 3 || !question.options.every(isText)) {
      errors.push(`${path}.options must contain at least three text options.`);
    }
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= (question.options?.length || 0)) {
      errors.push(`${path}.answer must be a valid option index.`);
    }
  } else if (question.type === 'gap') {
    if (!isTextArray(question.answers, 1)) errors.push(`${path}.answers must contain at least one accepted answer.`);
    if (!String(question.prompt).includes('___')) errors.push(`${path}.prompt must contain a ___ gap.`);
  } else {
    if (!isTextArray(question.tokens, 2)) errors.push(`${path}.tokens must contain at least two tokens.`);
    if (!isText(question.answer)) errors.push(`${path}.answer is required.`);
  }
}

/**
 * @returns {string[]} human-readable problems; an empty array means valid.
 */
export function validateLessonContent(doc, { lesson, levelId } = {}) {
  const errors = [];
  if (!isObject(doc)) return ['Lesson content must be a JSON object.'];
  if (!isText(doc.id)) errors.push('Lesson content needs an id.');
  if (lesson && doc.id !== lesson.id) errors.push(`Content id "${doc.id}" does not match lesson id "${lesson.id}".`);
  if (levelId && lesson && !doc.id.startsWith(`${levelId}-`)) {
    errors.push(`Content id "${doc.id}" does not belong to level ${levelId}.`);
  }
  if (doc.version !== 1) errors.push('Lesson content version must be 1.');
  if (!Array.isArray(doc.sections)) return [...errors, 'Lesson content needs a sections array.'];

  if (doc.sections.length !== SECTION_TYPES.length) {
    errors.push(`Expected ${SECTION_TYPES.length} sections, found ${doc.sections.length}.`);
  }

  const seenSectionIds = new Set();
  const questionIds = new Set();

  doc.sections.forEach((section, index) => {
    const path = `sections[${index}]`;
    if (!isObject(section)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    if (!isText(section.id)) errors.push(`${path}.id is required.`);
    else if (seenSectionIds.has(section.id)) errors.push(`${path}.id "${section.id}" is duplicated.`);
    else seenSectionIds.add(section.id);

    const expectedType = SECTION_TYPES[index];
    if (section.type !== expectedType) {
      errors.push(`${path}.type must be "${expectedType}" at position ${index + 1}, found "${section.type}".`);
    }
    if (!isText(section.title)) errors.push(`${path}.title is required.`);
    if (!Number.isFinite(section.minutes) || section.minutes <= 0) errors.push(`${path}.minutes must be positive.`);
    if (section.lede !== undefined && !isText(section.lede)) errors.push(`${path}.lede must be text.`);

    switch (section.type) {
      case 'warmup':
        if (!isText(section.prompt)) errors.push(`${path}.prompt is required.`);
        if (!isTextArray(section.items, 1)) errors.push(`${path}.items must contain at least one prompt.`);
        break;
      case 'objectives':
        if (section.items !== undefined && !isTextArray(section.items, 1)) {
          errors.push(`${path}.items must be a non-empty string array when provided.`);
        }
        break;
      case 'explanation':
        checkBlocks(section.blocks, `${path}.blocks`, errors, { min: 2 });
        break;
      case 'rules':
        checkBlocks(section.blocks, `${path}.blocks`, errors, { min: 2 });
        break;
      case 'vocabulary':
        if (!Array.isArray(section.items) || section.items.length < 4) {
          errors.push(`${path}.items must contain at least four vocabulary entries.`);
          break;
        }
        section.items.forEach((item, itemIndex) => {
          const where = `${path}.items[${itemIndex}]`;
          if (!isObject(item)) return errors.push(`${where} must be an object.`);
          if (!isText(item.de)) errors.push(`${where}.de is required.`);
          if (!isText(item.en)) errors.push(`${where}.en is required.`);
          if (item.article !== undefined && !['der', 'die', 'das'].includes(item.article)) {
            errors.push(`${where}.article must be der, die or das when provided.`);
          }
          if (item.plural !== undefined && !isText(item.plural)) errors.push(`${where}.plural must be text.`);
          if (item.pronunciation !== undefined && !isText(item.pronunciation)) {
            errors.push(`${where}.pronunciation must be text.`);
          }
          if (!isText(item.example)) errors.push(`${where}.example is required.`);
          if (!isText(item.exampleEn)) errors.push(`${where}.exampleEn is required.`);
        });
        break;
      case 'examples':
        if (!Array.isArray(section.items) || section.items.length < 3) {
          errors.push(`${path}.items must contain at least three example sentences.`);
          break;
        }
        section.items.forEach((item, itemIndex) => {
          const where = `${path}.items[${itemIndex}]`;
          if (!isObject(item)) return errors.push(`${where} must be an object.`);
          if (!isText(item.de)) errors.push(`${where}.de is required.`);
          if (!isText(item.en)) errors.push(`${where}.en is required.`);
          if (item.note !== undefined && !isText(item.note)) errors.push(`${where}.note must be text.`);
        });
        break;
      case 'pronunciation':
        if (!Array.isArray(section.items) || section.items.length < 3) {
          errors.push(`${path}.items must contain at least three pronunciation items.`);
          break;
        }
        section.items.forEach((item, itemIndex) => {
          const where = `${path}.items[${itemIndex}]`;
          if (!isObject(item)) return errors.push(`${where} must be an object.`);
          if (!isText(item.de)) errors.push(`${where}.de is required.`);
          if (!isText(item.hint)) errors.push(`${where}.hint is required.`);
        });
        break;
      case 'culture':
        if (!isText(section.heading)) errors.push(`${path}.heading is required.`);
        checkBlocks(section.blocks, `${path}.blocks`, errors, { min: 2 });
        break;
      case 'dialogue':
        if (!isText(section.setting)) errors.push(`${path}.setting is required.`);
        if (!Array.isArray(section.lines) || section.lines.length < 4) {
          errors.push(`${path}.lines must contain at least four turns.`);
          break;
        }
        section.lines.forEach((line, lineIndex) => {
          const where = `${path}.lines[${lineIndex}]`;
          if (!isObject(line)) return errors.push(`${where} must be an object.`);
          if (!isText(line.speaker)) errors.push(`${where}.speaker is required.`);
          if (!isText(line.de)) errors.push(`${where}.de is required.`);
          if (!isText(line.en)) errors.push(`${where}.en is required.`);
        });
        break;
      case 'grammar':
        if (!isText(section.heading)) errors.push(`${path}.heading is required.`);
        checkBlocks(section.blocks, `${path}.blocks`, errors, { min: 2 });
        if (section.tip !== undefined && !isText(section.tip)) errors.push(`${path}.tip must be text.`);
        break;
      case 'mcq':
      case 'gap':
      case 'order': {
        const minimum = section.type === 'order' ? 3 : 4;
        if (!Array.isArray(section.exercises) || section.exercises.length < minimum) {
          errors.push(`${path}.exercises must contain at least ${minimum} exercises.`);
          break;
        }
        section.exercises.forEach((exercise, exerciseIndex) => {
          const where = `${path}.exercises[${exerciseIndex}]`;
          checkQuestion(exercise, where, errors, questionIds);
          if (exercise.type !== section.type) errors.push(`${where}.type must be "${section.type}".`);
        });
        break;
      }
      case 'listening':
        if (!Array.isArray(section.script) || section.script.length < 3) {
          errors.push(`${path}.script must contain at least three lines.`);
          break;
        }
        section.script.forEach((line, lineIndex) => {
          const where = `${path}.script[${lineIndex}]`;
          if (!isObject(line)) return errors.push(`${where} must be an object.`);
          if (!isText(line.de)) errors.push(`${where}.de is required.`);
          if (!isText(line.en)) errors.push(`${where}.en is required.`);
        });
        if (!Array.isArray(section.questions) || section.questions.length < 2) {
          errors.push(`${path}.questions must contain at least two questions.`);
          break;
        }
        section.questions.forEach((question, questionIndex) =>
          checkQuestion(question, `${path}.questions[${questionIndex}]`, errors, questionIds),
        );
        break;
      case 'speaking':
        if (!isText(section.prompt)) errors.push(`${path}.prompt is required.`);
        if (!isObject(section.model) || !isText(section.model.de) || !isText(section.model.en)) {
          errors.push(`${path}.model must contain de and en text.`);
        }
        if (!isTextArray(section.tips, 2)) errors.push(`${path}.tips must contain at least two tips.`);
        break;
      case 'mistakes':
        if (!Array.isArray(section.items) || section.items.length < 3) {
          errors.push(`${path}.items must contain at least three mistakes.`);
          break;
        }
        section.items.forEach((item, itemIndex) => {
          const where = `${path}.items[${itemIndex}]`;
          if (!isObject(item)) return errors.push(`${where} must be an object.`);
          if (!isText(item.wrong)) errors.push(`${where}.wrong is required.`);
          if (!isText(item.right)) errors.push(`${where}.right is required.`);
          if (!isText(item.why)) errors.push(`${where}.why is required.`);
        });
        break;
      case 'assessment': {
        const expectedCount = lesson?.assessment?.questions;
        const expectedScore = lesson?.assessment?.passScore;
        if (expectedCount && (!Array.isArray(section.questions) || section.questions.length !== expectedCount)) {
          errors.push(`${path}.questions must contain exactly ${expectedCount} questions.`);
        }
        if (!Array.isArray(section.questions) || section.questions.length < 5) {
          errors.push(`${path}.questions must contain at least five questions.`);
          break;
        }
        if (section.passScore !== expectedScore) {
          errors.push(`${path}.passScore must be ${expectedScore}, matching the curriculum.`);
        }
        section.questions.forEach((question, questionIndex) =>
          checkQuestion(question, `${path}.questions[${questionIndex}]`, errors, questionIds),
        );
        break;
      }
      default:
        errors.push(`${path}.type "${section.type}" is not recognised.`);
    }
  });

  if (errors.length === 0) {
    const assessment = doc.sections[16];
    const types = new Set(assessment.questions.map((question) => question.type));
    if (types.size === 1) errors.push('The assessment should mix at least two question types.');
  }

  return errors;
}

/** Return the assessment section, or null for malformed content. */
export function getAssessment(doc) {
  return doc?.sections?.find((section) => section.type === 'assessment') || null;
}
