/**
 * Client-side persistence for the learner profile and progress.
 *
 * The app stays fully usable without an account: data lives in localStorage.
 * Milestone 7 adds optional server sync using the same state shape, so a
 * signed-in learner can move their real progress to another device.
 */

import { FLASHCARD_GRADES, isCardLearned, normalizeCardRecord, scheduleCard } from './srs.js';

const STATE_KEY = 'dl:state:v1';
const PREFS_KEY = 'dl:preferences';
const SYNC_KEY = 'dl:sync:v1';
const CHANGE_EVENT = 'dl:change';
const STORAGE_ERROR_EVENT = 'dl:storage-error';
let storageWarningSent = false;

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system', // light | dark | system
  reduceMotion: false,
  largeText: false,
  dailyGoal: 20, // minutes
  speechRate: 1,
  sidebarCollapsed: false,
  demoData: false,
});

export const DEFAULT_STATE = Object.freeze({
  version: 7,
  profile: {
    name: '',
    nativeLanguage: 'English',
    learningGoal: 'Travel & everyday life',
    targetLevel: 'b1',
    createdAt: null,
  },
  progress: {
    completedLessons: {},
    quizAttempts: [],
    lessonSessions: {},
    favoriteWords: [],
    learnedWords: [],
    studyLog: {},
    grammarDrills: {},
    grammarMistakes: [],
    flashcards: {},
    flashcardLog: [],
    practiceAttempts: [],
    practiceMistakes: [],
    examAttempts: [],
    examActive: {},
    aiConversations: [],
    speakingAttempts: [],
    pronunciationLog: [],
    skillAttempts: [],
    writingDrafts: {},
    skills: {
      reading: 0,
      listening: 0,
      speaking: 0,
      writing: 0,
      grammar: 0,
      vocabulary: 0,
    },
  },
  updatedAt: null,
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* Map keys come from localStorage and from the sync endpoint. Only plain,
   bounded, own keys may reach a plain object — otherwise a payload such as
   {"__proto__": …} can pollute prototypes or make writes/sync throw. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_MAP_ENTRIES = 300;

function safeEntries(value) {
  if (!isObject(value)) return [];
  return Object.entries(value).filter(([key]) => key && !UNSAFE_KEYS.has(key));
}

function safeObject(value, cap = MAX_MAP_ENTRIES) {
  return Object.fromEntries(safeEntries(value).slice(0, cap));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeRead(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`[store] Could not read ${key}.`, error);
    return null;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[store] Could not write ${key}.`, error);
    // Keep the in-memory state usable, but make the failed save visible. The
    // shell listens once and warns the learner instead of silently diverging.
    if (!storageWarningSent) {
      storageWarningSent = true;
      try {
        window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key } }));
      } catch {
        // A missing window (unit tests) must not turn a write failure into a crash.
      }
    }
    return false;
  }
}

function emit(type) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { type } }));
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                 */
/* -------------------------------------------------------------------------- */

let preferences = null;

export function getPreferences() {
  if (!preferences) {
    const stored = safeRead(PREFS_KEY);
    preferences = {
      ...clone(DEFAULT_PREFERENCES),
      ...(isObject(stored) ? stored : {}),
    };
  }
  return clone(preferences);
}

export function updatePreferences(patch) {
  const current = getPreferences();
  const next = { ...current, ...patch };
  preferences = next;
  safeWrite(PREFS_KEY, next);
  emit('preferences');
  return clone(next);
}

/* -------------------------------------------------------------------------- */
/* Learner state                                                               */
/* -------------------------------------------------------------------------- */

let state = null;

export function getState() {
  if (!state) {
    const stored = safeRead(STATE_KEY);
    state = normalizeState(stored);
  }
  return clone(state);
}

function normalizeCompletion(record) {
  if (!record) return null;
  if (!isObject(record)) {
    // Milestone 1 had no completion flow; any truthy leftover counts as passed.
    return {
      passed: true,
      completedAt: null,
      attempts: 0,
      bestScore: null,
      lastScore: null,
      lastAttemptAt: null,
    };
  }
  const bestScore = Number(record.bestScore ?? record.score);
  return {
    ...record,
    // Only a real boolean pass may unlock a lesson. Legacy truthy placeholders
    // were non-object records and are handled above; strings like "false" are
    // corrupt data, not a pass.
    passed: record.passed === true,
    completedAt: record.completedAt || record.firstPassedAt || null,
    attempts: Number.isFinite(Number(record.attempts)) ? Number(record.attempts) : 0,
    bestScore: Number.isFinite(bestScore) ? bestScore : null,
    lastScore: Number.isFinite(Number(record.lastScore)) ? Number(record.lastScore) : Number.isFinite(bestScore) ? bestScore : null,
    lastAttemptAt: record.lastAttemptAt || record.completedAt || null,
  };
}

function normalizeSession(session) {
  if (!isObject(session)) return null;
  return {
    sectionId: typeof session.sectionId === 'string' ? session.sectionId : null,
    sectionIndex: Number.isFinite(Number(session.sectionIndex)) ? Number(session.sectionIndex) : 0,
    visited: Array.isArray(session.visited) ? session.visited.filter((id) => typeof id === 'string') : [],
    startedAt: session.startedAt || null,
    updatedAt: session.updatedAt || null,
  };
}

/** Quiz attempts are read by the history, analytics and stats views. */
function normalizeQuizAttempt(record) {
  if (!isObject(record) || !record.id || !record.lessonId || !record.date) return null;
  const total = Math.max(0, Math.round(Number(record.total) || 0));
  const score = Math.max(0, Math.min(total, Math.round(Number(record.score) || 0)));
  const passScore = Number.isFinite(Number(record.passScore))
    ? Math.max(0, Math.min(100, Math.round(Number(record.passScore))))
    : 70;
  const percent = Number.isFinite(Number(record.percent))
    ? Math.max(0, Math.min(100, Math.round(Number(record.percent))))
    : total
      ? Math.round((score / total) * 100)
      : 0;
  return {
    id: String(record.id).slice(0, 100),
    lessonId: String(record.lessonId).slice(0, 120),
    level: typeof record.level === 'string' ? record.level.slice(0, 20) : null,
    title: typeof record.title === 'string' ? record.title.slice(0, 160) : '',
    score,
    total,
    percent,
    passScore,
    passed: record.passed !== false,
    date: isoDateOr(record.date, new Date().toISOString()),
  };
}

function normalizeIdList(value, cap = MAX_MAP_ENTRIES) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue;
    seen.add(item);
    result.push(item.slice(0, 120));
    if (result.length >= cap) break;
  }
  return result;
}

function normalizeStudyLog(value) {
  const result = {};
  for (const [key, minutes] of safeEntries(value).slice(0, MAX_MAP_ENTRIES)) {
    const amount = Number(minutes);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    result[key] = Math.min(1440, Math.round(amount));
  }
  return result;
}

function normalizeSkills(value, defaults) {
  const result = { ...defaults };
  for (const [key, score] of safeEntries(value)) {
    if (!(key in defaults)) continue;
    const amount = Number(score);
    result[key] = Number.isFinite(amount) ? Math.max(0, Math.min(100, Math.round(amount))) : defaults[key];
  }
  return result;
}

function normalizeDrillStat(record) {
  if (!isObject(record)) return null;
  const correct = Math.max(0, Number(record.correct) || 0);
  const total = Math.max(0, Number(record.total) || 0);
  return {
    attempts: Math.max(0, Math.round(Number(record.attempts) || 0)),
    correct,
    total,
    bestPercent: Number.isFinite(Number(record.bestPercent))
      ? Math.max(0, Math.min(100, Number(record.bestPercent)))
      : total > 0
        ? Math.round((correct / total) * 100)
        : null,
    lastPercent: Number.isFinite(Number(record.lastPercent))
      ? Math.max(0, Math.min(100, Number(record.lastPercent)))
      : null,
    lastAt: record.lastAt || null,
  };
}

function normalizeMistake(record) {
  if (!isObject(record)) return null;
  if (!record.topicId || !record.drillId || !record.prompt) return null;
  return {
    topicId: String(record.topicId),
    drillId: String(record.drillId),
    type: ['mcq', 'gap', 'order'].includes(record.type) ? record.type : 'gap',
    prompt: String(record.prompt),
    given: typeof record.given === 'string' ? record.given : '',
    answer: typeof record.answer === 'string' ? record.answer : '',
    explanation: typeof record.explanation === 'string' ? record.explanation : '',
    date: record.date || new Date().toISOString(),
  };
}

function normalizeFlashcardLog(record) {
  if (!isObject(record)) return null;
  if (!record.cardId || !['again', 'hard', 'good', 'easy'].includes(record.grade)) return null;
  return {
    cardId: String(record.cardId),
    grade: record.grade,
    date: record.date || new Date().toISOString(),
  };
}

function normalizePracticeAttempt(record) {
  if (!isObject(record) || !record.id || !record.date) return null;
  const total = Math.max(0, Math.round(Number(record.total) || 0));
  const correct = Math.max(0, Math.min(total, Math.round(Number(record.correct) || 0)));
  return {
    id: String(record.id),
    date: String(record.date),
    level: typeof record.level === 'string' ? record.level : 'all',
    skill: typeof record.skill === 'string' ? record.skill : 'all',
    type: typeof record.type === 'string' ? record.type : 'all',
    total,
    correct,
    percent: Number.isFinite(Number(record.percent))
      ? Math.max(0, Math.min(100, Number(record.percent)))
      : total
        ? Math.round((correct / total) * 100)
        : 0,
  };
}

function normalizePracticeMistake(record) {
  if (!isObject(record) || !record.id || !record.questionId || !record.prompt) return null;
  return {
    id: String(record.id),
    questionId: String(record.questionId),
    level: typeof record.level === 'string' ? record.level : 'all',
    skill: typeof record.skill === 'string' ? record.skill : 'all',
    type: ['mcq', 'gap', 'order'].includes(record.type) ? record.type : 'gap',
    prompt: String(record.prompt),
    given: typeof record.given === 'string' ? record.given : '',
    answer: typeof record.answer === 'string' ? record.answer : '',
    explanation: typeof record.explanation === 'string' ? record.explanation : '',
    date: record.date || new Date().toISOString(),
  };
}

function sanitizeAnswer(value) {
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' || typeof item === 'number').slice(0, 40);
  }
  return null;
}

function normalizeAnswers(answers) {
  if (!isObject(answers)) return {};
  const result = {};
  for (const [id, value] of safeEntries(answers).slice(0, 100)) {
    const answer = sanitizeAnswer(value);
    if (answer !== null) result[id] = answer;
  }
  return result;
}

function normalizeScoreGroups(groups) {
  if (!isObject(groups)) return {};
  const result = {};
  for (const [id, group] of safeEntries(groups).slice(0, 20)) {
    if (!isObject(group)) continue;
    const total = Math.max(0, Math.round(Number(group.total) || 0));
    result[id] = {
      correct: Math.max(0, Math.min(total, Math.round(Number(group.correct) || 0))),
      total,
      answered: Math.max(0, Math.min(total, Math.round(Number(group.answered) || 0))),
      percent: Number.isFinite(Number(group.percent)) ? Math.max(0, Math.min(100, Number(group.percent))) : null,
    };
  }
  return result;
}

function normalizeExamAttempt(record) {
  if (!isObject(record) || !record.id || !record.level || !record.completedAt) return null;
  const total = Math.max(0, Math.round(Number(record.total) || 0));
  const correct = Math.max(0, Math.min(total, Math.round(Number(record.correct) || 0)));
  return {
    id: String(record.id),
    level: String(record.level),
    startedAt: record.startedAt || null,
    completedAt: String(record.completedAt),
    durationMinutes: Math.max(1, Math.min(180, Math.round(Number(record.durationMinutes) || 30))),
    status: record.status === 'expired' ? 'expired' : 'submitted',
    total,
    correct,
    percent: Number.isFinite(Number(record.percent))
      ? Math.max(0, Math.min(100, Number(record.percent)))
      : total
        ? Math.round((correct / total) * 100)
        : 0,
    passed: record.passed === true,
    sections: normalizeScoreGroups(record.sections),
    skills: normalizeScoreGroups(record.skills),
  };
}

function normalizeExamActive(record) {
  if (!isObject(record) || !record.id || !record.level || !record.startedAt) return null;
  if (Number.isNaN(Date.parse(record.startedAt))) return null;
  return {
    id: String(record.id),
    level: String(record.level),
    startedAt: String(record.startedAt),
    durationMinutes: Math.max(1, Math.min(180, Math.round(Number(record.durationMinutes) || 30))),
    status: 'active',
    questionIds: Array.isArray(record.questionIds)
      ? record.questionIds.filter((id) => typeof id === 'string').slice(0, 100)
      : [],
    answers: normalizeAnswers(record.answers),
  };
}

const AI_LEVEL_RE = /^[abc][12]$/;
const AI_MODE_RE = /^(tutor|roleplay|voice)$/;

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${String(random).replace(/[^a-zA-Z0-9-]/g, '')}`;
}

function isoDateOr(value, fallback) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  return fallback;
}

function normalizeAIMessage(value, index = 0) {
  if (!isObject(value)) return null;
  const role = value.role === 'user' || value.role === 'assistant' ? value.role : null;
  const text = String(value.text ?? '').trim().slice(0, 1500);
  if (!role || !text) return null;

  return {
    id: typeof value.id === 'string' && value.id ? value.id.slice(0, 80) : `msg-${index}`,
    role,
    text,
    at: isoDateOr(value.at, null),
    translation: role === 'assistant' ? String(value.translation ?? '').slice(0, 1500) : '',
    correction: role === 'assistant' ? String(value.correction ?? '').slice(0, 500) : '',
    explanation: role === 'assistant' ? String(value.explanation ?? '').slice(0, 700) : '',
  };
}

function normalizeAIConversation(value) {
  if (!isObject(value) || !value.id) return null;
  const mode = AI_MODE_RE.test(String(value.mode)) ? String(value.mode) : 'tutor';
  const level = AI_LEVEL_RE.test(String(value.level)) ? String(value.level) : 'a1';
  const scenario = String(value.scenario ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const createdAt = isoDateOr(value.createdAt, new Date().toISOString());
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeAIMessage).filter(Boolean).slice(-60)
    : [];
  const title =
    String(value.title ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90) ||
    (scenario
      ? `Role-play: ${scenario}`
      : mode === 'roleplay'
        ? 'German role-play'
        : mode === 'voice'
          ? 'German voice chat'
          : 'German tutor');

  return {
    id: String(value.id).slice(0, 80),
    mode,
    level,
    scenario,
    title,
    createdAt,
    updatedAt: isoDateOr(value.updatedAt, createdAt),
    messages,
  };
}

const SPEECH_SOURCE_RE = /^(browser|azure|manual)$/;

function normalizeSpeakingAttempt(value) {
  if (!isObject(value) || !value.id || !value.date || !value.transcript) return null;
  return {
    id: String(value.id).slice(0, 80),
    date: isoDateOr(value.date, new Date().toISOString()),
    level: AI_LEVEL_RE.test(String(value.level)) ? String(value.level) : 'a1',
    promptId: String(value.promptId || '').slice(0, 100),
    prompt: String(value.prompt || '').slice(0, 500),
    model: String(value.model || '').slice(0, 500),
    transcript: String(value.transcript).slice(0, 1500),
    source: SPEECH_SOURCE_RE.test(String(value.source)) ? String(value.source) : 'manual',
    reply: String(value.reply || '').slice(0, 1500),
    correction: String(value.correction || '').slice(0, 500),
    explanation: String(value.explanation || '').slice(0, 700),
  };
}

function normalizePronunciationEntry(value) {
  if (!isObject(value) || !value.id || !value.date || !value.target || !value.transcript) return null;
  const total = Math.max(0, Math.round(Number(value.total) || 0));
  return {
    id: String(value.id).slice(0, 80),
    date: isoDateOr(value.date, new Date().toISOString()),
    level: AI_LEVEL_RE.test(String(value.level)) ? String(value.level) : 'a1',
    promptId: String(value.promptId || '').slice(0, 100),
    focus: String(value.focus || '').slice(0, 160),
    target: String(value.target).slice(0, 500),
    transcript: String(value.transcript).slice(0, 1500),
    matched: Math.max(0, Math.min(total, Math.round(Number(value.matched) || 0))),
    total,
    missed: Array.isArray(value.missed)
      ? value.missed.filter((word) => typeof word === 'string').slice(0, 40)
      : [],
    source: SPEECH_SOURCE_RE.test(String(value.source)) ? String(value.source) : 'manual',
  };
}

const SKILL_RE = /^(reading|listening|writing)$/;
const SKILL_MODE_RE = /^(comprehension|checklist)$/;
const SKILL_DETAIL_RE = /^(mcq|dictation|check)$/;

function normalizeSkillDetail(value) {
  if (!isObject(value) || !value.id) return null;
  return {
    id: String(value.id).slice(0, 100),
    type: SKILL_DETAIL_RE.test(String(value.type)) ? String(value.type) : 'mcq',
    correct: value.correct === true,
    given: typeof value.given === 'string' ? value.given.slice(0, 300) : '',
    expected: typeof value.expected === 'string' ? value.expected.slice(0, 300) : '',
    label: typeof value.label === 'string' ? value.label.slice(0, 180) : '',
    focus: typeof value.focus === 'string' ? value.focus.slice(0, 160) : '',
  };
}

function normalizeSkillAttempt(value) {
  if (!isObject(value) || !value.id || !value.date || !value.taskId) return null;
  if (!SKILL_RE.test(String(value.skill))) return null;
  const total = Math.max(0, Math.min(40, Math.round(Number(value.total) || 0)));
  const correct = Math.max(0, Math.min(total, Math.round(Number(value.correct) || 0)));
  const percent = Number.isFinite(Number(value.percent))
    ? Math.max(0, Math.min(100, Math.round(Number(value.percent))))
    : total
      ? Math.round((correct / total) * 100)
      : 0;
  return {
    id: String(value.id).slice(0, 80),
    date: isoDateOr(value.date, new Date().toISOString()),
    skill: String(value.skill),
    level: AI_LEVEL_RE.test(String(value.level)) ? String(value.level) : 'a1',
    taskId: String(value.taskId).slice(0, 100),
    mode: SKILL_MODE_RE.test(String(value.mode)) ? String(value.mode) : 'comprehension',
    total,
    correct,
    percent,
    words: Math.max(0, Math.min(5000, Math.round(Number(value.words) || 0))),
    sentences: Math.max(0, Math.min(500, Math.round(Number(value.sentences) || 0))),
    details: Array.isArray(value.details)
      ? value.details.map(normalizeSkillDetail).filter(Boolean).slice(0, 20)
      : [],
  };
}

function normalizeWritingDraft(value) {
  if (!isObject(value)) return null;
  const text = String(value.text ?? '').slice(0, 6000);
  if (!text.trim()) return null;
  return {
    taskId: String(value.taskId ?? '').slice(0, 100),
    text,
    updatedAt: isoDateOr(value.updatedAt, new Date().toISOString()),
  };
}

/** Exported for Milestone 9 tests: hostile/corrupt persisted state must fail safe. */
export function normalizeState(stored) {
  const base = clone(DEFAULT_STATE);
  if (!isObject(stored)) return base;

  const progress = isObject(stored.progress) ? stored.progress : {};
  const completedLessons = {};
  for (const [id, record] of safeEntries(progress.completedLessons).slice(0, MAX_MAP_ENTRIES)) {
    const normalized = normalizeCompletion(record);
    if (normalized) completedLessons[id] = normalized;
  }

  const lessonSessions = {};
  for (const [id, session] of safeEntries(progress.lessonSessions).slice(0, MAX_MAP_ENTRIES)) {
    const normalized = normalizeSession(session);
    if (normalized) lessonSessions[id] = normalized;
  }

  const grammarDrills = {};
  for (const [id, stat] of safeEntries(progress.grammarDrills).slice(0, MAX_MAP_ENTRIES)) {
    const normalized = normalizeDrillStat(stat);
    if (normalized) grammarDrills[id] = normalized;
  }

  const grammarMistakes = Array.isArray(progress.grammarMistakes)
    ? progress.grammarMistakes.map(normalizeMistake).filter(Boolean).slice(-200)
    : [];

  const flashcards = {};
  for (const [id, record] of safeEntries(progress.flashcards).slice(0, MAX_MAP_ENTRIES)) {
    const normalized = normalizeCardRecord(record);
    if (normalized) flashcards[id] = normalized;
  }

  const flashcardLog = Array.isArray(progress.flashcardLog)
    ? progress.flashcardLog.map(normalizeFlashcardLog).filter(Boolean).slice(-500)
    : [];

  const practiceAttempts = Array.isArray(progress.practiceAttempts)
    ? progress.practiceAttempts.map(normalizePracticeAttempt).filter(Boolean).slice(-100)
    : [];
  const practiceMistakes = Array.isArray(progress.practiceMistakes)
    ? progress.practiceMistakes.map(normalizePracticeMistake).filter(Boolean).slice(-200)
    : [];
  const examAttempts = Array.isArray(progress.examAttempts)
    ? progress.examAttempts.map(normalizeExamAttempt).filter(Boolean).slice(-50)
    : [];
  const examActive = {};
  for (const [level, record] of safeEntries(progress.examActive).slice(0, MAX_MAP_ENTRIES)) {
    const normalized = normalizeExamActive(record);
    if (normalized && normalized.level === level) examActive[level] = normalized;
  }

  const aiConversations = Array.isArray(progress.aiConversations)
    ? progress.aiConversations.map(normalizeAIConversation).filter(Boolean).slice(0, 20)
    : [];
  const speakingAttempts = Array.isArray(progress.speakingAttempts)
    ? progress.speakingAttempts.map(normalizeSpeakingAttempt).filter(Boolean).slice(-60)
    : [];
  const pronunciationLog = Array.isArray(progress.pronunciationLog)
    ? progress.pronunciationLog.map(normalizePronunciationEntry).filter(Boolean).slice(-100)
    : [];

  const skillAttempts = Array.isArray(progress.skillAttempts)
    ? progress.skillAttempts.map(normalizeSkillAttempt).filter(Boolean).slice(-80)
    : [];

  const writingDrafts = {};
  {
    const candidates = [];
    for (const [taskId, draft] of safeEntries(progress.writingDrafts).slice(0, MAX_MAP_ENTRIES)) {
      const normalized = normalizeWritingDraft({ ...(isObject(draft) ? draft : {}), taskId });
      if (normalized && normalized.taskId === taskId) candidates.push([taskId, normalized]);
    }
    candidates.sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)));
    for (const [taskId, draft] of candidates.slice(0, 24)) writingDrafts[taskId] = draft;
  }

  return {
    ...base,
    ...safeObject(stored),
    version: 7,
    profile: { ...base.profile, ...safeObject(stored.profile) },
    progress: {
      ...base.progress,
      ...safeObject(progress),
      completedLessons,
      quizAttempts: Array.isArray(progress.quizAttempts)
        ? progress.quizAttempts.map(normalizeQuizAttempt).filter(Boolean).slice(-300)
        : [],
      lessonSessions,
      favoriteWords: normalizeIdList(progress.favoriteWords),
      learnedWords: normalizeIdList(progress.learnedWords),
      studyLog: normalizeStudyLog(progress.studyLog),
      grammarDrills,
      grammarMistakes,
      flashcards,
      flashcardLog,
      practiceAttempts,
      practiceMistakes,
      examAttempts,
      examActive,
      aiConversations,
      speakingAttempts,
      pronunciationLog,
      skillAttempts,
      writingDrafts,
      skills: normalizeSkills(progress.skills, base.progress.skills),
    },
  };
}

