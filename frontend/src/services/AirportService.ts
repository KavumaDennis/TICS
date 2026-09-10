/**
 * AirportService.ts — worldwide airport search powered by the OurAirports dataset.
 *
 * Data source: OurAirways (https://ourairports.com/data/)
 * Contains 8,803+ airports with valid IATA codes.
 *
 * The airport data is bundled as a compressed JSON file at assets/airports.json
 * and loaded into memory once on first access. This provides instant offline search
 * with no network dependency and no Firestore read costs.
 *
 * PUBLIC API (backward-compatible):
 *   AirportEntry          — search result shape { code, name, city, country }
 *   searchAirports(q)     — returns AirportEntry[] (legacy, limited to 20)
 *   getAirports()         — returns AirportEntry[] (legacy)
 *   getAirportByCode(c)   — returns AirportEntry | null (legacy)
 *
 * NEW API (enhanced):
 *   searchAirportsFull(q) — returns AirportEntry[] with ranking
 *   getAirportByIATA(c)   — returns full AirportEntry | null
 *   getAirportByICAO(c)   — returns full AirportEntry | null
 *   getAirportByCity(c)   — returns AirportEntry[]
 *   getAirportByCountry(c)— returns AirportEntry[]
 *   getNearbyAirports(lat, lng, radiusKm) — returns AirportEntry[]
 *   getAirportFull(iata)  — returns full AirportEntry | null
 */

import type { AirportEntry as AirportEntryModel } from '@/src/models/AirportEntry';

// ─── Legacy lightweight type (backward-compatible) ───────────────────────

export interface AirportEntry {
  code: string;
  name: string;
  city: string;
  country: string;
}

// ─── Internal record type from compressed data ──────────────────────────

interface AirportRecord {
  i: string;   // iata
  g: string;   // icao
  n: string;   // name
  m: string;   // municipality (city)
  c: string;   // countryCode
  l: [number, number]; // [lat, lng]
  t: string;   // type
}

// ─── Country code → full name mapping ───────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  UG: 'Uganda', KE: 'Kenya', TZ: 'Tanzania', RW: 'Rwanda', BI: 'Burundi',
  ET: 'Ethiopia', DJ: 'Djibouti', SO: 'Somalia', ER: 'Eritrea', SD: 'Sudan',
  SS: 'South Sudan', ZA: 'South Africa', NG: 'Nigeria', GH: 'Ghana',
  EG: 'Egypt', MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria', LY: 'Libya',
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  IN: 'India', CN: 'China', JP: 'Japan', BR: 'Brazil', DE: 'Germany',
  FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands', CH: 'Switzerland',
  SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PT: 'Portugal',
  BE: 'Belgium', AT: 'Austria', IE: 'Ireland', GR: 'Greece', PL: 'Poland',
  CZ: 'Czech Republic', HU: 'Hungary', RO: 'Romania', BG: 'Bulgaria',
  RU: 'Russia', TR: 'Turkey', AE: 'United Arab Emirates', SA: 'Saudi Arabia',
  QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman', JO: 'Jordan',
  IL: 'Israel', LB: 'Lebanon', IQ: 'Iraq', IR: 'Iran', AF: 'Afghanistan',
  PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal', MV: 'Maldives',
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', PH: 'Philippines',
  TH: 'Thailand', VN: 'Vietnam', KH: 'Cambodia', LA: 'Laos', MM: 'Myanmar',
  KR: 'South Korea', HK: 'Hong Kong', TW: 'Taiwan', MN: 'Mongolia',
  MX: 'Mexico', AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  VE: 'Venezuela', EC: 'Ecuador', BO: 'Bolivia', PY: 'Paraguay', UY: 'Uruguay',
  NZ: 'New Zealand', FJ: 'Fiji', PG: 'Papua New Guinea',
  // Add more as needed — falls back to countryCode if missing
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

// ─── Module-level cache ─────────────────────────────────────────────────

let _airportRecords: AirportRecord[] | null = null;
let _airportIndexByIATA: Map<string, AirportRecord> | null = null;
let _airportIndexByICAO: Map<string, AirportRecord> | null = null;

