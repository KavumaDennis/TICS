/**
 * downloadAirlines.cjs — multi-source airline data pipeline
 *
 * Downloads the latest OpenFlights Airlines dataset as the base,
 * merges it with curated overrides, validates, deduplicates, sorts,
 * and writes a single compressed airlines.json for the app.
 *
 * Usage:
 *   node src/scripts/downloadAirlines.cjs
 *
 * The output file (assets/airlines.json) is backward-compatible with
 * the existing AirlineService, AirlineSelector, and TripInputScreen.
 *
 * ── Adding a new source ──────────────────────────────────────────────
 * To add another airline source, implement a loader function that
 * returns AirlineRecord[] and add it to the `sources` array in main().
 *
 *   async function loadMySource() { ... return records; }
 *   const sources = [downloadOpenFlights, loadOverrides, loadMySource];
 *
 * ── Data format ──────────────────────────────────────────────────────
 * AirlineRecord: { i: IATA, c: ICAO, n: name, o: country, s: callsign, a: active }
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Paths ───────────────────────────────────────────────────────────

const AIRLINES_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat';
const OUTPUT_FILE = path.resolve(__dirname, '../../assets/airlines.json');
const TS_FILE = path.resolve(__dirname, '../data/airlines.ts');
const OVERRIDES_FILE = path.resolve(__dirname, '../data/airlineOverrides.json');

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── Pipeline stages ─────────────────────────────────────────────────

/**
 * Stage 1: Download the OpenFlights Airlines dataset.
 * Returns AirlineRecord[].
 */
async function downloadOpenFlights() {
  console.log('[Airlines] Fetching OpenFlights Airlines dataset...');

  const csvData = await downloadFile(AIRLINES_URL);
  const lines = csvData.split('\n');
  console.log(`[Airlines] Downloaded ${lines.length} rows`);

  const airlines = [];
  let skippedNoIata = 0;
  let skippedInactive = 0;
  let skippedNoName = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCSVLine(line);
    if (parts.length < 8) continue;

    const name = (parts[1]?.trim() || '').replace(/\r$/, '');
    const iata = (parts[3]?.trim() || '').replace(/\r$/, '');
    const icao = (parts[4]?.trim() || '').replace(/\r$/, '');
    const callsign = (parts[5]?.trim() || '').replace(/\r$/, '');
    const country = (parts[6]?.trim() || '').replace(/\r$/, '');
    const active = (parts[7]?.trim() || '').replace(/\r$/, '');

    // Skip entries with no name
    if (!name) {
      skippedNoName++;
      continue;
    }

    // Skip inactive airlines
    if (active !== 'Y') {
      skippedInactive++;
      continue;
    }

    // Skip entries with neither IATA nor ICAO
    if (!iata && !icao) {
      skippedNoIata++;
      continue;
    }

    airlines.push({
      i: iata,
      c: icao,
      n: name,
      o: country,
      s: callsign,
      a: active === 'Y',
    });
  }

  console.log(`[Airlines] OpenFlights: ${airlines.length} active airlines`);
  console.log(`[Airlines]   Skipped (no name): ${skippedNoName}`);
  console.log(`[Airlines]   Skipped (inactive): ${skippedInactive}`);
  console.log(`[Airlines]   Skipped (no IATA/ICAO): ${skippedNoIata}`);

  return airlines;
}

/**
 * Stage 2: Load curated airline overrides from the local JSON file.
 * Returns AirlineRecord[].
 */
function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) {
    console.log('[Airlines] No overrides file found, skipping');
    return [];
  }

  const raw = fs.readFileSync(OVERRIDES_FILE, 'utf-8');
  const overrides = JSON.parse(raw);
  console.log(`[Airlines] Loaded ${overrides.length} override entries`);
  return overrides;
}

/**
 * Stage 3: Merge multiple airline sources into one array.
 * Later sources take priority over earlier ones for duplicates.
 */
function mergeAirlines(...sources) {
  const seen = new Map();
  const result = [];

  // Process sources in order — later sources override earlier ones
  for (const source of sources) {
    for (const airline of source) {
      // Generate a deduplication key: ICAO > IATA > Name
      const key = airline.c || airline.i || airline.n;
      if (!key) continue;

      if (seen.has(key)) {
        // Replace existing entry with the newer one (from later source)
        const idx = seen.get(key);
        result[idx] = airline;
      } else {
        seen.set(key, result.length);
        result.push(airline);
      }
    }
  }

  console.log(`[Airlines] Merged: ${result.length} unique airlines (from ${sources.reduce((s, a) => s + a.length, 0)} total entries)`);
  return result;
}

/**
 * Stage 4: Validate and clean airline records.
 * Removes entries that fail validation.
 */
