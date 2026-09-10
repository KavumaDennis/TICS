/**
 * ConversationManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages lightweight conversation context for AI Discovery sessions.
 * Supports follow-up questions by maintaining context of previous recommendations.
 * Context is stored in memory during the current session only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ConversationContext, ConversationMessage, AIRecommendation, TravelIntent, ExtractedEntities } from './types';

/* ── In-memory store ────────────────────────────────────────────────────────── */

const conversations = new Map<string, ConversationContext>();

const MAX_MESSAGES = 20;
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

/* ── ConversationManager ─────────────────────────────────────────────────────── */

export const ConversationManager = {
  /**
   * Create or get a conversation by ID.
   */
  getOrCreate(id: string): ConversationContext {
    const existing = conversations.get(id);
    if (existing) {
      // Check if expired
      if (Date.now() - existing.updatedAt > SESSION_TTL) {
        conversations.delete(id);
      } else {
        return existing;
      }
    }

    const newConversation: ConversationContext = {
      id,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    conversations.set(id, newConversation);
    return newConversation;
  },

  /**
   * Get a conversation by ID.
   */
  get(id: string): ConversationContext | undefined {
    const conv = conversations.get(id);
    if (!conv) return undefined;

    // Check expiration
    if (Date.now() - conv.updatedAt > SESSION_TTL) {
      conversations.delete(id);
      return undefined;
    }

    return conv;
  },

  /**
   * Add a user message to the conversation.
   */
  addUserMessage(id: string, content: string): ConversationContext {
    const conv = this.getOrCreate(id);

    const message: ConversationMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    conv.messages.push(message);
    conv.updatedAt = Date.now();

    // Trim old messages
    if (conv.messages.length > MAX_MESSAGES) {
      conv.messages = conv.messages.slice(conv.messages.length - MAX_MESSAGES);
    }

    return conv;
  },

  /**
   * Add an assistant message with recommendations to the conversation.
   */
  addAssistantMessage(
    id: string,
    content: string,
    recommendations?: AIRecommendation[]
  ): ConversationContext {
    const conv = this.getOrCreate(id);

    const message: ConversationMessage = {
      role: 'assistant',
      content,
      timestamp: Date.now(),
      recommendations,
    };

    conv.messages.push(message);

    // Update last recommendations
    if (recommendations) {
      conv.lastRecommendations = recommendations;
    }

    conv.updatedAt = Date.now();

    return conv;
  },

  /**
   * Update the last intent and entities for context.
   */
  updateContext(
    id: string,
    intent: TravelIntent,
    entities: ExtractedEntities
  ): void {
    const conv = conversations.get(id);
    if (conv) {
      conv.lastIntent = intent;
      conv.lastEntities = entities;
      conv.updatedAt = Date.now();
    }
  },

  /**
   * Get conversation history as a formatted string for prompts.
   */
  getConversationHistory(id: string, maxMessages: number = 6): string {
    const conv = conversations.get(id);
    if (!conv || conv.messages.length === 0) return '';

    const recentMessages = conv.messages.slice(-maxMessages);
    return recentMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
  },

  /**
   * Get the last recommendations from the conversation.
   */
  getLastRecommendations(id: string): AIRecommendation[] | undefined {
    const conv = conversations.get(id);
    return conv?.lastRecommendations;
  },

  /**
   * Generate a conversation ID for a user session.
   */
  generateConversationId(userId?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `aid_${userId || 'anon'}_${timestamp}_${random}`;
  },

  /**
   * Clear a conversation from memory.
   */
  clear(id: string): void {
    conversations.delete(id);
  },

  /**
   * Clear all expired conversations.
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [id, conv] of conversations.entries()) {
      if (now - conv.updatedAt > SESSION_TTL) {
        conversations.delete(id);
      }
    }
  },

  /**
   * Get the number of active conversations.
   */
  getActiveCount(): number {
    this.clearExpired();
    return conversations.size;
  },
};