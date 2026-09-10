/**
 * WeekendEscapeClassifier.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Strict eligibility classifier for Weekend Escape destinations.
 *
 * This runs BEFORE ranking. A place must be a genuine destination-worthy
 * escape to be eligible. Ordinary local places (mosques, churches, schools,
 * businesses, etc.) are always rejected regardless of score.
 *
 * Pipeline:
 *   Raw Places
 *     → Deduplicate
 *       → TravelClassifier
 *         → WeekendEscapeClassifier  ← YOU ARE HERE
 *           → Distance validation
 *             → Quality validation
 *               → Ranking
 *                 → Final Weekend Escapes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem, Destination } from '@/src/modules/explore/types';

/* ── Escape Destination Types ───────────────────────────────────────────────── */

const ESCAPE_DESTINATION_TYPES = [
  'National Park', 'Nature Reserve', 'Wildlife Park', 'Safari',
  'Beach', 'Island', 'Lake', 'Waterfall',
  'Mountain', 'Scenic Viewpoint', 'Forest', 'Hiking Area',
  'Castle', 'Monument', 'Archaeological Site', 'Historic Site',
  'Museum', 'Art Gallery', 'Zoo', 'Aquarium',
  'Amusement Park', 'Theme Park', 'Water Park',
  'Campground', 'Marina', 'Diving Spot', 'Garden',
] as const;

/* ── Explicitly rejected name patterns ──────────────────────────────────────── */

const REJECTED_NAME_PATTERNS = [
  // Places of worship
  /\b(mosque|masjid|church|cathedral|chapel|temple|synagogue|shrine)\b/i,
  /\b(masjid|mescit)\b/i,

  // Educational
  /\b(school|university|college|academy|institute|campus|library)\b/i,
  /\b(gate|entrance|exit|main gate)\b/i,

  // Government / business
  /\b(government|ministry|embassy|consulate|office|headquarters|hq)\b/i,
  /\b(bank|atm|accounting|lawyer|attorney|insurance|real estate|estate agency)\b/i,
  /\b(company|ltd|limited|incorporated|corporation|llc)\b/i,

  // Commercial / retail
  /\b(supermarket|grocery|convenience store|shop|store|mall|market)\b/i,
  /\b(pharmacy|clinic|hospital|medical|dental|optician)\b/i,
  /\b(salon|barber|spa|laundry|dry cleaning|tailor)\b/i,
  /\b(petrol|gas station|filling station|car wash|garage|parking)\b/i,

  // Transport
  /\b(bus stop|taxi stand|train station|bus station|airport|terminal)\b/i,

  // Residential / generic
  /\b(residence|apartment|housing|estate|building)\b/i,
  /\b(warehouse|factory|plant|workshop|distributor)\b/i,
  /\b(guest house|bed & breakfast|hostel)\b/i,
];

/* ── Allowed type blacklist (Google/OSM types never eligible) ───────────────── */

const REJECTED_PROVIDER_TYPES = new Set([
  'church', 'mosque', 'synagogue', 'temple', 'place_of_worship',
  'school', 'university', 'college', 'university_gate',
  'office', 'government_office', 'local_government_office',
  'bank', 'atm',
  'supermarket', 'grocery_store', 'convenience_store',
  'pharmacy', 'hospital', 'clinic', 'dentist', 'doctor',
  'gas_station', 'car_wash', 'car_repair', 'garage', 'parking',
  'travel_agency', 'bus_station', 'train_station', 'taxi_stand', 'airport',
  'real_estate_agency', 'storage', 'self_storage',
  'home_goods_store', 'electronics_store', 'furniture_store', 'hardware_store',
  'laundry', 'dry_cleaning', 'hair_care', 'beauty_salon',
  'gym', 'fitness_center', 'spa',
  'lodging', 'motel', 'hostel',
]);

/* ── Min quality thresholds ─────────────────────────────────────────────────── */

const MIN_ESCAPE_DISTANCE_KM = 5;
const MAX_ESCAPE_DISTANCE_KM = 300;
const MIN_RATING = 3.5;
const MIN_REVIEW_COUNT = 5;

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface EscapeEligibility {
  isEligible: boolean;
  category: string;
  rejectionReason?: string;
}

/* ── WeekendEscapeClassifier ────────────────────────────────────────────────── */