/**
 * Load the bundled airport dataset into memory (lazy, cached).
 * This reads the static JSON asset bundled at build time.
 */
async function loadAirports(): Promise<AirportRecord[]> {
  if (_airportRecords) return _airportRecords;

  try {
    // Dynamic import of the bundled data file
    const module = await import('@/src/data/airports');
    const records: AirportRecord[] = module.default as AirportRecord[];
    _airportRecords = records;
    buildIndexes(records);
    return records;
  } catch (e) {
    console.error('[AirportService] Failed to load airport data:', e);
    return [];
  }
}

function buildIndexes(records: AirportRecord[]): void {
  const iataIndex = new Map<string, AirportRecord>();
  const icaoIndex = new Map<string, AirportRecord>();

  for (const r of records) {
    if (r.i) iataIndex.set(r.i, r);
    if (r.g) icaoIndex.set(r.g, r);
  }

  _airportIndexByIATA = iataIndex;
  _airportIndexByICAO = icaoIndex;
}

// ─── Converters ─────────────────────────────────────────────────────────

function toLegacyEntry(r: AirportRecord): AirportEntry {
  return {
    code: r.i,
    name: r.n,
    city: r.m,
    country: r.c,
  };
}

function toFullEntry(r: AirportRecord): AirportEntryModel {
  return {
    iata: r.i,
    icao: r.g,
    name: r.n,
    city: r.m,
    country: getCountryName(r.c),
    countryCode: r.c,
    latitude: r.l[0],
    longitude: r.l[1],
    type: r.t,
  };
}

// ─── Ranking helper ─────────────────────────────────────────────────────

function rankMatch(query: string, r: AirportRecord): number {
  const q = query.toLowerCase().trim();

  // 1. Exact IATA match
  if (r.i.toLowerCase() === q) return 0;
  // 2. Exact ICAO match
  if (r.g && r.g.toLowerCase() === q) return 1;
  // 3. IATA prefix match
  if (r.i.toLowerCase().startsWith(q)) return 2;
  // 4. Name contains query
  if (r.n.toLowerCase().includes(q)) return 3;
  // 5. ICAO prefix match
  if (r.g && r.g.toLowerCase().startsWith(q)) return 3;
  // 6. City / municipality contains query
  if (r.m && r.m.toLowerCase().includes(q)) return 4;
  // 7. Country code matches query
  if (r.c && r.c.toLowerCase().includes(q)) return 5;

  return 999; // no match
}

