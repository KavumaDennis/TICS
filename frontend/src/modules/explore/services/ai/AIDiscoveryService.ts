/**
 * AIDiscoveryService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core AI Discovery Service - the main entry point for AI-powered travel discovery.
 * Implements the full processing pipeline:
 *   User Prompt → Intent Detection → Entity Extraction → Travel Preference Analysis
 *   → Recommendation Generation → Destination Enrichment → Ranking → Journey Suggestions
 *
 * Architecture:
 *   AIDiscoveryService
 *   ├── IntentDetector
 *   ├── EntityExtractor
 *   ├── PromptBuilder
 *   ├── GeminiService (primary)
 *   ├── FallbackEngine (when AI unavailable)
 *   ├── AIDiscoveryCache
 *   └── ConversationManager
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AIDiscoveryResponse, AIUserContext, AIDiscoveryOptions, AIDiscoveryError } from './types';
import type { TravelIntent, ExtractedEntities } from './types';
import { IntentDetector } from './IntentDetector';
import { EntityExtractor } from './EntityExtractor';
import { PromptBuilder } from './PromptBuilder';
import { GeminiService } from './GeminiService';
import { FallbackEngine } from './FallbackEngine';
import { AIDiscoveryCache } from './AIDiscoveryCache';
import { ConversationManager } from './ConversationManager';
import { getAllDestinations } from '@/src/services/DestinationsService';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const MAX_RETRIES = 2;
const TIMEOUT_MS = 30000;
const DEBOUNCE_MS = 500;

/* ── Active request tracking for cancellation ───────────────────────────────── */

let activeRequestId: string | null = null;
let abortController: AbortController | null = null;

/* ── AIDiscoveryService ──────────────────────────────────────────────────────── */

