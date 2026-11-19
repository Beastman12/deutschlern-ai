/**
 * Single source of truth for application navigation.
 * `status: 'live'` routes are implemented. `planned` routes open an honest
 * roadmap page instead of pretending to be functional.
 */

export const NAV_GROUPS = [
  { label: 'Overview', items: ['dashboard', 'progress'] },
  { label: 'Learn', items: ['courses', 'grammar', 'vocabulary'] },
  {
    label: 'Practise',
    items: ['tutor', 'talk', 'speaking', 'pronunciation', 'listening', 'reading', 'writing', 'conversations'],
  },
  { label: 'Assess', items: ['exercises', 'exams'] },
  { label: 'Account', items: ['profile', 'settings'] },
];

export const ROUTES = {
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'grid',
    path: '#/dashboard',
    group: 'Overview',
    status: 'live',
  },
  progress: {
    id: 'progress',
    label: 'My Progress',
    icon: 'chart',
    path: '#/progress',
    group: 'Overview',
    status: 'live',
  },
  roadmap: {
    id: 'roadmap',
    label: 'Roadmap',
    icon: 'compass',
    path: '#/roadmap',
    group: 'Overview',
    status: 'live',
  },
  courses: {
    id: 'courses',
    label: 'German Courses',
    icon: 'book',
    path: '#/courses',
    group: 'Learn',
    status: 'live',
  },
  grammar: {
    id: 'grammar',
    label: 'Grammar Academy',
    icon: 'layers',
    path: '#/grammar',
    group: 'Learn',
    status: 'live',
  },
  vocabulary: {
    id: 'vocabulary',
    label: 'Vocabulary Builder',
    icon: 'languages',
    path: '#/vocabulary',
    group: 'Learn',
    status: 'live',
  },
  tutor: {
    id: 'tutor',
    label: 'AI German Tutor',
    icon: 'sparkles',
    path: '#/tutor',
    group: 'Practise',
    status: 'live',
    description:
      'A real, context-aware German conversation partner that corrects your sentences, explains mistakes in English and adapts to your CEFR level.',
    features: [
      'Two-way text conversation with saved local history',
      'Corrections with the rule explained in English',
      'Difficulty selector from A1 to C2',
      'Optional English translation of each AI reply',
      'Clear error handling and a new-conversation action',
    ],
  },
  speaking: {
    id: 'speaking',
    label: 'Speaking Practice',
    icon: 'mic',
    path: '#/speaking',
    group: 'Practise',
    status: 'live',
    description:
      'Speak German out loud, see your transcript and hear a natural German reply. The complete two-way voice loop, built on the same AI tutor.',
    features: [
      'Browser Web Speech recognition with clear permission handling',
      'Optional Azure Speech fallback through a server-side proxy',
      'German speech recognition and editable transcript',
      'Real AI reply spoken back in German at normal or slow speed',
      'Graceful fallbacks for unsupported browsers',
    ],
  },
  talk: {
    id: 'talk',
    label: 'Talk with Partner',
    icon: 'headphones',
    path: '#/talk',
    group: 'Practise',
    status: 'live',
    description:
      'A spoken two-way German conversation: you talk, see the recognised transcript and hear a short, real AI reply spoken back in German.',
    features: [
      'Browser German speech recognition with visible interim transcript',
      'Short natural AI replies from the configured provider, spoken aloud',
      'Optional English translation shown beside the German reply',
      'Text fallback and replay controls when recognition is unavailable',
      'Saved voice conversations separate from tutor and role-play chats',
    ],
  },
  pronunciation: {
    id: 'pronunciation',
    label: 'Pronunciation Trainer',
    icon: 'volume',
    path: '#/pronunciation',
    group: 'Practise',
    status: 'live',
    description:
      'Targeted practice for the sounds English speakers find hardest, with model audio, recording and word-level comparison.',
    features: [
      'Authored model lines from every A1–C2 speaking prompt set',
      'Standard German audio with repeat and slow playback',
      'Real transcript comparison against the target text',
      'Honest feedback: no invented phonetic or accent score',
      'Bounded practice history with focus-topic tracking',
    ],
  },
  listening: {
    id: 'listening',
    label: 'Listening Practice',
    icon: 'headphones',
    path: '#/listening',
    group: 'Practise',
    status: 'live',
    milestone: 8,
    description:
      'Listen to authored A1–C2 scripts with real browser German speech, transcript reveal, exact-word dictation and comprehension checks.',
    features: [
      'Two authored scripts at every CEFR level',
      'Normal and slow playback through browser speech synthesis',
      'Transcript, translation and glossary after listening',
      'Comprehension questions with explanations and exact dictation',
      'Local result history with unlimited retakes',
    ],
  },
  reading: {
    id: 'reading',
    label: 'Reading Practice',
    icon: 'book-open',
    path: '#/reading',
    group: 'Practise',
    status: 'live',
    milestone: 8,
    description:
      'Read graded A1–C2 passages with a glossary, translation and explained comprehension questions drawn from authored content.',
    features: [
      'Two authored passages at every CEFR level',
      'German audio through browser speech synthesis',
      'Glossary and English translation on demand',
      'Three comprehension questions with authored explanations',
      'Local result history with unlimited retakes',
    ],
  },
  writing: {
    id: 'writing',
    label: 'Writing Practice',
    icon: 'pen',
    path: '#/writing',
    group: 'Practise',
    status: 'live',
    milestone: 8,
    description:
      'Write guided A1–C2 tasks and check a transparent deterministic checklist with an authored model answer. No invented AI grammar feedback.',
    features: [
      'Two authored prompts at every CEFR level',
      'Word-count, phrase and sentence checks shown in advance',
      'Local draft autosave and resubmission',
      'Authored model answer with notes',
      'Checklist history that never claims to be an exam grade',
    ],
  },
  conversations: {
    id: 'conversations',
    label: 'Real-Life Conversations',
    icon: 'message',
    path: '#/conversations',
    group: 'Practise',
    status: 'live',
    description:
      'Realistic German role-plays across every CEFR level — from introducing yourself and renting a flat to job interviews and academic debate — with an AI partner who stays in character.',
    features: [
      'All 35 scenarios mapped in the A1–C2 curriculum',
      'Level and scenario selectors with in-character replies',
      'Corrections with English explanations',
      'Saved role-play history and one-click new conversation',
      'Explicit unavailable state when no provider is configured',
    ],
  },
  exercises: {
    id: 'exercises',
    label: 'Practice Exercises',
    icon: 'zap',
    path: '#/exercises',
    group: 'Assess',
    status: 'live',
    description:
      'Unlimited practice drawn from authored lesson questions and grammar drills, with instant scoring and a reusable mistake queue.',
    features: [
      'Nearly 2,000 authored questions from the 72 lesson bodies and 90 grammar drills',
      'Multiple choice, gap-fill and sentence building',
      'Level, skill, question-type and source filters with deep links',
      'Instant scoring with the original explanation',
      'Saved mistakes with one-click targeted retry',
    ],
  },
  exams: {
    id: 'exams',
    label: 'Mock Examinations',
    icon: 'trophy',
    path: '#/exams',
    group: 'Assess',
    status: 'live',
    description:
      'Timed A1–C2 mock papers scored from authored questions, with a local readiness report and honest, unscored writing and speaking prompts.',
    features: [
      'Four scored sections: reading, listening, vocabulary and grammar',
      'Level-appropriate timing with a countdown and automatic submission',
      'Papers resume after a reload and never reveal correct answers',
      'Readiness report built only from recorded mock-exam scores',
      'Unscored writing and speaking prompts while AI feedback is unavailable',
      'Clearly inspired by CEFR — not an official certificate',
    ],
  },
  profile: {
    id: 'profile',
    label: 'My Profile',
    icon: 'user',
    path: '#/profile',
    group: 'Account',
    status: 'live',
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    path: '#/settings',
    group: 'Account',
    status: 'live',
  },
};

