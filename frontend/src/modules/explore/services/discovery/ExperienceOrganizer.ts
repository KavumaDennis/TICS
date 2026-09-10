/**
 * ExperienceOrganizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Organizes nearby places into meaningful travel experiences/sections.
 * Transforms "Nearby Places" into "Things to Do Nearby" with themed sections.
 * Automatically determines which sections have enough quality content.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';

/* ── Experience Section Definitions ─────────────────────────────────────────── */

export interface ExperienceSection {
  id: string;
  title: string;
  icon: string;
  places: NearbyItem[];
  qualityScore: number; // 0-100
  visible: boolean; // Whether this section should be displayed
}

const SECTION_DEFINITIONS: Array<{
  id: string;
  title: string;
  icon: string;
  minPlaces: number;
  minAvgRating: number;
  categoryFilter: (place: NearbyItem) => boolean;
}> = [
  {
    id: 'beaches',
    title: '🌴 Beaches Nearby',
    icon: 'water',
    minPlaces: 1,
    minAvgRating: 0,
    categoryFilter: (p) => (p as any).travelCategory === 'Beach',
  },
  {
    id: 'restaurants',
    title: '🍽 Top Restaurants',
    icon: 'restaurant',
    minPlaces: 3,
    minAvgRating: 3.5,
    categoryFilter: (p) => (p as any).travelCategory === 'Restaurant',
  },
  {
    id: 'wildlife',
    title: '🦁 Wildlife Experiences',
    icon: 'paw',
    minPlaces: 1,
    minAvgRating: 0,
    categoryFilter: (p) => ['Zoo', 'Aquarium', 'Safari', 'Wildlife Park'].includes((p as any).travelCategory),
  },
  {
    id: 'cultural',
    title: '🏛 Cultural Attractions',
    icon: 'museum',
    minPlaces: 2,
    minAvgRating: 3.0,
    categoryFilter: (p) => ['Museum', 'Historic Site', 'Art Gallery', 'Castle', 'Monument', 'Archaeological Site'].includes((p as any).travelCategory),
  },
  {
    id: 'scenic',
    title: '🌄 Scenic Spots',
    icon: 'sunny',
    minPlaces: 1,
    minAvgRating: 0,
    categoryFilter: (p) => ['Scenic Viewpoint', 'Waterfall', 'Lake', 'Mountain', 'National Park'].includes((p as any).travelCategory),
  },
  {
    id: 'parks_nature',
    title: '🌳 Parks & Nature',
    icon: 'leaf',
    minPlaces: 2,
    minAvgRating: 3.0,
    categoryFilter: (p) => ['Park', 'Forest', 'Nature Reserve', 'Garden'].includes((p as any).travelCategory),
  },
  {
    id: 'entertainment',
    title: '🎉 Entertainment',
    icon: 'musical-notes',
    minPlaces: 1,
    minAvgRating: 0,
    categoryFilter: (p) => ['Amusement Park', 'Theme Park', 'Water Park', 'Live Music Venue', 'Theater'].includes((p as any).travelCategory),
  },
  {
    id: 'food_drink',
    title: '☕ Cafés & Bars',
    icon: 'cafe',
    minPlaces: 2,
    minAvgRating: 3.5,
    categoryFilter: (p) => ['Café', 'Rooftop Bar', 'Brewery', 'Food Market'].includes((p as any).travelCategory),
  },
  {
    id: 'shopping',
    title: '🛍 Shopping & Markets',
    icon: 'cart',
    minPlaces: 1,
    minAvgRating: 0,
    categoryFilter: (p) => ['Shopping Mall', 'Artisan Market', 'Local Market'].includes((p as any).travelCategory),
  },
  {
    id: 'adventure',
    title: '🧗 Adventure Activities',
    icon: 'compass',
    minPlaces: 1,
    minAvgRating: 0,
    categoryFilter: (p) => ['Hiking Area', 'Campground', 'Marina', 'Diving Spot', 'Cycling Route'].includes((p as any).travelCategory),
  },
  {
    id: 'events',
    title: '🎪 Events & Festivals',
    icon: 'calendar',
    minPlaces: 1,
    minAvgRating: 0,
    categoryFilter: (p) => (p as any).travelCategory === 'Entertainment' || (p as any).travelCategory === 'Live Music Venue',
  },
];

/* ── ExperienceOrganizer ─────────────────────────────────────────────────────── */

export const ExperienceOrganizer = {
  /**
   * Organize places into themed experience sections.
   * Automatically determines which sections have enough quality content.
   */
  organize(places: NearbyItem[]): ExperienceSection[] {
    const sections: ExperienceSection[] = [];

    for (const def of SECTION_DEFINITIONS) {
      const matchingPlaces = places.filter(def.categoryFilter);

      if (matchingPlaces.length >= def.minPlaces) {
        const avgRating = matchingPlaces.reduce((sum, p) => sum + (p.rating || 0), 0) / matchingPlaces.length;
        const visible = avgRating >= def.minAvgRating;

        // Quality score: combination of count, rating, and diversity
        const countScore = Math.min(100, (matchingPlaces.length / 5) * 100);
        const ratingScore = avgRating > 0 ? (avgRating / 5) * 100 : 50;
        const qualityScore = Math.round((countScore * 0.4) + (ratingScore * 0.6));

        sections.push({
          id: def.id,
          title: def.title,
          icon: def.icon,
          places: matchingPlaces.slice(0, 5),
          qualityScore,
          visible,
        });
      }
    }

    // Sort by quality score descending, only include visible sections
    const visibleSections = sections
      .filter(s => s.visible)
      .sort((a, b) => b.qualityScore - a.qualityScore);

    console.log(`[ExperienceOrganizer] Organized ${places.length} places into ${visibleSections.length} experience sections:`);
    visibleSections.forEach(s => console.log(`  ${s.title}: ${s.places.length} places (quality: ${s.qualityScore})`));

    return visibleSections;
  },
};