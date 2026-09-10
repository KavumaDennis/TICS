/**
 * DestinationImageService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches accurate, real photos for destinations that come from Firestore
 * (the "Firestore fallback" destinations in the Explore pipeline). Curated
 * Firestore `Destination` docs frequently ship without `images[]`, which makes
 * the Explore screen fall back to a generic Unsplash placeholder.
 *
 * This service resolves a real photo per destination using a PRIMARY
 * keyless Wikimedia (Wikipedia/Commons) source, with a Google Places fallback
 * for when billing is enabled:
 *   1. Wikimedia Commons/Wikipedia — geosearch by coordinates → page thumbnail
 *      (accurate, free, no API key, no billing).
 *   2. Google Places `place/textsearch` + `place/photo` → hotlinkable photo URL
 *      (only when the Places API key has billing enabled).
 *
 * Design goals:
 *   - NON-BLOCKING / best effort: never throws; returns the existing image or
 *     leaves the placeholder in place on any failure.
 *   - Concurrency-limited pool so we never hammer the Places API.
 *   - Deduped (single in-flight request per destination name).
 *   - Cached in-memory + persisted to AsyncStorage so repeat renders and app
 *     restarts don't re-fetch (default 30-day TTL).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDestinationImage } from '@/src/services/PexelsService';
import { googlePlacesAvailable } from './providers/config';
import type {
  Destination,
  NearbyItem,
  WeekendEscape,
} from '@/src/modules/explore/types';

/* ── Endpoints & constants ─────────────────────────────────────────────────── */

// Wikimedia (keyless) — reliable regardless of Google billing status.
const WIKI_API_BASE = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST_BASE = 'https://en.wikipedia.org/w/api/rest_v1';

// Google Places — used only as a last-resort fallback.
const PLACES_TEXT_SEARCH_BASE =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACE_DETAILS_BASE =
  'https://maps.googleapis.com/maps/api/place/details/json';
const PLACE_PHOTO_BASE = 'https://maps.googleapis.com/maps/api/place/photo';

// Max desired image width for both sources.
const IMAGE_MAX_WIDTH = 800; // px — sharp for cards, keeps transfers light
// Per-request timeout for image lookups. A single subject can chain up to 4
// requests (wiki-geo → wiki-name → pexels → openverse), so a 5s per-request
// timeout meant a worst case of 20s PER DESTINATION — the enrichment window
// truncated most of the batch and cards rendered without images. 3s keeps
// the chain responsive (worst case 12s/subject, typical <1s).
const REQUEST_TIMEOUT_MS = 3_000;
const CONCURRENCY_LIMIT = 8; // max simultaneous image lookups

// Persistent (AsyncStorage) cache.
// v2: invalidates entries resolved by the old accuracy-uncontrolled chain
// (Openverse hits could be wrong-place photos; Commons is now authoritative).
const STORAGE_KEY = '@tics/destination_images/v2';
const STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Sentinel recorded when a lookup genuinely returned nothing, so we don't
// re-query the same unhappy destination repeatedly within a session.
const MISS = '__MISS__';

/* ── Caches ─────────────────────────────────────────────────────────────────── */

interface PersistentEntry {
  url: string;
  ts: number;
}

const memoryCache = new Map<string, string>(); // key -> real URL or MISS
const inFlight = new Map<string, Promise<string | null>>(); // request dedup

let persistentCache: Record<string, PersistentEntry> = {};
let persistenceLoaded = false;
let persistScheduled = false;

/* ── Global concurrency gate ──────────────────────────────────────────────────
 * Every image lookup across ALL sections shares this single pool, so parallel
 * enrichment of nearby + trending + popular + weekend escapes can never exceed
 * CONCURRENCY_LIMIT in-flight requests to Wikimedia/Google. This avoids
 * hammering the (free & rate-limited) Wikipedia API on first load. */

