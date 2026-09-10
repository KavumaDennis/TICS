/**
 * AIDiscoveryEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main AI Discovery engine - the orchestrator for the complete pipeline.
 *
 * Pipeline:
 *   1. Build user context from all data sources
 *   2. Gather verified candidate data from providers
 *   3. Score candidates with personalization
 *   4. Try Gemini for reasoning/ranking (non-blocking)
 *   5. Rank candidates using weighted system
 *   6. Assign to discovery sections
 *   7. Cache and return feed
 *
 * Fallback hierarchy:
 *   Cached AI recommendations
 *     → Previously generated recommendations
 *       → Personalized real-data ranking (no AI)
 *         → Trending/nearby real data
 *           → Firestore fallback
 *
 * Never shows fake AI content when Gemini fails.
 * Clearly distinguishes AI-generated reasoning from ordinary ranked recommendations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { assistantChat } from '@/src/firebase/callables';
import { withTimeout, PROVIDER_TIMEOUTS } from '@/src/modules/explore/utils/withTimeout';
import { DiscoveryContextBuilder } from './DiscoveryContextBuilder';
import { DiscoveryCandidateService } from './DiscoveryCandidateService';
import { DiscoveryPersonalizationService } from './DiscoveryPersonalizationService';
import { DiscoveryRankingService } from './DiscoveryRankingService';
import { DiscoveryCacheService } from './DiscoveryCacheService';
import type {
  DiscoveryFeed,
  DiscoveryOptions,
  DiscoveryUserContext,
  DiscoveryCandidate,
  AIRecommendation,
  DiscoverySection,
  DiscoverySectionType,
  GeminiDiscoveryResponse,
  DiscoveryError,
} from './types';

/* ── Section config ─────────────────────────────────────────────────────────── */

const SECTION_CONFIG: Record<DiscoverySectionType, { title: string; subtitle: string }> = {
  for_you: { title: 'For You', subtitle: 'Personalized recommendations based on your preferences' },
  near_you: { title: 'Near You', subtitle: 'Experiences close to your current location' },
  this_weekend: { title: 'This Weekend', subtitle: 'Perfect for an upcoming short getaway' },
  hidden_gems: { title: 'Hidden Gems', subtitle: 'Less obvious but highly relevant experiences' },
  trending: { title: 'Trending', subtitle: 'Currently popular travel experiences' },
  because_you_like: { title: 'Because You Like...', subtitle: 'Recommendations based on your previous activity' },
  perfect_for_your_trip: { title: 'Perfect For Your Trip', subtitle: 'Related to your active or upcoming journey' },
  explore_something_new: { title: 'Explore Something New', subtitle: 'Step outside your usual travel style' },
};

/* ── Gemini Prompt Builder ──────────────────────────────────────────────────── */

// The assistantChat callable enforces a 2000-char message limit.
// We must keep the prompt well under that. We'll cap candidates at 12
// and keep each candidate line compact.
const MAX_PROMPT_CANDIDATES = 12;
const MAX_PROMPT_CHARS = 1800;

function buildGeminiPrompt(
  context: DiscoveryUserContext,
  candidates: DiscoveryCandidate[]
): string {
  const parts: string[] = [];

  parts.push(`You are TICS AI Discovery. Rank these VERIFIED travel experiences for this user. ONLY use candidates below. Never invent places.`);

  parts.push('');
  parts.push('RULES:');
  parts.push('1. Assign each to sections: for_you, near_you, this_weekend, hidden_gems, trending, because_you_like, perfect_for_your_trip, explore_something_new.');
  parts.push('2. Provide reason, relevanceScore (0-100), confidence (0-100).');
  parts.push('3. Return ONLY valid JSON. No markdown.');

  parts.push('');
  parts.push('USER CONTEXT:');
  if (context.name) parts.push(`- Name: ${context.name}`);
  if (context.currentCity) parts.push(`- City: ${context.currentCity}`);
  if (context.currentCountry) parts.push(`- Country: ${context.currentCountry}`);
  if (context.interests?.length) parts.push(`- Interests: ${context.interests.slice(0, 3).join(', ')}`);
  if (context.travelPreferences?.length) parts.push(`- Prefs: ${context.travelPreferences.slice(0, 3).join(', ')}`);
  if (context.preferredTravelStyles?.length) parts.push(`- Styles: ${context.preferredTravelStyles.slice(0, 3).join(', ')}`);
  if (context.savedPlaces?.length) parts.push(`- Saved: ${context.savedPlaces.slice(0, 3).join(', ')}`);
  if (context.previousTrips?.length) parts.push(`- Visited: ${context.previousTrips.slice(0, 3).join(', ')}`);
  if (context.activeTrip?.destination) parts.push(`- Active trip: ${context.activeTrip.destination}`);
  if (context.upcomingTrip?.to) parts.push(`- Upcoming: ${context.upcomingTrip.to}`);
  if (context.searchHistory?.length) parts.push(`- Searches: ${context.searchHistory.slice(0, 3).join(', ')}`);
  if (context.currentSeason) parts.push(`- Season: ${context.currentSeason}`);
  if (context.weather?.weatherMain) parts.push(`- Weather: ${context.weather.weatherMain} (${context.weather.tempC || '?'}°C)`);
  if (context.tripStage) parts.push(`- Trip stage: ${context.tripStage}`);
  parts.push(`- Preference: ${context.localVsRegionalVsInternational || 'mixed'}`);

  parts.push('');
  parts.push('CANDIDATES:');
  for (const candidate of candidates.slice(0, MAX_PROMPT_CANDIDATES)) {
    const distance = candidate.distanceKm !== undefined ? `${candidate.distanceKm.toFixed(1)}km` : '?';
    parts.push(`- ${candidate.id}|${candidate.title}|${candidate.type}|${candidate.category}|${distance}|${candidate.rating || 'N/A'}`);
  }

  parts.push('');
  parts.push('OUTPUT (valid JSON only):');
  parts.push(`{"recommendations":[{"candidateId":"id","title":"exact title","type":"type","category":"category","reason":"1-2 sentence reason","bestTimeToVisit":"best time","bestFor":["weekend"],"relevanceScore":85,"confidence":90,"weatherSuitability":"any","tripTypeSuitability":["local"],"noveltyScore":60}],"sectionAssignments":{"for_you":["id1"],"near_you":["id2"],"this_weekend":["id3"],"hidden_gems":["id4"],"trending":["id5"],"because_you_like":["id6"],"perfect_for_your_trip":["id7"],"explore_something_new":["id8"]}}`);

  const fullPrompt = parts.join('\n');
  // Hard safety: truncate to stay under the 2000-char callable limit
  return fullPrompt.length > MAX_PROMPT_CHARS ? fullPrompt.substring(0, MAX_PROMPT_CHARS) : fullPrompt;
}

