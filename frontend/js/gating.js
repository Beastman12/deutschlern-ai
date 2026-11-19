/**
 * Sequential lesson gating.
 *
 * A course is a linear path: the first lesson is open, and each later lesson
 * unlocks only when the previous lesson's assessment has been passed. Revisions
 * of completed lessons are always open. The first lesson of every CEFR level is
 * open so learners can explore a level before committing to it.
 */
import { findLesson, getCourseLessons } from './content.js';

/** @returns {{passed:boolean, record:object|null}} */
export function getLessonCompletion(progress, lessonId) {
  const record = progress?.completedLessons?.[lessonId];
  if (!record) return { passed: false, record: null };
  if (typeof record === 'object') {
    return { passed: record.passed !== false, record };
  }
  // Milestone 1 stored truthy placeholders; treat them as passed.
  return { passed: Boolean(record), record: null };
}

export function isLessonPassed(progress, lessonId) {
  return getLessonCompletion(progress, lessonId).passed;
}

/**
 * @returns {{
 *   unlocked: boolean,
 *   completed: boolean,
 *   isNext: boolean,
 *   index: number,
 *   total: number,
 *   prerequisite: object|null,
 *   reason: 'completed'|'first'|'previous-passed'|'previous-missing'
 * }}
 */
export function getLessonAccess(lessonId, progress) {
  const entry = findLesson(lessonId);
  if (!entry) {
    return {
      unlocked: false,
      completed: false,
      isNext: false,
      index: -1,
      total: 0,
      prerequisite: null,
      reason: 'previous-missing',
    };
  }

  const lessons = getCourseLessons(entry.level.id);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  const total = lessons.length;
  const completion = getLessonCompletion(progress, lessonId);

  if (completion.passed) {
    return {
      unlocked: true,
      completed: true,
      isNext: false,
      index,
      total,
      prerequisite: null,
      reason: 'completed',
    };
  }

  if (index <= 0) {
    return {
      unlocked: true,
      completed: false,
      isNext: index === 0,
      index,
      total,
      prerequisite: null,
      reason: 'first',
    };
  }

  const prerequisite = lessons[index - 1];
  const prerequisitePassed = isLessonPassed(progress, prerequisite.id);

  return {
    unlocked: prerequisitePassed,
    completed: false,
    isNext: prerequisitePassed,
    index,
    total,
    prerequisite,
    reason: prerequisitePassed ? 'previous-passed' : 'previous-missing',
  };
}

/** First lesson in the level that is open and not yet passed. */
export function getNextLessonForLevel(levelId, progress) {
  for (const lesson of getCourseLessons(levelId)) {
    const access = getLessonAccess(lesson.id, progress);
    if (access.unlocked && !access.completed) return lesson;
  }
  return null;
}

/** Status used by course lists: completed | next | available | locked. */
export function getGatedLessonStatus(lessonId, progress) {
  const access = getLessonAccess(lessonId, progress);
  if (access.completed) return 'completed';
  if (!access.unlocked) return 'locked';
  return access.isNext ? 'next' : 'available';
}

export function countLockedLessons(levelId, progress) {
  return getCourseLessons(levelId).filter((lesson) => !getLessonAccess(lesson.id, progress).unlocked).length;
}