export function updateState(mutator) {
  const current = getState();
  const next = typeof mutator === 'function' ? mutator(current) : { ...current, ...mutator };
  if (!isObject(next)) throw new Error('updateState expects an object or a function returning one.');
  state = normalizeState(next);
  state.updatedAt = new Date().toISOString();
  safeWrite(STATE_KEY, state);
  emit('state');
  return clone(state);
}

export function updateProfile(patch) {
  return updateState((current) => ({
    ...current,
    profile: {
      ...current.profile,
      ...patch,
      createdAt: current.profile.createdAt || new Date().toISOString(),
    },
  }));
}

export function isFavoriteWord(wordId) {
  return getState().progress.favoriteWords.includes(wordId);
}

export function toggleFavoriteWord(wordId) {
  let nowFavorite = false;
  updateState((current) => {
    const favorites = new Set(current.progress.favoriteWords);
    if (favorites.has(wordId)) {
      favorites.delete(wordId);
      nowFavorite = false;
    } else {
      favorites.add(wordId);
      nowFavorite = true;
    }
    return { ...current, progress: { ...current.progress, favoriteWords: [...favorites] } };
  });
  return nowFavorite;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Remember where the learner stopped inside a lesson. */
export function markLessonSection(lessonId, sectionId, sectionIndex) {
  const now = new Date().toISOString();
  updateState((current) => {
    const sessions = { ...current.progress.lessonSessions };
    const existing = sessions[lessonId];
    sessions[lessonId] = {
      sectionId,
      sectionIndex: Number.isFinite(Number(sectionIndex)) ? Number(sectionIndex) : 0,
      visited: [...new Set([...(existing?.visited || []), sectionId])],
      startedAt: existing?.startedAt || now,
      updatedAt: now,
    };
    return { ...current, progress: { ...current.progress, lessonSessions: sessions } };
  });
}

export function getLessonSession(lessonId) {
  return getState().progress.lessonSessions?.[lessonId] || null;
}

export function getLessonAttempts(lessonId) {
  return getState()
    .progress.quizAttempts.filter((attempt) => attempt.lessonId === lessonId)
    .slice()
    .reverse();
}

/**
 * Persist a scored assessment and, when passed, mark the lesson complete.
 * The first pass updates skill estimates; retakes only improve the recorded
 * best score. Study time is the real elapsed session time, not the estimate.
 */
export function recordQuizAttempt({
  lessonId,
  levelId,
  lessonTitle,
  score,
  total,
  passScore,
  skills = [],
  minutes = 0,
}) {
  const now = new Date().toISOString();
  const safeTotal = Math.max(1, Number(total) || 0);
  const safeScore = Math.max(0, Math.min(safeTotal, Number(score) || 0));
  const safePass = Math.max(0, Math.min(100, Number(passScore) || 0));
  const percent = Math.round((safeScore / safeTotal) * 100);
  const passed = percent >= safePass;

  const attempt = {
    id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    lessonId,
    level: levelId,
    title: lessonTitle,
    score: safeScore,
    total: safeTotal,
    percent,
    passScore: safePass,
    passed,
    date: now,
  };

  let firstPass = false;
  updateState((current) => {
    const quizAttempts = [...current.progress.quizAttempts, attempt].slice(-300);
    const completedLessons = { ...current.progress.completedLessons };
    let studyLog = current.progress.studyLog;
    let totalMinutes = Number(current.progress.totalMinutes) || 0;
    let skillScores = current.progress.skills;

    if (passed) {
      const existing = completedLessons[lessonId];
      firstPass = !existing?.passed;
      completedLessons[lessonId] = {
        ...(existing || {}),
        passed: true,
        completedAt: existing?.completedAt || now,
        firstPassedAt: existing?.firstPassedAt || now,
        lastAttemptAt: now,
        attempts: (Number(existing?.attempts) || 0) + 1,
        bestScore: Math.max(Number(existing?.bestScore) || 0, percent),
        lastScore: percent,
        total: safeTotal,
        passScore: safePass,
      };

      if (firstPass) {
        skillScores = { ...current.progress.skills };
        for (const skill of skills) {
          const key = String(skill).toLowerCase();
          if (key in skillScores) {
            skillScores[key] = Math.min(100, (Number(skillScores[key]) || 0) + 4);
          }
        }
        skillScores.vocabulary = Math.min(100, (Number(skillScores.vocabulary) || 0) + 2);
      }

      const earnedMinutes = Math.max(0, Math.min(120, Math.round(Number(minutes) || 0)));
      if (earnedMinutes > 0) {
        const key = todayKey();
        studyLog = { ...current.progress.studyLog, [key]: (Number(studyLog?.[key]) || 0) + earnedMinutes };
        totalMinutes += earnedMinutes;
      }
    }

    return {
      ...current,
      progress: {
        ...current.progress,
        quizAttempts,
        completedLessons,
        studyLog,
        totalMinutes,
        skills: skillScores,
      },
    };
  });

  return { attempt, percent, passed, firstPass };
}

/* -------------------------------------------------------------------------- */
/* Grammar drills                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Persist a completed set of grammar drills.
 *
 * `results` carries one entry per answered question:
 *   { drillId, correct, type, prompt, given, answer, explanation }
 * Wrong answers replace any older mistake for the same drill; correctly
 * answered drills disappear from the review list.
 */
export function recordDrillAttempt({ topicId, levelId, results = [], minutes = 0 }) {
  const answered = results.filter((result) => result && typeof result.drillId === 'string');
  const total = answered.length;
  if (!total) return { correct: 0, total: 0, percent: 0 };

  const correct = answered.filter((result) => result.correct === true).length;
  const percent = Math.round((correct / total) * 100);
  const now = new Date().toISOString();
  const earnedMinutes = Math.max(0, Math.min(30, Math.round(Number(minutes) || 0)));

  updateState((current) => {
    const previous = current.progress.grammarDrills?.[topicId];
    const stat = {
      attempts: (Number(previous?.attempts) || 0) + 1,
      correct: (Number(previous?.correct) || 0) + correct,
      total: (Number(previous?.total) || 0) + total,
      bestPercent: Math.max(Number(previous?.bestPercent) || 0, percent),
      lastPercent: percent,
      lastAt: now,
    };

    const answeredIds = new Set(answered.map((result) => result.drillId));
    const mistakes = (current.progress.grammarMistakes || []).filter(
      (mistake) => !answeredIds.has(mistake.drillId),
    );
    for (const result of answered) {
      if (result.correct) continue;
      mistakes.push({
        topicId,
        drillId: result.drillId,
        type: ['mcq', 'gap', 'order'].includes(result.type) ? result.type : 'gap',
        prompt: String(result.prompt || ''),
        given: String(result.given || ''),
        answer: String(result.answer || ''),
        explanation: String(result.explanation || ''),
        date: now,
      });
    }

    let studyLog = current.progress.studyLog;
    let totalMinutes = Number(current.progress.totalMinutes) || 0;
    if (earnedMinutes > 0) {
      const key = todayKey();
      studyLog = { ...studyLog, [key]: (Number(studyLog?.[key]) || 0) + earnedMinutes };
      totalMinutes += earnedMinutes;
    }

    return {
      ...current,
      progress: {
        ...current.progress,
        grammarDrills: { ...current.progress.grammarDrills, [topicId]: stat },
        grammarMistakes: mistakes.slice(-200),
        studyLog,
        totalMinutes,
      },
    };
  });

  return { correct, total, percent };
}

export function getGrammarDrillStat(topicId) {
  return getState().progress.grammarDrills?.[topicId] || null;
}

export function getGrammarMistakes() {
  return getState().progress.grammarMistakes || [];
}

/* -------------------------------------------------------------------------- */
/* Practice exercises and mock exams                                           */
/* -------------------------------------------------------------------------- */

function makeAttemptId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getPracticeAttempts() {
  return getState().progress.practiceAttempts || [];
}

export function getPracticeMistakes() {
  return getState().progress.practiceMistakes || [];
}

export function clearPracticeMistakes() {
  updateState((current) => ({
    ...current,
    progress: { ...current.progress, practiceMistakes: [] },
  }));
}

/** Persist one scored practice session and refresh its reusable mistake list. */
export function recordPracticeAttempt({
  level = 'all',
  skill = 'all',
  type = 'all',
  results = [],
  minutes = 0,
} = {}) {
  const answered = results.filter((result) => result && typeof result.questionId === 'string');
  const total = answered.length;
  if (!total) return { correct: 0, total: 0, percent: 0 };

  const correct = answered.filter((result) => result.correct === true).length;
  const percent = Math.round((correct / total) * 100);
  const now = new Date().toISOString();
  const earnedMinutes = Math.max(0, Math.min(30, Math.round(Number(minutes) || 0)));

  updateState((current) => {
    const attempt = normalizePracticeAttempt({
      id: makeAttemptId('practice'),
      date: now,
      level,
      skill,
      type,
      total,
      correct,
      percent,
    });
    const answeredIds = new Set(answered.map((result) => result.questionId));
    const mistakes = (current.progress.practiceMistakes || []).filter(
      (mistake) => !answeredIds.has(mistake.questionId),
    );
    for (const result of answered) {
      if (result.correct) continue;
      mistakes.push(
        normalizePracticeMistake({
          id: makeAttemptId('mistake'),
          questionId: result.questionId,
          level: result.level || level,
          skill: result.skill || skill,
          type: result.type,
          prompt: result.prompt,
          given: result.given,
          answer: result.answer,
          explanation: result.explanation,
          date: now,
        }),
      );
    }

    let studyLog = current.progress.studyLog;
    let totalMinutes = Number(current.progress.totalMinutes) || 0;
    if (earnedMinutes > 0) {
      const key = todayKey();
      studyLog = { ...studyLog, [key]: (Number(studyLog?.[key]) || 0) + earnedMinutes };
      totalMinutes += earnedMinutes;
    }

    return {
      ...current,
      progress: {
        ...current.progress,
        practiceAttempts: [...(current.progress.practiceAttempts || []), attempt].slice(-100),
        practiceMistakes: mistakes.filter(Boolean).slice(-200),
        studyLog,
        totalMinutes,
      },
    };
  });

  return { correct, total, percent };
}

/* Milestone 8 — graded skill practice. These records are separate from the
   exercise bank so a skill-task id never enters the reusable mistake queue. */
export function getSkillAttempts() {
  return getState().progress.skillAttempts || [];
}

export function recordSkillAttempt({
  skill,
  level = 'a1',
  taskId,
  mode = 'comprehension',
  correct = 0,
  total = 0,
  details = [],
  words = 0,
  sentences = 0,
  minutes = 0,
} = {}) {
  const now = new Date().toISOString();
  const attempt = normalizeSkillAttempt({
    id: makeAttemptId('skill'),
    date: now,
    skill,
    level,
    taskId,
    mode,
    correct,
    total,
    words,
    sentences,
    details,
  });
  if (!attempt || !total) return null;

  const earnedMinutes = Math.max(0, Math.min(30, Math.round(Number(minutes) || 0)));
  updateState((current) => {
    let studyLog = current.progress.studyLog;
    let totalMinutes = Number(current.progress.totalMinutes) || 0;
    if (earnedMinutes > 0) {
      const key = todayKey();
      studyLog = { ...studyLog, [key]: (Number(studyLog?.[key]) || 0) + earnedMinutes };
      totalMinutes += earnedMinutes;
    }
    return {
      ...current,
      progress: {
        ...current.progress,
        skillAttempts: [...(current.progress.skillAttempts || []), attempt].slice(-80),
        studyLog,
        totalMinutes,
      },
    };
  });
  return attempt;
}

export function clearSkillHistory(skill) {
  updateState((current) => ({
    ...current,
    progress: {
      ...current.progress,
      skillAttempts: skill
        ? (current.progress.skillAttempts || []).filter((attempt) => attempt.skill !== skill)
        : [],
    },
  }));
}

export function getWritingDraft(taskId) {
  return getState().progress.writingDrafts?.[taskId] || null;
}

export function getWritingDrafts() {
  return getState().progress.writingDrafts || {};
}

export function saveWritingDraft(taskId, text) {
  if (!taskId) return null;
  const draft = normalizeWritingDraft({ taskId, text, updatedAt: new Date().toISOString() });
  updateState((current) => {
    const entries = Object.entries(current.progress.writingDrafts || {}).filter(([id]) => id !== taskId);
    if (draft) entries.push([taskId, draft]);
    entries.sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)));
    return {
      ...current,
      progress: { ...current.progress, writingDrafts: Object.fromEntries(entries.slice(0, 24)) },
    };
  });
  return draft;
}

