/**
 * TripClassificationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core classification engine that determines whether a journey is LOCAL,
 * REGIONAL, or INTERNATIONAL based on origin and destination.
 *
 * Architecture:
 *   Screens → Components → Hooks → Services → TripClassificationService
 *                                                      ↓
 *                                            Journey Services / Firestore
 *
 * Classification happens ONCE during journey creation and is stored as
 * trip.type. No classification logic lives inside UI components.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRIP TYPE ENUM                                                             */
/* ════════════════════════════════════════════════════════════════════════════ */

export enum TripType {
  LOCAL = 'LOCAL',
  REGIONAL = 'REGIONAL',
  INTERNATIONAL = 'INTERNATIONAL',
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  REGIONAL NEIGHBOR MAP                                                      */
/*  Maps each country to its list of neighboring countries.                    */
/*  Used to determine if a cross-border trip is REGIONAL vs INTERNATIONAL.     */
/* ════════════════════════════════════════════════════════════════════════════ */

const NEIGHBORING_COUNTRIES: Record<string, string[]> = {
  // East Africa
  UG: ['KE', 'TZ', 'RW', 'SS', 'CD'],
  KE: ['UG', 'TZ', 'SO', 'ET', 'SS'],
  TZ: ['UG', 'KE', 'RW', 'BI', 'ZM', 'MW', 'MZ'],
  RW: ['UG', 'TZ', 'BI', 'CD'],
  BI: ['TZ', 'RW', 'CD'],
  SS: ['UG', 'KE', 'ET', 'SD', 'CD', 'CF'],
  ET: ['KE', 'SS', 'SD', 'ER', 'DJ', 'SO'],
  SO: ['KE', 'ET', 'DJ'],
  DJ: ['ET', 'SO', 'ER'],
  ER: ['ET', 'SD', 'DJ'],

  // Central Africa
  CD: ['UG', 'RW', 'BI', 'TZ', 'ZM', 'AO', 'CF', 'SS', 'CG'],
  CG: ['CD', 'GA', 'CF', 'CM', 'AO'],
  GA: ['CG', 'CM', 'GQ'],
  GQ: ['GA', 'CM'],
  CM: ['NG', 'TD', 'CF', 'GA', 'GQ', 'CG'],
  CF: ['TD', 'SD', 'SS', 'CD', 'CG', 'CM'],
  TD: ['LY', 'SD', 'CF', 'NG', 'NE', 'CM'],

  // Southern Africa
  ZA: ['NA', 'BW', 'ZW', 'MZ', 'LS', 'SZ'],
  NA: ['ZA', 'BW', 'ZM', 'AO'],
  BW: ['ZA', 'NA', 'ZM', 'ZW'],
  ZW: ['ZA', 'BW', 'ZM', 'MZ'],
  MZ: ['ZA', 'ZW', 'ZM', 'MW', 'TZ'],
  ZM: ['CD', 'TZ', 'MW', 'MZ', 'ZW', 'BW', 'NA', 'AO'],
  MW: ['TZ', 'MZ', 'ZM'],
  AO: ['CD', 'ZM', 'NA', 'CG'],
  LS: ['ZA'],
  SZ: ['ZA', 'MZ'],

  // West Africa
  NG: ['BJ', 'NE', 'TD', 'CM'],
  GH: ['CI', 'BF', 'TG'],
  CI: ['GH', 'BF', 'ML', 'GN', 'LR'],
  BF: ['ML', 'NE', 'BJ', 'TG', 'GH', 'CI'],
  ML: ['SN', 'MR', 'DZ', 'NE', 'BF', 'CI', 'GN'],
  SN: ['MR', 'ML', 'GN', 'GW', 'GM'],
  GM: ['SN'],
  GN: ['GW', 'SN', 'ML', 'CI', 'LR', 'SL'],
  GW: ['SN', 'GN'],
  SL: ['GN', 'LR'],
  LR: ['SL', 'GN', 'CI'],
  BJ: ['NG', 'NE', 'BF', 'TG'],
  TG: ['GH', 'BF', 'BJ'],
  NE: ['DZ', 'LY', 'TD', 'NG', 'BJ', 'BF', 'ML'],
  MR: ['EH', 'DZ', 'ML', 'SN'],

  // North Africa
  DZ: ['MA', 'EH', 'MR', 'ML', 'NE', 'LY', 'TN'],
  MA: ['ES', 'DZ', 'EH'],
  TN: ['DZ', 'LY'],
  LY: ['TN', 'DZ', 'NE', 'TD', 'SD', 'EG'],
  EG: ['LY', 'SD', 'IL', 'PS'],
  SD: ['EG', 'LY', 'TD', 'CF', 'SS', 'ET', 'ER'],
  EH: ['MA', 'MR', 'DZ'],

  // Europe
  GB: ['IE'],
  IE: ['GB'],
  FR: ['BE', 'LU', 'DE', 'CH', 'IT', 'MC', 'ES', 'AD'],
  DE: ['DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'BE', 'LU', 'NL'],
  IT: ['FR', 'CH', 'AT', 'SI', 'SM', 'VA'],
  ES: ['FR', 'AD', 'PT', 'MA', 'GI'],
  PT: ['ES'],
  NL: ['BE', 'DE'],
  BE: ['FR', 'DE', 'LU', 'NL'],
  LU: ['FR', 'DE', 'BE'],
  CH: ['FR', 'DE', 'AT', 'LI', 'IT'],
  AT: ['DE', 'CZ', 'SK', 'HU', 'SI', 'IT', 'CH', 'LI'],
  DK: ['DE', 'SE', 'NO'],
  SE: ['NO', 'FI', 'DK'],
  NO: ['SE', 'FI', 'RU'],
  FI: ['SE', 'NO', 'RU'],
  PL: ['DE', 'CZ', 'SK', 'UA', 'BY', 'LT', 'RU'],
  CZ: ['DE', 'PL', 'SK', 'AT'],
  SK: ['PL', 'UA', 'HU', 'AT', 'CZ'],
  HU: ['AT', 'SK', 'UA', 'RO', 'RS', 'HR', 'SI'],
  SI: ['AT', 'HU', 'HR', 'IT'],
  HR: ['SI', 'HU', 'RS', 'BA', 'ME'],
  BA: ['HR', 'RS', 'ME'],
  RS: ['HU', 'RO', 'BG', 'MK', 'ME', 'BA', 'HR'],
  ME: ['HR', 'BA', 'RS', 'AL', 'XK'],
  AL: ['ME', 'XK', 'MK', 'GR'],
  XK: ['RS', 'ME', 'AL', 'MK'],
  MK: ['RS', 'BG', 'GR', 'AL', 'XK'],
  BG: ['RO', 'RS', 'MK', 'GR', 'TR'],
  RO: ['UA', 'MD', 'BG', 'RS', 'HU'],
  GR: ['AL', 'MK', 'BG', 'TR'],
  TR: ['GR', 'BG', 'GE', 'AM', 'AZ', 'IR', 'IQ', 'SY'],
  UA: ['PL', 'SK', 'HU', 'RO', 'MD', 'BY', 'RU'],
  BY: ['PL', 'LT', 'LV', 'RU', 'UA'],
  LT: ['LV', 'BY', 'PL', 'RU'],
  LV: ['EE', 'RU', 'BY', 'LT'],
  EE: ['RU', 'LV'],
  RU: ['NO', 'FI', 'EE', 'LV', 'LT', 'PL', 'BY', 'UA', 'GE', 'AZ', 'KZ', 'MN', 'CN', 'KP'],
  MD: ['RO', 'UA'],

  // Asia
  CN: ['RU', 'MN', 'KP', 'KR', 'JP', 'VN', 'LA', 'MM', 'IN', 'NP', 'BT', 'PK', 'AF', 'TJ', 'KG', 'KZ'],
  IN: ['PK', 'CN', 'NP', 'BT', 'MM', 'BD', 'LK'],
  JP: ['CN', 'KR', 'RU'],
  KR: ['CN', 'KP', 'JP'],
  KP: ['CN', 'RU', 'KR'],
  MN: ['RU', 'CN'],
  VN: ['CN', 'LA', 'KH'],
  LA: ['CN', 'VN', 'KH', 'TH', 'MM'],
  KH: ['VN', 'LA', 'TH'],
  TH: ['MM', 'LA', 'KH', 'MY'],
  MM: ['CN', 'LA', 'TH', 'BD', 'IN'],
  MY: ['TH', 'ID', 'BN', 'SG'],
  SG: ['MY'],
  ID: ['MY', 'PG', 'TL'],
  PH: [''],
  BN: ['MY'],
  TL: ['ID'],
  NP: ['CN', 'IN'],
  BT: ['CN', 'IN'],
  BD: ['IN', 'MM'],
  LK: ['IN'],
  PK: ['IR', 'AF', 'CN', 'IN'],
  AF: ['TM', 'UZ', 'TJ', 'CN', 'PK', 'IR'],
  IR: ['TR', 'IQ', 'AF', 'PK', 'TM', 'AZ', 'AM'],
  IQ: ['TR', 'SY', 'JO', 'SA', 'KW', 'IR'],
  SY: ['TR', 'IQ', 'JO', 'IL', 'LB'],
  JO: ['SY', 'IQ', 'SA', 'IL', 'PS'],
  IL: ['LB', 'SY', 'JO', 'EG', 'PS'],
  PS: ['IL', 'JO', 'EG'],
  LB: ['SY', 'IL'],
  SA: ['JO', 'IQ', 'KW', 'BH', 'QA', 'AE', 'OM', 'YE'],
  KW: ['IQ', 'SA'],
  BH: ['SA', 'QA'],
  QA: ['SA', 'BH', 'AE'],
  AE: ['SA', 'OM'],
  OM: ['SA', 'AE', 'YE'],
  YE: ['SA', 'OM'],
  KZ: ['RU', 'CN', 'KG', 'UZ', 'TM'],
  KG: ['CN', 'KZ', 'UZ', 'TJ'],
  UZ: ['KZ', 'KG', 'TJ', 'AF', 'TM'],
  TJ: ['CN', 'KG', 'UZ', 'AF'],
  TM: ['KZ', 'UZ', 'AF', 'IR'],
  GE: ['RU', 'AZ', 'AM', 'TR'],
  AZ: ['RU', 'GE', 'AM', 'IR', 'TR'],
  AM: ['GE', 'AZ', 'IR', 'TR'],

  // Americas
  US: ['CA', 'MX'],
  CA: ['US'],
  MX: ['US', 'GT', 'BZ'],
  GT: ['MX', 'BZ', 'HN', 'SV'],
  BZ: ['MX', 'GT'],
  HN: ['GT', 'SV', 'NI'],
  SV: ['GT', 'HN'],
  NI: ['HN', 'CR'],
  CR: ['NI', 'PA'],
  PA: ['CR', 'CO'],
  CU: [''],
  DO: ['HT'],
  HT: ['DO'],
  JM: [''],
  PR: [''],

  // South America
  CO: ['PA', 'EC', 'PE', 'BR', 'VE'],
  VE: ['CO', 'BR', 'GY'],
  EC: ['CO', 'PE'],
  PE: ['EC', 'CO', 'BR', 'BO', 'CL'],
  BR: ['CO', 'VE', 'GY', 'SR', 'GF', 'PE', 'BO', 'PY', 'AR', 'UY'],
  BO: ['PE', 'CL', 'AR', 'PY', 'BR'],
  PY: ['BO', 'AR', 'BR'],
  AR: ['CL', 'BO', 'PY', 'BR', 'UY'],
  CL: ['PE', 'BO', 'AR'],
  UY: ['AR', 'BR'],
  GY: ['VE', 'BR', 'SR'],
  SR: ['GY', 'BR', 'GF'],
  GF: ['BR', 'SR'],

  // Oceania
  AU: ['PG', 'ID', 'NZ', 'SB', 'VU', 'NC'],
  NZ: ['AU'],
  PG: ['ID', 'AU', 'SB'],
  FJ: [''],
  SB: ['PG', 'VU', 'AU'],
  VU: ['SB', 'NC', 'AU'],
  NC: ['AU', 'VU', 'SB'],
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  COUNTRY METADATA                                                           */
/*  Maps country codes to continent and other useful metadata.                */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface CountryInfo {
  name: string;
  continent: string;
  currency?: string;
  language?: string;
  timezone?: string;
  requiresVisa?: boolean;
  requiresPassport?: boolean;
  requiresVaccination?: string[];
}

const COUNTRY_METADATA: Record<string, CountryInfo> = {
  UG: { name: 'Uganda', continent: 'Africa', currency: 'UGX', language: 'English, Swahili', timezone: 'UTC+3' },
  KE: { name: 'Kenya', continent: 'Africa', currency: 'KES', language: 'English, Swahili', timezone: 'UTC+3' },
  TZ: { name: 'Tanzania', continent: 'Africa', currency: 'TZS', language: 'English, Swahili', timezone: 'UTC+3' },
  RW: { name: 'Rwanda', continent: 'Africa', currency: 'RWF', language: 'English, Kinyarwanda', timezone: 'UTC+2' },
  BI: { name: 'Burundi', continent: 'Africa', currency: 'BIF', language: 'Kirundi, French', timezone: 'UTC+2' },
  SS: { name: 'South Sudan', continent: 'Africa', currency: 'SSP', language: 'English', timezone: 'UTC+2' },
  CD: { name: 'DRC', continent: 'Africa', currency: 'CDF', language: 'French', timezone: 'UTC+1/2' },
  ET: { name: 'Ethiopia', continent: 'Africa', currency: 'ETB', language: 'Amharic', timezone: 'UTC+3' },
  SO: { name: 'Somalia', continent: 'Africa', currency: 'SOS', language: 'Somali', timezone: 'UTC+3' },
  ZA: { name: 'South Africa', continent: 'Africa', currency: 'ZAR', language: '11 Official', timezone: 'UTC+2' },
  NG: { name: 'Nigeria', continent: 'Africa', currency: 'NGN', language: 'English', timezone: 'UTC+1' },
  GH: { name: 'Ghana', continent: 'Africa', currency: 'GHS', language: 'English', timezone: 'UTC+0' },
  EG: { name: 'Egypt', continent: 'Africa', currency: 'EGP', language: 'Arabic', timezone: 'UTC+2' },
  MA: { name: 'Morocco', continent: 'Africa', currency: 'MAD', language: 'Arabic, Berber', timezone: 'UTC+1' },

  // Europe
  GB: { name: 'United Kingdom', continent: 'Europe', currency: 'GBP', language: 'English', timezone: 'UTC+0' },
  FR: { name: 'France', continent: 'Europe', currency: 'EUR', language: 'French', timezone: 'UTC+1' },
  DE: { name: 'Germany', continent: 'Europe', currency: 'EUR', language: 'German', timezone: 'UTC+1' },
  IT: { name: 'Italy', continent: 'Europe', currency: 'EUR', language: 'Italian', timezone: 'UTC+1' },
  ES: { name: 'Spain', continent: 'Europe', currency: 'EUR', language: 'Spanish', timezone: 'UTC+1' },
  NL: { name: 'Netherlands', continent: 'Europe', currency: 'EUR', language: 'Dutch', timezone: 'UTC+1' },
  CH: { name: 'Switzerland', continent: 'Europe', currency: 'CHF', language: 'German, French, Italian', timezone: 'UTC+1' },
  SE: { name: 'Sweden', continent: 'Europe', currency: 'SEK', language: 'Swedish', timezone: 'UTC+1' },
  NO: { name: 'Norway', continent: 'Europe', currency: 'NOK', language: 'Norwegian', timezone: 'UTC+1' },
  DK: { name: 'Denmark', continent: 'Europe', currency: 'DKK', language: 'Danish', timezone: 'UTC+1' },
  FI: { name: 'Finland', continent: 'Europe', currency: 'EUR', language: 'Finnish', timezone: 'UTC+2' },
  PT: { name: 'Portugal', continent: 'Europe', currency: 'EUR', language: 'Portuguese', timezone: 'UTC+0' },
  IE: { name: 'Ireland', continent: 'Europe', currency: 'EUR', language: 'English, Irish', timezone: 'UTC+0' },
  PL: { name: 'Poland', continent: 'Europe', currency: 'PLN', language: 'Polish', timezone: 'UTC+1' },
  CZ: { name: 'Czech Republic', continent: 'Europe', currency: 'CZK', language: 'Czech', timezone: 'UTC+1' },
  AT: { name: 'Austria', continent: 'Europe', currency: 'EUR', language: 'German', timezone: 'UTC+1' },
  HU: { name: 'Hungary', continent: 'Europe', currency: 'HUF', language: 'Hungarian', timezone: 'UTC+1' },
  GR: { name: 'Greece', continent: 'Europe', currency: 'EUR', language: 'Greek', timezone: 'UTC+2' },
  TR: { name: 'Turkey', continent: 'Europe/Asia', currency: 'TRY', language: 'Turkish', timezone: 'UTC+3' },
  RU: { name: 'Russia', continent: 'Europe/Asia', currency: 'RUB', language: 'Russian', timezone: 'UTC+3' },
  UA: { name: 'Ukraine', continent: 'Europe', currency: 'UAH', language: 'Ukrainian', timezone: 'UTC+2' },
  RO: { name: 'Romania', continent: 'Europe', currency: 'RON', language: 'Romanian', timezone: 'UTC+2' },
  BE: { name: 'Belgium', continent: 'Europe', currency: 'EUR', language: 'Dutch, French, German', timezone: 'UTC+1' },

  // Asia
  CN: { name: 'China', continent: 'Asia', currency: 'CNY', language: 'Chinese', timezone: 'UTC+8' },
  IN: { name: 'India', continent: 'Asia', currency: 'INR', language: 'Hindi, English', timezone: 'UTC+5:30' },
  JP: { name: 'Japan', continent: 'Asia', currency: 'JPY', language: 'Japanese', timezone: 'UTC+9' },
  KR: { name: 'South Korea', continent: 'Asia', currency: 'KRW', language: 'Korean', timezone: 'UTC+9' },
  SG: { name: 'Singapore', continent: 'Asia', currency: 'SGD', language: 'English, Chinese, Malay', timezone: 'UTC+8' },
  MY: { name: 'Malaysia', continent: 'Asia', currency: 'MYR', language: 'Malay', timezone: 'UTC+8' },
  TH: { name: 'Thailand', continent: 'Asia', currency: 'THB', language: 'Thai', timezone: 'UTC+7' },
  VN: { name: 'Vietnam', continent: 'Asia', currency: 'VND', language: 'Vietnamese', timezone: 'UTC+7' },
  ID: { name: 'Indonesia', continent: 'Asia', currency: 'IDR', language: 'Indonesian', timezone: 'UTC+7' },
  PH: { name: 'Philippines', continent: 'Asia', currency: 'PHP', language: 'Filipino, English', timezone: 'UTC+8' },
  AE: { name: 'UAE', continent: 'Asia', currency: 'AED', language: 'Arabic', timezone: 'UTC+4' },
  SA: { name: 'Saudi Arabia', continent: 'Asia', currency: 'SAR', language: 'Arabic', timezone: 'UTC+3' },
  IL: { name: 'Israel', continent: 'Asia', currency: 'ILS', language: 'Hebrew, Arabic', timezone: 'UTC+2' },
  PK: { name: 'Pakistan', continent: 'Asia', currency: 'PKR', language: 'Urdu, English', timezone: 'UTC+5' },
  BD: { name: 'Bangladesh', continent: 'Asia', currency: 'BDT', language: 'Bengali', timezone: 'UTC+6' },
  LK: { name: 'Sri Lanka', continent: 'Asia', currency: 'LKR', language: 'Sinhala, Tamil', timezone: 'UTC+5:30' },
  NP: { name: 'Nepal', continent: 'Asia', currency: 'NPR', language: 'Nepali', timezone: 'UTC+5:45' },
  IR: { name: 'Iran', continent: 'Asia', currency: 'IRR', language: 'Persian', timezone: 'UTC+3:30' },
  IQ: { name: 'Iraq', continent: 'Asia', currency: 'IQD', language: 'Arabic, Kurdish', timezone: 'UTC+3' },
  KZ: { name: 'Kazakhstan', continent: 'Asia', currency: 'KZT', language: 'Kazakh, Russian', timezone: 'UTC+5' },

  // Americas
  US: { name: 'United States', continent: 'North America', currency: 'USD', language: 'English', timezone: 'UTC-5' },
  CA: { name: 'Canada', continent: 'North America', currency: 'CAD', language: 'English, French', timezone: 'UTC-5' },
  MX: { name: 'Mexico', continent: 'North America', currency: 'MXN', language: 'Spanish', timezone: 'UTC-6' },
  BR: { name: 'Brazil', continent: 'South America', currency: 'BRL', language: 'Portuguese', timezone: 'UTC-3' },
  AR: { name: 'Argentina', continent: 'South America', currency: 'ARS', language: 'Spanish', timezone: 'UTC-3' },
  CO: { name: 'Colombia', continent: 'South America', currency: 'COP', language: 'Spanish', timezone: 'UTC-5' },
  CL: { name: 'Chile', continent: 'South America', currency: 'CLP', language: 'Spanish', timezone: 'UTC-4' },
  PE: { name: 'Peru', continent: 'South America', currency: 'PEN', language: 'Spanish', timezone: 'UTC-5' },

  // Oceania
  AU: { name: 'Australia', continent: 'Oceania', currency: 'AUD', language: 'English', timezone: 'UTC+10' },
  NZ: { name: 'New Zealand', continent: 'Oceania', currency: 'NZD', language: 'English, Maori', timezone: 'UTC+12' },
  FJ: { name: 'Fiji', continent: 'Oceania', currency: 'FJD', language: 'English, Fijian', timezone: 'UTC+12' },
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CLASSIFICATION INPUT / RESULT                                              */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface ClassificationInput {
  originCountry: string;       // ISO 3166-1 alpha-2 country code
  destinationCountry: string;  // ISO 3166-1 alpha-2 country code
  originCity?: string;
  destinationCity?: string;
  originDistrict?: string;
  destinationDistrict?: string;
}

export interface ClassificationResult {
  tripType: TripType;
  originCountry: string;
  destinationCountry: string;
  originCountryInfo: CountryInfo | null;
  destinationCountryInfo: CountryInfo | null;
  isSameCountry: boolean;
  isNeighboringCountry: boolean;
  sameContinent: boolean;
  distance?: number; // estimated in km
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CLASSIFICATION CACHE                                                       */
/*  Caches trip type results to avoid re-computation.                         */
/* ════════════════════════════════════════════════════════════════════════════ */

const classificationCache = new Map<string, ClassificationResult>();

function getCacheKey(input: ClassificationInput): string {
  return `${input.originCountry}:${input.destinationCountry}:${input.originCity || ''}:${input.destinationCity || ''}`;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRIP CLASSIFICATION SERVICE                                                */
/* ════════════════════════════════════════════════════════════════════════════ */

export const TripClassificationService = {
  /**
   * Classify a journey based on origin and destination.
   * This is the primary entry point for all trip type determination.
   *
   * Classification Rules:
   *   LOCAL        → Same country (same city, district, or country)
   *   REGIONAL     → Neighboring countries
   *   INTERNATIONAL → Different continent or non-neighboring country
   */
  classify(input: ClassificationInput): ClassificationResult {
    const cacheKey = getCacheKey(input);
    const cached = classificationCache.get(cacheKey);
    if (cached) return cached;

    const originCountry = input.originCountry.toUpperCase();
    const destinationCountry = input.destinationCountry.toUpperCase();

    const originInfo = COUNTRY_METADATA[originCountry] || null;
    const destinationInfo = COUNTRY_METADATA[destinationCountry] || null;

    const isSameCountry = originCountry === destinationCountry;
    const isNeighboring = this.areNeighbors(originCountry, destinationCountry);
    const sameContinent = originInfo?.continent === destinationInfo?.continent;

    let tripType: TripType;

    if (isSameCountry) {
      tripType = TripType.LOCAL;
    } else if (isNeighboring) {
      tripType = TripType.REGIONAL;
    } else {
      tripType = TripType.INTERNATIONAL;
    }

    const result: ClassificationResult = {
      tripType,
      originCountry,
      destinationCountry,
      originCountryInfo: originInfo,
      destinationCountryInfo: destinationInfo,
      isSameCountry,
      isNeighboringCountry: isNeighboring,
      sameContinent,
    };

    // Cache the result
    classificationCache.set(cacheKey, result);

    console.log('[TripClassificationService]', {
      from: originCountry,
      to: destinationCountry,
      type: tripType,
      isNeighboring,
      sameContinent,
    });

    return result;
  },

  /**
   * Check if two countries are neighbors.
   */
  areNeighbors(countryA: string, countryB: string): boolean {
    const a = countryA.toUpperCase();
    const b = countryB.toUpperCase();
    if (a === b) return false;
    const neighbors = NEIGHBORING_COUNTRIES[a];
    if (!neighbors) return false;
    return neighbors.includes(b);
  },

  /**
   * Get country metadata by ISO code.
   */
  getCountryInfo(countryCode: string): CountryInfo | null {
    return COUNTRY_METADATA[countryCode.toUpperCase()] || null;
  },

  /**
   * Get all neighboring countries for a given country.
   */
  getNeighbors(countryCode: string): string[] {
    return NEIGHBORING_COUNTRIES[countryCode.toUpperCase()] || [];
  },

  /**
   * Get continent for a country code.
   */
  getContinent(countryCode: string): string | null {
    const info = COUNTRY_METADATA[countryCode.toUpperCase()];
    return info?.continent || null;
  },

  /**
   * Clear the classification cache.
   */
  clearCache(): void {
    classificationCache.clear();
  },

  /**
   * Get the TripType enum for reference.
   */
  TripType,
};

export default TripClassificationService;