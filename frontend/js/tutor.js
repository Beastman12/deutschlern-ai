/**
 * Milestone 5 — AI German Tutor route.
 * The conversation shell is shared with role-plays; only the copy changes.
 */
import { renderAIChat } from './ai-chat.js';

export function renderTutor() {
  return renderAIChat({
    mode: 'tutor',
    title: 'AI German Tutor',
    description:
      'Write in German at your level. A real configured AI provider replies, corrects your sentences and explains the rule in English.',
  });
}
