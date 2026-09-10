/**
 * CategoryBalancer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ensures section diversity by balancing travel categories in results.
 * Prevents sections from being filled with the same type of place.
 *
 * IMPORTANT: The balancer must NOT collapse a healthy candidate pool.
 * If only one category has candidates, it should fill up to the target
 * count with the best from that category rather than returning 3 results.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';

/* ── Configurable constants ─────────────────────────────────────────────────── */

const MAX_PER_CATEGORY = 5;
const MIN_CATEGORY_DIVERSITY = 3;
const TARGET_RESULT_COUNT = 20;

/* ── CategoryBalancer ────────────────────────────────────────────────────────── */

export const CategoryBalancer = {
  /**
   * Balance an array of places to ensure category diversity.
   * Takes the top places but ensures no single category dominates.
   *
   * @param places - Array of places with travelCategory attached
   * @param maxPerCategory - Maximum places from same category (default: 5)
   * @param maxTotal - Maximum total places to return (default: 20)
   * @returns Balanced array of places
   */
  balance(
    places: NearbyItem[],
    maxPerCategory: number = MAX_PER_CATEGORY,
    maxTotal: number = TARGET_RESULT_COUNT
  ): NearbyItem[] {
    if (places.length === 0) return [];

    // Group places by travel category
    const grouped: Record<string, NearbyItem[]> = {};
    
    for (const place of places) {
      const category = (place as any).travelCategory || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(place);
    }

    const categoryNames = Object.keys(grouped);
    
    // ── Critical fix: If there are few categories, don't collapse the pool ──
    // If we have fewer categories than the diversity target, we need to
    // relax the per-category limit so we can still fill up to maxTotal.
    const numCategories = categoryNames.length;
    const effectiveMaxPerCategory = Math.max(
      maxPerCategory,
      Math.ceil(maxTotal / Math.max(numCategories, 1))
    );

    // Track categories used and their counts
    const categoryCounts: Record<string, number> = {};
    const balanced: NearbyItem[] = [];
    
    // Interleave categories round-robin style
    const sortedCategories = [...categoryNames].sort((a, b) => {
      // Prioritize higher-value categories
      const priorityOrder = [
        'National Park', 'Beach', 'Safari', 'Wildlife Park', 
        'Waterfall', 'Island', 'Historic Site', 'Museum',
        'Lake', 'Mountain', 'Scenic Viewpoint',
      ];
      const aIdx = priorityOrder.indexOf(a);
      const bIdx = priorityOrder.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return 0;
    });

    // Track per-category index
    const indices: Record<string, number> = {};
    for (const cat of sortedCategories) {
      indices[cat] = 0;
    }

    let added = 0;
    while (added < maxTotal) {
      let anyAdded = false;
      
      for (const category of sortedCategories) {
        const idx = indices[category];
        const count = categoryCounts[category] || 0;
        
        if (idx < grouped[category].length && count < effectiveMaxPerCategory && added < maxTotal) {
          balanced.push(grouped[category][idx]);
          categoryCounts[category] = count + 1;
          indices[category]++;
          added++;
          anyAdded = true;
        }
      }
      
      if (!anyAdded) break;
    }

    const categorySpread = Object.entries(categoryCounts)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(', ');
    console.log(`[CategoryBalancer] Balanced ${places.length} → ${balanced.length} places (${categorySpread})`);

    return balanced;
  },

  /**
   * Get diversity score for a set of places.
   * Higher means more diverse.
   */
  getDiversityScore(places: NearbyItem[]): number {
    if (places.length === 0) return 0;
    
    const categories = new Set<string>();
    for (const place of places) {
      const cat = (place as any).travelCategory || 'Uncategorized';
      categories.add(cat);
    }
    
    return categories.size / places.length;
  },
};