/**
 * useTripType.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook that provides trip type classification for any trip in the app.
 * Caches the trip type on the trip object and allows consuming components
 * to reactively adapt their UI based on trip type.
 *
 * Usage:
 *   const { tripType, classification, isLocal, isRegional, isInternational } = useTripType(trip);
 *   if (isLocal) { ... show local UI ... }
 *   if (isRegional) { ... show regional UI ... }
 *   if (isInternational) { ... show international UI ... }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';
import {
  TripClassificationService,
  TripType,
  type ClassificationInput,
  type ClassificationResult,
} from '@/src/services/trip/TripClassificationService';
import type { Trip } from '@/src/store/tripStore';

export interface TripTypeInfo {
  /** The classified trip type (LOCAL, REGIONAL, INTERNATIONAL) */
  tripType: TripType;
  /** Full classification result with metadata */
  classification: ClassificationResult | null;
  /** Convenience booleans */
  isLocal: boolean;
  isRegional: boolean;
  isInternational: boolean;
  /** Country info */
  originCountryName: string | null;
  destinationCountryName: string | null;
  /** Requires international documents */
  requiresPassport: boolean;
  requiresVisa: boolean;
  requiresVaccination: boolean;
  /** UI hints */
  showBorderCrossing: boolean;
  showImmigration: boolean;
  showFlightInfo: boolean;
  showDrivingInfo: boolean;
  showCurrencyExchange: boolean;
  showTravelInsurance: boolean;
  showPackingChecklist: boolean;
  showLocalTransport: boolean;
}

/**
 * Guess a country code from a location string like "Kampala, Uganda" or just "Uganda".
 */
function guessCountryCode(location: string): string | null {
  if (!location) return null;

  // Try to extract country name from "City, Country" format
  const parts = location.split(',').map((p) => p.trim());
  const lastPart = parts[parts.length - 1].toLowerCase();

  // Map common country names to ISO codes
  const countryNameToCode: Record<string, string> = {
    'uganda': 'UG',
    'kenya': 'KE',
    'tanzania': 'TZ',
    'rwanda': 'RW',
    'burundi': 'BI',
    'south sudan': 'SS',
    'ethiopia': 'ET',
    'somalia': 'SO',
    'djibouti': 'DJ',
    'eritrea': 'ER',
    'drc': 'CD',
    'congo': 'CD',
    'democratic republic of the congo': 'CD',
    'south africa': 'ZA',
    'nigeria': 'NG',
    'ghana': 'GH',
    'egypt': 'EG',
    'morocco': 'MA',
    'united kingdom': 'GB',
    'uk': 'GB',
    'england': 'GB',
    'france': 'FR',
    'germany': 'DE',
    'italy': 'IT',
    'spain': 'ES',
    'netherlands': 'NL',
    'switzerland': 'CH',
    'sweden': 'SE',
    'norway': 'NO',
    'denmark': 'DK',
    'finland': 'FI',
    'portugal': 'PT',
    'ireland': 'IE',
    'poland': 'PL',
    'austria': 'AT',
    'hungary': 'HU',
    'greece': 'GR',
    'turkey': 'TR',
    'russia': 'RU',
    'ukraine': 'UA',
    'romania': 'RO',
    'belgium': 'BE',
    'china': 'CN',
    'india': 'IN',
    'japan': 'JP',
    'south korea': 'KR',
    'korea': 'KR',
    'singapore': 'SG',
    'malaysia': 'MY',
    'thailand': 'TH',
    'vietnam': 'VN',
    'indonesia': 'ID',
    'philippines': 'PH',
    'uae': 'AE',
    'united arab emirates': 'AE',
    'dubai': 'AE',
    'saudi arabia': 'SA',
    'israel': 'IL',
    'pakistan': 'PK',
    'bangladesh': 'BD',
    'sri lanka': 'LK',
    'nepal': 'NP',
    'iran': 'IR',
    'iraq': 'IQ',
    'kazakhstan': 'KZ',
    'united states': 'US',
    'usa': 'US',
    'america': 'US',
    'united states of america': 'US',
    'canada': 'CA',
    'mexico': 'MX',
    'brazil': 'BR',
    'argentina': 'AR',
    'colombia': 'CO',
    'chile': 'CL',
    'peru': 'PE',
    'australia': 'AU',
    'new zealand': 'NZ',
    'fiji': 'FJ',
  };

  // Check if it's already a 2-letter code
  if (/^[A-Z]{2}$/.test(lastPart.toUpperCase())) {
    return lastPart.toUpperCase();
  }

  return countryNameToCode[lastPart] || null;
}

