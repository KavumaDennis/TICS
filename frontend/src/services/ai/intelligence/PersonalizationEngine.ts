/**
 * PersonalizationEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Learns from user behavior to generate increasingly relevant suggestions.
 *
 * Tracks:
 * - Saved destinations
 * - Trip history
 * - Favorite categories
 * - Travel style
 * - Budget
 * - Previous AI interactions
 * - Dismissed alerts
 * - Liked recommendations
 *
 * Uses this data to personalize all AI-generated content.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { RecommendationCategory, type UserPreferences, type TripIntelligenceContext } from './TripIntelligenceContext';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PERSONALIZATION PROFILE                                                   */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface PersonalizationProfile {
  /** Categories the user engages with most */
  topCategories: RecommendationCategory[];
  /** Categories the user dismisses or ignores */
  ignoredCategories: RecommendationCategory[];
  /** Travel styles preferred */
  preferredStyles: string[];
  /** Average budget range */
  averageBudget: { min: number; max: number; currency: string };
  /** Whether user prefers off-the-beaten-path vs popular */
  explorationStyle: 'popular' | 'balanced' | 'hidden_gems';
  /** Level of detail preferred */
  detailLevel: 'brief' | 'moderate' | 'detailed';
  /** Time of day when user is most active */
  activeTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Engagement score (0-100) */
  engagementScore: number;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PERSONALIZATION ENGINE                                                    */
/* ════════════════════════════════════════════════════════════════════════════ */

export class PersonalizationEngine {
  private profile: PersonalizationProfile | null = null;

  /**
   * Build a personalization profile from user preferences and interaction history.
   */
  buildProfile(preferences: UserPreferences): PersonalizationProfile {
    // Analyze favorite categories
    const topCategories = this.analyzeTopCategories(preferences);
    const ignoredCategories = this.analyzeIgnoredCategories(preferences);

    // Analyze travel style
    const preferredStyles = preferences.travelStyle || [];

    // Analyze budget
    const averageBudget = {
      min: preferences.budget?.min || 0,
      max: preferences.budget?.max || 1000,
      currency: preferences.budget?.currency || 'USD',
    };

    // Determine exploration style
    const explorationStyle = this.determineExplorationStyle(preferences);

    // Determine detail level
    const detailLevel = this.determineDetailLevel(preferences);

    // Determine active time of day
    const activeTimeOfDay = this.determineActiveTimeOfDay(preferences);

    // Calculate engagement score
    const engagementScore = this.calculateEngagementScore(preferences);

    this.profile = {
      topCategories,
      ignoredCategories,
      preferredStyles,
      averageBudget,
      explorationStyle,
      detailLevel,
      activeTimeOfDay,
      engagementScore,
    };

    return this.profile;
  }

  /**
   * Get the current personalization profile.
   */
  getProfile(): PersonalizationProfile | null {
    return this.profile;
  }

  /**
   * Personalize recommendations based on user profile.
   */
  personalizeRecommendations(
    recommendations: Array<{ category: string; title: string; confidence: number }>,
    context: TripIntelligenceContext,
  ): Array<{ category: string; title: string; confidence: number; personalScore: number }> {
    if (!this.profile) {
      this.buildProfile(context.userPreferences);
    }

    const profile = this.profile!;

    return recommendations.map(rec => {
      let personalScore = 0;
      const category = rec.category.toLowerCase();

      // Boost for top categories
      if (profile.topCategories.some(c => c.toLowerCase() === category)) {
        personalScore += 20;
      }

      // Penalize for ignored categories
      if (profile.ignoredCategories.some(c => c.toLowerCase() === category)) {
        personalScore -= 30;
      }

      // Boost for matching travel style
      if (profile.preferredStyles.length > 0) {
        const styleMatch = profile.preferredStyles.some(style =>
          rec.title.toLowerCase().includes(style.toLowerCase()) ||
          rec.category.toLowerCase().includes(style.toLowerCase())
        );
        if (styleMatch) personalScore += 15;
      }

      // Boost for budget-appropriate content
      if (rec.category === 'budget' || rec.category === 'accommodation') {
        personalScore += 10;
      }

      // Exploration style adjustment
      if (profile.explorationStyle === 'hidden_gems' && rec.confidence < 0.7) {
        personalScore += 10; // Boost less obvious recommendations
      } else if (profile.explorationStyle === 'popular' && rec.confidence > 0.7) {
        personalScore += 10; // Boost popular recommendations
      }

      // Final score
      const finalScore = Math.min(100, Math.max(0, rec.confidence * 100 + personalScore));

      return {
        ...rec,
        personalScore: finalScore,
      };
    }).sort((a, b) => b.personalScore - a.personalScore);
  }

  /**
   * Generate personalized prompt context for AI.
   */
  getPersonalizationPromptContext(context: TripIntelligenceContext): string {
    if (!this.profile) {
      this.buildProfile(context.userPreferences);
    }

    const profile = this.profile!;

    let prompt = '=== PERSONALIZATION CONTEXT ===\n\n';

    // User preferences
    if (context.userPreferences.savedDestinations.length > 0) {
      prompt += `Saved Destinations: ${context.userPreferences.savedDestinations.join(', ')}\n`;
    }

    if (context.userPreferences.tripHistory.length > 0) {
      prompt += `Trip History: ${context.userPreferences.tripHistory.join(', ')}\n`;
    }

    if (profile.preferredStyles.length > 0) {
      prompt += `Preferred Travel Styles: ${profile.preferredStyles.join(', ')}\n`;
    }

    prompt += `\nTop Categories: ${profile.topCategories.map(c => c.replace(/_/g, ' ')).join(', ')}\n`;
    prompt += `Exploration Style: ${profile.explorationStyle.replace(/_/g, ' ')}\n`;
    prompt += `Engagement Score: ${profile.engagementScore}/100\n`;

    // Budget context
    if (context.budget.max) {
      prompt += `\nBudget: Up to ${context.budget.currency || 'USD'} ${context.budget.max}\n`;
    }

    // Previous interactions
    if (context.userPreferences.previousInteractions.length > 0) {
      const recent = context.userPreferences.previousInteractions.slice(-5);
      prompt += `\nRecent Interactions:\n`;
      for (const interaction of recent) {
        prompt += `- ${interaction.type}: ${interaction.itemId}\n`;
      }
    }

    // Dismissed alerts to avoid
    if (context.userPreferences.dismissedAlerts.length > 0) {
      prompt += `\nAvoid generating similar content to these dismissed items:\n`;
      context.userPreferences.dismissedAlerts.slice(-3).forEach(id => {
        prompt += `- ${id}\n`;
      });
    }

    prompt += `\nGenerate content that matches this user's preferences and travel style.\n`;

    return prompt;
  }

  /**
   * Track a user interaction for future personalization.
   */
  trackInteraction(
    preferences: UserPreferences,
    interaction: {
      type: 'alert_dismissed' | 'recommendation_liked' | 'recommendation_saved' | 'journey_created';
      itemId: string;
      category?: string;
    },
  ): UserPreferences {
    return {
      ...preferences,
      previousInteractions: [
        ...preferences.previousInteractions,
        {
          type: interaction.type,
          itemId: interaction.itemId,
          timestamp: Date.now(),
        },
      ],
      // Track liked recommendations
      likedRecommendations: interaction.type === 'recommendation_liked'
        ? [...preferences.likedRecommendations, interaction.itemId]
        : preferences.likedRecommendations,
      // Track dismissed alerts
      dismissedAlerts: interaction.type === 'alert_dismissed'
        ? [...preferences.dismissedAlerts, interaction.itemId]
        : preferences.dismissedAlerts,
    };
  }

  /**
   * Analyze top categories based on user interactions.
   */
  private analyzeTopCategories(preferences: UserPreferences): RecommendationCategory[] {
    if (preferences.favoriteCategories.length > 0) {
      return preferences.favoriteCategories;
    }

    // Derive from trip history
    const categoryScores: Record<string, number> = {};
    for (const history of preferences.tripHistory) {
      // Simple scoring based on keywords
      if (history.toLowerCase().includes('beach')) categoryScores['nearby_experiences'] = (categoryScores['nearby_experiences'] || 0) + 1;
      if (history.toLowerCase().includes('culture')) categoryScores['culture'] = (categoryScores['culture'] || 0) + 1;
      if (history.toLowerCase().includes('food')) categoryScores['food'] = (categoryScores['food'] || 0) + 1;
      if (history.toLowerCase().includes('adventure')) categoryScores['adventure'] = (categoryScores['adventure'] || 0) + 1;
      if (history.toLowerCase().includes('family')) categoryScores['family'] = (categoryScores['family'] || 0) + 1;
    }

    // Sort by score and return top 5
    return Object.entries(categoryScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([key]) => key as RecommendationCategory);
  }

  /**
   * Analyze ignored categories based on user interactions.
   */
  private analyzeIgnoredCategories(preferences: UserPreferences): RecommendationCategory[] {
    // Categories that appear in trip history that user hasn't engaged with
    const allCategories = Object.values(RecommendationCategory);
    const engaged = new Set([
      ...preferences.favoriteCategories,
      ...preferences.likedRecommendations.map(id => id.split('_')[0] as RecommendationCategory).filter(Boolean),
    ]);

    return allCategories.filter(c => !engaged.has(c)).slice(0, 3);
  }

  /**
   * Determine exploration style from user behavior.
   */
  private determineExplorationStyle(preferences: UserPreferences): 'popular' | 'balanced' | 'hidden_gems' {
    const likesCount = preferences.likedRecommendations.length;
    const tripCount = preferences.tripHistory.length;

    if (likesCount === 0 && tripCount === 0) return 'balanced';
    if (tripCount > 5 && likesCount < tripCount / 2) return 'hidden_gems';
    if (likesCount > tripCount * 2) return 'popular';
    return 'balanced';
  }

  /**
   * Determine preferred detail level.
   */
  private determineDetailLevel(preferences: UserPreferences): 'brief' | 'moderate' | 'detailed' {
    const interactionCount = preferences.previousInteractions.length;
    if (interactionCount > 50) return 'detailed';
    if (interactionCount > 10) return 'moderate';
    return 'brief';
  }

  /**
   * Determine active time of day.
   */
  private determineActiveTimeOfDay(preferences: UserPreferences): 'morning' | 'afternoon' | 'evening' | 'night' {
    const interactions = preferences.previousInteractions;
    if (interactions.length === 0) return 'morning';

    // Analyze last few interaction times
    const recentTimes = interactions.slice(-10).map(i => {
      const hour = new Date(i.timestamp).getHours();
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 17) return 'afternoon';
      if (hour >= 17 && hour < 22) return 'evening';
      return 'night';
    });

    // Find most common time
    const counts: Record<string, number> = {};
    recentTimes.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    return (Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'morning') as any;
  }

  /**
   * Calculate engagement score based on interaction volume.
   */
  private calculateEngagementScore(preferences: UserPreferences): number {
    let score = 0;

    // Saved destinations (max 20)
    score += Math.min(preferences.savedDestinations.length * 5, 20);

    // Trip history (max 20)
    score += Math.min(preferences.tripHistory.length * 4, 20);

    // Favorite categories (max 15)
    score += Math.min(preferences.favoriteCategories.length * 5, 15);

    // Interactions (max 30)
    score += Math.min(preferences.previousInteractions.length * 2, 30);

    // Liked recommendations (max 15)
    score += Math.min(preferences.likedRecommendations.length * 3, 15);

    return Math.min(100, score);
  }
}

export const personalizationEngine = new PersonalizationEngine();
export default personalizationEngine;