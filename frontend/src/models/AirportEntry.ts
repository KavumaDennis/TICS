/**
 * AirportEntry — universal airport model derived from the OurAirports dataset.
 *
 * Only airports that have a valid IATA code are included.
 * This model is the single source of truth for all airport lookups.
 */
export interface AirportEntry {
  /** IATA code (e.g. "EBB") */
  iata: string;
  /** ICAO / GPS code (e.g. "HUEN") */
  icao: string;
  /** Full airport name (e.g. "Entebbe International Airport") */
  name: string;
  /** Municipality / city served (e.g. "Entebbe") */
  city: string;
  /** Full country name (e.g. "Uganda") */
  country: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "UG") */
  countryCode: string;
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Airport type from OurAirways: large_airport, medium_airport, small_airport, etc. */
  type: string;
}

/**
 * Lightweight airport entry used for search results and selection.
 * Compatible with the existing AirportEntry in TripInputScreen.
 */
export type AirportSearchResult = {
  code: string;
  name: string;
  city: string;
  country: string;
};