/**
 * Hook that classifies a trip and provides type-aware utilities.
 *
 * @param trip - The trip object to classify
 * @param originCountryOverride - Optional override for origin country code
 * @param destinationCountryOverride - Optional override for destination country code
 */
export function useTripType(
  trip: Trip | null,
  originCountryOverride?: string,
  destinationCountryOverride?: string,
): TripTypeInfo {
  return useMemo(() => {
    if (!trip) {
      return createEmptyInfo();
    }

    // If trip already has a type stored, use it directly
    if (trip.type) {
      const tripType = trip.type as unknown as TripType;
      const classification: ClassificationResult = {
        tripType,
        originCountry: '',
        destinationCountry: '',
        originCountryInfo: null,
        destinationCountryInfo: null,
        isSameCountry: tripType === TripType.LOCAL,
        isNeighboringCountry: tripType === TripType.REGIONAL,
        sameContinent: tripType !== TripType.INTERNATIONAL,
      };

      return buildInfo(tripType, classification);
    }

    // Determine origin and destination country codes
    const originCode = originCountryOverride || guessCountryCode(trip.from) || 'UG';
    const destCode = destinationCountryOverride || guessCountryCode(trip.to) || '';

    if (!destCode) {
      // Fallback: if we can't determine country, assume LOCAL for same-city trips
      const isSameCity = trip.from?.toLowerCase() === trip.to?.toLowerCase();
      const fallbackType = isSameCity ? TripType.LOCAL : TripType.INTERNATIONAL;
      return createEmptyInfo(fallbackType);
    }

    // Classify the trip
    const result = TripClassificationService.classify({
      originCountry: originCode,
      destinationCountry: destCode,
      originCity: trip.from,
      destinationCity: trip.to,
    });

    return buildInfo(result.tripType, result);
  }, [trip, originCountryOverride, destinationCountryOverride]);
}

function createEmptyInfo(fallbackType?: TripType): TripTypeInfo {
  const type = fallbackType || TripType.LOCAL;
  return {
    tripType: type,
    classification: null,
    isLocal: type === TripType.LOCAL,
    isRegional: type === TripType.REGIONAL,
    isInternational: type === TripType.INTERNATIONAL,
    originCountryName: null,
    destinationCountryName: null,
    requiresPassport: type !== TripType.LOCAL,
    requiresVisa: type === TripType.INTERNATIONAL,
    requiresVaccination: type === TripType.INTERNATIONAL,
    showBorderCrossing: type !== TripType.LOCAL,
    showImmigration: type === TripType.INTERNATIONAL,
    showFlightInfo: type !== TripType.LOCAL,
    showDrivingInfo: type === TripType.LOCAL,
    showCurrencyExchange: type !== TripType.LOCAL,
    showTravelInsurance: type !== TripType.LOCAL,
    showPackingChecklist: type === TripType.INTERNATIONAL,
    showLocalTransport: type === TripType.INTERNATIONAL,
  };
}

function buildInfo(tripType: TripType, classification: ClassificationResult): TripTypeInfo {
  const isLocal = tripType === TripType.LOCAL;
  const isRegional = tripType === TripType.REGIONAL;
  const isInternational = tripType === TripType.INTERNATIONAL;

  return {
    tripType,
    classification,
    isLocal,
    isRegional,
    isInternational,
    originCountryName: classification.originCountryInfo?.name || null,
    destinationCountryName: classification.destinationCountryInfo?.name || null,
    requiresPassport: !isLocal,
    requiresVisa: isInternational,
    requiresVaccination: isInternational,
    showBorderCrossing: !isLocal,
    showImmigration: isInternational,
    showFlightInfo: !isLocal,
    showDrivingInfo: isLocal || isRegional,
    showCurrencyExchange: !isLocal,
    showTravelInsurance: !isLocal,
    showPackingChecklist: isInternational,
    showLocalTransport: isInternational,
  };
}

export { TripType };
export default useTripType;