export function clearWritingDraft(taskId) {
  updateState((current) => {
    const drafts = { ...(current.progress.writingDrafts || {}) };
    delete drafts[taskId];
    return { ...current, progress: { ...current.progress, writingDrafts: drafts } };
  });
}

export function clearSkillPracticeData() {
  updateState((current) => ({
    ...current,
    progress: { ...current.progress, skillAttempts: [], writingDrafts: {} },
  }));
}

export function getExamActive(level) {
  const active = getState().progress.examActive || {};
  return level ? active[level] || null : active;
}

export function getExamAttempts(level) {
  const attempts = getState().progress.examAttempts || [];
  return level ? attempts.filter((attempt) => attempt.level === level) : attempts;
}

/** Start a timed attempt, or return the existing one so a reload can resume. */
export function startExamAttempt({ level, durationMinutes = 30, questionIds = [], id, now = new Date() }) {
  const existing = getExamActive(level);
  if (existing) return existing;

  const active = normalizeExamActive({
    id: id || makeAttemptId('exam'),
    level,
    startedAt: now.toISOString(),
    durationMinutes,
    status: 'active',
    questionIds,
    answers: {},
  });

  updateState((current) => ({
    ...current,
    progress: { ...current.progress, examActive: { ...current.progress.examActive, [level]: active } },
  }));
  return active;
}

