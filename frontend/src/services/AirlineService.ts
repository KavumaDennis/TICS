/**
 * AirlineService.ts — worldwide airline search powered by the OpenFlights Airlines dataset.
 *
 * Data source: OpenFlights (https://openflights.org/data.html#airline)
 * Contains 1,255+ active airlines.
 *
 * The airline data is bundled as a compressed JSON file at assets/airlines.json
 * and loaded into memory once on first access. This provides instant offline search
 * with no network dependency and no Firestore read costs.
 *
 * PUBLIC API:
 *   AirlineResult           — search result shape { name, iata }
 *   AirlineFull             — full AirlineEntry with all fields
 *   searchAirlines(query)   — returns AirlineResult[] (compatible with existing selector)
 *   getAirlineByIATA(code)  — returns AirlineFull | null
 *   getAirlineByICAO(code)  — returns AirlineFull | null
 *   getAirlineByName(name)  — returns AirlineFull[]
 *   getAirlines()           — returns AirlineResult[]
 *   getAirlineFull(iata)    — returns AirlineFull | null
 */

import type { AirlineEntry } from '@/src/models/AirlineEntry';

// ─── Lightweight search result type (compatible with existing selector) ───

export interface AirlineResult {
  name: string;
  iata: string;
}

// ─── Internal record type from compressed data ──────────────────────────

interface AirlineRecord {
  i: string;   // iata
  c: string;   // icao
  n: string;   // name
  o: string;   // country
  s: string;   // callsign
  a: boolean;  // active
}

// ─── Module-level cache ─────────────────────────────────────────────────

let _airlineRecords: AirlineRecord[] | null = null;
let _airlineIndexByIATA: Map<string, AirlineRecord> | null = null;
let _airlineIndexByICAO: Map<string, AirlineRecord> | null = null;

/**
 * Load the bundled airline dataset into memory (lazy, cached).
 */
async function loadAirlines(): Promise<AirlineRecord[]> {
  if (_airlineRecords) return _airlineRecords;

  try {
    const module = await import('@/src/data/airlines');
    const records: AirlineRecord[] = module.default as AirlineRecord[];
    _airlineRecords = records;
    buildIndexes(records);
    return records;
  } catch (e) {
    console.error('[AirlineService] Failed to load airline data:', e);
    return [];
  }
}

function buildIndexes(records: AirlineRecord[]): void {
  const iataIndex = new Map<string, AirlineRecord>();
  const icaoIndex = new Map<string, AirlineRecord>();

  for (const r of records) {
    if (r.i) iataIndex.set(r.i, r);
    if (r.c) icaoIndex.set(r.c, r);
  }

  _airlineIndexByIATA = iataIndex;
  _airlineIndexByICAO = icaoIndex;
}

// ─── Converters ─────────────────────────────────────────────────────────

function toSearchResult(r: AirlineRecord): AirlineResult {
  return {
    name: r.n,
    iata: r.i,
  };
}

function toFullEntry(r: AirlineRecord): AirlineEntry {
  return {
    iata: r.i,
    icao: r.c,
    name: r.n,
    country: r.o,
    callsign: r.s,
    active: r.a,
  };
}

// ─── Ranking helper ─────────────────────────────────────────────────────

function rankMatch(query: string, r: AirlineRecord): number {
  const q = query.toLowerCase().trim();

  // 1. Exact IATA match
  if (r.i && r.i.toLowerCase() === q) return 0;
  // 2. Exact ICAO match
  if (r.c && r.c.toLowerCase() === q) return 1;
  // 3. IATA prefix match
  if (r.i && r.i.toLowerCase().startsWith(q)) return 2;
  // 4. Name contains query
  if (r.n.toLowerCase().includes(q)) return 3;
  // 5. Country contains query
  if (r.o && r.o.toLowerCase().includes(q)) return 4;
  // 6. Callsign contains query
  if (r.s && r.s.toLowerCase().includes(q)) return 5;
  // 7. ICAO prefix match
  if (r.c && r.c.toLowerCase().startsWith(q)) return 5;

  return 999; // no match
}

