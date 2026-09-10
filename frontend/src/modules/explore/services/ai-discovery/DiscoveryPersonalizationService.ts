/**
 * DiscoveryPersonalizationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Personalizes discovery results based on user behavior and preferences.
 *
 * Tracked signals:
 *  - Impression (recommendation shown)
 *  - View (user opened recommendation)
 *  - Click (user tapped)
 *  - Save
 *  - Coordinate Journey
 *  - Dismiss
 *  - Share
 *  - Visit/Complete
 *
 * Uses these signals to continuously improve future recommendations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import type { DiscoveryAnalyticsEvent, DiscoveryUserContext, DiscoveryCandidate, AIRecommendation, DiscoverySectionType } from './types';

/* ── Storage Keys ───────────────────────────────────────────────────────────── */

const STORAGE_KEYS = {
  PREFERENCES: '@tics_discovery_preferences',
  INTERACTIONS: '@tics_discovery_interactions',
  DISMISSED: '@tics_discovery_dismissed_',
  LIKED: '@tics_discovery_liked_',
} as const;

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface DiscoveryPreference {
  category: string;
  weight: number;
  count: number;
  lastSeen: number;
}

export interface DiscoveryInteractionRecord {
  id: string;
  userId: string;
  event: DiscoveryAnalyticsEvent;
  recommendationId: string;
  recommendationTitle: string;
  sectionType: DiscoverySectionType;
  category?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/* ── Category weight map ───────────────────────────────────────────────────── */

const CATEGORY_IMPLICIT_WEIGHTS: Partial<Record<string, number>> = {
  'discovery_clicked': 2,
  'discovery_viewed': 1,
  'discovery_saved': 5,
  'discovery_coordinated': 8,
  'discovery_shared': 4,
  'discovery_dismissed': -3,
};

/* ── Service ────────────────────────────────────────────────────────────────── */

export const DiscoveryPersonalizationService = {
  /**
   * Load user discovery preferences from storage.
   */
  async getPreferences(userId?: string): Promise<DiscoveryPreference[]> {
    try {
      const key = `${STORAGE_KEYS.PREFERENCES}_${userId || 'guest'}`;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  /**
   * Save user discovery preferences to storage.
   */
  async savePreferences(preferences: DiscoveryPreference[], userId?: string): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.PREFERENCES}_${userId || 'guest'}`;
      await AsyncStorage.setItem(key, JSON.stringify(preferences.slice(0, 50)));
    } catch {}
  },

  /**
   * Track a discovery interaction.
   * Updates local preferences and optionally writes to Firestore.
   */
  async trackInteraction(interaction: {
    userId?: string;
    event: DiscoveryAnalyticsEvent;
    recommendation: AIRecommendation;
    sectionType: DiscoverySectionType;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { userId, event, recommendation, sectionType, metadata } = interaction;
    const timestamp = Date.now();

    // ── 1. Update local preferences ────────────────────────────────────────
    try {
      const preferences = await this.getPreferences(userId);
      const weight = CATEGORY_IMPLICIT_WEIGHTS[event] || 0;
      const categoryKey = recommendation.category || recommendation.type || 'general';

      let preference = preferences.find((p) => p.category === categoryKey);
      if (preference) {
        preference.weight += weight;
        preference.count += 1;
        preference.lastSeen = timestamp;
      } else {
        preferences.push({
          category: categoryKey,
          weight: Math.max(weight, 1),
          count: 1,
          lastSeen: timestamp,
        });
      }

      // Track recommendation title for better personalization
      const titleKey = recommendation.title.toLowerCase();
      let titlePref = preferences.find((p) => p.category === `title:${titleKey}`);
      if (!titlePref) {
        preferences.push({
          category: `title:${titleKey}`,
          weight: weight > 0 ? weight : 0.5,
          count: 1,
          lastSeen: timestamp,
        });
      }

      await this.savePreferences(preferences, userId);
    } catch {}

    // ── 2. Track dismissed / liked lists ───────────────────────────────────
    try {
      if (event === 'discovery_dismissed') {
        const dismissKey = `${STORAGE_KEYS.DISMISSED}${userId || 'guest'}`;
        const dismissedRaw = await AsyncStorage.getItem(dismissKey);
        const dismissed = dismissedRaw ? JSON.parse(dismissedRaw) : [];
        dismissed.push({ id: recommendation.id, title: recommendation.title, timestamp });
        await AsyncStorage.setItem(dismissKey, JSON.stringify(dismissed.slice(-50)));
      } else if (event === 'discovery_saved' || event === 'discovery_clicked' || event === 'discovery_viewed') {
        const likedKey = `${STORAGE_KEYS.LIKED}${userId || 'guest'}`;
        const likedRaw = await AsyncStorage.getItem(likedKey);
        const liked = likedRaw ? JSON.parse(likedRaw) : [];
        if (!liked.some((l: any) => l.id === recommendation.id)) {
          liked.push({ id: recommendation.id, title: recommendation.title, timestamp });
          await AsyncStorage.setItem(likedKey, JSON.stringify(liked.slice(-50)));
        }
      }
    } catch {}

    // ── 3. Write interaction to Firestore (best effort) ────────────────────
    if (userId) {
      try {
        const db = getFirebaseFirestore();
        const interactionRef = collection(db, 'users', userId, 'discoveryInteractions');
        await addDoc(interactionRef, {
          event,
          recommendationId: recommendation.id,
          recommendationTitle: recommendation.title,
          category: recommendation.category,
          sectionType,
          metadata: metadata || {},
          timestamp: serverTimestamp(),
        });

        // Also track in exploreAnalytics for cross-module analysis
        const analyticsRef = collection(db, 'exploreAnalytics');
        await addDoc(analyticsRef, {
          userId,
          event: `discovery_${event.replace('discovery_', '')}`,
          metadata: {
            recommendationId: recommendation.id,
            recommendationTitle: recommendation.title,
            category: recommendation.category,
            sectionType,
            ...(metadata || {}),
          },
          timestamp: serverTimestamp(),
        });
      } catch {}
    }
  },

  /**
   * Score a candidate based on user context and preferences.
   * Returns a normalized 0-100 score.
   */
  scoreCandidateForUser(
    candidate: DiscoveryCandidate,
    context: DiscoveryUserContext,
    preferences: DiscoveryPreference[]
  ): number {
    let score = 50; // Neutral baseline
    const reasons: string[] = [];

    // ── 1. Category preference matching ───────────────────────────────────
    const categoryLower = (candidate.category || '').toLowerCase();
    const typeLower = (candidate.type || '').toLowerCase();
    const tags = candidate.tags || [];

    for (const pref of preferences) {
      const prefLower = pref.category.toLowerCase();
      if (categoryLower.includes(prefLower) || typeLower.includes(prefLower) || tags.some((t) => t.toLowerCase().includes(prefLower))) {
        score += pref.weight * 1.5;
        if (pref.category.startsWith('title:')) {
          // Content-based matching: user engaged with this specific place before
          score += 10;
        }
      }
    }

    // ── 2. User profile interests ─────────────────────────────────────────
    if (context.interests?.length) {
      for (const interest of context.interests) {
        const interestLower = interest.toLowerCase();
        if (categoryLower.includes(interestLower) || typeLower.includes(interestLower) || tags.some((t) => t.toLowerCase().includes(interestLower))) {
          score += 8;
        }
      }
    }

    // ── 3. Travel preferences ─────────────────────────────────────────────
    if (context.travelPreferences?.length) {
      for (const pref of context.travelPreferences) {
        const prefLower = pref.toLowerCase();
        if (categoryLower.includes(prefLower) || typeLower.includes(prefLower)) {
          score += 6;
        }
      }
    }

    // ── 4. Previously viewed ──────────────────────────────────────────────
    if (context.previouslyViewed?.includes(candidate.title)) {
      score -= 5; // Slightly penalize already-viewed
    }

    // ── 5. Previously visited (prior trips) ───────────────────────────────
    if (context.previousTrips?.some((trip) => trip.toLowerCase() === candidate.title.toLowerCase())) {
      score -= 10; // Encourage discovery, not repeats
    }

    // ── 6. Distance preference ────────────────────────────────────────────
    if (candidate.distanceKm !== undefined) {
      const distance = candidate.distanceKm;
      const userPreference = context.localVsRegionalVsInternational;

      if (userPreference === 'local' && distance <= 50) {
        score += 15;
        reasons.push('Near your location');
      } else if (userPreference === 'regional' && distance > 50 && distance <= 500) {
        score += 15;
        reasons.push('Great regional option');
      } else if (userPreference === 'international' && distance > 500) {
        score += 15;
        reasons.push('International destination');
      } else if (userPreference === 'mixed') {
        // Favor nearby for default experience
        if (distance <= 100) score += 5;
      }

      // Very close items get a bonus
      if (distance <= 10) score += 5;
    }

    // ── 7. Weather suitability ────────────────────────────────────────────
    if (context.weather?.weatherMain && candidate.weatherSuitability) {
      const isRainy = ['rain', 'thunderstorm', 'drizzle', 'snow'].includes(context.weather.weatherMain);
      if (isRainy && candidate.weatherSuitability === 'indoor') {
        score += 12;
        reasons.push('Great for current weather');
      } else if (!isRainy && candidate.weatherSuitability === 'outdoor') {
        score += 8;
        reasons.push('Perfect for outdoor activity');
      } else if (isRainy && candidate.weatherSuitability === 'outdoor') {
        score -= 8;
      }
    }

    // ── 8. Rating and popularity ──────────────────────────────────────────
    if (candidate.rating) {
      score += (candidate.rating - 3.5) * 5; // Bonus for highly rated
    }
    if (candidate.popularity) {
      score += Math.min(candidate.popularity / 10, 5);
    }

    // ── 9. Recently dismissed ─────────────────────────────────────────────
    if (context.recentlyDismissed?.includes(candidate.id)) {
      score -= 30; // Strong penalty for dismissed items
    }

    // ── 10. Recently liked ────────────────────────────────────────────────
    if (context.recentlyLiked?.includes(candidate.id)) {
      score += 15;
    }

    // ── 11. Novelty boost (hidden gems) ───────────────────────────────────
    if (candidate.type === 'hidden_gem' || (candidate.tags || []).some((t) => t.toLowerCase().includes('hidden'))) {
      score += 5;
    }

    // ── 12. Search history relevance ──────────────────────────────────────
    if (context.searchHistory?.length) {
      for (const term of context.searchHistory) {
        const termLower = term.toLowerCase();
        if (candidate.title.toLowerCase().includes(termLower) || categoryLower.includes(termLower)) {
          score += 6;
          reasons.push('Matches your recent searches');
          break;
        }
      }
    }

    // ── 13. Active trip relevance ─────────────────────────────────────────
    if (context.activeTrip?.destination) {
      const tripDest = context.activeTrip.destination.toLowerCase();
      const candidateTitle = candidate.title.toLowerCase();
      if (candidateTitle.includes(tripDest) || tripDest.includes(candidateTitle)) {
        score += 20;
        reasons.push('Perfect for your current trip');
      }
    }

    // Normalize to 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  },

  /**
   * Generate a personalized recommendation reason.
   */
  generateReason(
    candidate: DiscoveryCandidate,
    context: DiscoveryUserContext,
    preferences: DiscoveryPreference[],
    score: number
  ): string {
    const reasons: string[] = [];

    // Preference-based
    const prefMatch = preferences.find((p) =>
      (candidate.category || '').toLowerCase().includes(p.category.toLowerCase()) ||
      (candidate.type || '').toLowerCase().includes(p.category.toLowerCase()) ||
      (candidate.tags || []).some((t) => t.toLowerCase().includes(p.category.toLowerCase()))
    );
    if (prefMatch && prefMatch.category.startsWith('title:')) {
      reasons.push('You engaged with this place before');
    } else if (prefMatch && prefMatch.weight > 5) {
      reasons.push(`Matches your interest in ${candidate.category}`);
    }

    // Interest-based
    if (context.interests?.length) {
      const interestMatch = context.interests.find((i) =>
        (candidate.category || '').toLowerCase().includes(i.toLowerCase()) ||
        (candidate.tags || []).some((t) => t.toLowerCase().includes(i.toLowerCase()))
      );
      if (interestMatch) reasons.push(`Perfect for your ${interestMatch} interests`);
    }

    // Distance-based
    if (candidate.distanceKm !== undefined && candidate.distanceKm <= 10) {
      reasons.push(`Only ${candidate.distanceKm.toFixed(1)} km away`);
    } else if (candidate.distanceKm !== undefined && candidate.distanceKm <= 50) {
      reasons.push(`${Math.round(candidate.distanceKm)} km from you`);
    } else if (candidate.distanceKm !== undefined) {
      reasons.push(`${Math.round(candidate.distanceKm)} km away — worth the trip`);
    }

    // Trip-based
    if (context.activeTrip?.destination) {
      const tripDest = context.activeTrip.destination.toLowerCase();
      if ((candidate.title || '').toLowerCase().includes(tripDest)) {
        reasons.push('Ideal for your upcoming trip');
      }
    }

    // Weather-based
    if (context.weather?.weatherMain && candidate.weatherSuitability) {
      const isRainy = ['rain', 'thunderstorm', 'drizzle', 'snow'].includes(context.weather.weatherMain);
      if (isRainy && candidate.weatherSuitability === 'indoor') {
        reasons.push('Perfect indoor experience for today\'s weather');
      } else if (!isRainy && candidate.weatherSuitability === 'outdoor') {
        reasons.push('Great outdoor experience today');
      }
    }

    // Rating-based
    if (candidate.rating && candidate.rating >= 4.5) {
      reasons.push(`Top-rated (${candidate.rating.toFixed(1)} stars)`);
    }

    // Popularity
    if (candidate.popularity && candidate.popularity > 70) {
      reasons.push('Trending right now');
    }

    // Fallback
    if (reasons.length === 0) {
      if (candidate.type === 'weekend_escape') {
        reasons.push('Perfect for a weekend getaway');
      } else if (candidate.type === 'event') {
        reasons.push('Don\'t miss this upcoming event');
      } else {
        reasons.push('We think you\'ll love this');
      }
    }

    return reasons.slice(0, 2).join('. ') + '.';
  },
};