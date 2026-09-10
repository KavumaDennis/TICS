/**
 * OpenStreetMapProvider.ts  (providers layer)
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMARY destination provider for TICS discovery.
 *
 * Uses the Overpass API for travel-relevant OpenStreetMap entities and returns
 * normalized `TICSDestination` objects. Complies with the OSM usage policy:
 *   - bounded, purpose-specific queries (never "everything")
 *   - request timeout + retry + exponential backoff across mirrors
 *   - response validation and coordinate checks
 *   - in-memory caching keyed on latitude bucket / longitude bucket / radius /
 *     category with stale-while-revalidate semantics
 *   - no fake ratings, no fake review counts, no fabricated images
 *   - graceful failure (returns [] and lets the aggregator fall back)
 *
 * IDs are stable and namespaced: tics:osm:node:123 | tics:osm:way:456 | ...
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  buildTicsId,
  isValidCoordinate,
  isValidUserLocation,
  DestinationProvider,
  ProviderQueryOptions,
  TICSDestination,
} from './types';

/* ── Constants ────────────────────────────────────────────────────────────── */

/**
 * Overpass endpoint configuration.
 *
 * IMPORTANT — endpoint coverage:
 * Only GLOBAL endpoints may be listed here. Region-limited endpoints (e.g.
 * overpass.osm.ch = Switzerland only) return HTTP 200 with 0 elements for
 * queries outside their coverage, which silently corrupts results. Never add
 * one just because it "responds 200".
 *
 * Live reachability evidence (2026-01, Uganda/dev network):
 *   overpass-api.de        ~2s when healthy, intermittently 504/502
 *   kumi.systems           intermittently 502
 *   private.coffee         intermittently 502
 *   maps.mail.ru           consistently reachable but SLOW (~10-15s)
 * → The total budget must be large enough for the slow-but-reliable mirror,
 *   otherwise failover aborts before any endpoint answers (root cause of the
 *   previous "OSM returns 0 live destinations" behavior).
 */
interface OverpassEndpoint {
  url: string;
  coverage: 'global';
  purpose: string;
}

const OVERPASS_ENDPOINTS: OverpassEndpoint[] = [
  {
    url: 'https://overpass-api.de/api/interpreter',
    coverage: 'global',
    purpose: 'primary — fastest when healthy',
  },
  {
    url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    coverage: 'global',
    purpose: 'mirror 1 — slowest but most consistently reachable; requires a long budget',
  },
  {
    url: 'https://overpass.kumi.systems/api/interpreter',
    coverage: 'global',
    purpose: 'mirror 2',
  },
  {
    url: 'https://overpass.private.coffee/api/interpreter',
    coverage: 'global',
    purpose: 'mirror 3',
  },
];

const OVERPASS_URLS = OVERPASS_ENDPOINTS.map((e) => e.url);

/** Endpoint configuration + live health for diagnostics / health screens. */
export function getOverpassEndpointStatus() {
  return OVERPASS_ENDPOINTS.map((e) => ({
    endpoint: e.url,
    coverage: e.coverage,
    purpose: e.purpose,
    health: endpointState(e.url).health,
  }));
}

const MAX_RADIUS_KM = 300;
/**
 * STRICT TOTAL PROVIDER BUDGET — includes every endpoint attempt, retry,
 * backoff sleep, network wait and JSON parsing. This is NOT per-request.
 *
 * LIVE EVIDENCE: the most consistently reachable public endpoint
 * (maps.mail.ru) needs ~10–15s to answer. The previous 5s/7s budgets aborted
 * failover before ANY endpoint could respond, so live OSM always returned 0
 * elements. Budgets below are sized so that: fast endpoints answer early
 * (~2–3s typical) and the slow mirror still fits when the fast ones 5xx.
 *
 * Local discovery (nearby/trending/weekend): 32s
 * Larger/global discovery:                   35s
 */
const LOCAL_BUDGET_MS = 32_000;
const GLOBAL_BUDGET_MS = 35_000;
// Hard cap for any single HTTP request inside the budget. Must exceed the
// observed worst-case latency of a full TICS union query (~16s under load,
// LIVE MEASURED on overpass-api.de: 15.5s for 60 elements at 25km radius).
const PER_REQUEST_CAP_MS = 28_000;
const MAX_RETRIES = 1;
const BACKOFF_BASE_MS = 600;
const MIN_REQUEST_GAP_MS = 300; // light politeness delay, inside budget
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min fresh
const STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h stale window
/** Empty results expire quickly so a transient Overpass outage recovers fast. */
const EMPTY_RESULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 60;

