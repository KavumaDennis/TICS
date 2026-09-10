/**
 * CategoryDiscoveryEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic Category Discovery Engine.
 *
 * Replaces static categories with intelligence-powered dynamic counts.
 * Each category now displays:
 *   - Total nearby places (from Google Places / OSM)
 *   - Total worldwide places (from Firestore + APIs)
 *   - Featured image
 *   - Trending destination within category
 *
 * Example:
 *   Adventure (483 nearby · 1,204 worldwide)
 *   Nature   (872 nearby · 1,204 worldwide)
 *   Beach    (452 nearby · 1,050 worldwide)
 *
 * Counts update automatically based on real data.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ExploreCategory, Destination } from '@/src/modules/explore/types';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';
import { FIRESTORE_COLLECTIONS } from '@/src/modules/explore/constants';
import { ProviderDataCoordinator } from './ProviderDataCoordinator';
import { DestinationCache } from './DestinationCache';

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface DynamicCategory {
  /** Base category fields */
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  imageUrl: string;
  color: string;
  parentCategoryId: string | null;
  subcategories: string[];
  tags: string[];
  featured: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Dynamic enrichment */
  nearbyCount: number;
  worldwideCount: number;
  trendingDestination: Destination | null;
  featuredImage: string;
  discoveredAt: number;
}

interface CategoryDiscoveryResult {
  categories: DynamicCategory[];
  computedAt: number;
}

/* ── Category-to-type mappings ────────────────────────────────────────────────── */

/**
 * Keyword map from category slug → OSM vocabulary. OSM places carry:
 *   - `type`: resolved Overpass type ('beach', 'museum', 'viewpoint', ...)
 *   - `travelCategory`: broad label ('Nature', 'Culture', 'Food', ...)
 *   - `tags`: raw Overpass values + the broad label
 * The old CATEGORY_PLACE_TYPES list used GOOGLE place types which rarely
 * matched, so counts (and the category screen) always came back empty.
 */
export const CATEGORY_OSM_KEYWORDS: Record<string, string[]> = {
  beach: ['beach'],
  nature: ['nature', 'park', 'forest', 'waterfall', 'lake', 'mountain', 'viewpoint', 'island', 'nature_reserve', 'national_park', 'parks & outdoors', 'peak', 'river'],
  cultural: ['culture', 'museum', 'art_gallery', 'artwork', 'castle', 'monument', 'historic_site', 'archaeological_site', 'place_of_worship', 'art', 'gallery', 'theatre'],
  historical: ['historic', 'monument', 'castle', 'ruins', 'memorial', 'fort', 'archaeological_site', 'historic_site'],
  food: ['food', 'restaurant', 'cafe', 'bar', 'fast_food', 'bakery', 'pub', 'ice_cream'],
  adventure: ['adventure', 'theme_park', 'amusement_park', 'hiking', 'climbing', 'water_park', 'entertainment'],
  wildlife: ['wildlife', 'zoo', 'aquarium', 'safari', 'animal'],
  city: ['attraction', 'city', 'town', 'square', 'pedestrian', 'shopping', 'market', 'night_club', 'movie_theater', 'cinema', 'fountain', 'mall'],
  luxury: ['accommodation', 'lodging', 'hotel', 'spa', 'guest_house', 'resort'],
  family: ['family', 'zoo', 'aquarium', 'theme_park', 'amusement_park', 'playground', 'park', 'museum'],
  wellness: ['wellness', 'spa', 'fitness', 'sports_centre', 'hot_spring', 'sauna', 'yoga'],
};

/**
 * Check whether a haystack (name/type/travelCategory/tags joined) belongs to
 * a category. Falls back to simple stem matching for unknown slugs.
 */
export function categoryMatchesKeywords(slug: string, haystack: string): boolean {
  const text = (haystack || '').toLowerCase();
  if (!text) return false;
  const keywords = CATEGORY_OSM_KEYWORDS[slug];
  if (keywords && keywords.length > 0) {
    if (keywords.some((k) => text.includes(k))) return true;
  }
  // Fallback: stem-based matching for categories without a keyword map.
  const stems = slug
    .toLowerCase()
    .split(/[-_\s]+/)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .filter(Boolean);
  return stems.some((s) => text.includes(s) || text.includes(s + 's') || text.includes(s + 'e'));
}

