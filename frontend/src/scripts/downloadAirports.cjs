/**
 * downloadAirports.cjs — downloads the latest OurAirports dataset and compiles it
 * into a compressed JSON file stored at assets/airports.json
 *
 * Usage:
 *   node src/scripts/downloadAirports.cjs
 *
 * The output file contains only airports with valid IATA codes, in a compact
 * format suitable for mobile app bundling.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUR_AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const COUNTRIES_URL = 'https://davidmegginson.github.io/ourairports-data/countries.csv';
const OUTPUT_FILE = path.resolve(__dirname, '../../assets/airports.json');
const TS_FILE = path.resolve(__dirname, '../data/airports.ts');

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function fetchCountryNames() {
  const countryNames = {};
  try {
    const data = await downloadFile(COUNTRIES_URL);
    const lines = data.split('\n');

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length >= 3) {
        const code = parts[0]?.replace(/"/g, '').trim();
        const name = parts[2]?.replace(/"/g, '').trim();
        if (code && name) {
          countryNames[code] = name;
        }
      }
    }
    console.log(`[Airports] Loaded ${Object.keys(countryNames).length} country names`);
  } catch (e) {
    console.warn('[Airports] Failed to fetch country names, using codes as fallback');
  }
  return countryNames;
}

async function main() {
  console.log('[Airports] Fetching OurAirports dataset...');

  // First fetch country names
  const COUNTRY_NAMES = await fetchCountryNames();

  // Download airport data
  const csvData = await downloadFile(OUR_AIRPORTS_URL);
  const lines = csvData.split('\n');
  console.log(`[Airports] Downloaded ${lines.length} rows`);

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]);
  const colIndex = (name) => header.findIndex((h) => h.replace(/"/g, '').trim() === name);

  const colType = colIndex('type');
  const colName = colIndex('name');
  const colLat = colIndex('latitude_deg');
  const colLng = colIndex('longitude_deg');
  const colMunicipality = colIndex('municipality');
  const colIsoCountry = colIndex('iso_country');
  const colIata = colIndex('iata_code');
  const colGps = colIndex('gps_code');

  console.log(`[Airports] Column indices: type=${colType}, name=${colName}, lat=${colLat}, lng=${colLng}, municipality=${colMunicipality}, iso_country=${colIsoCountry}, iata=${colIata}, gps=${colGps}`);

  const airports = [];
  let skippedNoIata = 0;
  let skippedBadType = 0;
  let skippedNoName = 0;

  // Only include airport types that are useful for commercial travel
  const validTypes = new Set([
    'large_airport',
    'medium_airport',
    'small_airport',
  ]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCSVLine(line);

    const iata = parts[colIata]?.replace(/"/g, '').trim() || '';
    if (!iata) {
      skippedNoIata++;
      continue;
    }

    const type = parts[colType]?.replace(/"/g, '').trim() || '';
    if (!validTypes.has(type)) {
      skippedBadType++;
      continue;
    }

    const name = parts[colName]?.replace(/"/g, '').trim() || '';
    if (!name) {
      skippedNoName++;
      continue;
    }

    const lat = parseFloat(parts[colLat]?.replace(/"/g, '').trim());
    const lng = parseFloat(parts[colLng]?.replace(/"/g, '').trim());
    if (isNaN(lat) || isNaN(lng)) continue;

    const countryCode = parts[colIsoCountry]?.replace(/"/g, '').trim() || '';
    const municipality = parts[colMunicipality]?.replace(/"/g, '').trim() || '';

    airports.push({
      i: iata,
      g: parts[colGps]?.replace(/"/g, '').trim() || '',
      n: name,
      m: municipality,
      c: countryCode,
      l: [lat, lng],
      t: type,
    });
  }

  console.log(`[Airports] Skipped (no IATA): ${skippedNoIata}`);
  console.log(`[Airports] Skipped (bad type): ${skippedBadType}`);
  console.log(`[Airports] Skipped (no name): ${skippedNoName}`);
  console.log(`[Airports] Total airports with IATA: ${airports.length}`);

  // Sort by IATA code for consistent output
  airports.sort((a, b) => a.i.localeCompare(b.i));

  // Write the compressed JSON file
  const output = JSON.stringify(airports);
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  const fileSizeKB = Math.round(output.length / 1024);
  console.log(`[Airports] Written to ${OUTPUT_FILE} (${fileSizeKB} KB, ${airports.length} airports)`);

  // Also create a TypeScript cache file for rapid loading
  const tsContent = `// Auto-generated by downloadAirports.cjs — do not edit manually
// Generated from OurAirports dataset (${new Date().toISOString()})
// Contains ${airports.length} airports with valid IATA codes

import type { AirportEntry } from '@/src/models/AirportEntry';
import airportsData from '@/assets/airports.json';

export type AirportRecord = {
  i: string;   // iata
  g: string;   // icao
  n: string;   // name
  m: string;   // municipality (city)
  c: string;   // countryCode
  l: [number, number]; // [lat, lng]
  t: string;   // type
};

const data: AirportRecord[] = airportsData as AirportRecord[];

export default data;
`;

  fs.writeFileSync(TS_FILE, tsContent, 'utf-8');
  console.log('[Airports] Done!');
}

main().catch((err) => {
  console.error('[Airports] Failed:', err);
  process.exit(1);
});