/* ── Endpoint health tracking ─────────────────────────────────────────────── */

type EndpointHealth = 'healthy' | 'degraded' | 'failed';

interface EndpointState {
  health: EndpointHealth;
  consecutiveFailures: number;
  lastFailureAt: number;
}

// An endpoint is deprioritized (not disabled) after repeated failures and
// automatically recovers after this cooldown.
const ENDPOINT_COOLDOWN_MS = 3 * 60 * 1000;
const FAILURES_TO_DEGRADE = 1;
const FAILURES_TO_FAIL = 3;

const endpointStates = new Map<string, EndpointState>();

function endpointState(url: string): EndpointState {
  let s = endpointStates.get(url);
  if (!s) {
    s = { health: 'healthy', consecutiveFailures: 0, lastFailureAt: 0 };
    endpointStates.set(url, s);
  }
  // Automatic recovery after cooldown — never permanently disable.
  if (
    s.health !== 'healthy' &&
    s.lastFailureAt > 0 &&
    Date.now() - s.lastFailureAt > ENDPOINT_COOLDOWN_MS
  ) {
    s.health = 'healthy';
    s.consecutiveFailures = 0;
  }
  return s;
}

function recordEndpointSuccess(url: string): void {
  const s = endpointState(url);
  s.health = 'healthy';
  s.consecutiveFailures = 0;
}

function recordEndpointFailure(url: string): void {
  const s = endpointState(url);
  s.consecutiveFailures += 1;
  s.lastFailureAt = Date.now();
  if (s.consecutiveFailures >= FAILURES_TO_FAIL) s.health = 'failed';
  else if (s.consecutiveFailures >= FAILURES_TO_DEGRADE) s.health = 'degraded';
}

/** Endpoints ordered healthy-first so we try reliable mirrors first. */
function orderedEndpoints(): string[] {
  const rank = (h: EndpointHealth) => (h === 'healthy' ? 0 : h === 'degraded' ? 1 : 2);
  return [...OVERPASS_URLS].sort(
    (a, b) => rank(endpointState(a).health) - rank(endpointState(b).health)
  );
}

/** One-line health snapshot for diagnostics. */
export function logEndpointHealth(): void {
  const primary = endpointState(OVERPASS_URLS[0]);
  const secondary = OVERPASS_URLS[1] ? endpointState(OVERPASS_URLS[1]) : null;
  console.log(
    `[OpenStreetMapProvider]\nendpoint health:\nprimary=${primary.health}\n${secondary ? `secondary=${secondary.health}` : ''}`.trim()
  );
}

/* ── OSM tag → classifier type mapping (feeds TravelClassifier) ────────────── */

const TOURISM_TO_TYPE: Record<string, string> = {
  attraction: 'tourist_attraction',
  museum: 'museum',
  viewpoint: 'viewpoint',
  gallery: 'art_gallery',
  hotel: 'lodging',
  hostel: 'lodging',
  guest_house: 'lodging',
  camp_site: 'campground',
  caravan_site: 'campground',
  information: 'point_of_interest',
  theme_park: 'theme_park',
  zoo: 'zoo',
  aquarium: 'aquarium',
  picnic_site: 'park',
};

const NATURAL_TO_TYPE: Record<string, string> = {
  beach: 'beach',
  peak: 'mountain',
  volcano: 'mountain',
  waterfall: 'waterfall',
  cave_entrance: 'mountain',
  hot_spring: 'natural_feature',
  bay: 'beach',
  lake: 'lake',
  wood: 'forest',
  protected_area: 'national_park',
  water: 'lake',
  spring: 'natural_feature',
  hill: 'mountain',
};

const HISTORIC_TO_TYPE: Record<string, string> = {
  monument: 'monument',
  memorial: 'monument',
  castle: 'castle',
  ruins: 'archaeological_site',
  archaeological_site: 'archaeological_site',
  fort: 'castle',
  building: 'historic_site',
  church: 'place_of_worship',
  cathedral: 'place_of_worship',
  monastery: 'historic_site',
};

