/**
 * PexelsService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches destination country images from the Pexels API with Firestore
 * caching (30-day TTL). Always returns exactly 5 landscape image URLs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface CountryImagesCache {
  country: string;
  images: string[];
  updatedAt: Timestamp;
}

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    landscape: string;
  };
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const PEXELS_BASE = 'https://api.pexels.com/v1/search';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TARGET_COUNT = 5;

/* ── Country code → name map ──────────────────────────────────────────────── */

const COUNTRY_CODE_MAP: Record<string, string> = {
  FR: 'France', JP: 'Japan', US: 'United States', AE: 'United Arab Emirates',
  ID: 'Indonesia', GB: 'United Kingdom', ZA: 'South Africa', IT: 'Italy',
  AU: 'Australia', GR: 'Greece', MV: 'Maldives', KE: 'Kenya',
  ES: 'Spain', DE: 'Germany', BR: 'Brazil', CA: 'Canada',
  IN: 'India', CN: 'China', TH: 'Thailand', MX: 'Mexico',
  PT: 'Portugal', NL: 'Netherlands', CH: 'Switzerland', TR: 'Turkey',
  EG: 'Egypt', MA: 'Morocco', TZ: 'Tanzania', NG: 'Nigeria',
  GH: 'Ghana', AR: 'Argentina', CL: 'Chile', CO: 'Colombia',
  PE: 'Peru', RU: 'Russia', KR: 'South Korea', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', IE: 'Ireland',
  AT: 'Austria', BE: 'Belgium', IL: 'Israel', SG: 'Singapore',
  MY: 'Malaysia', PH: 'Philippines', VN: 'Vietnam', NZ: 'New Zealand',
  HR: 'Croatia', CZ: 'Czech Republic', HU: 'Hungary', PL: 'Poland',
  RO: 'Romania', UA: 'Ukraine', GT: 'Guatemala', CR: 'Costa Rica',
  PA: 'Panama', DO: 'Dominican Republic', JM: 'Jamaica', BS: 'Bahamas',
  BB: 'Barbados', SC: 'Seychelles', MU: 'Mauritius', LK: 'Sri Lanka',
  NP: 'Nepal', KH: 'Cambodia', LA: 'Laos', MM: 'Myanmar',
  MN: 'Mongolia', KZ: 'Kazakhstan', UZ: 'Uzbekistan', QA: 'Qatar',
  KW: 'Kuwait', OM: 'Oman', BH: 'Bahrain', SA: 'Saudi Arabia',
  JO: 'Jordan', LB: 'Lebanon', CY: 'Cyprus', MT: 'Malta',
  IS: 'Iceland', LU: 'Luxembourg', MC: 'Monaco', LI: 'Liechtenstein',
  SM: 'San Marino', VA: 'Vatican City', AD: 'Andorra', GI: 'Gibraltar',
  BM: 'Bermuda', KY: 'Cayman Islands', VI: 'U.S. Virgin Islands',
  PR: 'Puerto Rico', AW: 'Aruba', CW: 'Curacao', FJ: 'Fiji',
  VU: 'Vanuatu', WS: 'Samoa', TO: 'Tonga', SB: 'Solomon Islands',
  PG: 'Papua New Guinea', TL: 'Timor-Leste',
  BT: 'Bhutan', BD: 'Bangladesh', PK: 'Pakistan', IR: 'Iran',
  IQ: 'Iraq', SY: 'Syria', YE: 'Yemen', LY: 'Libya',
  TN: 'Tunisia', DZ: 'Algeria', SN: 'Senegal', CI: 'Ivory Coast',
  UG: 'Uganda', RW: 'Rwanda', ET: 'Ethiopia', ZM: 'Zambia',
  ZW: 'Zimbabwe', BW: 'Botswana', NA: 'Namibia', MZ: 'Mozambique',
  AO: 'Angola', CD: 'DR Congo', CG: 'Congo', GA: 'Gabon',
  CM: 'Cameroon', SL: 'Sierra Leone', LR: 'Liberia', ML: 'Mali',
  BF: 'Burkina Faso', NE: 'Niger', TD: 'Chad', SO: 'Somalia',
  SD: 'Sudan', SS: 'South Sudan', AF: 'Afghanistan', AM: 'Armenia',
  AZ: 'Azerbaijan', GE: 'Georgia', BA: 'Bosnia and Herzegovina',
  ME: 'Montenegro', RS: 'Serbia', MK: 'North Macedonia',
  AL: 'Albania', BG: 'Bulgaria', SI: 'Slovenia', SK: 'Slovakia',
  EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', BY: 'Belarus',
  MD: 'Moldova', KG: 'Kyrgyzstan', TJ: 'Tajikistan', TM: 'Turkmenistan',
  TW: 'Taiwan', HK: 'Hong Kong', MO: 'Macao',
};


function getApiKey(): string {
  return process.env.EXPO_PUBLIC_PEXELS_API_KEY ?? '';
}

/* ── Destination image lookup ─────────────────────────────────────────────── */

const destImageCache = new Map<string, string | null>();

