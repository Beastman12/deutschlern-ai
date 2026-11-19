/**
 * Milestone 8 — deterministic writing checklist.
 *
 * This is deliberately a transparent rule checker, not grammar correction or
 * an AI score. It reports only the authored checks attached to the task: word
 * range, required phrases/terms and sentence count.
 */

export const FEEDBACK_LABEL = 'Checklist result · deterministic, not an AI grammar score';

export function normalizeWritingText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('de-DE')
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/[-‐-―]/g, ' ')
    .replace(/[.,!?;:„“”"«»()\[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  const normalized = normalizeWritingText(value);
  return normalized ? normalized.split(' ') : [];
}

export function countWords(value) {
  return tokens(value).length;
}

// Common German abbreviations whose period is not a sentence boundary.
// Multi-part forms such as "z. B." are covered by their single-letter parts.
const SENTENCE_ABBREVIATIONS = new Set([
  'dr', 'prof', 'herr', 'frau', 'fr', 'sr',
  'z', 'b', 'd', 'h', 'u', 'a', 'bzw', 'ca', 'etc', 'nr', 'no',
  'min', 'sek', 'std', 'vgl', 'sog', 'evtl', 'ggf', 'bspw', 'zz',
]);

export function countSentences(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const matches = [...text.matchAll(/[.!?]+(?=(?:\s|$|["'”’])|$)/g)];
  if (!matches.length) return 1;

  const boundaries = matches.filter((match) => {
    const before = text.slice(0, match.index).trim();
    const token = before.split(/[\s.]+/).pop()?.toLocaleLowerCase('de-DE') || '';
    return !SENTENCE_ABBREVIATIONS.has(token);
  });
  // A text that only ends in an abbreviation is still one sentence.
  return boundaries.length || 1;
}

function containsPhrase(text, phrase) {
  const normalizedPhrase = normalizeWritingText(phrase);
  if (!normalizedPhrase) return false;
  const phraseWords = normalizedPhrase.split(' ');
  const textWords = tokens(text);
  if (phraseWords.length === 1) return textWords.includes(phraseWords[0]);
  return textWords.some((word, index) => {
    if (word !== phraseWords[0]) return false;
    return phraseWords.slice(1).every((expected, offset) => {
      const actual = textWords[index + offset + 1];
      if (!actual) return false;
      const isLast = offset === phraseWords.length - 2;
      return isLast ? actual === expected || actual.startsWith(expected) : actual === expected;
    });
  });
}

function containsKeyword(text, keyword) {
  const normalizedKeyword = normalizeWritingText(keyword);
  if (!normalizedKeyword) return false;
  return tokens(text).some((word) => word === normalizedKeyword);
}

function evaluateCheck(check, text, stats) {
  let passed = false;
  let detail = '';

  if (check.type === 'wordCount') {
    passed = stats.words >= check.min && stats.words <= check.max;
    detail = `${stats.words} words · target ${check.min}–${check.max}`;
  } else if (check.type === 'sentences') {
    passed = stats.sentences >= check.min;
    detail = `${stats.sentences} sentences · minimum ${check.min}`;
  } else if (check.type === 'includes') {
    passed = containsPhrase(text, check.value);
    detail = passed
      ? `Found “${check.value}”.`
      : `Required phrase not found: “${check.value}”.`;
  } else if (check.type === 'keywords') {
    const found = (check.values || []).filter((value) => containsKeyword(text, value));
    passed = found.length >= check.min;
    detail = `${found.length} of ${check.min} required terms found${found.length ? `: ${found.join(', ')}` : ''}.`;
  } else {
    detail = 'This check type is not supported.';
  }

  return {
    id: String(check.id),
    type: check.type,
    label: String(check.label),
    passed,
    detail,
  };
}

/**
 * Evaluate one authored writing task against a learner's text.
 * `percent` is checklist completion only and must be labelled that way in UI.
 */
export function evaluateWriting(task, text) {
  const value = String(text ?? '');
  const stats = { words: countWords(value), sentences: countSentences(value) };
  const checks = Array.isArray(task?.checks) ? task.checks.map((check) => evaluateCheck(check, value, stats)) : [];
  const met = checks.filter((check) => check.passed).length;
  return {
    taskId: task?.id || '',
    words: stats.words,
    sentences: stats.sentences,
    checks,
    met,
    total: checks.length,
    percent: checks.length ? Math.round((met / checks.length) * 100) : 0,
    complete: checks.length > 0 && met === checks.length,
    label: FEEDBACK_LABEL,
  };
}

/** Compact representation for the local attempt log. */
export function writingResultToDetails(result) {
  return result.checks.map((check) => ({
    id: check.id,
    type: 'check',
    correct: check.passed,
    label: check.label,
    given: check.detail,
  }));
}