const LEISURE_TO_TYPE: Record<string, string> = {
  park: 'park',
  nature_reserve: 'nature_reserve',
  marina: 'marina',
  garden: 'park',
  dog_park: 'park',
  playground: 'park',
  water_park: 'water_park',
  golf_course: 'entertainment',
};

const AMENITY_TO_TYPE: Record<string, string> = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  bar: 'bar',
  pub: 'bar',
  fast_food: 'restaurant',
  cinema: 'movie_theater',
  theatre: 'performing_arts_theater',
  nightclub: 'night_club',
  bus_station: 'bus_station',
  casino: 'casino',
  market: 'market',
};

const OTHER_TO_TYPE: Record<string, string> = {
  aerodrome: 'airport',
  station: 'train_station',
  summit: 'mountain',
  island: 'island',
  forest: 'forest',
  wetland: 'nature_reserve',
};

/* ── Category → targeted tag groups (category actually changes the query) ──── */

export type OsmCategory =
  | 'attractions'
  | 'restaurants'
  | 'hotels'
  | 'nature'
  | 'culture'
  | 'entertainment'
  | 'landmarks'
  | 'beaches'
  | 'museums'
  | 'parks';

/** Map a TICS category to the tag predicate used in the Overpass query. */
const CATEGORY_TO_TAG_PREDICATE: Record<OsmCategory, string> = {
  attractions: '["tourism"]',
  restaurants: '["amenity"~"restaurant|cafe|fast_food|bar|pub"]',
  hotels: '["tourism"~"hotel|hostel|guest_house|apartment"]',
  nature: '["natural"]',
  culture: '["historic"]',
  entertainment: '["amenity"~"cinema|theatre|nightclub"]',
  landmarks: '["tourism"~"attraction|viewpoint"]',
  beaches: '["natural"="beach"]',
  museums: '["tourism"="museum"]',
  parks: '["leisure"="park"]',
};

/* ── Caching ──────────────────────────────────────────────────────────────── */

interface CacheEntry {
  value: TICSDestination[];
  fetchedAt: number;
  /** Per-entry TTL. Empty results use a SHORT ttl so a transient Overpass
   *  outage doesn't pin "0 destinations" into the cache for 30 minutes. */
  ttlMs?: number;
}

// Key format: osm:{latBucket}:{lngBucket}:{radius}:{category}
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number, radiusKm: number, category?: string): string {
  const latBucket = Math.round(lat * 2) / 2; // ~55km buckets → cache friendly
  const lngBucket = Math.round(lng * 2) / 2;
  return `osm:${latBucket}:${lngBucket}:${radiusKm}:${category || 'all'}`;
}

function readCache(
  lat: number,
  lng: number,
  radiusKm: number,
  category?: string
): { value: TICSDestination[] | null; isStale: boolean } {
  const key = cacheKey(lat, lng, radiusKm, category);
  const entry = cache.get(key);
  if (!entry) return { value: null, isStale: false };
  const age = Date.now() - entry.fetchedAt;
  return {
    value: entry.value,
    isStale: age > (entry.ttlMs ?? CACHE_TTL_MS),
  };
}

function writeCache(
  lat: number,
  lng: number,
  radiusKm: number,
  category: string | undefined,
  value: TICSDestination[],
  ttlMs?: number
): void {
  const key = cacheKey(lat, lng, radiusKm, category);
  // Evict old entries to bound memory.
  if (cache.size > 400) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, fetchedAt: Date.now(), ttlMs });
}

/* ── Network: strict total-budget, deadline-aborted Overpass calls ────────── */

let lastRequestAt = 0;
// Tracks how many duplicate provider requests were avoided by joining an
// in-flight one (reported through discovery health).
const joinStats = { inFlightHits: 0 };

/** Last completed operation outcome — distinguishes TIMEOUT/FAILED from
 *  a genuine SUCCESS_EMPTY so health reporting never lies. */
export type OsmOutcome = 'SUCCESS_WITH_DATA' | 'SUCCESS_EMPTY' | 'TIMEOUT' | 'FAILED' | 'IDLE';
let lastOutcome: { status: OsmOutcome; durationMs: number } = {
  status: 'IDLE',
  durationMs: 0,
};

export function getLastOsmOutcome(): { status: OsmOutcome; durationMs: number } {
  return lastOutcome;
}

