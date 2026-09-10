/**
 * countryCodes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utility for converting between country names and ISO 3166-1 alpha-2 codes.
 * Used by the JourneyCoordinatorService to derive country codes when only
 * a country name is available (e.g. from Google Places, Journey Feed, Events).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Comprehensive country name → ISO 3166-1 alpha-2 code mapping */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // East Africa
  'uganda': 'UG', 'kenya': 'KE', 'tanzania': 'TZ', 'rwanda': 'RW',
  'burundi': 'BI', 'south sudan': 'SS', 'ethiopia': 'ET', 'somalia': 'SO',
  'djibouti': 'DJ', 'eritrea': 'ER', 'sudan': 'SD',

  // Central Africa
  'democratic republic of the congo': 'CD', 'drc': 'CD', 'congo': 'CG',
  'republic of the congo': 'CG', 'gabon': 'GA', 'equatorial guinea': 'GQ',
  'cameroon': 'CM', 'central african republic': 'CF', 'chad': 'TD',

  // Southern Africa
  'south africa': 'ZA', 'namibia': 'NA', 'botswana': 'BW', 'zimbabwe': 'ZW',
  'mozambique': 'MZ', 'zambia': 'ZM', 'malawi': 'MW', 'angola': 'AO',
  'lesotho': 'LS', 'eswatini': 'SZ', 'swaziland': 'SZ',

  // West Africa
  'nigeria': 'NG', 'ghana': 'GH', "cote d'ivoire": 'CI', 'ivory coast': 'CI',
  'burkina faso': 'BF', 'mali': 'ML', 'senegal': 'SN', 'gambia': 'GM',
  'guinea': 'GN', 'guinea-bissau': 'GW', 'sierra leone': 'SL', 'liberia': 'LR',
  'benin': 'BJ', 'togo': 'TG', 'niger': 'NE', 'mauritania': 'MR',

  // North Africa
  'algeria': 'DZ', 'morocco': 'MA', 'tunisia': 'TN', 'libya': 'LY',
  'egypt': 'EG', 'western sahara': 'EH',

  // Europe
  'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB', 'scotland': 'GB',
  'wales': 'GB', 'northern ireland': 'GB', 'ireland': 'IE',
  'france': 'FR', 'germany': 'DE', 'italy': 'IT', 'spain': 'ES',
  'portugal': 'PT', 'netherlands': 'NL', 'belgium': 'BE', 'luxembourg': 'LU',
  'switzerland': 'CH', 'austria': 'AT', 'sweden': 'SE', 'norway': 'NO',
  'denmark': 'DK', 'finland': 'FI', 'iceland': 'IS', 'poland': 'PL',
  'czech republic': 'CZ', 'czechia': 'CZ', 'slovakia': 'SK', 'hungary': 'HU',
  'romania': 'RO', 'bulgaria': 'BG', 'greece': 'GR', 'turkey': 'TR',
  'russia': 'RU', 'ukraine': 'UA', 'belarus': 'BY', 'lithuania': 'LT',
  'latvia': 'LV', 'estonia': 'EE', 'moldova': 'MD', 'slovenia': 'SI',
  'croatia': 'HR', 'bosnia and herzegovina': 'BA', 'serbia': 'RS',
  'montenegro': 'ME', 'albania': 'AL', 'north macedonia': 'MK',
  'kosovo': 'XK', 'malta': 'MT', 'cyprus': 'CY', 'monaco': 'MC',
  'andorra': 'AD', 'san marino': 'SM', 'vatican city': 'VA',
  'liechtenstein': 'LI', 'georgia': 'GE', 'armenia': 'AM', 'azerbaijan': 'AZ',

  // Asia
  'china': 'CN', 'india': 'IN', 'japan': 'JP', 'south korea': 'KR',
  'korea': 'KR', 'north korea': 'KP', 'mongolia': 'MN', 'vietnam': 'VN',
  'laos': 'LA', 'cambodia': 'KH', 'thailand': 'TH', 'myanmar': 'MM',
  'burma': 'MM', 'malaysia': 'MY', 'singapore': 'SG', 'indonesia': 'ID',
  'philippines': 'PH', 'brunei': 'BN', 'timor-leste': 'TL', 'east timor': 'TL',
  'nepal': 'NP', 'bhutan': 'BT', 'bangladesh': 'BD', 'sri lanka': 'LK',
  'maldives': 'MV', 'pakistan': 'PK', 'afghanistan': 'AF', 'iran': 'IR',
  'iraq': 'IQ', 'syria': 'SY', 'jordan': 'JO', 'israel': 'IL',
  'lebanon': 'LB', 'palestine': 'PS', 'saudi arabia': 'SA',
  'united arab emirates': 'AE', 'uae': 'AE', 'qatar': 'QA', 'kuwait': 'KW',
  'bahrain': 'BH', 'oman': 'OM', 'yemen': 'YE', 'kazakhstan': 'KZ',
  'kyrgyzstan': 'KG', 'uzbekistan': 'UZ', 'tajikistan': 'TJ',
  'turkmenistan': 'TM', 'taiwan': 'TW', 'hong kong': 'HK', 'macau': 'MO',

  // Americas
  'united states': 'US', 'usa': 'US', 'america': 'US', 'canada': 'CA',
  'mexico': 'MX', 'guatemala': 'GT', 'belize': 'BZ', 'honduras': 'HN',
  'el salvador': 'SV', 'nicaragua': 'NI', 'costa rica': 'CR', 'panama': 'PA',
  'cuba': 'CU', 'dominican republic': 'DO', 'haiti': 'HT', 'jamaica': 'JM',
  'puerto rico': 'PR', 'trinidad and tobago': 'TT', 'bahamas': 'BS',
  'barbados': 'BB', 'grenada': 'GD', 'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC', 'antigua and barbuda': 'AG',
  'dominica': 'DM', 'saint kitts and nevis': 'KN',

  // South America
  'brazil': 'BR', 'argentina': 'AR', 'chile': 'CL', 'colombia': 'CO',
  'peru': 'PE', 'venezuela': 'VE', 'ecuador': 'EC', 'bolivia': 'BO',
  'paraguay': 'PY', 'uruguay': 'UY', 'guyana': 'GY', 'suriname': 'SR',
  'french guiana': 'GF',

  // Oceania
  'australia': 'AU', 'new zealand': 'NZ', 'fiji': 'FJ', 'papua new guinea': 'PG',
  'solomon islands': 'SB', 'vanuatu': 'VU', 'new caledonia': 'NC',
  'samoa': 'WS', 'tonga': 'TO', 'kiribati': 'KI', 'marshall islands': 'MH',
  'micronesia': 'FM', 'palau': 'PW', 'nauru': 'NR', 'tuvalu': 'TV',

  // Other
  'greenland': 'GL', 'bermuda': 'BM', 'falkland islands': 'FK',
};

/**
 * Convert a country name to its ISO 3166-1 alpha-2 code.
 * Case-insensitive. Returns null if no match found.
 */
export function countryNameToCode(countryName: string | null | undefined): string | null {
  if (!countryName) return null;
  const normalized = countryName.trim().toLowerCase();
  if (!normalized) return null;

  // Direct lookup
  if (COUNTRY_NAME_TO_CODE[normalized]) {
    return COUNTRY_NAME_TO_CODE[normalized];
  }

  // Try partial match (e.g. "United States of America" → "US")
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return code;
    }
  }

  return null;
}

/**
 * Resolve a country code from a destination-like object.
 * Checks countryCode first, then derives from country name.
 */
export function resolveCountryCode(
  countryCode: string | null | undefined,
  countryName: string | null | undefined
): string | null {
  // If we already have a valid 2-letter code, use it
  if (countryCode && /^[A-Za-z]{2}$/.test(countryCode.trim())) {
    return countryCode.trim().toUpperCase();
  }

  // Otherwise try to derive from the country name
  return countryNameToCode(countryName);
}