export function updateExamAnswers(level, answers) {
  let updated = null;
  updateState((current) => {
    const active = current.progress.examActive?.[level];
    if (!active) return current;
    updated = { ...active, answers: normalizeAnswers(answers) };
    return {
      ...current,
      progress: { ...current.progress, examActive: { ...current.progress.examActive, [level]: updated } },
    };
  });
  return updated;
}

/** Store the final score and release the active exam slot. */
export function completeExamAttempt({ level, result = {}, status = 'submitted', now = new Date() }) {
  let completed = null;
  updateState((current) => {
    const active = current.progress.examActive?.[level];
    if (!active) return current;
    const completedAt = now.toISOString();
    const elapsed = Math.max(
      1,
      Math.min(active.durationMinutes, Math.round((Date.parse(completedAt) - Date.parse(active.startedAt)) / 60000)),
    );
    const key = todayKey();
    const studyLog = {
      ...current.progress.studyLog,
      [key]: (Number(current.progress.studyLog?.[key]) || 0) + elapsed,
    };

    completed = normalizeExamAttempt({
      id: active.id,
      level,
      startedAt: active.startedAt,
      completedAt,
      durationMinutes: active.durationMinutes,
      status,
      total: result.total,
      correct: result.correct,
      percent: result.percent,
      passed: result.passed === true,
      sections: result.sections,
      skills: result.skills,
    });

    const examActive = { ...current.progress.examActive };
    delete examActive[level];
    return {
      ...current,
      progress: {
        ...current.progress,
        examActive,
        examAttempts: [...(current.progress.examAttempts || []), completed].slice(-50),
        studyLog,
        totalMinutes: (Number(current.progress.totalMinutes) || 0) + elapsed,
      },
    };
  });
  return completed;
}