let activeRequests = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const tryAcquire = (): void => {
      if (activeRequests < CONCURRENCY_LIMIT) {
        activeRequests += 1;
        resolve(() => {
          activeRequests -= 1;
          const next = waiters.shift();
          if (next) next();
        });
      } else {
        waiters.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

function getApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
}

/* ── Small helpers ──────────────────────────────────────────────────────────── */

/** Minimal shape we need to resolve an image for a destination-like object. */
interface ImageSubject {
  name?: string | null;
  city?: string | null;
  country?: string | null;
  coordinates?: { lat: number; lng: number } | null;
}

function buildKey(subject: ImageSubject): string {
  const name = (subject?.name || '').trim().toLowerCase();
  const place = (subject?.city || subject?.country || '').trim().toLowerCase();
  if (!name) return '';
  return place ? `${name}|${place}` : name;
}

function buildQuery(subject: ImageSubject): string {
  return [subject?.name, subject?.city, subject?.country]
    .filter(Boolean)
    .join(', ')
    .trim();
}

function hasUsableUrl(url?: string | null): boolean {
  return !!url && /^https?:\/\//.test(url);
}

function buildPhotoUrl(photoReference: string): string | null {
  const key = getApiKey();
  if (!key || !photoReference) return null;
  return `${PLACE_PHOTO_BASE}?maxwidth=${IMAGE_MAX_WIDTH}&photoreference=${encodeURIComponent(
    photoReference
  )}&key=${key}`;
}

/** Set a destination's primary image URL, tolerating a missing/odd `images[]`. */
function ensureImage(dest: Destination, url: string): void {
  if (!dest || !url) return;
  if (!Array.isArray(dest.images) || dest.images.length === 0) {
    dest.images = [{ url, caption: '', credit: '' }];
    return;
  }
  dest.images[0] = { ...(dest.images[0] || {}), url };
}
/* ── Persistence ────────────────────────────────────────────────────────────── */

async function ensurePersistenceLoaded(): Promise<void> {
  if (persistenceLoaded) return;
  persistenceLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    persistentCache = raw ? JSON.parse(raw) : {};
  } catch {
    persistentCache = {};
  }
}

function schedulePersist(): void {
  if (persistScheduled) return;
  persistScheduled = true;
  setTimeout(async () => {
    persistScheduled = false;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistentCache));
    } catch {
      // non-critical — cache will simply not persist this round
    }
  }, 400);
}

/* ── Network layer: Wikimedia (primary) + Google Places (fallback) ──────────── */

async function fetchFromUrl(url: string): Promise<any | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'en',
        // Wikipedia is far more lenient with a descriptive User-Agent and
        // returns "too many requests" to generic ones under burst traffic.
        'User-Agent': 'TICS-Explore/1.0 (React Native; contact: tics@example.com)',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Drop the `utm_*` marketing params Wikimedia appends to thumbnail URLs. */
function cleanImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('utm_content');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * PRIMARY image source — Wikimedia/Wikipedia, keyless and billing-free.
 * Strategy:
 *   1. geosearch by the destination's coordinates → the geographically
 *      nearest Wikipedia page's lead image (most accurate for Firestore
 *      destinations, which carry coordinates).
 *   2. If no coordinates (or no geo match), search Wikipedia by name → the
 *      top page's lead image.
 */
