/**
 * WikidataProvider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enrichment provider that pulls useful travel metadata from Wikidata
 * (keyless, free). It is strictly best-effort and non-blocking: a failure or
 * timeout must never crash the pipeline.
 *
 * Provides:
 *   - country / countryCode
 *   - short description
 *   - image (Wikimedia Commons thumbnail)
 *   - a prominence signal (number of sitelinks)
 *   - searchByQuery for cities / landmarks (for the Search screen)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  DestinationProvider,
  TICSDestination,
} from './types';

const WB_ACTION_URL = 'https://www.wikidata.org/w/api.php';
const REQUEST_TIMEOUT_MS = 5_000;

interface WbSearchEntity {
  id: string;
  label?: string;
  description?: string;
  pageid?: number;
  sitelinks?: number;
}

interface WbEntityResult {
  description?: string;
  sitelinks?: number;
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
}

const cache = new Map<string, Partial<TICSDestination>>();
const inFlight = new Map<string, Promise<Partial<TICSDestination>>>();

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

function countryCodeFromQ(qid: string): { country?: string; countryCode?: string } {
  // A small local map for common cases; enrichment fills the rest.
  const map: Record<string, { country: string; countryCode: string }> = {
    Q183: { country: 'Germany', countryCode: 'DE' },
    Q142: { country: 'France', countryCode: 'FR' },
    Q145: { country: 'United Kingdom', countryCode: 'GB' },
    Q30: { country: 'United States', countryCode: 'US' },
    Q17: { country: 'Japan', countryCode: 'JP' },
    Q148: { country: 'China', countryCode: 'CN' },
    Q668: { country: 'India', countryCode: 'IN' },
    Q1036: { country: 'Uganda', countryCode: 'UG' },
    Q258: { country: 'South Africa', countryCode: 'ZA' },
    Q953: { country: 'Kenya', countryCode: 'KE' },
    Q924: { country: 'Tanzania', countryCode: 'TZ' },
  };
  return map[qid] || {};
}

/**
 * Best-effort enrichment for a single destination. Never throws.
 */
export async function enrichDestination(dest: TICSDestination): Promise<Partial<TICSDestination>> {
  if (!dest || !dest.name) return {};
  const key = dest.name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const searchUrl = `${WB_ACTION_URL}?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=3&search=${encodeURIComponent(dest.name)}`;
      const searchRes = (await getJson(searchUrl)) as { search?: WbSearchEntity[] };
      const entity = searchRes.search?.[0];
      if (!entity) return {};
      const entityUrl = `${WB_ACTION_URL}?action=wbgetentities&format=json&ids=${entity.id}&props=descriptions|claims|sitelinks|labels`;
      const res = (await getJson(entityUrl)) as { entities?: Record<string, WbEntityResult> };
      const data = res.entities?.[entity.id];
      if (!data) return {};

      const partial: Partial<TICSDestination> = {
        metadata: { wikidataId: entity.id, wikidataSitelinks: data.sitelinks || entity.sitelinks || 0 },
      };
      if (!dest.description && entity.description) partial.description = entity.description;
      if (!dest.country) {
        const countryQ = data.claims?.P17?.[0]?.mainsnak?.datavalue?.value as { id?: string } | undefined;
        const cc = countryQ?.id ? countryCodeFromQ(countryQ.id) : {};
        if (cc.country) partial.country = cc.country;
        if (cc.countryCode) partial.countryCode = cc.countryCode;
      }
      if (!dest.imageUrl) {
        const imageClaim = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value as string | undefined;
        if (imageClaim) {
          partial.imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageClaim.replace(/ /g, '_'))}?width=800`;
        }
      }
      cache.set(key, partial);
      return partial;
    } catch {
      return {};
    }
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/** Enrich a batch of destinations (best-effort, parallel but bounded). */
export async function enrichDestinations(dests: TICSDestination[]): Promise<TICSDestination[]> {
  const enriched = await Promise.all(
    dests.slice(0, 12).map(async (d) => {
      const partial = await enrichDestination(d);
      return Object.assign(d, partial);
    })
  );
  const count = enriched.filter((d) => d.metadata?.wikidataId).length;
  console.log(
    `[WikidataProvider]\nWikidata:\nenrichmentMatches=${count}\nstandaloneCandidates=0 (coordinateless search results are used for enrichment only)`
  );
  return dests;
}

export const WikidataProvider: DestinationProvider = {
  name: 'wikidata',
  kind: 'enrichment',

  isAvailable(): boolean {
    return true;
  },

  // OSM is the primary; Wikidata search is a secondary, best-effort search
  // source for cities / landmarks so "Paris" surfaces the city.
  async searchNearby(): Promise<TICSDestination[]> {
    return [];
  },

  async searchByQuery(query, options = {}): Promise<TICSDestination[]> {
    if (!query || query.trim().length < 2) return [];
    try {
      const searchUrl = `${WB_ACTION_URL}?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=${options.limit || 10}&search=${encodeURIComponent(query.trim())}`;
      const res = (await getJson(searchUrl)) as { search?: WbSearchEntity[] };
      const items = res.search || [];
      const dests: TICSDestination[] = items
        .filter((it) => it.id && it.label)
        .map((it) => ({
          id: `tics:wikidata:${it.id}`,
          sourceId: it.id,
          name: it.label as string,
          latitude: 0,
          longitude: 0,
          description: it.description,
          categories: ['Curated'],
          source: 'wikidata',
          sourceConfidence: 0.5,
          qualityScore: 0.5,
          metadata: { wikidataId: it.id, sitelinks: it.sitelinks || 0 },
        }));
      return dests;
    } catch {
      return [];
    }
  },
};