export function abandonExamAttempt(level) {
  updateState((current) => {
    const examActive = { ...current.progress.examActive };
    delete examActive[level];
    return { ...current, progress: { ...current.progress, examActive } };
  });
}

/* -------------------------------------------------------------------------- */
/* AI conversations                                                            */
/* -------------------------------------------------------------------------- */

/** All locally saved conversations, newest activity first. */
export function getAIConversations() {
  return getState().progress.aiConversations || [];
}

export function getAIConversation(id) {
  if (!id) return null;
  return getAIConversations().find((conversation) => conversation.id === id) || null;
}

/** Start an empty conversation. No assistant message is created locally. */
export function createAIConversation({ mode = 'tutor', level = 'a1', scenario = '' } = {}) {
  const now = new Date().toISOString();
  const safeMode = AI_MODE_RE.test(String(mode)) ? String(mode) : 'tutor';
  const safeLevel = AI_LEVEL_RE.test(String(level)) ? String(level) : 'a1';
  const safeScenario = String(scenario).replace(/\s+/g, ' ').trim().slice(0, 160);
  const conversation = normalizeAIConversation({
    id: makeId('chat'),
    mode: safeMode,
    level: safeLevel,
    scenario: safeScenario,
    createdAt: now,
    updatedAt: now,
    messages: [],
  });

  updateState((current) => ({
    ...current,
    progress: {
      ...current.progress,
      aiConversations: [conversation, ...(current.progress.aiConversations || [])].slice(0, 20),
    },
  }));
  return conversation;
}

