/**
 * Milestone 5 — Real-Life Conversations route.
 * Scenarios come from the authored course JSON, not from invented copy.
 */
import { renderAIChat } from './ai-chat.js';

export function renderConversations() {
  return renderAIChat({
    mode: 'roleplay',
    title: 'Real-Life Conversations',
    description:
      'Practise the 35 authored A1–C2 scenarios with an in-character German partner. Corrections and explanations come only from the configured AI provider.',
  });
}