async function fetchWikimediaImage(
  subject: ImageSubject
): Promise<string | null> {
  const coords =
    subject?.coordinates &&
    typeof subject.coordinates.lat === 'number' &&
    typeof subject.coordinates.lng === 'number'
      ? { lat: subject.coordinates.lat, lng: subject.coordinates.lng }
      : null;

  // 1) Geographically-linked image via coordinates.
  if (coords) {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'geosearch',
      ggscoord: `${coords.lat}|${coords.lng}`,
      ggsradius: '10000', // 10 km (Wikipedia's max allowed radius)
      ggslimit: '6',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: String(IMAGE_MAX_WIDTH),
      format: 'json',
      origin: '*',
    });
    const data = await fetchFromUrl(`${WIKI_API_BASE}?${params.toString()}`);
    const pages = data?.query?.pages as Record<string, any> | undefined;
    if (pages) {
      const match = Object.values(pages).find(
        (p: any) => p?.thumbnail?.source
      );
      const thumb = (match as any)?.thumbnail?.source;
      if (thumb) return cleanImageUrl(thumb);
    }
  }

  // 2) Fall back to searching by the destination name. Famous places almost
  //    always have a Wikipedia page; try progressively simpler variants.
  const name = (subject?.name || '').trim();
  if (name) {
    const variants = Array.from(new Set([
      name,
      name.replace(/\s*\(.*\)\s*$/, '').trim(), // "Kampala (city)" → "Kampala"
      name.replace(/^(the|a|an)\s+/i, '').trim(),
    ])).filter((v) => v.length >= 2);

    for (const variant of variants) {
      const sParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: variant,
        srlimit: '1',
        format: 'json',
        origin: '*',
      });
      const sData = await fetchFromUrl(`${WIKI_API_BASE}?${sParams.toString()}`);
      const title = sData?.query?.search?.[0]?.title;
      if (!title) continue;
      const summary = await fetchFromUrl(
        `${WIKI_REST_BASE}/page/summary/${encodeURIComponent(title)}`
      );
      const thumb = summary?.thumbnail?.source || summary?.originalimage?.source;
      if (thumb) return cleanImageUrl(thumb);
    }
  }

  return null;
}

/**
 * PRIMARY ACCURACY SOURCE — Wikimedia Commons search (keyless, hotlink-safe).
 * Commons hosts *every* uploaded photo of a place, not just the Wikipedia
 * article's lead image, so coverage is far broader than the Wikipedia REST
 * summary lookup. Supports both geosearch (accurate for coordinate-bearing
 * destinations) and plain name search. All returned URLs are
 * upload.wikimedia.org / thumb.wikimedia.org — proven to render in RN <Image>.
 */