/** Append one real user or provider message and move the chat to the top. */
export function appendAIMessage(conversationId, message) {
  let updated = null;
  updateState((current) => {
    const conversations = current.progress.aiConversations || [];
    const index = conversations.findIndex((conversation) => conversation.id === conversationId);
    if (index === -1) return current;

    const normalized = normalizeAIMessage({ ...message, id: message?.id || makeId('msg'), at: new Date().toISOString() });
    if (!normalized) return current;

    const existing = conversations[index];
    updated = {
      ...existing,
      updatedAt: new Date().toISOString(),
      messages: [...existing.messages, normalized].slice(-60),
    };
    const next = [...conversations];
    next.splice(index, 1);
    return { ...current, progress: { ...current.progress, aiConversations: [updated, ...next] } };
  });
  return updated;
}

export function deleteAIConversation(id) {
  updateState((current) => ({
    ...current,
    progress: {
      ...current.progress,
      aiConversations: (current.progress.aiConversations || []).filter((conversation) => conversation.id !== id),
    },
  }));
}

/** Clear every AI conversation, or only one mode when explicitly requested. */
export function clearAllAIConversations(mode) {
  const safeMode = AI_MODE_RE.test(String(mode)) ? String(mode) : null;
  updateState((current) => ({
    ...current,
    progress: {
      ...current.progress,
      aiConversations: safeMode
        ? (current.progress.aiConversations || []).filter((conversation) => conversation.mode !== safeMode)
        : [],
    },
  }));
}