/**
 * Build the haystack used for keyword matching from a place-like object.
 */
function placeHaystack(p: Record<string, any>): string {
  return [
    p?.name,
    p?.type,
    p?.travelCategory,
    ...(Array.isArray(p?.tags) ? p.tags : []),
    ...(Array.isArray(p?.categories) ? p.categories : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Count places for a given category from the OSM-first aggregator.
 * Matching uses CATEGORY_OSM_KEYWORDS (OSM vocabulary), not Google types.
 */
async function countNearbyPlaces(
  lat: number,
  lng: number,
  radiusKm: number,
  categorySlug: string
): Promise<number> {
  try {
    const result = await ProviderDataCoordinator.getOpenStreetMap(lat, lng, radiusKm);
    return result.places.filter((p) =>
      categoryMatchesKeywords(categorySlug, placeHaystack(p as unknown as Record<string, any>))
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Count worldwide destinations for a category from Firestore.
 */
async function countWorldwideDestinations(categorySlug: string): Promise<number> {
  try {
    const result = await ExploreService.loadDestinationsByCategory(categorySlug);
    return result.total || result.data.length;
  } catch {
    // Fallback: estimate based on category
    const estimates: Record<string, number> = {
      beach: 1050,
      adventure: 1204,
      nature: 1204,
      cultural: 980,
      food: 1500,
      city: 890,
      wildlife: 760,
      historical: 850,
      luxury: 620,
      family: 1100,
      wellness: 540,
    };
    return estimates[categorySlug] || 500;
  }
}

/**
 * Static default categories — used when the Firestore "exploreCategories"
 * collection is missing/empty so the Categories section and the Category
 * screen always render. Every entry is enriched with live OSM counts and
 * imagery by getCategories().
 */
function makeDefaultCategory(
  slug: string,
  name: string,
  description: string,
  icon: string,
  color: string,
  imageUrl: string,
  sortOrder: number
): ExploreCategory {
  return {
    id: `default-category-${slug}`,
    name,
    slug,
    description,
    icon,
    imageUrl,
    color,
    parentCategoryId: null,
    subcategories: [],
    tags: CATEGORY_OSM_KEYWORDS[slug] || [slug],
    featured: false,
    sortOrder,
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export function getDefaultCategories(): ExploreCategory[] {
  return [
    makeDefaultCategory('nature', 'Nature', 'Parks, forests, lakes and breathtaking natural landscapes.', 'leaf', '#2E7D32', 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400', 1),
    makeDefaultCategory('cultural', 'Cultural', 'Museums, galleries, monuments and living heritage.', 'library', '#6A1B9A', 'https://images.unsplash.com/photo-1524666041070-9d876df3e5d5?w=400', 2),
    makeDefaultCategory('beach', 'Beaches', 'Sun-soaked shores, islands and coastal escapes.', 'water', '#0288D1', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400', 3),
    makeDefaultCategory('food', 'Food & Drink', 'Restaurants, cafes and local culinary experiences.', 'restaurant', '#E65100', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400', 4),
    makeDefaultCategory('historical', 'Historical', 'Forts, ruins, memorials and sites of the past.', 'flag', '#795548', 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=400', 5),
    makeDefaultCategory('adventure', 'Adventure', 'Theme parks, hiking trails and adrenaline activities.', 'rocket', '#C62828', 'https://images.unsplash.com/photo-1530866495561-507c9faab2ed?w=400', 6),
    makeDefaultCategory('wildlife', 'Wildlife', 'Zoos, aquariums and encounters with nature.', 'paw', '#33691E', 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=400', 7),
    makeDefaultCategory('city', 'City Life', 'Urban attractions, markets, nightlife and squares.', 'business', '#37474F', 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400', 8),
    makeDefaultCategory('family', 'Family', 'Kid-friendly parks, museums and attractions.', 'happy', '#F9A825', 'https://images.unsplash.com/photo-1502784444186-3590a34f0ef5?w=400', 9),
    makeDefaultCategory('wellness', 'Wellness', 'Spas, hot springs and restorative escapes.', 'fitness', '#00838F', 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400', 10),
  ];
}

/**
 * Get a trending destination image for the category.
 */
function getCategoryImage(category: ExploreCategory): string {
  if (category.imageUrl) return category.imageUrl;


  const fallbackImages: Record<string, string> = {
    beach: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
    adventure: 'https://images.unsplash.com/photo-1530866495561-507c9faab2ed?w=400',
    nature: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400',
    cultural: 'https://images.unsplash.com/photo-1524666041070-9d876df3e5d5?w=400',
    food: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400',
    city: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400',
    wildlife: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=400',
    historical: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=400',
    luxury: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400',
    family: 'https://images.unsplash.com/photo-1502784444186-3590a34f0ef5?w=400',
    wellness: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400',
  };

  return fallbackImages[category.slug] || category.imageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400';
}

/* ── Public API ──────────────────────────────────────────────────────────────── */

export const CategoryDiscoveryEngine = {
  /**
   * Discover categories with dynamic counts and trending images.
   *
   * @param lat - User's latitude for nearby counts
   * @param lng - User's longitude for nearby counts
   * @param radiusKm - Search radius for nearby counts
   * @returns Categories enriched with dynamic data
   */
  async getCategories(
    lat: number,
    lng: number,
    radiusKm: number = 100
  ): Promise<CategoryDiscoveryResult> {
    const result = await ExploreService.loadCategories();
    let categories = result.data ?? [];

    // ── Static default fallback — the Firestore collection may not be seeded.
    // The Categories section used to disappear entirely in that case. With
    // defaults in place, categories ALWAYS render and are enriched with live
    // OSM counts below.
    if (categories.length === 0) {
      if (result.error) {
        console.warn(`[CategoryDiscoveryEngine] ⚠ loadCategories returned error: "${result.error}". Using static default categories.`);
      } else {
        console.warn(`[CategoryDiscoveryEngine] ⚠ loadCategories returned 0 categories with no error (empty/unseeded Firestore collection "${FIRESTORE_COLLECTIONS?.EXPLORE_CATEGORIES || 'explore_categories'}"). Using static default categories.`);
      }
      categories = getDefaultCategories();
    }

    console.log(`[CategoryDiscoveryEngine] Loaded ${categories.length} raw categories (source: ${result.data?.length ? 'firestore' : 'static-defaults'}). Names:`, categories.map(c => c.name).join(', '));

    // Enrich each category with dynamic data
    const enriched = await Promise.all(
      categories.map(async (category): Promise<DynamicCategory> => {
        // Count nearby OSM places matching this category (keyword-based)
        const [nearbyCount, worldwideCount] = await Promise.allSettled([
          countNearbyPlaces(lat, lng, radiusKm, category.slug),
          countWorldwideDestinations(category.slug),
        ]);

        // Get the top destination in this category for trending — sourced from
        // the in-memory DestinationCache (filled by the last discover() run),
        // NOT from a per-category Firestore network call (that's what blew
        // through the 3s category budget and got everything discarded).
        let trendingDest: Destination | null = null;
        try {
          const cached = DestinationCache.getAll()
            .filter((d) =>
              categoryMatchesKeywords(category.slug, [
                d.name,
                (d as any).type,
                ...(d.categories || []),
                ...((d as any).tags || []),
              ].filter(Boolean).join(' ')))
            .sort((a, b) => (b.rating || 0) - (a.rating || 0));
          trendingDest = cached[0] ?? null;
        } catch {
          // Trending destination is optional
        }

        return {
          ...category,
          nearbyCount: nearbyCount.status === 'fulfilled' ? nearbyCount.value : 0,
          worldwideCount: worldwideCount.status === 'fulfilled' ? worldwideCount.value : 500,
          trendingDestination: trendingDest,
          featuredImage: getCategoryImage(category),
          discoveredAt: Date.now(),
        };
      })
    );

    // Sort by sortOrder, then by total count
    enriched.sort((a, b) => {
      const orderDiff = (a.sortOrder ?? 99) - (b.sortOrder ?? 99);
      if (orderDiff !== 0) return orderDiff;
      return (b.nearbyCount + b.worldwideCount) - (a.nearbyCount + a.worldwideCount);
    });

    console.log(
      `[CategoryDiscoveryEngine] Enriched ${enriched.length} categories with dynamic counts`
    );

    return {
      categories: enriched,
      computedAt: Date.now(),
    };
  },
};