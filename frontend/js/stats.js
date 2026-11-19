/**
 * Derived learning statistics.
 *
 * Everything the dashboard and progress page display is computed from the
 * curriculum plus the local store — no numbers are hard-coded into views.
 * `demoData` produces a clearly-labelled preview state for design review
 * before the lesson engine can record real activity.
 */
import { getPreferences, getState } from './store.js';
import { curriculum, getCourseLessons } from './content.js';
import { getLessonAccess, getLessonCompletion, getNextLessonForLevel } from './gating.js';

const DAY_MS = 86_400_000;

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function lastNDays(count) {
  const days = [];
  const today = new Date();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    days.push({
      key: dateKey(date),
      date,
      label: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      shortDate: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    });
  }
  return days;
}

export function calculateStreak(studyLog) {
  let streak = 0;
  let cursor = new Date();
  if (!(studyLog[dateKey(cursor)] > 0)) {
    cursor = addDays(cursor, -1);
    if (!(studyLog[dateKey(cursor)] > 0)) return 0;
  }
  while (studyLog[dateKey(cursor)] > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Demo progress used only when the user enables "Preview demo data". */
export function buildDemoProgress() {
  const completedLessons = {};
  const a1 = getCourseLessons('a1');
  const a2 = getCourseLessons('a2');
  a1.forEach((lesson) => {
    completedLessons[lesson.id] = { completedAt: addDays(new Date(), -14).toISOString(), score: 88 };
  });
  a2.slice(0, 6).forEach((lesson, index) => {
    completedLessons[lesson.id] = {
      completedAt: addDays(new Date(), -(6 - index)).toISOString(),
      score: 74 + index * 2,
    };
  });

  const studyLog = {};
  [22, 18, 32, 26, 15, 28, 18].forEach((minutes, index) => {
    studyLog[dateKey(addDays(new Date(), index - 6))] = minutes;
  });

  const quizAttempts = [
    { id: 'demo-1', level: 'a1', title: 'A1 lesson check', score: 9, total: 10, date: addDays(new Date(), -6).toISOString() },
    { id: 'demo-2', level: 'a1', title: 'A1 module check', score: 16, total: 20, date: addDays(new Date(), -5).toISOString() },
    { id: 'demo-3', level: 'a2', title: 'A2 lesson check', score: 8, total: 10, date: addDays(new Date(), -4).toISOString() },
    { id: 'demo-4', level: 'a2', title: 'A2 lesson check', score: 7, total: 10, date: addDays(new Date(), -2).toISOString() },
    { id: 'demo-5', level: 'a2', title: 'A2 module check', score: 15, total: 20, date: addDays(new Date(), -1).toISOString() },
    { id: 'demo-6', level: 'a2', title: 'A2 lesson check', score: 9, total: 10, date: new Date().toISOString() },
  ];

  return {
    completedLessons,
    quizAttempts,
    favoriteWords: curriculum.vocabulary.slice(0, 5).map((word) => word.id),
    learnedWords: curriculum.vocabulary.slice(0, 34).map((word) => word.id),
    studyLog,
    skills: {
      reading: 61,
      listening: 54,
      speaking: 46,
      writing: 41,
      grammar: 72,
      vocabulary: 66,
    },
    totalMinutes: 1476,
  };
}

/**
 * @returns {ReturnType<typeof computeStats>}
 */
export function getLearnerStats() {
  const preferences = getPreferences();
  const state = getState();
  const demo = preferences.demoData === true;
  const progress = demo ? buildDemoProgress() : state.progress;
  return computeStats(progress, {
    demo,
    dailyGoal: preferences.dailyGoal,
    profile: state.profile,
    // Demo data is a preview for stats screens only. Gating consumers read
    // stats.completedLessons, so they always receive real recorded progress.
    gatingProgress: { completedLessons: state.progress.completedLessons },
  });
}

/** Only a passed record counts as completed — the same rule as gating.js. */
function passedLessons(completedLessons) {
  const result = {};
  for (const id of Object.keys(completedLessons || {})) {
    if (getLessonCompletion(completedLessons, id).passed) result[id] = completedLessons[id];
  }
  return result;
}

function computeStats(progress, { demo, dailyGoal, profile, gatingProgress = progress }) {
  const totalLessons = curriculum.totals.lessons || 0;
  const displayLessons = passedLessons(progress.completedLessons);
  const gatingLessons = passedLessons(gatingProgress?.completedLessons);
  const completedIds = Object.keys(displayLessons);
  const completedCount = completedIds.length;

  const lessonsByLevel = {};
  let currentLevel = curriculum.levels[0] || null;
  let currentLevelFound = false;

  for (const level of curriculum.levels) {
    const lessons = getCourseLessons(level.id);
    const completed = lessons.filter((lesson) => displayLessons[lesson.id]).length;
    const pct = lessons.length ? Math.min(100, Math.round((completed / lessons.length) * 100)) : 0;
    lessonsByLevel[level.id] = { completed, total: lessons.length, pct };
    if (!currentLevelFound && completed < lessons.length) {
      currentLevel = level;
      currentLevelFound = true;
    }
  }
  if (!currentLevelFound) currentLevel = curriculum.levels[curriculum.levels.length - 1] || null;

  const levelLessons = currentLevel ? getCourseLessons(currentLevel.id) : [];
  const nextLessonItem =
    (currentLevel ? getNextLessonForLevel(currentLevel.id, { completedLessons: displayLessons }) : null) ||
    levelLessons.find((lesson) => !displayLessons[lesson.id]) ||
    null;
  const nextLesson = nextLessonItem
    ? { lesson: nextLessonItem, level: currentLevel }
    : null;

  const week = lastNDays(7).map((day) => ({
    ...day,
    minutes: Number(progress.studyLog?.[day.key]) || 0,
  }));
  const weeklyTotal = week.reduce((sum, day) => sum + day.minutes, 0);
  const minutesToday = week[week.length - 1]?.minutes || 0;

  const quizAttempts = progress.quizAttempts || [];
  const quizAverage = quizAttempts.length
    ? Math.round(
        quizAttempts.reduce((sum, attempt) => sum + (attempt.total ? (attempt.score / attempt.total) * 100 : 0), 0) /
          quizAttempts.length,
      )
    : 0;

  const skillScores = { ...progress.skills };
  const skillValues = Object.values(skillScores).filter((value) => Number.isFinite(value));
  const overallSkill = skillValues.length
    ? Math.round(skillValues.reduce((sum, value) => sum + value, 0) / skillValues.length)
    : 0;

  const completedInLevel = currentLevel ? lessonsByLevel[currentLevel.id]?.completed || 0 : 0;
  const totalInLevel = currentLevel ? lessonsByLevel[currentLevel.id]?.total || 0 : 0;

  return {
    demo,
    totalLessons,
    completedCount,
    completionPct: Math.min(100, totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0),
    currentLevel,
    nextLesson,
    completedLessons: gatingLessons,
    favoriteWordIds: progress.favoriteWords || [],
    learnedWordIds: progress.learnedWords || [],
    studyLog: progress.studyLog || {},
    levelProgressPct: Math.min(100, totalInLevel ? Math.round((completedInLevel / totalInLevel) * 100) : 0),
    completedInLevel,
    totalInLevel,
    lessonsByLevel,
    weekly: week,
    weeklyTotal,
    weeklyGoal: dailyGoal * 7,
    minutesToday,
    dailyGoal,
    dailyGoalPct: dailyGoal > 0 ? Math.min(100, Math.round((minutesToday / dailyGoal) * 100)) : 0,
    streak: calculateStreak(progress.studyLog || {}),
    learnedWords: (progress.learnedWords || []).length,
    favoriteWords: (progress.favoriteWords || []).length,
    totalWords: curriculum.totals.words,
    quizAverage,
    quizCount: quizAttempts.length,
    skills: skillScores,
    overallSkill,
    totalMinutes: Number(progress.totalMinutes) || Object.values(progress.studyLog || {}).reduce((sum, value) => sum + Number(value || 0), 0),
    studyHours: Math.round(((Number(progress.totalMinutes) || Object.values(progress.studyLog || {}).reduce((sum, value) => sum + Number(value || 0), 0)) / 60) * 10) / 10,
    profile,
  };
}

export function getLessonStatus(lessonId, stats) {
  const completedLessons = stats?.completedLessons || {};
  if (getLessonCompletion(completedLessons, lessonId).passed) return 'completed';
  const access = getLessonAccess(lessonId, { completedLessons });
  if (!access.unlocked) return 'locked';
  if (stats?.nextLesson?.lesson?.id === lessonId) return 'next';
  return access.isNext ? 'next' : 'available';
}

export function currentWeekRangeLabel() {
  const days = lastNDays(7);
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  return `${formatter.format(first)} – ${formatter.format(last)}`;
}

export const DAY_MS_EXPORT = DAY_MS;