/* -------------------------------------------------------------------------- */
/* Milestone 6 — real speaking and pronunciation history                        */
/* -------------------------------------------------------------------------- */

/** Bounded local history. It never changes the skill estimates or lesson gates. */
export function getSpeakingAttempts() {
  return getState().progress.speakingAttempts || [];
}

export function recordSpeakingAttempt(attempt) {
  const normalized = normalizeSpeakingAttempt({
    ...attempt,
    id: makeId('speak'),
    date: new Date().toISOString(),
  });
  if (!normalized) return null;
  updateState((current) => ({
    ...current,
    progress: {
      ...current.progress,
      speakingAttempts: [normalized, ...(current.progress.speakingAttempts || [])].slice(0, 60),
    },
  }));
  return normalized;
}

export function clearSpeakingHistory() {
  updateState((current) => ({
    ...current,
    progress: { ...current.progress, speakingAttempts: [] },
  }));
}

export function getPronunciationLog() {
  return getState().progress.pronunciationLog || [];
}

export function recordPronunciationAttempt(entry) {
  const normalized = normalizePronunciationEntry({
    ...entry,
    id: makeId('pron'),
    date: new Date().toISOString(),
  });
  if (!normalized) return null;
  updateState((current) => ({
    ...current,
    progress: {
      ...current.progress,
      pronunciationLog: [normalized, ...(current.progress.pronunciationLog || [])].slice(0, 100),
    },
  }));
  return normalized;
}