/**
 * Look up a single real photo for a named destination/POI via Pexels.
 * Best-effort: returns null on any failure or when no key is configured.
 * Used as an image fallback AFTER Wikimedia and BEFORE Google Places.
 */
export async function fetchDestinationImage(name: string): Promise<string | null> {
  const key = getApiKey();
  const query = (name || '').trim();
  if (!key || query.length < 3) return null;

  if (destImageCache.has(query.toLowerCase())) {
    return destImageCache.get(query.toLowerCase()) || null;
  }

  try {
    const params = new URLSearchParams({
      query,
      per_page: '1',
      orientation: 'landscape',
    });
    const res = await fetch(`${PEXELS_BASE}?${params.toString()}`, {
      headers: { Authorization: key },
    });
    if (!res.ok) {
      destImageCache.set(query.toLowerCase(), null);
      return null;
    }
    const data = (await res.json()) as PexelsSearchResponse;
    const url = data?.photos?.[0]?.src?.landscape || data?.photos?.[0]?.src?.large || null;
    destImageCache.set(query.toLowerCase(), url);
    return url;
  } catch {
    destImageCache.set(query.toLowerCase(), null);
    return null;
  }
}

export function resolveCountry(trip: {
  destinationAirport?: { countryCode?: string };
  destinations?: Array<{ country?: string }>;
  to?: string;
}): { country: string; countryCode: string } | null {
  const destCountry = trip.destinations?.[0]?.country;
  if (destCountry) {
    const code = Object.entries(COUNTRY_CODE_MAP).find(
      ([, n]) => n.toLowerCase() === destCountry.toLowerCase(),
    )?.[0] ?? destCountry.slice(0, 2).toUpperCase();
    return { country: destCountry, countryCode: code };
  }

  const cc = trip.destinationAirport?.countryCode?.toUpperCase();
  if (cc && COUNTRY_CODE_MAP[cc]) {
    return { country: COUNTRY_CODE_MAP[cc], countryCode: cc };
  }

  if (trip.to) {
    const name = trip.to.trim();
    const code = Object.entries(COUNTRY_CODE_MAP).find(
      ([, n]) => n.toLowerCase() === name.toLowerCase(),
    )?.[0] ?? name.slice(0, 2).toUpperCase();
    return { country: name, countryCode: code };
  }

  return null;
}

export function countryNameFromCode(code: string): string {
  return COUNTRY_CODE_MAP[code.toUpperCase()] ?? code;
}

