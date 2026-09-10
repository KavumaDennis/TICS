/**
 * config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central provider configuration for TICS destination discovery.
 *
 * Google Places is now an OPTIONAL enrichment provider, never a required
 * dependency. OSM is the primary discovery source.
 *
 * Env controls:
 *   TICS_ENABLE_GOOGLE_PLACES   - when "false" or "0", zero Google Places
 *                                 requests are ever issued and the provider
 *                                 reports itself unavailable.
 *   EXPO_PUBLIC_GOOGLE_PLACES_API_KEY - when missing, Google Places is treated
 *                                 as disabled even if the flag is unset.
 *
 * Google Maps (map rendering) is tracked separately and intentionally NOT
 * gated by the Places flag so that map rendering keeps working.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

function explicitFlag(): boolean | undefined {
  // Expo inlines EXPO_PUBLIC_* into the bundle; the bare name is honoured too.
  const raw =
    process.env.TICS_ENABLE_GOOGLE_PLACES ??
    process.env.EXPO_PUBLIC_TICS_ENABLE_GOOGLE_PLACES;
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return undefined;
}

let loggedDisabled = false;

/**
 * Google Places is OPT-IN. It resolves to false unless the developer
 * explicitly sets TICS_ENABLE_GOOGLE_PLACES=true AND a key exists.
 *
 * Default state: DISABLED — zero Google Places requests, zero REQUEST_DENIED
 * spam, and no share of the discovery timeout budget.
 */
export function isGooglePlacesEnabled(): boolean {
  const flag = explicitFlag();
  const key = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  const enabled = flag === true && Boolean(key);

  if (!enabled && !loggedDisabled) {
    loggedDisabled = true;
    console.log('[DestinationProviders] Google Places: DISABLED');
  }
  return enabled;
}

/**
 * Google Places must never throw into the pipeline. This always returns a
 * usable boolean and is safe to call in provider `isAvailable()` checks.
 */
export function googlePlacesAvailable(): boolean {
  try {
    return isGooglePlacesEnabled();
  } catch {
    return false;
  }
}

/**
 * Google Maps is used only for rendering maps inside the UI (not for data).
 * It is kept independent of the Places flag by design.
 */
export function isGoogleMapsEnabled(): boolean {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return Boolean(key);
}

/** Human-readable provider configuration for startup / diagnostic logging. */
export function getProviderConfigSummary(): Record<string, boolean> {
  return {
    openstreetmap: true,
    geonames: Boolean(process.env.EXPO_PUBLIC_GEONAMES_USERNAME),
    wikidata: true,
    firestore: true,
    google_places: googlePlacesAvailable(),
    google_maps: isGoogleMapsEnabled(),
  };
}