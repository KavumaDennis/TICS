/**
 * IntelligentDeduper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart deduplication using name normalization, coordinate proximity,
 * string similarity, and travel category matching.
 * 
 * "Queen Elizabeth National Park" and "Queen Elizabeth NP" → merge
 * "Masjid aisha" and "Masjid Shuaibu" → separate (different places)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';

/* ── IntelligentDeduper ──────────────────────────────────────────────────────── */

export const IntelligentDeduper = {
  /**
   * Deduplicate places using multiple strategies.
   */
  deduplicate(places: NearbyItem[]): NearbyItem[] {
    const groups: Array<{ primary: NearbyItem; duplicates: NearbyItem[] }> = [];

    for (const place of places) {
      let matched = false;

      for (const group of groups) {
        if (this.isDuplicate(place, group.primary)) {
          group.duplicates.push(place);
          // Keep the one with higher rating
          if ((place.rating || 0) > (group.primary.rating || 0)) {
            group.primary = place;
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        groups.push({ primary: place, duplicates: [] });
      }
    }

    const deduplicated = groups.map(g => g.primary);
    
    console.log(`[IntelligentDeduper] Deduplicated ${places.length} → ${deduplicated.length} unique places`);
    
    return deduplicated;
  },

  /**
   * Check if two places are duplicates using multiple strategies.
   */
  isDuplicate(a: NearbyItem, b: NearbyItem): boolean {
    // Strategy 1: Exact coordinate match
    const latDiff = Math.abs(a.coordinates.lat - b.coordinates.lat);
    const lngDiff = Math.abs(a.coordinates.lng - b.coordinates.lng);
    
    if (latDiff < 0.0001 && lngDiff < 0.0001) {
      return true; // Same coordinates
    }

    // Strategy 2: Close coordinates + similar name
    if (latDiff < 0.01 && lngDiff < 0.01) {
      const nameSimilarity = this.nameSimilarity(a.name, b.name);
      if (nameSimilarity > 0.7) {
        return true; // Close coordinates + similar name
      }
    }

    // Strategy 3: Normalized name match (ignoring special chars, abbreviations)
    const normalizedA = this.normalizeName(a.name);
    const normalizedB = this.normalizeName(b.name);
    if (normalizedA === normalizedB) {
      return true;
    }

    // Strategy 4: Same travel category + close coordinates
    const catA = (a as any).travelCategory;
    const catB = (b as any).travelCategory;
    if (catA && catB && catA === catB && latDiff < 0.05 && lngDiff < 0.05) {
      return true;
    }

    return false;
  },

  /**
   * Normalize a place name for comparison.
   * Removes special chars, common abbreviations, and extra whitespace.
   */
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\b(np|national park|natl park)\b/g, 'national park') // Normalize abbreviations
      .replace(/\b(mt|mount)\b/g, 'mountain')
      .replace(/\b(st|saint)\b/g, 'st')
      .replace(/\b(ft|fort)\b/g, 'fort')
      .replace(/\b(univ|university)\b/g, 'university')
      .replace(/\b(inst|institute)\b/g, 'institute')
      .replace(/\b(ctr|center)\b/g, 'center')
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  },

  /**
   * Calculate string similarity (0-1) using common character overlap.
   */
  nameSimilarity(a: string, b: string): number {
    const normA = this.normalizeName(a);
    const normB = this.normalizeName(b);

    // Exact match after normalization
    if (normA === normB) return 1;

    // One contains the other
    if (normA.includes(normB) || normB.includes(normA)) {
      return Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
    }

    // Word overlap
    const wordsA = new Set(normA.split(' '));
    const wordsB = new Set(normB.split(' '));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  },
};