async function fetchCommonsImage(
  subject: ImageSubject
): Promise<string | null> {
  const name = (subject?.name || '').trim();
  const coords =
    subject?.coordinates &&
    typeof subject.coordinates.lat === 'number' &&
    typeof subject.coordinates.lng === 'number'
      ? { lat: subject.coordinates.lat, lng: subject.coordinates.lng }
      : null;
  if (!name && !coords) return null;

  // Titles that are never the photo a traveller wants.
  const BAD_TITLE = /(map|logo|icon|flag|coat[_ -]of[_ -]arms|plan|diagram|chart|graph|seal|stamp|banner)/i;
  const OK_MIME = /^(image\/(jpeg|png)|image\/jpg)/i;

  const attempt = async (
    params: URLSearchParams,
    opts: { requireGpsNear?: { lat: number; lng: number } } = {}
  ): Promise<string | null> => {
    const p = new URLSearchParams(params);
    if (opts.requireGpsNear) {
      // GPS verification needs extmetadata.
      p.set('iiprop', 'url|mime|extmetadata');
      p.set('iiextmetadatafilter', 'GPSLatitude|GPSLongitude');
    }
    const data = await fetchFromUrl(
      `https://commons.wikimedia.org/w/api.php?${p.toString()}`
    );
    const pages = Object.values(
      (data?.query?.pages || {}) as Record<string, any>
    );
    for (const page of pages) {
      if (BAD_TITLE.test(page?.title || '')) continue;
      const ii = page?.imageinfo?.[0];
      if (!ii) continue;
      if (ii.mime && !OK_MIME.test(ii.mime)) continue;
      // NAME-COLLISION GUARD: when the destination has coordinates, a name
      // search hit from elsewhere on the planet is almost certainly a
      // different place (e.g. "Norfolk Gardens" Kampala → "Norfolk Botanical
      // Garden" Virginia). Only accept GPS-verified files within ~50 km.
      if (opts.requireGpsNear) {
        const lat = parseFloat(ii.extmetadata?.GPSLatitude?.value ?? '');
        const lng = parseFloat(ii.extmetadata?.GPSLongitude?.value ?? '');
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const dLat = ((lat - opts.requireGpsNear.lat) * Math.PI) / 180;
        const dLng = ((lng - opts.requireGpsNear.lng) * Math.PI) / 180;
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((opts.requireGpsNear.lat * Math.PI) / 180) *
            Math.cos((lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const km = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
        if (km > 50) continue;
      }
      const thumb = ii.thumburl || ii.url;
      if (thumb) return cleanImageUrl(thumb);
    }
    return null;
  };

  // 1) Geosearch on Commons — photos actually taken at/near the coordinates.
  //    This is the MOST accurate path: the file is physically at the place.
  if (coords) {
    const geo = await attempt(new URLSearchParams({
      action: 'query',
      generator: 'geosearch',
      ggscoord: `${coords.lat}|${coords.lng}`,
      ggsradius: '10000',
      ggslimit: '10',
      ggsnamespace: '6',
      prop: 'imageinfo',
      iiprop: 'url|mime',
      iiurlwidth: String(IMAGE_MAX_WIDTH),
      format: 'json',
    }));
    if (geo) return geo;
  }

  // 2) Name search with progressive variants (same strategy as Wikipedia).
  if (name) {
    const variants = Array.from(new Set([
      name,
      name.replace(/\s*\(.*\)\s*$/, '').trim(),
      name.replace(/^(the|a|an)\s+/i, '').trim(),
    ])).filter((v) => v.length >= 3);

    for (const variant of variants) {
      const found = await attempt(new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: variant,
        gsrnamespace: '6',
        gsrlimit: '10',
        prop: 'imageinfo',
        iiprop: 'url|mime',
        iiurlwidth: String(IMAGE_MAX_WIDTH),
        format: 'json',
      }), coords ? { requireGpsNear: coords } : {});
      if (found) return found;
    }
  }

  return null;
}

/**
 * SECONDARY keyless source — Openverse (openverse.org), CC-licensed images
 * indexed from Flickr/Wikimedia/etc. Catches POIs that have no Wikipedia page
 * but do have openly-licensed photos. No API key required.
 *
 * ACCURACY GUARDS (the reason some cards previously showed wrong photos):
 *   1. Every candidate must contain at least one significant token of the
 *      destination name in its title/tags — generic name matches otherwise
 *      return completely unrelated photos.
 *   2. Only hotlink-friendly hosts are accepted (upload.wikimedia.org,
 *      staticflickr.com). Many other Openverse sources block hotlinking, so
 *      their URLs silently fail to render in React Native <Image>.
 * If nothing accurate passes, return null → the card renders the deterministic
 * local bundled fallback (an accurate-but-generic photo beats a wrong one).
 */
async function fetchOpenverseImage(
  subject: ImageSubject
): Promise<string | null> {
  const name = (subject?.name || '').trim();
  if (name.length < 3) return null;
  const params = new URLSearchParams({
    q: name,
    page_size: '10',
    license_type: 'all-cc',
  });
  const data = await fetchFromUrl(
    `https://api.openverse.org/v1/images/?${params.toString()}`
  );
  const results = (data?.results || []) as Array<{
    url?: string;
    thumbnail?: string;
    title?: string;
    tags?: Array<{ name?: string }>;
  }>;

  // Significant tokens of the destination name (drop generic words).
  const GENERIC = new Set(['the', 'and', 'of', 'park', 'garden', 'gardens', 'centre', 'center', 'hotel', 'restaurant', 'cafe', 'museum', 'beach', 'house', 'club', 'bar', 'shop', 'store']);
  const nameTokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !GENERIC.has(t));

  const HOTLINK_SAFE = /(^|\.)?(upload\.wikimedia\.org|staticflickr\.com|live\.staticflickr\.com)$/i;

  for (const r of results) {
    const url = r?.url || r?.thumbnail;
    if (!url) continue;
    try {
      const host = new URL(url).hostname;
      if (!HOTLINK_SAFE.test(host)) continue;
    } catch {
      continue;
    }
    const haystack = `${r.title || ''} ${(r.tags || [])
      .map((t) => t?.name || '')
      .join(' ')}`.toLowerCase();
    const accurate =
      nameTokens.length === 0 ||
      nameTokens.some((tok) => haystack.includes(tok));
    if (!accurate) continue;
    return cleanImageUrl(url);
  }
  return null;
}

