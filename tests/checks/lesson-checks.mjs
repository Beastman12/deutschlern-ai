/**
 * Backwards-compatible import for the shared lesson contract.
 * The canonical implementation lives in frontend/js/lesson-schema.js so the
 * browser loader and the Node test suite validate with exactly the same rules.
 */
export {
  SECTION_TYPES,
  SECTION_TITLES,
  validateLessonContent,
  getAssessment,
} from '../../frontend/js/lesson-schema.js';
