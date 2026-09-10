/**
 * AI Discovery Module Barrel Export
 * ─────────────────────────────────────────────────────────────────────────────
 * Central export point for all AI Discovery services.
 * UI should only import from this barrel file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { AIDiscoveryService } from './AIDiscoveryService';
export { IntentDetector } from './IntentDetector';
export { EntityExtractor } from './EntityExtractor';
export { PromptBuilder } from './PromptBuilder';
export { GeminiService } from './GeminiService';
export { ConversationManager } from './ConversationManager';
export { FallbackEngine } from './FallbackEngine';
export { AIDiscoveryCache } from './AIDiscoveryCache';

export type {
  TravelIntent,
  ExtractedEntities,
  BudgetEstimate,
  WeatherInfo,
  Place,
  AIRecommendation,
  AIDiscoveryResponse,
  ConversationMessage,
  ConversationContext,
  AIUserContext,
  AIDiscoveryOptions,
  AIDiscoveryAnalyticsEvent,
  AIDiscoveryError,
  SuggestedPrompt,
} from './types';