function matchesQuery(query: string, r: AirlineRecord): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;
  return (
    (r.i ? r.i.toLowerCase().includes(q) : false) ||
    (r.c ? r.c.toLowerCase().includes(q) : false) ||
    r.n.toLowerCase().includes(q) ||
    (r.o ? r.o.toLowerCase().includes(q) : false) ||
    (r.s ? r.s.toLowerCase().includes(q) : false)
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get all airlines as search results.
 */
export async function getAirlines(): Promise<AirlineResult[]> {
  const records = await loadAirlines();
  return records.map(toSearchResult);
}

/**
 * Search airlines by query (IATA, ICAO, name, country, callsign).
 * Returns up to 20 results as AirlineResult[].
 * Ranking: exact IATA > exact ICAO > IATA prefix > name > country > callsign.
 */
export async function searchAirlines(query: string): Promise<AirlineResult[]> {
  const records = await loadAirlines();
  const q = query.toLowerCase().trim();
  if (!q) return records.slice(0, 10).map(toSearchResult);

  const scored = records
    .filter((r) => matchesQuery(q, r))
    .map((r) => ({ record: r, score: rankMatch(q, r) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 20);

  return scored.map((s) => toSearchResult(s.record));
}

/**
 * Search airlines with full ranking support.
 * Returns full AirlineEntry[].
 */
export async function searchAirlinesFull(
  query: string,
  limit = 20,
): Promise<AirlineEntry[]> {
  const records = await loadAirlines();
  const q = query.toLowerCase().trim();
  if (!q) return records.slice(0, limit).map(toFullEntry);

  const scored = records
    .filter((r) => matchesQuery(q, r))
    .map((r) => ({ record: r, score: rankMatch(q, r) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  return scored.map((s) => toFullEntry(s.record));
}

/**
 * Get airline by IATA code. Returns full AirlineEntry or null.
 */
export async function getAirlineByIATA(
  code: string,
): Promise<AirlineEntry | null> {
  if (!_airlineIndexByIATA) await loadAirlines();

  const q = code.toUpperCase().trim();
  const r = _airlineIndexByIATA?.get(q);
  return r ? toFullEntry(r) : null;
}

/**
 * Get airline by ICAO code. Returns full AirlineEntry or null.
 */
export async function getAirlineByICAO(
  code: string,
): Promise<AirlineEntry | null> {
  if (!_airlineIndexByICAO) await loadAirlines();

  const q = code.toUpperCase().trim();
  const r = _airlineIndexByICAO?.get(q);
  return r ? toFullEntry(r) : null;
}

/**
 * Get airlines by name. Case-insensitive partial match.
 */
export async function getAirlineByName(
  name: string,
): Promise<AirlineEntry[]> {
  const records = await loadAirlines();
  const q = name.toLowerCase().trim();
  if (!q) return [];

  return records
    .filter((r) => r.n.toLowerCase().includes(q))
    .map(toFullEntry);
}

/**
 * Get full airline entry by IATA code. Alias for getAirlineByIATA.
 */
export async function getAirlineFull(
  iata: string,
): Promise<AirlineEntry | null> {
  return getAirlineByIATA(iata);
}

/**
 * Reload the airline data from the bundled asset (clears in-memory cache).
 */
export function resetAirlineCache(): void {
  _airlineRecords = null;
  _airlineIndexByIATA = null;
  _airlineIndexByICAO = null;
}

/**
 * Check if the airline data is loaded into memory.
 */
export function isAirlineDataLoaded(): boolean {
  return _airlineRecords !== null;
}

/**
 * Get total count of loaded airlines.
 */
export async function getAirlineCount(): Promise<number> {
  const records = await loadAirlines();
  return records.length;
}