/* ── Gemini Response Parser ─────────────────────────────────────────────────── */

function parseGeminiDiscoveryResponse(text: string): GeminiDiscoveryResponse | null {
  try {
    // Try direct JSON parse first
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {}
    }
    // Try finding JSON object
    const objectMatch = text.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {}
    }
  }
  return null;
}

/* ── AIDiscoveryEngine ──────────────────────────────────────────────────────── */

export const AIDiscoveryEngine = {
  /**
   * Main entry point: generate a personalized AI discovery feed.
   *
   * Strategy:
   *  1. Check cache → return immediately if fresh
   *  2. Build context + gather candidates in parallel
   *  3. Score candidates locally (always works)
   *  4. Try Gemini reasoning (non-blocking, may fail)
   *  5. Rank + assign sections
   *  6. Cache and return
   */
  async discover(options: DiscoveryOptions = {}): Promise<DiscoveryFeed> {
    const dedupKey = DiscoveryCacheService.buildDedupKey(options);

    return DiscoveryCacheService.dedupeRequest(dedupKey, async () => {
      const startTime = Date.now();

      // ── 1. Build user context ────────────────────────────────────────────
      const context = await DiscoveryContextBuilder.buildContext({
        userId: options.userId,
        location: options.location,
      });

      // ── 2. Gather candidate data from providers ──────────────────────────
      const { candidates, providersUsed, errors } = await DiscoveryCandidateService.gatherCandidates({
        location: options.location,
        userId: options.userId,
      });

      // ── 3. Load personalization preferences ──────────────────────────────
      const preferences = await DiscoveryPersonalizationService.getPreferences(options.userId);

      // ── 4. Score candidates with personalization ─────────────────────────
      const personalScores = new Map<string, number>();
      for (const candidate of candidates) {
        const score = DiscoveryPersonalizationService.scoreCandidateForUser(candidate, context, preferences);
        personalScores.set(candidate.id, score);
      }

      // ── 5. Try Gemini for AI reasoning (non-blocking, may fail) ──────────
      let geminiResult: GeminiDiscoveryResponse | null = null;
      let geminiFailed = false;

      if (candidates.length > 0) {
        try {
          const prompt = buildGeminiPrompt(context, candidates);
          const geminiResponse = await withTimeout(
            assistantChat({
              message: prompt,
              instruction: 'You are TICS AI Discovery. Reason over the candidate list and produce structured JSON output only.',
            }),
            PROVIDER_TIMEOUTS.GEMINI + 5000,
            'gemini_discovery'
          );

          if (geminiResponse?.answer) {
            geminiResult = parseGeminiDiscoveryResponse(geminiResponse.answer);
          }
        } catch (err) {
          geminiFailed = true;
          console.warn('[AIDiscoveryEngine] Gemini reasoning failed (continuing with rule-based ranking):', err);
          errors.push('Gemini unavailable - using rule-based ranking');
        }
      }

      // ── 6. Rank candidates using weighted system ─────────────────────────
      const ranked = DiscoveryRankingService.rankCandidates(candidates, context, personalScores);

      // ── 7. Apply Gemini reasoning if available ───────────────────────────
      let finalRecommendations = ranked;
      if (geminiResult?.recommendations?.length) {
        finalRecommendations = this.applyGeminiReasoning(ranked, geminiResult);
      }

      // ── 8. Assign to sections ────────────────────────────────────────────
      const sectionMap = DiscoveryRankingService.assignToSections(finalRecommendations, context);

      // ── 9. Build section objects ──────────────────────────────────────────
      const sections: DiscoverySection[] = [];
      for (const [type, recommendations] of Object.entries(sectionMap)) {
        const sectionType = type as DiscoverySectionType;
        const config = SECTION_CONFIG[sectionType];
        if (!config || recommendations.length === 0) continue;

        // Add personalized reasons
        const withReasons = recommendations.map((rec) => {
          const geminiRec = geminiResult?.recommendations?.find((r) => r.candidateId === rec.id);
          const reason = geminiRec?.reason ||
            DiscoveryPersonalizationService.generateReason(
              candidates.find((c) => c.id === rec.id) as DiscoveryCandidate,
              context,
              preferences,
              rec.relevanceScore
            );
          return {
            ...rec,
            reason,
            isAIReasoned: Boolean(geminiRec?.reason),
            bestTimeToVisit: geminiRec?.bestTimeToVisit || rec.bestTimeToVisit,
            bestFor: geminiRec?.bestFor || rec.bestFor,
            relevanceScore: geminiRec?.relevanceScore || rec.relevanceScore,
            confidence: geminiRec?.confidence || rec.confidence,
            weatherSuitability: geminiRec?.weatherSuitability || rec.weatherSuitability,
            tripTypeSuitability: geminiRec?.tripTypeSuitability || rec.tripTypeSuitability,
            noveltyScore: geminiRec?.noveltyScore || rec.noveltyScore,
          };
        });

        sections.push({
          id: `${sectionType}_${Date.now()}`,
          type: sectionType,
          title: config.title,
          subtitle: config.subtitle,
          recommendations: withReasons,
          source: geminiResult ? 'ai' : 'ranked',
          generatedAt: Date.now(),
        });
      }

      // ── 10. Build the final feed ─────────────────────────────────────────
      const feed: DiscoveryFeed = {
        sections,
        generatedAt: Date.now(),
        source: geminiResult ? 'ai' : 'ranked',
        context,
        providersUsed,
        errors,
        isStale: false,
      };

      // ── 11. Cache the feed ───────────────────────────────────────────────
      await DiscoveryCacheService.set(feed, options);

      const elapsed = Date.now() - startTime;
      const aiMode = geminiResult ? 'AI reasoning' : geminiFailed ? 'rule-based (Gemini failed)' : 'rule-based';
      console.log(`[AIDiscoveryEngine] Generated discovery feed in ${elapsed}ms (${aiMode})`);
      console.log(`[AIDiscoveryEngine] ${sections.length} sections, ${finalRecommendations.length} total recommendations`);
      console.log(`[AIDiscoveryEngine] Providers: ${providersUsed.join(', ')}`);

      return feed;
    });
  },

  /**
   * Apply Gemini reasoning scores to ranked recommendations.
   */
  applyGeminiReasoning(
    recommendations: AIRecommendation[],
    geminiResult: GeminiDiscoveryResponse
  ): AIRecommendation[] {
    const geminiMap = new Map(
      geminiResult.recommendations?.map((r) => [r.candidateId, r]) || []
    );

    return recommendations.map((rec) => {
      const geminiRec = geminiMap.get(rec.id);
      if (!geminiRec) return rec;

      return {
        ...rec,
        reason: geminiRec.reason || rec.reason,
        bestTimeToVisit: geminiRec.bestTimeToVisit || rec.bestTimeToVisit,
        bestFor: geminiRec.bestFor || rec.bestFor,
        relevanceScore: geminiRec.relevanceScore || rec.relevanceScore,
        confidence: geminiRec.confidence || rec.confidence,
        isAIReasoned: true,
        weatherSuitability: geminiRec.weatherSuitability || rec.weatherSuitability,
        tripTypeSuitability: geminiRec.tripTypeSuitability || rec.tripTypeSuitability,
        noveltyScore: geminiRec.noveltyScore || rec.noveltyScore,
      };
    });
  },

  /**
   * Refresh an existing feed in the background.
   * Returns old feed immediately, then updates cache when new one is ready.
   */
  async refreshInBackground(
    options: DiscoveryOptions,
    onNewFeed?: (feed: DiscoveryFeed) => void
  ): Promise<DiscoveryFeed> {
    // First, try to get cached feed for immediate rendering
    const cached = await DiscoveryCacheService.getImmediate(options);
    if (cached) {
      // Fire background refresh
      DiscoveryCacheService.dedupeRequest(
        `${DiscoveryCacheService.buildDedupKey(options)}_bg`,
        async () => {
          const fresh = await this.discover({ ...options, forceRefresh: true });
          if (onNewFeed) onNewFeed(fresh);
          return fresh;
        }
      ).catch(() => {});
      return cached;
    }

    // No cache - wait for fresh discovery
    return this.discover(options);
  },
};

/* ── Error helper ───────────────────────────────────────────────────────────── */

export function createDiscoveryError(code: DiscoveryError['code'], message: string, retryable = true): DiscoveryError {
  return { code, message, retryable };
}