function matchesQuery(query: string, r: AirportRecord): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;
  return (
    r.i.toLowerCase().includes(q) ||
    (r.g && r.g.toLowerCase().includes(q)) ||
    r.n.toLowerCase().includes(q) ||
    (r.m && r.m.toLowerCase().includes(q)) ||
    (r.c && r.c.toLowerCase().includes(q))
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC API — LEGACY (backward-compatible)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get all airports as legacy AirportEntry[].
 * @deprecated Prefer searchAirports() or getAirportByIATA().
 */
export async function getAirports(_forceRefresh = false): Promise<AirportEntry[]> {
  const records = await loadAirports();
  return records.map(toLegacyEntry);
}

/**
 * Search airports by query (IATA, ICAO, name, city, country).
 * Legacy — returns up to 20 results as AirportEntry[].
 * Uses the ranking system: exact IATA > exact ICAO > name > city > country.
 */
export async function searchAirports(query: string): Promise<AirportEntry[]> {
  const records = await loadAirports();
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const scored = records
    .filter((r) => matchesQuery(q, r))
    .map((r) => ({ record: r, score: rankMatch(q, r) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 20);

  return scored.map((s) => toLegacyEntry(s.record));
}

/**
 * Get airport by IATA or ICAO code (legacy).
 * @deprecated Prefer getAirportByIATA() or getAirportByICAO().
 */
export async function getAirportByCode(code: string): Promise<AirportEntry | null> {
  if (!_airportIndexByIATA) await loadAirports();

  const q = code.toUpperCase().trim();
  const full = await getAirportByIATA(q);
  if (full) return { code: full.iata, name: full.name, city: full.city, country: full.countryCode };

  const icao = await getAirportByICAO(q);
  if (icao) return { code: icao.iata, name: icao.name, city: icao.city, country: icao.countryCode };

  return null;
}

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC API — NEW (enhanced full AirportEntry)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Search airports with full ranking support.
 * Returns full AirportEntry[] for the new dataset.
 * Ranking: exact IATA > exact ICAO > name > city > country.
 * Limit defaults to 20.
 */
export async function searchAirportsFull(
  query: string,
  limit = 20,
): Promise<AirportEntryModel[]> {
  const records = await loadAirports();
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const scored = records
    .filter((r) => matchesQuery(q, r))
    .map((r) => ({ record: r, score: rankMatch(q, r) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  return scored.map((s) => toFullEntry(s.record));
}

/**
 * Get airport by IATA code. Returns full AirportEntry or null.
 */
export async function getAirportByIATA(
  code: string,
): Promise<AirportEntryModel | null> {
  if (!_airportIndexByIATA) await loadAirports();

  const q = code.toUpperCase().trim();
  const r = _airportIndexByIATA?.get(q);
  return r ? toFullEntry(r) : null;
}

/**
 * Get airport by ICAO code. Returns full AirportEntry or null.
 */
export async function getAirportByICAO(
  code: string,
): Promise<AirportEntryModel | null> {
  if (!_airportIndexByICAO) await loadAirports();

  const q = code.toUpperCase().trim();
  const r = _airportIndexByICAO?.get(q);
  return r ? toFullEntry(r) : null;
}

/**
 * Get all airports in a given city. Case-insensitive partial match.
 */
export async function getAirportByCity(
  city: string,
): Promise<AirportEntryModel[]> {
  const records = await loadAirports();
  const q = city.toLowerCase().trim();
  if (!q) return [];

  return records
    .filter((r) => r.m && r.m.toLowerCase().includes(q))
    .map(toFullEntry);
}

/**
 * Get all airports in a given country (by country code or name). Case-insensitive partial match.
 */
export async function getAirportByCountry(
  country: string,
): Promise<AirportEntryModel[]> {
  const records = await loadAirports();
  const q = country.toLowerCase().trim();
  if (!q) return [];

  return records
    .filter(
      (r) =>
        r.c.toLowerCase() === q ||
        getCountryName(r.c).toLowerCase().includes(q),
    )
    .map(toFullEntry);
}

/**
 * Get airports within a given radius (km) of a coordinate.
 * Uses the Haversine formula for distance calculation.
 */
export async function getNearbyAirports(
  latitude: number,
  longitude: number,
  radiusKm: number,
): Promise<AirportEntryModel[]> {
  const records = await loadAirports();

  return records
    .filter((r) => {
      const dist = haversineDistance(
        latitude,
        longitude,
        r.l[0],
        r.l[1],
      );
      return dist <= radiusKm;
    })
    .sort((a, b) => {
      const distA = haversineDistance(latitude, longitude, a.l[0], a.l[1]);
      const distB = haversineDistance(latitude, longitude, b.l[0], b.l[1]);
      return distA - distB;
    })
    .slice(0, 20)
    .map(toFullEntry);
}

/**
 * Get full airport entry by IATA code. Alias for getAirportByIATA for convenience.
 */
export async function getAirportFull(
  iata: string,
): Promise<AirportEntryModel | null> {
  return getAirportByIATA(iata);
}

// ══════════════════════════════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════════════════════════════

/**
 * Haversine distance between two coordinates in km.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Reload the airport data from the bundled asset (e.g. after an update).
 * This clears the in-memory cache and forces a fresh load.
 */
export function resetAirportCache(): void {
  _airportRecords = null;
  _airportIndexByIATA = null;
  _airportIndexByICAO = null;
}

/**
 * Check if the airport data is loaded into memory.
 */
export function isAirportDataLoaded(): boolean {
  return _airportRecords !== null;
}

/**
 * Get total count of loaded airports.
 */
export async function getAirportCount(): Promise<number> {
  const records = await loadAirports();
  return records.length;
}