/**
 * Resolve a Google Places `photo_reference` for a destination:
 * text-search (coordinates-biased) first, place-details as a fallback.
 */
async function fetchPhotoReference(
  subject: ImageSubject
): Promise<string | null> {
  const key = getApiKey();
  if (!key) return null;

  const query = buildQuery(subject);
  if (!query) return null;

  const params = new URLSearchParams({ query, key, language: 'en' });
  // Bias the search toward the destination's coordinates when available —
  // dramatically improves match accuracy for Firestore fallback destinations.
  if (
    subject?.coordinates &&
    typeof subject.coordinates.lat === 'number' &&
    typeof subject.coordinates.lng === 'number'
  ) {
    params.set(
      'location',
      `${subject.coordinates.lat},${subject.coordinates.lng}`
    );
    params.set('radius', '50000'); // 50 km bias window
  }

  const data = await fetchFromUrl(
    `${PLACES_TEXT_SEARCH_BASE}?${params.toString()}`
  );
  if (!data || data.status !== 'OK' || !data.results?.length) return null;

  const best = data.results[0];
  if (best?.photos?.[0]?.photo_reference) {
    return best.photos[0].photo_reference;
  }

  // Text search sometimes omits photos while place details has them.
  if (best?.place_id) {
    const details = await fetchFromUrl(
      `${PLACE_DETAILS_BASE}?${new URLSearchParams({
        place_id: best.place_id,
        fields: 'photos',
        key,
      }).toString()}`
    );
    if (
      details &&
      details.status === 'OK' &&
      details.result?.photos?.length
    ) {
      return details.result.photos[0].photo_reference || null;
    }
  }

  return null;
}
/* ── Per-destination resolution (cached + deduped) ──────────────────────────── */

