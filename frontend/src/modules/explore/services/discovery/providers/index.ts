/**
 * providers/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider registry. Exposes the ordered set of active destination providers
 * so the aggregator and downstream services never couple directly to OSM.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { OpenStreetMapProvider } from './OpenStreetMapProvider';
import { FirestoreDestinationProvider } from './FirestoreDestinationProvider';
import { WikidataProvider } from './WikidataProvider';
import { GeoNamesProvider } from './GeoNamesProvider';
import { GooglePlacesProvider } from './GooglePlacesProvider';
import { getProviderConfigSummary } from './config';
import { DestinationProvider } from './types';

export type { TICSDestination, DestinationProvider, DestinationSource, ProviderQueryOptions } from './types';
export {
  OpenStreetMapProvider,
  clearOpenStreetMapCache,
  fetchOverpass,
  getLastOsmOutcome,
  getOsmJoinStats,
  logEndpointHealth,
} from './OpenStreetMapProvider';
export { FirestoreDestinationProvider } from './FirestoreDestinationProvider';
export { WikidataProvider, enrichDestination as enrichSingleDestination, enrichDestinations as enrichWikimediaDestinations } from './WikidataProvider';
export { GeoNamesProvider } from './GeoNamesProvider';
export { GooglePlacesProvider } from './GooglePlacesProvider';
export { isGooglePlacesEnabled, googlePlacesAvailable, isGoogleMapsEnabled, getProviderConfigSummary } from './config';
export { buildTicsId, isValidCoordinate } from './types';

/** Every provider known to the system (regardless of availability). */
export const ALL_PROVIDERS: DestinationProvider[] = [
  OpenStreetMapProvider,
  WikidataProvider,
  GeoNamesProvider,
  FirestoreDestinationProvider,
  GooglePlacesProvider,
];

/** Providers that are currently available (OSM first, Google optional). */
export function getEnabledDestinationProviders(): DestinationProvider[] {
  return ALL_PROVIDERS.filter((p) => p.isAvailable());
}

/** Human-readable list of enabled provider names for logging. */
export function getEnabledProviderNames(): string[] {
  return getEnabledDestinationProviders().map((p) => p.name);
}

/** Log the provider configuration once at startup for diagnostics. */
export function logProviderConfig(): void {
  const summary = getProviderConfigSummary();
  console.log('[DestinationAggregator] Provider config:', JSON.stringify(summary));
  console.log(`[DestinationAggregator] Providers enabled: ${getEnabledProviderNames().join(', ')}`);
}