export function getOsmJoinStats(): number {
  return joinStats.inFlightHits;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single HTTP request with its OWN AbortController, additionally linked to the
 * parent deadline signal. When the parent deadline fires, this request is
 * aborted immediately even mid-flight.
 */
async function fetchOnce(
  url: string,
  body: string,
  timeoutMs: number,
  parentSignal: AbortSignal
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed);
  }
  lastRequestAt = Date.now();

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  parentSignal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Some carrier proxies / middleboxes return 406 when no Accept header
        // is present on a POST with a urlencoded body. Be explicit.
        'Accept': 'application/json',
        // REQUIRED: Overpass API usage policy asks for an identifiable UA, and
        // LIVE VERIFICATION showed that requests WITHOUT one are rejected with
        // HTTP 406 (bot detection) by overpass-api.de. Do not remove.
        'User-Agent': 'TICS/1.0 (React Native; https://tics.app)',
      },
      body: `data=${encodeURIComponent(body)}`,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onAbort);
  }
}

/**
 * GET fallback. Some proxies/CDNs mangle POST bodies (→ HTTP 406) while
 * passing query-string requests through untouched. Used only when POST fails
 * with 406/5xx so we never double-hit healthy endpoints.
 */
async function fetchOnceGet(
  url: string,
  body: string,
  timeoutMs: number,
  parentSignal: AbortSignal
): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  parentSignal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${url}?data=${encodeURIComponent(body)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onAbort);
  }
}

/**
 * Execute an Overpass query inside a STRICT TOTAL BUDGET.
 *
 * Strategy: attempt the healthiest endpoint first; if it fails fast, try the
 * next mirror while time remains. The parent AbortController aborts ALL child
 * requests when the budget expires, and the provider returns [] immediately.
 * No work continues after the caller's deadline.
 *
 * @returns parsed elements, or [] when the budget expired / all endpoints failed.
 */
/* ── Global politeness queue ─────────────────────────────────────────────────
 * Every Overpass request across ALL features (Explore sections, Near Me,
 * Weekend, Search, Popular regions) is serialised through this queue with a
 * minimum gap. Parallel bursts of section queries were tripping Overpass rate
 * limits (429/504) and every section failed together on device.
 */
const OVERPASS_MIN_GAP_MS = 1_200;
let overpassChain: Promise<void> = Promise.resolve();
let lastOverpassRequestAt = 0;

async function acquireOverpassSlot(): Promise<() => void> {
  const wait = Math.max(
    0,
    lastOverpassRequestAt + OVERPASS_MIN_GAP_MS - Date.now()
  );
  const chained = overpassChain.then(async () => {
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  });
  overpassChain = chained.catch(() => undefined);
  await chained;
  lastOverpassRequestAt = Date.now();
  return () => {
    lastOverpassRequestAt = Date.now();
  };
}