export function clearPronunciationHistory() {
  updateState((current) => ({
    ...current,
    progress: { ...current.progress, pronunciationLog: [] },
  }));
}

/* -------------------------------------------------------------------------- */
/* Vocabulary flashcards                                                       */
/* -------------------------------------------------------------------------- */

export function getFlashcardRecord(cardId) {
  return getState().progress.flashcards?.[cardId] || null;
}

export function getFlashcardRecords() {
  return getState().progress.flashcards || {};
}

export function getFlashcardLog() {
  return getState().progress.flashcardLog || [];
}

/** Schedule one card review and keep the learned-word list up to date. */
export function reviewFlashcard(cardId, grade, now = new Date()) {
  // Callers may pass DOM data, numbers or unknown grades; validate at the
  // boundary so scheduleCard never throws and unsafe ids never reach the map.
  const safeCardId = typeof cardId === 'string' || typeof cardId === 'number' ? String(cardId) : '';
  if (!safeCardId) return null;
  const safeGrade = FLASHCARD_GRADES.includes(grade) ? grade : 'again';
  let scheduled = null;
  updateState((current) => {
    const existing = current.progress.flashcards?.[safeCardId] || null;
    scheduled = scheduleCard(existing, safeGrade, now);
    const flashcards = { ...current.progress.flashcards, [safeCardId]: scheduled };
    let learnedWords = current.progress.learnedWords;
    // The dashboard counts this list against the 48 curated library words.
    // Lesson-derived deck cards are tracked by their SRS record instead.
    if (safeCardId.startsWith('v-') && isCardLearned(scheduled) && !learnedWords.includes(safeCardId)) {
      learnedWords = [...learnedWords, safeCardId];
    }
    const flashcardLog = [
      ...(current.progress.flashcardLog || []),
      { cardId: safeCardId, grade: safeGrade, date: now.toISOString() },
    ].slice(-500);

    return {
      ...current,
      progress: { ...current.progress, flashcards, learnedWords, flashcardLog },
    };
  });
  return scheduled;
}

/** Add real elapsed practice time to the study log. */
export function addStudyMinutes(minutes) {
  const earnedMinutes = Math.max(0, Math.min(60, Math.round(Number(minutes) || 0)));
  if (earnedMinutes === 0) return getState();
  updateState((current) => {
    const key = todayKey();
    const studyLog = {
      ...current.progress.studyLog,
      [key]: (Number(current.progress.studyLog?.[key]) || 0) + earnedMinutes,
    };
    return {
      ...current,
      progress: {
        ...current.progress,
        studyLog,
        totalMinutes: (Number(current.progress.totalMinutes) || 0) + earnedMinutes,
      },
    };
  });
  return getState();
}

export function resetProgress() {
  updateState((current) => ({
    ...current,
    progress: clone(DEFAULT_STATE.progress),
  }));
}

export function exportData() {
  return {
    exportedAt: new Date().toISOString(),
    app: 'DeutschLern AI',
    schemaVersion: 7,
    profile: getState().profile,
    progress: getState().progress,
    preferences: getPreferences(),
  };
}

/** Remove every DeutschLern key from this browser and reset in-memory caches. */
export function clearAllData() {
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(PREFS_KEY);
    localStorage.removeItem(SYNC_KEY);
  } catch (error) {
    console.warn('[store] Could not clear stored data.', error);
  }
  state = null;
  preferences = null;
  syncMeta = null;
  emit('reset');
}


/* -------------------------------------------------------------------------- */
/* Server sync metadata                                                        */
/* -------------------------------------------------------------------------- */

const DEFAULT_SYNC_META = Object.freeze({
  revision: 0,
  lastSyncedAt: null,
  accountId: null,
  localOwner: null,
  lastError: '',
});

let syncMeta = null;

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
}

export function getSyncMeta() {
  if (!syncMeta) {
    const stored = safeRead(SYNC_KEY);
    syncMeta = {
      ...clone(DEFAULT_SYNC_META),
      ...safeObject(stored),
      revision: normalizeRevision(isObject(stored) ? stored.revision : 0),
    };
  }
  return clone(syncMeta);
}

export function updateSyncMeta(patch) {
  const next = { ...getSyncMeta(), ...safeObject(patch) };
  next.revision = normalizeRevision(next.revision);
  syncMeta = next;
  safeWrite(SYNC_KEY, syncMeta);
  return clone(syncMeta);
}

export function clearSyncMeta() {
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch (error) {
    console.warn('[store] Could not clear sync metadata.', error);
  }
  syncMeta = null;
}

/** The exact state object sent to the authenticated sync endpoint. */
export function getSyncableState() {
  return getState();
}

/**
 * Replace local state with a server copy. This is only called after an explicit
 * learner choice (download, or resolve a conflict) — never silently.
 * Emits a distinct event so auto-sync does not immediately push it back.
 */
export function replaceStateFromServer(remote, meta = {}) {
  if (!isObject(remote)) throw new Error('A remote state object is required.');
  state = normalizeState(remote);
  safeWrite(STATE_KEY, state);
  if (isObject(meta)) updateSyncMeta(meta);
  emit('remote');
  return clone(state);
}

export function subscribe(listener) {
  const handler = (event) => listener(event.detail);
  window.addEventListener(CHANGE_EVENT, handler);

  const storageHandler = (event) => {
    if (event.key !== STATE_KEY && event.key !== PREFS_KEY && event.key !== SYNC_KEY) return;
    // Another tab changed stored data — reload lazily on next access.
    state = null;
    preferences = null;
    syncMeta = null;
    listener({ type: 'external' });
  };
  window.addEventListener('storage', storageHandler);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