function validateAirlines(airlines) {
  const valid = [];
  let removedNoName = 0;
  let removedNoCode = 0;
  let removedInactive = 0;

  for (const a of airlines) {
    // Trim whitespace and normalize
    const record = {
      i: (a.i || '').trim(),
      c: (a.c || '').trim(),
      n: (a.n || '').trim(),
      o: (a.o || '').trim(),
      s: (a.s || '').trim(),
      a: a.a === true,
    };

    // Remove entries with no name
    if (!record.n) {
      removedNoName++;
      continue;
    }

    // Remove entries with neither IATA nor ICAO
    if (!record.i && !record.c) {
      removedNoCode++;
      continue;
    }

    // Remove inactive airlines (unless explicitly kept)
    if (!record.a) {
      removedInactive++;
      continue;
    }

    valid.push(record);
  }

  if (removedNoName > 0) console.log(`[Airlines]   Removed (no name): ${removedNoName}`);
  if (removedNoCode > 0) console.log(`[Airlines]   Removed (no IATA/ICAO): ${removedNoCode}`);
  if (removedInactive > 0) console.log(`[Airlines]   Removed (inactive): ${removedInactive}`);

  return valid;
}

/**
 * Stage 5: Deduplicate airlines with a more thorough pass.
 * Priority: ICAO > IATA > Name.
 * When duplicates exist, the later entry in the array wins
 * (which means overrides take priority since they come after OpenFlights).
 */
function deduplicateAirlines(airlines) {
  const seen = new Map();
  const result = [];

  for (const a of airlines) {
    // Use ICAO as primary key, fall back to IATA, then name
    const key = a.c || a.i || a.n;
    if (!key) continue;

    if (seen.has(key)) {
      const idx = seen.get(key);
      result[idx] = a; // replace with later entry
    } else {
      seen.set(key, result.length);
      result.push(a);
    }
  }

  console.log(`[Airlines] Deduplicated: ${result.length} airlines (from ${airlines.length})`);
  return result;
}

/**
 * Stage 6: Sort airlines deterministically.
 * Primary: airline name (case-insensitive)
 * Secondary: IATA code
 */
function sortAirlines(airlines) {
  return [...airlines].sort((a, b) => {
    const nameCmp = a.n.toLowerCase().localeCompare(b.n.toLowerCase());
    if (nameCmp !== 0) return nameCmp;
    return a.i.localeCompare(b.i);
  });
}

/**
 * Stage 7: Write the compressed JSON file.
 */
function writeAirlinesJson(airlines) {
  const output = JSON.stringify(airlines);
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  const fileSizeKB = Math.round(output.length / 1024);
  console.log(`[Airlines] Written to ${OUTPUT_FILE} (${fileSizeKB} KB, ${airlines.length} airlines)`);
}

/**
 * Stage 8: Generate the TypeScript cache file for rapid loading.
 */
function generateTypeScriptCache(airlines) {
  const tsContent = `// Auto-generated by downloadAirlines.cjs — do not edit manually
// Generated from OpenFlights Airlines dataset + curated overrides (${new Date().toISOString()})
// Contains ${airlines.length} active airlines

export type AirlineRecord = {
  i: string;   // iata
  c: string;   // icao
  n: string;   // name
  o: string;   // country
  s: string;   // callsign
  a: boolean;  // active
};

import airlinesData from '@/assets/airlines.json';

const data: AirlineRecord[] = airlinesData as AirlineRecord[];

export default data;
`;

  fs.writeFileSync(TS_FILE, tsContent, 'utf-8');
  console.log(`[Airlines] TypeScript cache written to ${TS_FILE}`);
}

// ─── Main pipeline ───────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Airline Data Pipeline');
  console.log('═══════════════════════════════════════════════');

  // 1. Download OpenFlights
  const openFlights = await downloadOpenFlights();

  // 2. Load overrides
  const overrides = loadOverrides();

  // ── Add additional sources here ──────────────────────
  // Example:
  //   const anotherSource = await loadAnotherSource();
  //   const merged = mergeAirlines(openFlights, overrides, anotherSource);
  // ─────────────────────────────────────────────────────

  // 3. Merge (overrides take priority over OpenFlights)
  const merged = mergeAirlines(openFlights, overrides);

  // 4. Validate
  console.log('[Airlines] Validating...');
  const validated = validateAirlines(merged);

  // 5. Deduplicate
  const deduplicated = deduplicateAirlines(validated);

  // 6. Sort
  const sorted = sortAirlines(deduplicated);

  // 7. Write JSON
  writeAirlinesJson(sorted);

  // 8. Generate TypeScript cache
  generateTypeScriptCache(sorted);

  console.log('[Airlines] Done!');
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[Airlines] Failed:', err);
  process.exit(1);
});