/**
 * AirlineEntry — universal airline model derived from the OpenFlights Airlines dataset.
 *
 * Only active airlines are included by default.
 * This model is the single source of truth for all airline lookups.
 */
export interface AirlineEntry {
  /** IATA code (e.g. "EK") */
  iata: string;
  /** ICAO code (e.g. "UAE") */
  icao: string;
  /** Full airline name (e.g. "Emirates") */
  name: string;
  /** Country of registration (e.g. "United Arab Emirates") */
  country: string;
  /** Radio callsign (e.g. "EMIRATES") */
  callsign: string;
  /** Whether the airline is currently operational */
  active: boolean;
}

/**
 * Lightweight airline entry used for search results and selection.
 * Compatible with the existing pattern in TripInputScreen.
 */
export type AirlineSearchResult = {
  name: string;
  iata: string;
};

/**
 * Structured airline data stored on a Trip when created/updated.
 * Used by monitoring, recommendations, and AI assistant features.
 */
export interface AirlineInfo {
  name: string;
  iata: string;
  icao: string;
  country: string;
  callsign: string;
}