export const MOBILE_NAV = [
  { route: 'dashboard', label: 'Home', icon: 'grid' },
  { route: 'courses', label: 'Courses', icon: 'book' },
  { route: 'tutor', label: 'Tutor', icon: 'sparkles' },
  { route: 'progress', label: 'Progress', icon: 'chart' },
  { route: 'more', label: 'More', icon: 'menu' },
];

export function getRoute(routeId) {
  return ROUTES[routeId] || null;
}

/** A small set of shortcuts for the command palette. */
export const QUICK_ACTIONS = [
  {
    title: 'Open the A1 course',
    subtitle: 'Start at the beginning of the A1 curriculum',
    href: '#/courses/a1',
    icon: 'book',
    meta: 'Course',
  },
  {
    title: 'Browse the Grammar Academy',
    subtitle: '30 explanations with German examples',
    href: '#/grammar',
    icon: 'layers',
    meta: 'Grammar',
  },
  {
    title: 'Build vocabulary',
    subtitle: 'Words, articles, plurals and audio',
    href: '#/vocabulary',
    icon: 'languages',
    meta: 'Vocabulary',
  },
  {
    title: 'View your progress',
    subtitle: 'Local report, streak and readiness',
    href: '#/progress',
    icon: 'chart',
    meta: 'Progress',
  },
  {
    title: 'Run practice exercises',
    subtitle: 'Authored questions with instant feedback',
    href: '#/exercises',
    icon: 'zap',
    meta: 'Practice',
  },
  {
    title: 'Sit a mock examination',
    subtitle: 'Timed A1–C2 paper with a readiness report',
    href: '#/exams',
    icon: 'trophy',
    meta: 'Assess',
  },
  {
    title: 'Chat with the AI tutor',
    subtitle: 'Real German replies, corrections and explanations',
    href: '#/tutor',
    icon: 'sparkles',
    meta: 'AI',
  },
  {
    title: 'Start a real-life role-play',
    subtitle: '35 authored scenarios from A1 to C2',
    href: '#/conversations',
    icon: 'message',
    meta: 'AI',
  },
  {
    title: 'Talk with your German partner',
    subtitle: 'Speak and hear a real AI reply in German',
    href: '#/talk',
    icon: 'headphones',
    meta: 'Voice',
  },
  {
    title: 'Practise speaking aloud',
    subtitle: 'Real recognition, transcript and spoken AI reply',
    href: '#/speaking',
    icon: 'mic',
    meta: 'Voice',
  },
  {
    title: 'Train your pronunciation',
    subtitle: 'Model audio and honest transcript comparison',
    href: '#/pronunciation',
    icon: 'volume',
    meta: 'Voice',
  },
];
