/**
 * Explore Module Utilities
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utility functions for the Explore module with safe null handling.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination, Event, NearbyItem } from '@/src/modules/explore/types';
import type { ImageSourcePropType } from 'react-native';

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Safely handles undefined/null values.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance for display. Handles null/undefined.
 */
export function formatDistance(km: number): string {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

/**
 * Format price level as currency symbols.
 */
export function formatPriceLevel(level: number): string {
  if (level == null) return '';
  return '$'.repeat(Math.max(1, Math.min(level, 4)));
}

/**
 * Format rating for display. Handles null/undefined.
 */
export function formatRating(rating: number): string {
  // OSM destinations have no ratings — showing a fabricated "0.0" with a star
  // misleads users. "New" is the honest display for unrated places.
  if (rating == null || rating <= 0) return 'New';
  return rating.toFixed(1);
}

/**
 * Truncate text with ellipsis.
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/* ── Destination image resolution ──────────────────────────────────────────── */

/** Deterministic fallback used when no usable image exists on the record. */
export const DESTINATION_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400';

/**
 * DETERMINISTIC FINAL FALLBACK — LOCAL BUNDLED ASSET.
 *
 * The remote Unsplash fallback requires network and can 404/rate-limit; the
 * final fallback must work after `npx expo start -c` and with no connectivity.
 * This is a real bundled travel photo (copied from the onboarding assets),
 * resolved by Metro at build time into a `number` asset module — consumed by
 * <Image source={number}> directly, per the React Native source contract:
 *   remote URL  → source={{ uri }}
 *   local asset → source={require(...)}  (a number — NEVER mixed into {uri})
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const DESTINATION_FALLBACK_ASSET: number = require(
  '@/assets/images/destination-fallback.jpg'
);

/** Strings that look like URLs but are actually null/undefined artifacts. */
const INVALID_URL_VALUES = new Set(['', 'undefined', 'null', 'none', 'n/a']);

/**
 * Validate a candidate image URL for React Native <Image source={{ uri }}>.
 * Rejects undefined/null/""/"undefined"/"null", malformed URLs and obvious
 * non-HTTP schemes. Firebase Storage `gs://` references are converted to
 * HTTPS download URLs (public objects work without a download token).
 */
export function isValidImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (INVALID_URL_VALUES.has(trimmed.toLowerCase())) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      // eslint-disable-next-line no-new
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  // Firebase Storage gs:// reference — usable after conversion.
  if (/^gs:\/\//i.test(trimmed)) return true;
  return false;
}

/** Convert a gs://bucket/path Firebase Storage reference to an HTTPS URL. */
function firebaseStorageToHttps(gsUrl: string): string | null {
  const match = /^gs:\/\/([^/]+)\/(.+)$/i.exec(gsUrl.trim());
  if (!match) return null;
  const [, bucket, path] = match;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

/**
 * CENTRAL IMAGE SOURCE CONTRACT (React Native <Image>):
 *   remote URL   → source={{ uri }}
 *   local asset  → source={number} (Metro module from require())
 * Never mix the two shapes. Non-HTTP/empty candidates resolve to the
 * deterministic LOCAL bundled fallback (works offline, after `expo start -c`).
 */
export function toImageSource(candidate: string | null | undefined): ImageSourcePropType {
  if (candidate && /^https?:\/\//i.test(candidate.trim())) {
    return { uri: candidate.trim() };
  }
  return DESTINATION_FALLBACK_ASSET;
}

/**
 * CENTRALIZED IMAGE RESOLVER.
 *
 * Firestore destination documents use several image field shapes:
 *   images: [{url}], imageUrl, image, photoUrl, photo, photos: [..|string],
 *   coverImage, heroImage
 * This resolver inspects all of them, validates each candidate URL, converts
 * gs:// references, and returns the highest-quality usable URL — or null when
 * nothing usable exists (callers then render a fallback WITHOUT dropping the
 * destination card).
 */
export function resolveDestinationImage(
  destination: Record<string, unknown> | null | undefined
): string | null {
  if (!destination || typeof destination !== 'object') return null;
  const d = destination as Record<string, any>;

  const candidates: unknown[] = [
    d.images?.[0]?.url,
    d.images?.[0]?.uri,
    d.images?.find?.((im: any) => im?.url)?.url,
    Array.isArray(d.photos) ? d.photos[0]?.url : undefined,
    Array.isArray(d.photos) ? d.photos[0] : undefined,
    typeof d.photos === 'string' ? d.photos : undefined,
    d.imageUrl,
    d.image,
    d.photoUrl,
    d.photo,
    d.coverImage,
    d.heroImage,
    d.thumbnail,
  ];

  for (const raw of candidates) {
    if (!isValidImageUrl(raw)) continue;
    let url = (raw as string).trim();
    if (/^gs:\/\//i.test(url)) {
      const https = firebaseStorageToHttps(url);
      if (!https) continue;
      url = https;
    }
    return url;
  }

  // Misses are expected for enrichment-dependent records — toImageSource()
  // renders the local bundled fallback. Per-render logging here produced
  // massive log spam; re-enable temporarily if debugging image fields.
  return null;
}

/**
 * Get the primary image URL from a destination.
 * Uses the centralized resolver (multi-field, gs:// aware) and falls back to a
 * deterministic placeholder. Never throws; never returns an invalid URI.
 */
export function getDestinationPrimaryImage(destination: Destination): string {
  const resolved = resolveDestinationImage(destination as unknown as Record<string, unknown>);
  if (resolved) return resolved;
  // No per-render log — cards without stored images are expected; the card
  // renders the deterministic fallback (and onError swaps to the local asset).
  return DESTINATION_FALLBACK_IMAGE;
}

/**
 * Get the primary image URL from an event.
 */
export function getEventPrimaryImage(event: Event): string {
  if (event.images?.length > 0 && event.images[0].url) {
    const url = event.images[0].url;
    // Ensure URL has proper format
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // If it's a relative path or invalid, use placeholder
    console.log(`[getEventPrimaryImage] Invalid image URL for ${event.title}: ${url}`);
  }
  return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400';
}

/**
 * Get category icon name based on category slug.
 */
export function getCategoryIcon(slug: string): string {
  const iconMap: Record<string, string> = {
    sports: 'football',
    concerts: 'musical-notes',
    festivals: 'calendar',
    national_parks: 'leaf',
    museums: 'business',
    food: 'restaurant',
    weekend_escapes: 'sunny',
    historical_sites: 'business',
    beaches: 'water',
    business: 'briefcase',
    family: 'people',
    adventure: 'compass',
    religious_tourism: 'church',
    wildlife: 'paw',
    nightlife: 'moon',
    shopping: 'cart',
  };
  return iconMap[slug] || 'location';
}

/**
 * Get a color based on category.
 */
export function getCategoryColor(slug: string): string {
  const colorMap: Record<string, string> = {
    sports: '#FF6B6B',
    concerts: '#6C5CE7',
    festivals: '#FDCB6E',
    national_parks: '#00B894',
    museums: '#0984E3',
    food: '#E17055',
    weekend_escapes: '#FAB1A0',
    historical_sites: '#636E72',
    beaches: '#00CEC9',
    business: '#2D3436',
    family: '#FD79A8',
    adventure: '#E84393',
    religious_tourism: '#A29BFE',
    wildlife: '#55EFC4',
    nightlife: '#2C3E50',
    shopping: '#FF7675',
  };
  return colorMap[slug] || '#0984E3';
}

/**
 * Generate a session token for Google Places API.
 */
export function generateSessionToken(): string {
  return `tics_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Format a date range for display.
 * Safely handles undefined, null, or invalid dates.
 */
export function formatDateRange(start?: Date | string | null, end?: Date | string | null): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  const formatDate = (value: Date | string | null | undefined): string => {
    if (value == null) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', options);
  };

  const startStr = formatDate(start);
  const endStr = formatDate(end);

  if (startStr && endStr) return `${startStr} - ${endStr}`;
  if (startStr) return startStr;
  if (endStr) return endStr;
  return 'Date TBA';
}

/**
 * Check if an event is currently happening.
 * Safely handles missing/invalid dates.
 */
export function isEventHappening(event: Event): boolean {
  if (!event.startDate || !event.endDate) return false;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  const now = new Date();
  return now >= start && now <= end;
}

/**
 * Check if an event is upcoming.
 * Safely handles missing/invalid dates.
 */
export function isEventUpcoming(event: Event): boolean {
  if (!event.startDate) return false;
  const start = new Date(event.startDate);
  if (isNaN(start.getTime())) return false;
  return start > new Date();
}

/**
 * Sort nearby items by distance.
 */
export function sortNearbyByDistance(items: NearbyItem[]): NearbyItem[] {
  return [...items].sort((a, b) => a.distance - b.distance);
}

/**
 * Sort nearby items by rating.
 */
export function sortNearbyByRating(items: NearbyItem[]): NearbyItem[] {
  return [...items].sort((a, b) => b.rating - a.rating);
}

/**
 * Sort nearby items by popularity (review count).
 */
export function sortNearbyByPopularity(items: NearbyItem[]): NearbyItem[] {
  return [...items].sort((a, b) => b.reviewCount - a.reviewCount);
}

/**
 * Get current season name.
 */
export function getSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

export { withTimeout, withTimeoutFallback, PROVIDER_TIMEOUTS } from './withTimeout';
export { queryClient } from './queryClient';
export {
  markStart,
  markEnd,
  logTiming,
  getTimings,
  logPerformanceSummary,
  resetTimings,
} from './performance';