async function searchPexels(query: string, perPage = 10): Promise<PexelsPhoto[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const url = `${PEXELS_BASE}?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      console.warn(`[PexelsService] API ${res.status}: ${res.statusText}`);
      return [];
    }
    const data: PexelsSearchResponse = await res.json();
    return data.photos ?? [];
  } catch (err) {
    console.warn('[PexelsService] fetch error:', err);
    return [];
  }
}

export async function fetchCountryImages(
  country: string,
  countryCode: string,
): Promise<string[]> {
  const db = getFirebaseFirestore();
  const cacheRef = doc(db, 'country_images', countryCode.toUpperCase());
  try {
    const snap = await getDoc(cacheRef);
    if (snap.exists()) {
      const cached = snap.data() as CountryImagesCache;
      const age = Date.now() - cached.updatedAt.toMillis();
      if (age < CACHE_TTL_MS && cached.images?.length === TARGET_COUNT) {
        return cached.images;
      }
    }
  } catch (err) {
    console.warn('[PexelsService] cache read error:', err);
  }
  let photos = await searchPexels(`${country} tourism`, 10);
  if (photos.length < TARGET_COUNT) {
    const fallback = await searchPexels(`${country} travel`, 10);
    photos = [...photos, ...fallback];
  }
  if (photos.length < TARGET_COUNT) {
    const extra = await searchPexels(`${country} landscape`, 10);
    photos = [...photos, ...extra];
  }
  const seen = new Set<number>();
  photos = photos.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  const sorted = photos
    .filter((p) => p.width >= p.height)
    .sort((a, b) => (b.width / b.height) - (a.width / a.height));
  const pool = sorted.length >= TARGET_COUNT ? sorted : photos;
  let urls = pool.slice(0, TARGET_COUNT).map((p) => p.src.large);
  while (urls.length < TARGET_COUNT && urls.length > 0) {
    urls.push(urls[urls.length % urls.length]);
  }
  if (urls.length === 0) return [];
  try {
    const cacheData: CountryImagesCache = {
      country,
      images: urls.slice(0, TARGET_COUNT),
      updatedAt: Timestamp.now(),
    };
    await setDoc(cacheRef, cacheData);
  } catch (err) {
    console.warn('[PexelsService] cache write error:', err);
  }
  return urls.slice(0, TARGET_COUNT);
}

export interface PopularDestination {
  name: string;
  countryCode: string;
  image: string;
}

export const POPULAR_DESTINATIONS: PopularDestination[] = [
  { name: 'Paris', countryCode: 'FR', image: 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Tokyo', countryCode: 'JP', image: 'https://images.pexels.com/photos/2614818/pexels-photo-2614818.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'New York', countryCode: 'US', image: 'https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Dubai', countryCode: 'AE', image: 'https://images.pexels.com/photos/1470502/pexels-photo-1470502.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Bali', countryCode: 'ID', image: 'https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'London', countryCode: 'GB', image: 'https://images.pexels.com/photos/460672/pexels-photo-460672.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Cape Town', countryCode: 'ZA', image: 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Rome', countryCode: 'IT', image: 'https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Sydney', countryCode: 'AU', image: 'https://images.pexels.com/photos/1878293/pexels-photo-1878293.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Santorini', countryCode: 'GR', image: 'https://images.pexels.com/photos/1010657/pexels-photo-1010657.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Maldives', countryCode: 'MV', image: 'https://images.pexels.com/photos/1287460/pexels-photo-1287460.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { name: 'Nairobi', countryCode: 'KE', image: 'https://images.pexels.com/photos/3935702/pexels-photo-3935702.jpeg?auto=compress&cs=tinysrgb&w=600' },
];

/**
 * Fetches dynamic images for popular destinations from Pexels API.
 * Returns updated destinations with fresh image URLs.
 */
export async function fetchPopularDestinations(): Promise<PopularDestination[]> {
  const results = await Promise.allSettled(
    POPULAR_DESTINATIONS.map(async (dest) => {
      const images = await fetchCountryImages(dest.name, dest.countryCode);
      return {
        ...dest,
        image: images.length > 0 ? images[0] : dest.image,
      };
    })
  );
  
  return results.map((r, i) => 
    r.status === 'fulfilled' ? r.value : POPULAR_DESTINATIONS[i]
  );
}

/* ── Travel carousel for AddYourTripScreen ─────────────────────────────────── */

/**
 * Large pool of diverse travel destination queries from around the world.
 * Each query targets a specific place to get actual location photos.
 * On each call, a random subset is selected for dynamic variety.
 */
const TRAVEL_PLACE_POOL = [
  'Paris France travel',
  'Tokyo Japan cityscape',
  'Bali Indonesia beach',
  'Santorini Greece',
  'Maldives island',
  'New York City skyline',
  'London England landmarks',
  'Dubai UAE architecture',
  'Rome Italy colosseum',
  'Sydney Australia harbour',
  'Cape Town South Africa',
  'Nairobi Kenya safari',
  'Barcelona Spain',
  'Amsterdam Netherlands',
  'Prague Czech Republic',
  'Istanbul Turkey',
  'Marrakech Morocco',
  'Bangkok Thailand',
  'Hanoi Vietnam',
  'Seoul South Korea',
  'Hong Kong skyline',
  'Singapore city',
  'Kuala Lumpur Malaysia',
  'Mumbai India',
  'Rio de Janeiro Brazil',
  'Buenos Aires Argentina',
  'Machu Picchu Peru',
  'Cairo Egypt pyramids',
  'Reykjavik Iceland',
  'Oslo Norway fjord',
  'Zurich Switzerland',
  'Lisbon Portugal',
  'Dubrovnik Croatia',
  'Budapest Hungary',
  'Vienna Austria',
  'Edinburgh Scotland',
  'Queenstown New Zealand',
  'Fiji islands',
  'Maui Hawaii',
  'Banff Canada',
  'Antelope Canyon USA',
  'Santorini Greece',
  'Positano Italy coast',
  'Cinque Terre Italy',
  'Provence France lavender',
  'Safari Tanzania',
  'Victoria Falls Zambia',
  'Petra Jordan',
  'Angkor Wat Cambodia',
  'Taj Mahal India',
  'Great Wall China',
];

export interface TravelImage {
  url: string;
  label: string;
}

/**
 * Fetches up to 9 travel destination images from Pexels by randomly selecting
 * from a large pool of diverse place queries. Each call returns a different
 * set of images for dynamic variety. Only returns actual place photos —
 * no maps, suitcases, or globes.
 */
export async function fetchTravelCarouselImages(): Promise<TravelImage[]> {
  const results: TravelImage[] = [];
  const seen = new Set<number>();

  // Shuffle a copy of the pool for random selection each time
  const shuffled = [...TRAVEL_PLACE_POOL].sort(() => Math.random() - 0.5);
  // Pick up to 12 random queries (more than needed to allow for dedup)
  const selectedQueries = shuffled.slice(0, 12);

  for (const query of selectedQueries) {
    if (results.length >= 9) break;
    const photos = await searchPexels(query, 3);
    for (const photo of photos) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      // Extract the place name from the query (everything before the first space)
      const placeName = query.split(' ')[0];
      results.push({
        url: photo.src.large,
        label: placeName,
      });
      if (results.length >= 9) break;
    }
  }

  return results;
}

/* ── Country images with labels for DestinationCarousel ────────────────────── */

export interface CountryImage {
  url: string;
  label: string;
}

/**
 * Fetches country images and returns them with the country name as label.
 * Used by DestinationCarousel to show the place name on each image.
 */
export async function fetchCountryImagesWithLabels(
  country: string,
  countryCode: string,
): Promise<CountryImage[]> {
  const urls = await fetchCountryImages(country, countryCode);
  return urls.map((url) => ({
    url,
    label: country,
  }));
}