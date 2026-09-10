/**
 * TravelThemeEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tags every destination with multiple travel themes.
 * Each place can belong to several themes simultaneously.
 * Enables filtering, recommendations, and personalization.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';

/* ── Travel Themes ──────────────────────────────────────────────────────────── */

export const TRAVEL_THEMES = [
  'Adventure', 'Nature', 'Wildlife', 'Culture', 'Food',
  'Nightlife', 'Relaxation', 'Luxury', 'Family', 'Romantic',
  'Photography', 'Shopping', 'History', 'Wellness', 'Beach',
  'Art', 'Music', 'Education', 'Fitness', 'Social',
  'Local', 'Scenic', 'Outdoor', 'Entertainment',
] as const;

export type TravelTheme = typeof TRAVEL_THEMES[number];

/* ── Theme Mapping ──────────────────────────────────────────────────────────── */

const CATEGORY_TO_THEMES: Record<string, TravelTheme[]> = {
  'Beach': ['Beach', 'Nature', 'Relaxation', 'Photography', 'Romantic'],
  'National Park': ['Nature', 'Adventure', 'Wildlife', 'Photography', 'Family'],
  'Park': ['Nature', 'Relaxation', 'Family', 'Photography'],
  'Waterfall': ['Nature', 'Adventure', 'Photography', 'Romantic'],
  'Lake': ['Nature', 'Relaxation', 'Photography', 'Romantic'],
  'Mountain': ['Nature', 'Adventure', 'Photography', 'Outdoor'],
  'Nature Reserve': ['Nature', 'Wildlife', 'Education', 'Photography'],
  'Scenic Viewpoint': ['Nature', 'Photography', 'Romantic', 'Relaxation'],
  'Island': ['Beach', 'Nature', 'Adventure', 'Relaxation', 'Romantic'],
  'Forest': ['Nature', 'Adventure', 'Photography', 'Relaxation'],
  'Zoo': ['Wildlife', 'Family', 'Education', 'Photography'],
  'Safari': ['Wildlife', 'Adventure', 'Photography', 'Luxury'],
  'Wildlife Park': ['Wildlife', 'Nature', 'Adventure', 'Photography'],
  'Aquarium': ['Wildlife', 'Family', 'Education', 'Photography'],
  'Museum': ['Culture', 'History', 'Education', 'Photography'],
  'Art Gallery': ['Culture', 'Art', 'Photography', 'Romantic'],
  'Historic Site': ['History', 'Culture', 'Photography', 'Education'],
  'Castle': ['History', 'Culture', 'Photography', 'Romantic'],
  'Monument': ['History', 'Culture', 'Photography', 'Scenic'],
  'Archaeological Site': ['History', 'Culture', 'Adventure', 'Photography'],
  'Amusement Park': ['Family', 'Adventure', 'Entertainment', 'Outdoor'],
  'Theme Park': ['Family', 'Adventure', 'Entertainment', 'Outdoor'],
  'Water Park': ['Family', 'Adventure', 'Outdoor', 'Relaxation'],
  'Live Music Venue': ['Nightlife', 'Music', 'Culture', 'Social'],
  'Theater': ['Culture', 'Art', 'Entertainment', 'Nightlife'],
  'Restaurant': ['Food', 'Social', 'Culture', 'Local'],
  'Café': ['Food', 'Relaxation', 'Social', 'Local'],
  'Rooftop Bar': ['Nightlife', 'Food', 'Social', 'Romantic', 'Photography'],
  'Brewery': ['Food', 'Social', 'Nightlife', 'Culture'],
  'Food Market': ['Food', 'Local', 'Culture', 'Shopping'],
  'Shopping Mall': ['Shopping', 'Entertainment', 'Family', 'Food'],
  'Artisan Market': ['Shopping', 'Local', 'Culture', 'Photography'],
  'Local Market': ['Shopping', 'Local', 'Food', 'Culture'],
  'Hiking Area': ['Adventure', 'Nature', 'Fitness', 'Photography'],
  'Campground': ['Adventure', 'Nature', 'Outdoor', 'Relaxation'],
  'Marina': ['Adventure', 'Outdoor', 'Luxury', 'Social'],
  'Diving Spot': ['Adventure', 'Outdoor', 'Nature', 'Photography'],
  'Cycling Route': ['Adventure', 'Fitness', 'Nature', 'Outdoor'],
};

/* ── TravelThemeEngine ──────────────────────────────────────────────────────── */

export const TravelThemeEngine = {
  /**
   * Get themes for a place based on its travel category.
   */
  getThemes(place: NearbyItem): TravelTheme[] {
    const travelCategory = (place as any).travelCategory;
    if (travelCategory && CATEGORY_TO_THEMES[travelCategory]) {
      return CATEGORY_TO_THEMES[travelCategory];
    }

    // Fallback: derive from tags
    const tags = place.tags || [];
    const type = place.type || '';
    const name = place.name?.toLowerCase() || '';

    const derivedThemes: TravelTheme[] = [];

    if (tags.includes('beach') || name.includes('beach')) derivedThemes.push('Beach');
    if (tags.includes('museum') || name.includes('museum')) derivedThemes.push('Culture');
    if (tags.includes('park') || name.includes('park')) derivedThemes.push('Nature');
    if (tags.includes('zoo') || name.includes('zoo')) derivedThemes.push('Wildlife');
    if (tags.includes('restaurant') || name.includes('restaurant')) derivedThemes.push('Food');
    if (tags.includes('hiking') || name.includes('hiking')) derivedThemes.push('Adventure');
    if (tags.includes('shopping') || name.includes('mall')) derivedThemes.push('Shopping');
    if (tags.includes('historic') || name.includes('historic')) derivedThemes.push('History');
    if (tags.includes('night') || name.includes('bar') || name.includes('club')) derivedThemes.push('Nightlife');
    if (tags.includes('spa') || name.includes('spa') || name.includes('wellness')) derivedThemes.push('Wellness');
    if (tags.includes('luxury') || name.includes('luxury') || name.includes('resort')) derivedThemes.push('Luxury');
    if (tags.includes('family') || name.includes('family') || name.includes('kids')) derivedThemes.push('Family');
    if (tags.includes('romantic') || name.includes('romantic')) derivedThemes.push('Romantic');
    if (tags.includes('photo') || name.includes('view') || name.includes('scenic')) derivedThemes.push('Photography');

    return [...new Set(derivedThemes)];
  },

  /**
   * Tag an array of places with their travel themes.
   */
  tagPlaces(places: NearbyItem[]): NearbyItem[] {
    for (const place of places) {
      (place as any).travelThemes = this.getThemes(place);
    }
    return places;
  },

  /**
   * Filter places by a specific theme.
   */
  filterByTheme(places: NearbyItem[], theme: TravelTheme): NearbyItem[] {
    return places.filter(p => {
      const themes = (p as any).travelThemes || this.getThemes(p);
      return themes.includes(theme);
    });
  },

  /**
   * Get all available themes.
   */
  getAllThemes(): readonly TravelTheme[] {
    return TRAVEL_THEMES;
  },
};