export const WeekendEscapeClassifier = {
  /**
   * Determine if a place is eligible as a Weekend Escape destination.
   * This runs BEFORE ranking - no amount of score can make an ineligible
   * place eligible.
   */
  classify(place: NearbyItem | Destination): EscapeEligibility {
    const name = (place as any).name || place.id || '';
    const type = (place as any).type || '';
    const travelCategory = (place as any).travelCategory || '';
    const tags = (place as any).tags || [];
    const distance = (place as any).distance || 0;

    // ── 1. Reject by provider type ─────────────────────────────────────────
    for (const tag of tags) {
      if (REJECTED_PROVIDER_TYPES.has(tag)) {
        return {
          isEligible: false,
          category: 'Rejected',
          rejectionReason: `Rejected provider type: ${tag}`,
        };
      }
    }

    // ── 2. Reject by name patterns ─────────────────────────────────────────
    for (const pattern of REJECTED_NAME_PATTERNS) {
      if (pattern.test(name)) {
        return {
          isEligible: false,
          category: 'Rejected',
          rejectionReason: `Rejected name pattern: ${pattern}`,
        };
      }
    }

    // ── 3. Reject by type if it's clearly not a destination ────────────────
    if (type && REJECTED_PROVIDER_TYPES.has(type)) {
      return {
        isEligible: false,
        category: 'Rejected',
        rejectionReason: `Rejected type: ${type}`,
      };
    }

    // ── 4. Check if travel category is an escape destination type ─────────
    const isEscapeCategory = ESCAPE_DESTINATION_TYPES.some(
      (cat) => travelCategory === cat || travelCategory.toLowerCase().includes(cat.toLowerCase())
    );

    if (!isEscapeCategory) {
      return {
        isEligible: false,
        category: 'Rejected',
        rejectionReason: `Not an escape destination type: ${travelCategory || 'unknown'}`,
      };
    }

    // ── 5. Distance validation ─────────────────────────────────────────────
    if (distance > 0) {
      if (distance < MIN_ESCAPE_DISTANCE_KM) {
        return {
          isEligible: false,
          category: 'Rejected',
          rejectionReason: `Too close (${distance.toFixed(1)}km < ${MIN_ESCAPE_DISTANCE_KM}km)`,
        };
      }
      if (distance > MAX_ESCAPE_DISTANCE_KM) {
        return {
          isEligible: false,
          category: 'Rejected',
          rejectionReason: `Too far (${distance.toFixed(1)}km > ${MAX_ESCAPE_DISTANCE_KM}km)`,
        };
      }
    }

    // ── 6. Quality validation (optional but recommended) ───────────────────
    const rating = (place as any).rating || 0;
    const reviewCount = (place as any).reviewCount || 0;
    if (rating > 0 && rating < MIN_RATING) {
      return {
        isEligible: false,
        category: 'Rejected',
        rejectionReason: `Low rating (${rating} < ${MIN_RATING})`,
      };
    }
    if (reviewCount > 0 && reviewCount < MIN_REVIEW_COUNT) {
      return {
        isEligible: false,
        category: 'Rejected',
        rejectionReason: `Too few reviews (${reviewCount} < ${MIN_REVIEW_COUNT})`,
      };
    }

    return {
      isEligible: true,
      category: travelCategory || 'Uncategorized',
    };
  },

  /**
   * Filter an array of places to only include Weekend Escape eligible ones.
   * Logs the candidate funnel with rejection reasons.
   */
  filterEligible(places: Array<NearbyItem | Destination>): Array<NearbyItem | Destination> {
    const eligible: Array<NearbyItem | Destination> = [];
    const rejected: Record<string, number> = {};

    for (const place of places) {
      const result = this.classify(place);
      if (result.isEligible) {
        eligible.push(place);
      } else if (result.rejectionReason) {
        const key = result.rejectionReason.replace(/\d+\.\d+|\d+/g, 'X');
        rejected[key] = (rejected[key] || 0) + 1;
      }
    }

    // Log rejection breakdown
    const breakdown = Object.entries(rejected)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([reason, count]) => `${count}x ${reason}`)
      .join(', ');

    console.log(`[WeekendEscapeClassifier] Eligible: ${eligible.length}/${places.length}`);
    if (breakdown) {
      console.log(`[WeekendEscapeClassifier] Rejected: ${breakdown}`);
    }

    return eligible;
  },

  /**
   * Get the allowed destination types.
   */
  getDestinationTypes(): readonly string[] {
    return ESCAPE_DESTINATION_TYPES;
  },
};