export const AIDiscoveryService = {
  /**
   * Main entry point for AI-powered travel discovery.
   * Processes a natural language prompt through the full pipeline.
   */
  async discover(
    prompt: string,
    userContext?: AIUserContext,
    options: AIDiscoveryOptions = {}
  ): Promise<AIDiscoveryResponse> {
    const startTime = Date.now();
    const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Cancel any previous request
    this.cancelPreviousRequest();

    // Set this as the active request
    activeRequestId = requestId;
    abortController = new AbortController();

    try {
      // 1. Check cache first
      if (options.useCache !== false) {
        const cached = await AIDiscoveryCache.get(prompt, options.userId);
        if (cached) {
          console.log('[AIDiscoveryService] Cache hit for prompt:', prompt.substring(0, 50));
          return { ...cached, source: 'cache' };
        }
      }

      // 2. Generate conversation ID
      const conversationId = ConversationManager.generateConversationId(options.userId);

      // 3. Add user message to conversation
      ConversationManager.addUserMessage(conversationId, prompt);

      // 4. Detect if this is a follow-up question
      const isFollowUp = IntentDetector.isFollowUp(prompt);
      const conversationHistory = isFollowUp
        ? ConversationManager.getConversationHistory(conversationId)
        : '';

      // 5. Detect intent
      const intent = IntentDetector.detectIntent(prompt);
      const intentConfidence = IntentDetector.detectIntentsWithConfidence(prompt);

      // 6. Extract entities
      const entities = EntityExtractor.extract(prompt);

      // 7. Load destinations from Firestore
      const destinations = await this.loadDestinations();

      // 8. Build user context for personalization
      const aiUserContext: AIUserContext | undefined = userContext;

      // 9. Try Gemini AI first
      try {
        const response = await this.generateWithGemini(
          prompt,
          intent,
          entities,
          aiUserContext,
          destinations,
          isFollowUp,
          conversationHistory,
          conversationId,
          abortController.signal
        );

        // Update conversation context
        ConversationManager.updateContext(conversationId, intent, entities);
        ConversationManager.addAssistantMessage(
          conversationId,
          `Found ${response.recommendations.length} recommendations for you`,
          response.recommendations
        );

        // Cache the response
        await AIDiscoveryCache.set(prompt, response, options.userId);

        return response;
      } catch (geminiError) {
        console.warn('[AIDiscoveryService] Gemini failed, using fallback:', geminiError);

        // 10. Fallback to rule-based engine
        const fallbackResponse = await FallbackEngine.generateFallbackRecommendations(
          prompt,
          intent,
          entities,
          destinations,
          aiUserContext,
          conversationId
        );

        // Update conversation context
        ConversationManager.updateContext(conversationId, intent, entities);
        ConversationManager.addAssistantMessage(
          conversationId,
          `Found ${fallbackResponse.recommendations.length} recommendations for you (fallback mode)`,
          fallbackResponse.recommendations
        );

        return fallbackResponse;
      }
    } catch (error) {
      // Handle errors gracefully
      const errorResponse = this.handleError(error, prompt);
      throw errorResponse;
    } finally {
      if (activeRequestId === requestId) {
        activeRequestId = null;
        abortController = null;
      }
    }
  },

  /**
   * Generate recommendations using Gemini AI.
   */
  async generateWithGemini(
    prompt: string,
    intent: TravelIntent,
    entities: ExtractedEntities,
    userContext: AIUserContext | undefined,
    destinations: any[],
    isFollowUp: boolean,
    conversationHistory: string,
    conversationId: string,
    signal: AbortSignal
  ): Promise<AIDiscoveryResponse> {
    // Build the complete prompt
    const fullPrompt = PromptBuilder.buildCompletePrompt({
      prompt,
      intent,
      entities,
      userContext,
      destinations: destinations.map((d: any) => ({
        name: d.name,
        country: d.country,
        description: d.description,
        categories: d.categories || d.travelCategories,
        bestTimeToVisit: d.bestTimeToVisit,
        estimatedBudget: d.estimatedBudget,
        topAttractions: d.topAttractions,
      })),
      isFollowUp,
      conversationHistory: isFollowUp ? conversationHistory : undefined,
    });

    // Call Gemini with timeout
    const geminiResponse = await this.callGeminiWithTimeout(fullPrompt, signal);

    // Parse into structured response
    return GeminiService.parseAIDiscovery(
      geminiResponse,
      prompt,
      intent,
      entities,
      destinations,
      conversationId
    );
  },

  /**
   * Call Gemini with timeout support.
   */
  async callGeminiWithTimeout(
    prompt: string,
    signal: AbortSignal
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, TIMEOUT_MS);

      // Check if aborted
      if (signal.aborted) {
        clearTimeout(timeout);
        reject(new Error('CANCELLED'));
        return;
      }

      try {
        const result = await GeminiService.callGemini(prompt);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  },

  /**
   * Load destinations from Firestore for context.
   */
  async loadDestinations(): Promise<any[]> {
    try {
      const destinations = await getAllDestinations();
      return destinations.map((d: any) => ({
        ...d,
        name: d.name,
        country: d.country,
        countryCode: d.countryCode,
        description: d.description,
        categories: d.travelCategories || d.categories || [],
        bestTimeToVisit: d.bestTimeToVisit,
        estimatedBudget: d.estimatedBudget,
        topAttractions: d.topAttractions || [],
        rating: d.rating || 0,
        popularity: d.popularity || 0,
        images: d.images || [],
        coordinates: d.coordinates || (d.lat && d.lng ? { lat: d.lat, lng: d.lng } : undefined),
      }));
    } catch (err) {
      console.warn('[AIDiscoveryService] Failed to load destinations:', err);
      return [];
    }
  },

  /**
   * Cancel the current active request.
   */
  cancelPreviousRequest(): void {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    activeRequestId = null;
  },

  /**
   * Handle errors and return user-friendly error objects.
   */
  handleError(error: any, prompt: string): AIDiscoveryError {
    const message = error?.message || String(error);

    if (message.includes('QUOTA_EXCEEDED') || message.includes('429')) {
      return {
        code: 'QUOTA_EXCEEDED',
        message: 'AI service is temporarily unavailable due to high demand. Please try again shortly.',
        retryable: true,
      };
    }

    if (message.includes('GEMINI_UNAVAILABLE') || message.includes('500') || message.includes('503')) {
      return {
        code: 'GEMINI_UNAVAILABLE',
        message: 'AI service is currently unavailable. Please try again later.',
        retryable: true,
      };
    }

    if (message.includes('TIMEOUT') || message.includes('timeout')) {
      return {
        code: 'TIMEOUT',
        message: 'Request timed out. Please check your connection and try again.',
        retryable: true,
      };
    }

    if (message.includes('INVALID_RESPONSE')) {
      return {
        code: 'INVALID_RESPONSE',
        message: 'Received an unexpected response. Please try rephrasing your request.',
        retryable: true,
      };
    }

    if (message.includes('CANCELLED')) {
      return {
        code: 'TIMEOUT',
        message: 'Previous request was cancelled.',
        retryable: false,
      };
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('Network')) {
      return {
        code: 'NO_INTERNET',
        message: 'No internet connection. Please check your connection and try again.',
        retryable: true,
      };
    }

    return {
      code: 'UNKNOWN',
      message: 'Something went wrong. Please try again.',
      retryable: true,
    };
  },

  /**
   * Get suggested prompts for the initial screen.
   */
  getSuggestedPrompts(): Array<{ id: string; text: string; icon: string; category: string }> {
    return [
      { id: '1', text: 'Weekend getaway near me', icon: '🌴', category: 'Weekend' },
      { id: '2', text: 'Beach destinations under $1000', icon: '🏖️', category: 'Beach' },
      { id: '3', text: 'Romantic honeymoon', icon: '💑', category: 'Romance' },
      { id: '4', text: 'Wildlife adventures', icon: '🦁', category: 'Wildlife' },
      { id: '5', text: 'Family vacation ideas', icon: '👨‍👩‍👧‍👦', category: 'Family' },
      { id: '6', text: 'Road trips', icon: '🚗', category: 'Adventure' },
      { id: '7', text: 'Luxury escapes', icon: '✨', category: 'Luxury' },
      { id: '8', text: 'Business travel', icon: '💼', category: 'Business' },
      { id: '9', text: 'Festivals this month', icon: '🎉', category: 'Festivals' },
      { id: '10', text: 'Food and culture', icon: '🍽️', category: 'Culture' },
    ];
  },

  /**
   * Get conversation history for a session.
   */
  getConversationHistory(conversationId: string): string {
    return ConversationManager.getConversationHistory(conversationId);
  },

  /**
   * Clear a conversation.
   */
  clearConversation(conversationId: string): void {
    ConversationManager.clear(conversationId);
  },
};