async function resolveImageUrl(subject: ImageSubject): Promise<string | null> {
  const key = buildKey(subject);
  if (!key) return null;

  // 1) In-memory (session) cache, including known-miss.
  const memo = memoryCache.get(key);
  if (memo !== undefined) return memo === MISS ? null : memo;

  // 2) Persistent (AsyncStorage) cache.
  await ensurePersistenceLoaded();
  const stored = persistentCache[key];
  if (stored && Date.now() - stored.ts <= STORAGE_TTL_MS) {
    memoryCache.set(key, stored.url);
    return stored.url || null;
  }

  // 3) Reuse a request already in flight for this key.
  if (inFlight.has(key)) return (inFlight.get(key) as Promise<string | null>);

  const promise = (async (): Promise<string | null> => {
    let url: string | null = null;

    // Acquire a slot from the shared global pool — all sections together stay
    // within CONCURRENCY_LIMIT so we never burst the (free) Wikipedia API.
    const release = await acquireSlot();
    try {
      url = await fetchWikimediaImage(subject);

      // Wikimedia Commons — the accuracy workhorse. Far broader coverage than
      // Wikipedia lead images (every uploaded photo of the place), keyless,
      // and all URLs are hotlink-safe upload.wikimedia.org thumbs.
      if (!url) {
        url = await fetchCommonsImage(subject);
      }

      // Pexels is the next fallback (real photos, no Google billing needed).
      if (!url && subject?.name) {
        url = await fetchDestinationImage(subject.name);
      }

      // Openverse — keyless CC-image search; catches POIs without a
      // Wikipedia page (many OSM-sourced places).
      if (!url && subject?.name) {
        url = await fetchOpenverseImage(subject);
      }

      // Google Places is an OPTIONAL last-resort fallback. It is skipped
      // entirely when TICS_ENABLE_GOOGLE_PLACES=false or no key is present.
      if (!url && googlePlacesAvailable()) {
        const photoRef = await fetchPhotoReference(subject);
        if (photoRef) url = buildPhotoUrl(photoRef);
      }
    } finally {
      release();
    }

    memoryCache.set(key, url || MISS);
    if (url) {
      persistentCache[key] = { url, ts: Date.now() };
    } else {
      delete persistentCache[key];
    }
    schedulePersist();
    return url;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/* ── Concurrency-limited pool ───────────────────────────────────────────────── */

async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (!items.length) return;
  let cursor = 0;
  const workerCount = Math.min(CONCURRENCY_LIMIT, items.length);

  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      try {
        await worker(item);
      } catch {
        // never let one failing destination halt the rest
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => run()));
}

/* ── Public enrichment API ─────────────────────────────────────────────────── */

/**
 * Fill a primary image for every Destination missing one. Mutates the original
 * objects so that even a partial pass leaves already-resolved images in place;
 * returns the same list for convenience.
 */
export async function enrichDestinations(
  destinations: Destination[]
): Promise<Destination[]> {
  const missing = (destinations || []).filter(
    (d) => d && !hasUsableUrl(d.images?.[0]?.url)
  );
  if (!missing.length) return destinations;

  await runPool(missing, async (d) => {
    const url = await resolveImageUrl(d);
    if (url) ensureImage(d, url);
  });

  return destinations;
}

/** Enrich the destination inside each weekend escape. */
export async function enrichWeekendEscapes(
  escapes: WeekendEscape[]
): Promise<WeekendEscape[]> {
  const missing = (escapes || []).filter(
    (e) => e?.destination && !hasUsableUrl(e.destination.images?.[0]?.url)
  );
  if (!missing.length) return escapes;

  await runPool(missing, async (e) => {
    const url = await resolveImageUrl(e.destination);
    if (url) ensureImage(e.destination, url);
  });

  return escapes;
}

/**
 * Ensure every NearbyItem has a usable imageUrl. Primarily used for the
 * Firestore fallback in "Around You" / weekend escapes.
 */
export async function enrichNearbyItems(
  items: NearbyItem[]
): Promise<NearbyItem[]> {
  const missing = (items || []).filter((i) => i && !hasUsableUrl(i.imageUrl));
  if (!missing.length) return items;

  await runPool(missing, async (i) => {
    const url = await resolveImageUrl({ name: i.name, coordinates: i.coordinates });
    if (url) i.imageUrl = url;
  });

  return items;
}

/**
 * One-shot enrichment of every Explore home-screen "destination-bearing"
 * section produced by DiscoveryOrchestrator. Best-effort and non-blocking.
 */
export async function enrichExploreSections(input: {
  trending?: Destination[];
  popular?: Destination[];
  weekendEscapes?: WeekendEscape[];
  nearby?: NearbyItem[];
}): Promise<void> {
  const jobs: Array<Promise<unknown>> = [];
  if (input.trending?.length) jobs.push(enrichDestinations(input.trending));
  if (input.popular?.length) jobs.push(enrichDestinations(input.popular));
  if (input.weekendEscapes?.length) {
    jobs.push(enrichWeekendEscapes(input.weekendEscapes));
  }
  if (input.nearby?.length) jobs.push(enrichNearbyItems(input.nearby));
  await Promise.all(jobs);
}