export async function fetchOverpass(
  query: string,
  options?: { budgetMs?: number }
): Promise<OverpassElement[]> {
  const budgetMs = options?.budgetMs ?? LOCAL_BUDGET_MS;
  const startedAt = Date.now();

  // Parent deadline: aborts every child request when it fires.
  const parentCtrl = new AbortController();
  const deadlineTimer = setTimeout(() => parentCtrl.abort(), budgetMs);

  let lastError: unknown = null;
  // The GET fallback (proxy-mangled POST workaround) is used at most ONCE per
  // run so a fully-down Overpass is never hit with 2× attempts per endpoint.
  let getFallbackUsed = false;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      for (const url of orderedEndpoints()) {
        const remaining = budgetMs - (Date.now() - startedAt);
        if (remaining <= 200 || parentCtrl.signal.aborted) break;

        const attemptStart = Date.now();
        try {
          // GLOBAL POLITENESS QUEUE: the app fires many section queries in
          // parallel (Explore, Near Me, Weekend, Search, Popular regions…).
          // Simultaneous bursts trip Overpass rate limits (429/504) and every
          // section fails together — the "OSM not bringing back data" device
          // behavior. Serialise requests with a minimum gap between them.
          const release = await acquireOverpassSlot();
          let response: Awaited<ReturnType<typeof fetchOnce>>;
          try {
            response = await fetchOnce(
              url,
              query,
              Math.min(PER_REQUEST_CAP_MS, remaining),
              parentCtrl.signal
            );
            // POST rejected (406/5xx) → one GET retry against the same endpoint
            // before moving on. Handles proxy-mangled POST bodies.
            if ((response.status === 406 || response.status >= 500) && !parentCtrl.signal.aborted && !getFallbackUsed) {
              getFallbackUsed = true;
              console.log(
                `[OpenStreetMapProvider] endpoint=${shortHost(url)} POST status=${response.status} — trying GET fallback (once per run)`
              );
              response = await fetchOnceGet(
                url,
                query,
                Math.min(PER_REQUEST_CAP_MS, budgetMs - (Date.now() - startedAt)),
                parentCtrl.signal
              );
            }
          } finally {
            release();
          }
          if (!response.ok) {
            lastError = new Error(`Overpass HTTP ${response.status}`);
            recordEndpointFailure(url);
            console.log(
              `[OSM DEBUG]\nendpoint: ${shortHost(url)}\nmethod: POST(+GET fallback)\nstatus: ${response.status}\nquery length: ${query.length}\ntimeout: ${Math.min(PER_REQUEST_CAP_MS, remaining)}ms\ndurationMs: ${Date.now() - attemptStart}\nparsed element count: 0\nerror: HTTP ${response.status}`
            );
            continue;
          }
          const data = await response.json();
          recordEndpointSuccess(url);
          const elements: OverpassElement[] = Array.isArray(data?.elements)
            ? data.elements
            : [];
          console.log(
            `[OSM DEBUG]\nendpoint: ${shortHost(url)}\nmethod: POST\nstatus: 200\nquery length: ${query.length}\ndurationMs: ${Date.now() - attemptStart}\nresponse size: ${JSON.stringify(data).length}\nparsed element count: ${elements.length}\nerror: none`
          );
          return elements;
        } catch (err: unknown) {
          lastError = err;
          recordEndpointFailure(url);
          const kind = isAbort(err) ? 'AbortError' : 'NetworkError';
          console.log(
            `[OpenStreetMapProvider] endpoint=${shortHost(url)} attempt=${attempt + 1} status=${kind} durationMs=${Date.now() - attemptStart} resultCount=0`
          );
          // Budget already gone → stop everything immediately.
          if (parentCtrl.signal.aborted) break;
        }
      }
      if (parentCtrl.signal.aborted) break;
      const wait = BACKOFF_BASE_MS * Math.pow(2, attempt);
      if (budgetMs - (Date.now() - startedAt) <= wait) break; // no budget for backoff
      await sleep(wait);
    }

    // Budget exhausted or all endpoints failed → fail fast with [].
    lastOutcome = {
      status: parentCtrl.signal.aborted ? 'TIMEOUT' : 'FAILED',
      durationMs: Date.now() - startedAt,
    };
    console.warn(
      `[OpenStreetMapProvider] ${lastOutcome.status} after ${lastOutcome.durationMs}ms (budget ${budgetMs}ms):`,
      lastError instanceof Error ? lastError.message : lastError ?? 'no response'
    );
    logEndpointHealth();
    return [];
  } finally {
    clearTimeout(deadlineTimer);
    // Ensure any still-running child request is torn down.
    if (!parentCtrl.signal.aborted && Date.now() - startedAt >= budgetMs) {
      parentCtrl.abort();
    }
  }
}

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isAbort(err: unknown): boolean {
  return Boolean(err) && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

/** Best available stale cache entry (within STALE_TTL_MS), or null. */
function readStaleCache(
  lat: number,
  lng: number,
  radiusKm: number,
  category?: string
): TICSDestination[] | null {
  const key = cacheKey(lat, lng, radiusKm, category);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > STALE_TTL_MS) return null;
  return entry.value;
}

/* ── Overpass QL query builders ───────────────────────────────────────────── */

type OverpassElementType = 'node' | 'way' | 'relation';

