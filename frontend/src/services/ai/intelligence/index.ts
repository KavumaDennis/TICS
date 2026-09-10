/**
 * Trip Intelligence System - Index
 * ─────────────────────────────────────────────────────────────────────────────
 * Central export point for all AI intelligence services.
 *
 * Architecture (AI-First):
 *   ContextAggregator    → Collects all trip context data
 *   PromptBuilder        → Builds structured prompts for Gemini
 *   Gemini AI            → Primary intelligence engine
 *   ValidationLayer      → Validates, deduplicates, ranks, caches
 *   AIRecommendationEngine → AI-first recommendation generation
 *   AIAlertEngine        → AI-first alert generation
 *   Fallback Templates   → Only used when AI is unavailable
 *
 * Supporting Engines:
 *   TripStageEngine      → Stage-aware content selection
 *   TransportModeEngine  → Mode-aware content selection
 *   PriorityEngine       → Alert/recommendation priority
 *   TimingEngine         → Time-aware content delivery
 *   PersonalizationEngine → User learning and personalization
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Shared Context
export { TripIntelligenceContextBuilder, tripIntelligenceContext } from './TripIntelligenceContext';
export type { TripIntelligenceContext, WeatherData, UserPreferences, NearbyPlace, RoadCondition, TravelDocument, SafetyInformation, ItineraryEvent } from './TripIntelligenceContext';
export { TripStage, TransportMode, AlertPriority, RecommendationCategory } from './TripIntelligenceContext';

// Context Aggregator
export { ContextAggregator, contextAggregator } from './ContextAggregator';
export type { AggregatedContext } from './ContextAggregator';

// Prompt Builder
export { PromptBuilder, promptBuilder } from './PromptBuilder';
export type { BuiltPrompt, PromptType } from './PromptBuilder';

// Validation Layer
export { ValidationLayer, validationLayer } from './ValidationLayer';
export type { AIResponseItem, ValidationResult } from './ValidationLayer';

// Stage Engine
export { TripStageEngine, tripStageEngine } from './TripStageEngine';
export type { StageContentGuide } from './TripStageEngine';

// Transport Mode Engine
export { TransportModeEngine, transportModeEngine } from './TransportModeEngine';
export type { ModeAlertDomain } from './TransportModeEngine';

// Priority Engine
export { PriorityEngine, priorityEngine } from './PriorityEngine';
export type { PriorityDefinition } from './PriorityEngine';

// Timing Engine
export { TimingEngine, timingEngine } from './TimingEngine';
export type { TimedContent, TimeWindow } from './TimingEngine';

// Personalization Engine
export { PersonalizationEngine, personalizationEngine } from './PersonalizationEngine';
export type { PersonalizationProfile } from './PersonalizationEngine';

// Recommendation Engine (AI-First)
export { AIRecommendationEngine, aiRecommendationEngine } from './AIRecommendationEngine';
export type { AIRecommendation } from './AIRecommendationEngine';

// Alert Engine (AI-First)
export { AIAlertEngine, aiAlertEngine } from './AIAlertEngine';
export type { AIAlert } from './AIAlertEngine';