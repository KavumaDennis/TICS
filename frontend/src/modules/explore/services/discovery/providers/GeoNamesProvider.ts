/**
 * GeoNamesProvider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Optional enrichment / search provider backed by GeoNames.
 *
 * Used to resolve city / country names for Search and to enrich location
 * metadata. Fully optional: `isAvailable()` returns false when no GeoNames
 * username is configured, so the rest of the pipeline is unaffected.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DestinationProvider, ProviderQueryOptions, TICSDestination } from './types';

const GEONAMES_BASE = 'https://api.geonames.org/searchJSON';
const REQUEST_TIMEOUT_MS = 5_000;

function geonamesUsername(): string {
  return process.env.EXPO_PUBLIC_GEONAMES_USERNAME || '';
}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface GeoNamesHit {
  geonameId: number;
  name: string;
  countryName?: string;
  countryCode?: string;
  adminName1?: string;
  lat: number;
  lng: number;
  fcl?: string;
  population?: number;
}

export const GeoNamesProvider: DestinationProvider = {
  name: 'geonames',
  kind: 'enrichment',

  isAvailable(): boolean {
    return Boolean(geonamesUsername());
  },

  async searchNearby(): Promise<TICSDestination[]> {
    return [];
  },

  async searchByQuery(query, options = {}): Promise<TICSDestination[]> {
    if (!geonamesUsername() || !query || query.trim().length < 2) return [];
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        username: geonamesUsername(),
        maxRows: String(options.limit || 8),
        style: 'SHORT',
        lang: 'en',
        featureClass: 'P',
      });
      const res = (await getJson(`${GEONAMES_BASE}?${params.toString()}`)) as { geonames?: GeoNamesHit[] };
      const hits = (res.geonames || []).filter((h) => typeof h.lat === 'number' && typeof h.lng === 'number');
      return hits.map((h) => ({
        id: `tics:geonames:${h.geonameId}`,
        sourceId: String(h.geonameId),
        name: h.name,
        latitude: h.lat,
        longitude: h.lng,
        country: h.countryName,
        countryCode: h.countryCode,
        region: h.adminName1,
        city: h.name,
        categories: ['City'],
        type: 'city',
        source: 'geonames',
        sourceConfidence: 0.7,
        qualityScore: 0.7,
        metadata: { population: h.population || 0 },
      }));
    } catch {
      return [];
    }
  },
};