interface OverpassElement {
  type: OverpassElementType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Convert (lat,lng,radiusKm) into an Overpass bounding box string. */
function toBBox(lat: number, lng: number, radiusKm: number): string {
  const latDeg = radiusKm / 111.0;
  const lngDeg = radiusKm / (111.0 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const s = lat - latDeg;
  const w = lng - lngDeg;
  const n = lat + latDeg;
  const e = lng + lngDeg;
  return `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
}

/** The travel-relevant `( ... );` union block for a bbox.
 *  When a category predicate is supplied, ONLY that tag group is queried so
 *  category filtering genuinely changes the underlying dataset. */
function travelUnionBlock(bbox: string, predicate?: string): string {
  if (predicate) {
    return `
    (
      node${predicate}(${bbox});
      way${predicate}(${bbox});
      relation${predicate}(${bbox});
    );`;
  }
  return `
    (
      node["tourism"](${bbox});
      way["tourism"](${bbox});
      relation["tourism"](${bbox});
      node["natural"](${bbox});
      way["natural"](${bbox});
      node["historic"](${bbox});
      way["historic"](${bbox});
      relation["historic"](${bbox});
      node["leisure"~"^(park|nature_reserve|marina|garden)$"](${bbox});
      way["leisure"~"^(park|nature_reserve|marina|garden)$"](${bbox});
      node["amenity"="restaurant"](${bbox});
      node["amenity"="cafe"](${bbox});
      node["amenity"="bar"](${bbox});
      node["amenity"="pub"](${bbox});
      node["aeroway"="aerodrome"](${bbox});
      node["railway"="station"](${bbox});
      node["tourism"="hotel"](${bbox});
    );`;
}

function buildNearbyQuery(lat: number, lng: number, radiusKm: number, category?: string): string {
  const bbox = toBBox(lat, lng, radiusKm);
  const predicate = category && CATEGORY_TO_TAG_PREDICATE[category as OsmCategory]
    ? CATEGORY_TO_TAG_PREDICATE[category as OsmCategory]
    : undefined;
  return `[out:json][timeout:30];${travelUnionBlock(bbox, predicate)}out center ${DEFAULT_LIMIT};`;
}

function buildSearchQuery(query: string, country?: string): string {
  const esc = query.replace(/"/g, '');
  const countryFilter = country ? `["addr:country"="${country}"]` : '';
  return `[out:json][timeout:25];
  (
    node["name"~"${esc}",i]${countryFilter};
    way["name"~"${esc}",i]${countryFilter};
    relation["name"~"${esc}",i]${countryFilter};
  );
  out center 25;`;
}

function buildByIdQuery(elmType: OverpassElementType, id: number): string {
  return `[out:json][timeout:20];${elmType}(${id});out center;`;
}

/* ── Element → TICSDestination ────────────────────────────────────────────── */

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveType(tags: Record<string, string>): string | null {
  if (tags.tourism && TOURISM_TO_TYPE[tags.tourism]) return TOURISM_TO_TYPE[tags.tourism];
  if (tags.natural && NATURAL_TO_TYPE[tags.natural]) return NATURAL_TO_TYPE[tags.natural];
  if (tags.historic && HISTORIC_TO_TYPE[tags.historic]) return HISTORIC_TO_TYPE[tags.historic];
  if (tags.leisure && LEISURE_TO_TYPE[tags.leisure]) return LEISURE_TO_TYPE[tags.leisure];
  if (tags.amenity && AMENITY_TO_TYPE[tags.amenity]) return AMENITY_TO_TYPE[tags.amenity];
  if (tags.aeroway === 'aerodrome') return 'airport';
  if (tags.railway === 'station') return 'train_station';
  return null;
}

/** Broad TICS-ish category label used by the UI / ranking. */
function travelCategoryFromType(type: string): string {
  if (['beach', 'waterfall', 'lake', 'mountain', 'nature_reserve', 'forest', 'national_park', 'natural_feature', 'viewpoint', 'island'].includes(type)) return 'Nature';
  if (['museum', 'art_gallery', 'castle', 'monument', 'historic_site', 'archaeological_site', 'place_of_worship'].includes(type)) return 'Culture';
  if (['zoo', 'aquarium', 'theme_park', 'amusement_park', 'entertainment', 'movie_theater', 'night_club'].includes(type)) return 'Entertainment';
  if (['restaurant', 'cafe', 'bar'].includes(type)) return 'Food';
  if (['lodging', 'hotel'].includes(type)) return 'Accommodation';
  if (['airport', 'train_station', 'bus_station'].includes(type)) return 'Transport';
  if (['park'].includes(type)) return 'Parks & Outdoors';
  return 'Attraction';
}

function collectTags(tags: Record<string, string>, type: string): string[] {
  const out = new Set<string>([type]);
  const keys = ['tourism', 'natural', 'historic', 'leisure', 'amenity', 'aeroway', 'railway', 'landuse', 'waterway', 'boundary', 'man_made'];
  for (const k of keys) if (tags[k]) out.add(tags[k]);
  out.add(travelCategoryFromType(type));
  return Array.from(out);
}

function computeQuality(tags: Record<string, string>): number {
  let q = 0.45;
  if (tags.website || tags['contact:website']) q += 0.15;
  if (tags.opening_hours) q += 0.1;
  if (tags.wikipedia) q += 0.1;
  if (tags.wikidata) q += 0.1;
  if (tags.phone || tags['contact:phone']) q += 0.05;
  if (tags.description) q += 0.05;
  return Math.min(1, Math.max(0, q));
}

function elementToDestination(
  el: OverpassElement,
  centerLat: number,
  centerLng: number
): TICSDestination | null {
  const tags = el.tags || {};
  const name = tags.name?.trim();
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!isValidCoordinate(lat, lon)) return null;

  const type = resolveType(tags);
  if (!type) return null;

  return {
    id: buildTicsId('openstreetmap', `${el.type}:${el.id}`),
    sourceId: `${el.type}/${el.id}`,
    name,
    latitude: lat,
    longitude: lon,
    description: tags.description || undefined,
    categories: [travelCategoryFromType(type)],
    tags: collectTags(tags, type),
    type,
    website: tags.website || tags['contact:website'] || undefined,
    phone: tags.phone || tags['contact:phone'] || undefined,
    openingHours: tags.opening_hours || undefined,
    imageUrl: undefined,
    rating: undefined,
    reviewCount: undefined,
    distanceKm: haversine(centerLat, centerLng, lat, lon),
    isOpen: undefined,
    source: 'openstreetmap',
    sourceConfidence: 0.6,
    qualityScore: computeQuality(tags),
    metadata: {
      osmType: el.type,
      osmId: el.id,
      wikipedia: tags.wikipedia,
      wikidata: tags.wikidata,
    },
  };
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function dedupe(dests: TICSDestination[]): TICSDestination[] {
  const seen = new Map<string, TICSDestination>();
  for (const d of dests) {
    const key = `${normalizeName(d.name)}_${d.latitude.toFixed(2)}_${d.longitude.toFixed(2)}`;
    const existing = seen.get(key);
    if (!existing || (d.qualityScore || 0) > (existing.qualityScore || 0)) {
      seen.set(key, d);
    }
  }
  return Array.from(seen.values());
}

function applyLimit(dests: TICSDestination[], limit?: number): TICSDestination[] {
  const n = limit && limit > 0 ? limit : DEFAULT_LIMIT;
  return dests.slice(0, n);
}

/* ── In-flight dedup ──────────────────────────────────────────────────────── */

const inFlight = new Map<string, Promise<TICSDestination[]>>();

async function refreshNearby(
  lat: number,
  lng: number,
  radiusKm: number,
  category?: string,
  limit?: number,
  budgetMs: number = LOCAL_BUDGET_MS
): Promise<TICSDestination[]> {
  const key = cacheKey(lat, lng, radiusKm, category);
  const existing = inFlight.get(key);
  if (existing) {
    joinStats.inFlightHits += 1;
    console.log('[OpenStreetMapProvider] in-flight HIT — joining existing request');
    return existing;
  }

  const promise = (async () => {
    const startedAt = Date.now();
    try {
      const query = buildNearbyQuery(lat, lng, radiusKm, category);
      const elements = await fetchOverpass(query, { budgetMs });
      if (elements.length === 0) {
        // fetchOverpass already recorded TIMEOUT/FAILED; SUCCESS_EMPTY only
        // when the service genuinely answered with zero matches.
        if (getLastOsmOutcome().status === 'IDLE') {
          lastOutcome = { status: 'SUCCESS_EMPTY', durationMs: Date.now() - startedAt };
        }
      } else {
        lastOutcome = { status: 'SUCCESS_WITH_DATA', durationMs: Date.now() - startedAt };
      }
      const dests = elements
        .map((el) => elementToDestination(el, lat, lng))
        .filter((d): d is TICSDestination => d !== null);
      const unique = dedupe(dests).sort(
        (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)
      );
      // Empty results (transient outage / genuine none) get a SHORT TTL so a
      // temporarily-down Overpass never pins "0 destinations" for 30 minutes.
      writeCache(
        lat,
        lng,
        radiusKm,
        category,
        unique,
        unique.length === 0 ? EMPTY_RESULT_TTL_MS : undefined
      );
      console.log(
        `[OpenStreetMapProvider] Query: nearby | Center: ${lat.toFixed(4)},${lng.toFixed(4)} | Radius: ${radiusKm}km | Results: ${unique.length} | durationMs=${Date.now() - startedAt}`
      );
      return applyLimit(unique, limit);
    } catch (err) {
      console.warn(
        '[OpenStreetMapProvider] ERROR nearby fetch failed:',
        err instanceof Error ? err.message : err
      );
      lastOutcome = { status: 'FAILED', durationMs: Date.now() - startedAt };
      // Serve stale data rather than nothing when Overpass is down.
      const stale = readStaleCache(lat, lng, radiusKm, category);
      if (stale && stale.length > 0) {
        console.log(`[OpenStreetMapProvider] serving STALE cache (${stale.length}) after failure`);
        return applyLimit(stale, limit);
      }
      return [];
    }
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/** Public provider object implementing DestinationProvider (OSM = primary). */
export const OpenStreetMapProvider: DestinationProvider = {
  name: 'openstreetmap',
  kind: 'primary',

  isAvailable(): boolean {
    return true; // OSM requires no key / billing.
  },

  async searchNearby({
    lat,
    lng,
    radiusKm = 50,
    limit,
    category,
    budgetMs,
  }): Promise<TICSDestination[]> {
    // NEVER query Overpass with null-island (0,0) or out-of-range coordinates.
    if (!isValidUserLocation(lat, lng)) {
      console.warn(
        `[OpenStreetMapProvider] rejected invalid user location lat=${lat} lng=${lng} — skipping OSM query`
      );
      return [];
    }
    const radius = Math.min(Math.max(radiusKm || 50, 1), MAX_RADIUS_KM);

    const cached = readCache(lat, lng, radius, category);
    if (cached.value) {
      // An EMPTY cached result that has gone stale must never be served —
      // fetch live instead (a 0-entry cache is only useful while fresh, to
      // smooth out short bursts; it expires after EMPTY_RESULT_TTL_MS).
      if (cached.isStale && cached.value.length === 0) {
        console.log('[OpenStreetMapProvider] cache STALE-EMPTY — refetching live');
        return refreshNearby(lat, lng, radius, category, limit, budgetMs ?? LOCAL_BUDGET_MS);
      }
      if (cached.isStale) {
        console.log(`[OpenStreetMapProvider] cache STALE — serving stale and refreshing (${cached.value.length})`);
        // Stale-while-revalidate: return cached immediately, refresh in bg.
        void refreshNearby(lat, lng, radius, category, limit, budgetMs ?? LOCAL_BUDGET_MS);
      } else {
        console.log(`[OpenStreetMapProvider] cache HIT (${cached.value.length})`);
      }
      return applyLimit(cached.value, limit);
    }

    console.log('[OpenStreetMapProvider] cache MISS — fetching');
    return refreshNearby(lat, lng, radius, category, limit, budgetMs ?? LOCAL_BUDGET_MS);
  },

  async searchByQuery(query, options = {}): Promise<TICSDestination[]> {
    if (!query || query.trim().length < 2) return [];
    try {
      const ql = buildSearchQuery(query.trim(), options.country);
      const elements = await fetchOverpass(ql);
      const dests = elements
        .map((el) => elementToDestination(el, 0, 0))
        .filter((d): d is TICSDestination => d !== null);
      const unique = dedupe(dests);
      console.log(`[OpenStreetMapProvider] Query: search "${query}" | Results: ${unique.length}`);
      return applyLimit(unique, options.limit || 20);
    } catch (err) {
      console.warn('[OpenStreetMapProvider] ERROR search failed:', err);
      return [];
    }
  },

  async getById(id: string): Promise<TICSDestination | null> {
    const parts = id.split(':');
    const elmType = parts[parts.length - 2];
    const rawId = parts[parts.length - 1];
    if ((elmType !== 'node' && elmType !== 'way' && elmType !== 'relation') || !rawId) {
      return null;
    }
    try {
      const elements = await fetchOverpass(buildByIdQuery(elmType, Number(rawId)));
      const el = elements[0];
      if (!el) return null;
      return elementToDestination(el, el.lat ?? el.center?.lat ?? 0, el.lon ?? el.center?.lon ?? 0);
    } catch {
      return null;
    }
  },
};

/** Clear the OSM in-memory cache (e.g. tests, major location jump). */
export function clearOpenStreetMapCache(): void {
  cache.clear();
  inFlight.clear();
}