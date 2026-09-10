/**
 * WeekendEscapeIntelligence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Destination-based Weekend Escape Engine.
 *
 * Uses a strict eligibility classifier BEFORE ranking. Ordinary local
 * places (mosques, churches, schools, businesses, etc.) are always rejected.
 *
 * Pipeline:
 *   Google Places + OSM + Firestore
 *     → Deduplicate
 *       → TravelClassifier
 *         → WeekendEscapeClassifier  (strict eligibility)
 *           → Distance validation
 *             → Quality validation
 *               → Ranking
 *                 → Final Weekend Escapes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem, DestinationCoordinates, WeekendEscape, Destination } from '@/src/modules/explore/types';
import { TravelClassifier } from './TravelClassifier';
import { TravelRankingEngine } from './TravelRankingEngine';
import { CategoryBalancer } from './CategoryBalancer';
import { WeekendEscapeClassifier } from './WeekendEscapeClassifier';
import { ProviderDataCoordinator } from './ProviderDataCoordinator';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';

/* ── Minimum threshold before Firestore fallback ────────────────────────────── */

const MIN_ESCAPES_REQUIRED = 5;

/* ── WeekendEscapeIntelligence ──────────────────────────────────────────────── */

export const WeekendEscapeIntelligence = {
  /**
   * Discover weekend escapes by searching for real destination-worthy places.
   * Falls back to Firestore if live APIs return insufficient eligible candidates.
   */
  async discoverEscapes(
    lat: number,
    lng: number,
    maxRadiusKm: number = 250
  ): Promise<{ escapes: WeekendEscape[]; candidates: number; selected: number; source: 'live' | 'firestore'; firestoreReason?: string }> {
    console.log('[WeekendEscapeIntelligence] ═══════════════════════════════════════');
    console.log('[WeekendEscapeIntelligence] 🏕️ Discovering weekend escapes');
    console.log('[WeekendEscapeIntelligence] Radius: 5-300km from user');
    console.log('[WeekendEscapeIntelligence] ═══════════════════════════════════════');

      // Bounded radius: very large bboxes make Overpass slow / 502-prone.
      // Curated Firestore escapes beyond this range still surface via fallback.
      const osmResult = await Promise.allSettled([
        ProviderDataCoordinator.getOpenStreetMap(lat, lng, 120),
      ]);

      let allCandidates: NearbyItem[] = [];
      const osmPlaces = osmResult[0].status === 'fulfilled' ? osmResult[0].value.places : [];
      allCandidates = (osmPlaces || []).filter((p) => (p as any).distance >= 5);
      console.log(`[WeekendEscapeIntelligence] OSM+Curated (up to 120km): ${allCandidates.length} candidates`);

    // Deduplicate
    const unique = this.deduplicate(allCandidates);
    console.log(`[WeekendEscapeIntelligence] Total unique candidates: ${unique.length}`);

    // Classify for travel relevance
    const travelRelevant = TravelClassifier.filterTravelRelevant(unique) as NearbyItem[];
    console.log(`[WeekendEscapeIntelligence] Travel relevant: ${travelRelevant.length}`);

    // ── STRICT Weekend Escape eligibility (before ranking) ───────────────────
    const escapeEligible = WeekendEscapeClassifier.filterEligible(travelRelevant) as NearbyItem[];
    console.log(`[WeekendEscapeIntelligence] Weekend escape eligible: ${escapeEligible.length}`);
    
    // ── Check if live APIs returned enough eligible candidates ───────────────
    if (escapeEligible.length >= MIN_ESCAPES_REQUIRED) {
      // Rank by escape suitability
      const ranked = TravelRankingEngine.rank(escapeEligible, {
        userLocation: { lat, lng },
      });

      // Balance categories (won't collapse small pools)
      const balanced = CategoryBalancer.balance(ranked, 3, 10);

      // Convert to WeekendEscape model
      const escapes: WeekendEscape[] = balanced.map((place, index) => ({
        id: `escape_${place.id}`,
        destinationId: place.id,
        type: place.distance <= 100 ? 'day_trip' as any : place.distance <= 200 ? 'weekend' as any : 'road_trip' as any,
        distance: place.distance,
        travelTime: this.estimateTravelTime(place.distance),
        reason: this.generateEscapeReason(place),
        destination: this.toDestination(place),
      }));

      console.log(`[WeekendEscapeIntelligence] ✓ Generated ${escapes.length} escapes from live APIs (${escapeEligible.length} eligible candidates)`);
      escapes.forEach(e => console.log(`  ${e.destination.name}: ${e.distance}km (${e.type}) - ${e.reason}`));

      return {
        escapes,
        candidates: escapeEligible.length,
        selected: escapes.length,
        source: 'live',
      };
    }

    // ── Firestore fallback when live APIs fail or return insufficient data ──────
    const firestoreReason = escapeEligible.length === 0
      ? `All live APIs failed or returned 0 Weekend Escape eligible places`
      : `Live APIs returned only ${escapeEligible.length} eligible candidates. Minimum required = ${MIN_ESCAPES_REQUIRED}.`;
    
    console.log(`[WeekendEscapeIntelligence] ⚠ ${firestoreReason} Using Firestore fallback...`);

    try {
      const firestoreResult = await ExploreService.loadDestinations({
        pageSize: 20,
      });

      // Build weekend escapes from Firestore destinations
      const firestoreEscapes: WeekendEscape[] = firestoreResult.data
        .map((dest) => {
          let distance = 100; // Default: assume medium distance
          let hasValidCoords = false;
          
          if (dest.coordinates && typeof dest.coordinates === 'object') {
            const coords = dest.coordinates as any;
            if (typeof coords.lat === 'number' && typeof coords.lng === 'number' && coords.lat !== 0 && coords.lng !== 0) {
              distance = this.haversineDistance(
                { lat, lng },
                { lat: coords.lat, lng: coords.lng }
              );
              hasValidCoords = true;
            }
          }
          
          return {
            id: `fs_escape_${dest.id}`,
            destinationId: dest.id,
            type: (distance <= 100 ? 'day_trip' : distance <= 200 ? 'weekend' : 'road_trip') as any,
            distance: Math.round(distance * 100) / 100,
            travelTime: this.estimateTravelTime(distance),
            reason: hasValidCoords 
              ? `Explore ${dest.name} - a great escape ${Math.round(distance)}km away`
              : `Discover ${dest.name} - a top travel destination`,
            destination: dest,
          } as WeekendEscape;
        });

      console.log(`[WeekendEscapeIntelligence] ✓ Firestore fallback: Returned ${firestoreEscapes.length} weekend escapes`);
      console.log(`[WeekendEscapeIntelligence] 🔥 SOURCE: Firestore (live APIs: ${escapeEligible.length} eligible candidates)`);

      return {
        escapes: firestoreEscapes.slice(0, 10),
        candidates: 0,
        selected: Math.min(firestoreEscapes.length, 10),
        source: 'firestore',
        firestoreReason,
      };
    } catch (err) {
      console.warn('[WeekendEscapeIntelligence] Firestore fallback also failed:', err);
      console.log('[WeekendEscapeIntelligence] Returning 0 escapes - all providers failed');
      
      return {
        escapes: [],
        candidates: unique.length,
        selected: 0,
        source: 'live',
        firestoreReason: 'All providers including Firestore fallback failed',
      };
    }
  },

  /**
   * Estimate travel time based on distance.
   */
  estimateTravelTime(distanceKm: number): string {
    const drivingTime = Math.round(distanceKm / 50); // ~50km/h average
    if (drivingTime < 1) return 'Under 1 hour';
    if (drivingTime === 1) return '1 hour';
    if (drivingTime < 24) return `${drivingTime} hours`;
    return `${Math.round(drivingTime / 24)} days`;
  },

  /**
   * Generate a reason why this place makes a good escape.
   */
  generateEscapeReason(place: NearbyItem): string {
    const category = (place as any).travelCategory || '';
    const rating = place.rating || 0;
    const distance = place.distance;

    if (category === 'National Park' || category === 'Nature Reserve') {
      return `Explore nature and wildlife just ${Math.round(distance)}km away`;
    }
    if (category === 'Beach' || category === 'Island') {
      return `Perfect beach getaway ${Math.round(distance)}km from you`;
    }
    if (category === 'Waterfall' || category === 'Lake') {
      return `Scenic water destination ${Math.round(distance)}km away`;
    }
    if (category === 'Mountain' || category === 'Scenic Viewpoint') {
      return `Breathtaking views ${Math.round(distance)}km away`;
    }
    if (category === 'Historic Site' || category === 'Castle') {
      return `Historic destination ${Math.round(distance)}km away`;
    }
    if (rating >= 4.5) {
      return `Top-rated destination just ${Math.round(distance)}km away`;
    }
    return `Great weekend escape ${Math.round(distance)}km away`;
  },

  /**
   * Convert NearbyItem to Destination model.
   */
  toDestination(place: NearbyItem): Destination {
    return {
      id: place.id,
      name: place.name,
      slug: place.name.toLowerCase().replace(/\s+/g, '-'),
      description: place.description || '',
      country: '',
      countryCode: '',
      city: '',
      coordinates: place.coordinates,
      images: place.imageUrl ? [{ url: place.imageUrl, caption: '', credit: '' }] : [],
      categories: [(place as any).travelCategory || 'attraction'],
      travelTips: [],
      nearbyAirport: null,
      nearbyHotels: [],
      nearbyAttractions: [],
      weatherSummary: null,
      bestSeason: '',
      bestTimeToVisit: '',
      popularity: place.rating || 0,
      rating: place.rating || 0,
      reviewCount: place.reviewCount || 0,
      reviews: [],
      travelRequirements: [],
      emergencyContacts: [],
      currency: '',
      language: '',
      timezone: '',
      timezoneOffset: '',
      estimatedBudget: null,
      topAttractions: [],
      relatedDestinationIds: [],
      featured: false,
      trending: false,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },

  /**
   * Deduplicate places by name similarity and coordinates.
   */
  deduplicate(places: NearbyItem[]): NearbyItem[] {
    const unique = new Map<string, NearbyItem>();
    for (const place of places) {
      const normalizedName = place.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = `${normalizedName}_${place.coordinates.lat.toFixed(2)}_${place.coordinates.lng.toFixed(2)}`;
      if (!unique.has(key)) {
        unique.set(key, place);
      } else {
        const existing = unique.get(key)!;
        if ((place.rating || 0) > (existing.rating || 0)) {
          unique.set(key, place);
        }
      }
    }
    return Array.from(unique.values());
  },

  /**
   * Calculate Haversine distance between two coordinates in km.
   */
  haversineDistance(from: DestinationCoordinates, to: DestinationCoordinates): number {
    const R = 6371;
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(deg: number): number {
    return deg * (Math.PI / 180);
  },
};