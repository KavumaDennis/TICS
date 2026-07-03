/**
 * Email Sync Engine for TICS
 * ────────────────────────────
 * Parses travel confirmation emails from Gmail/Outlook to extract trip details.
 * Supports common booking email formats from airlines, Expedia, Booking.com, etc.
 */

import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface ParsedTripData {
  title: string;
  from: string;
  to: string;
  departureTime: string; // ISO
  arrivalTime: string;   // ISO
  airline?: string;
  flightNumber?: string;
  bookingReference?: string;
  source: 'gmail' | 'outlook';
  emailId?: string;
  rawSubject?: string;
  rawBody?: string;
}

/* ─── Patterns ────────────────────────────────────────────────────────────── */

// Flight number patterns: AA123, BA456, TK789, etc.
const FLIGHT_NUM_REGEX = /\b([A-Z]{2,3})\s*(\d{1,4}[A-Z]?)\b/g;

// Date patterns: "March 15, 2026", "15 Mar 2026", "2026-03-15"
const DATE_PATTERNS = [
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i,
  /\b(\d{4})-(\d{2})-(\d{2})\b/,
];

// Time patterns: "14:30", "2:30 PM", "14:30:00"
const TIME_PATTERN = /\b(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?\b/;

// Airport/city patterns: "from London (LHR)", "to JFK", "departing Nairobi"
const FROM_PATTERNS = [
  /\b(?:from|departing|leaving|outbound)\s+([A-Za-z\s-]+?)\s*(?:\(([A-Z]{3})\))?/i,
  /\b(?:from|departing|leaving|outbound)\s+([A-Za-z\s-]+?)(?:\s+at|\s+on|\s+\d|$)/i,
];

const TO_PATTERNS = [
  /\b(?:to|arriving|arrival|inbound|flying\s+to|headed\s+to|bound\s+for)\s+([A-Za-z\s-]+?)\s*(?:\(([A-Z]{3})\))?/i,
  /\b(?:to|arriving|arrival|inbound)\s+([A-Za-z\s-]+?)(?:\s+at|\s+on|\s+\d|$)/i,
];

// Airline names
const AIRLINES: Record<string, string[]> = {
  'Delta Air Lines': ['delta', 'delta air'],
  'United Airlines': ['united', 'united airlines'],
  'American Airlines': ['american', 'american airlines'],
  'Southwest Airlines': ['southwest', 'southwest airlines'],
  'British Airways': ['british airways', 'british air'],
  'Emirates': ['emirates'],
  'Qatar Airways': ['qatar airways', 'qatar'],
  'Etihad Airways': ['etihad', 'etihad airways'],
  'Turkish Airlines': ['turkish airlines', 'turkish'],
  'KLM': ['klm', 'klm royal dutch'],
  'Air France': ['air france'],
  'Lufthansa': ['lufthansa'],
  'Singapore Airlines': ['singapore airlines'],
  'Cathay Pacific': ['cathay pacific', 'cathay'],
  'Japan Airlines': ['japan airlines', 'jal'],
  'Kenya Airways': ['kenya airways'],
  'Ethiopian Airlines': ['ethiopian airlines'],
  'RwandAir': ['rwandair'],
  'Qantas': ['qantas'],
  'Ryanair': ['ryanair'],
  'EasyJet': ['easyjet', 'easy jet'],
  'Wizz Air': ['wizz air', 'wizz'],
  'AirAsia': ['airasia', 'air asia'],
  'JetBlue': ['jetblue', 'jet blue'],
  'Alaska Airlines': ['alaska airlines', 'alaska air'],
  'Spirit Airlines': ['spirit airlines', 'spirit'],
  'Frontier Airlines': ['frontier airlines', 'frontier'],
  'Virgin Atlantic': ['virgin atlantic', 'virgin'],
  'Air Canada': ['air canada'],
  'LATAM': ['latam', 'latam airlines'],
};

const AIRPORT_CODES = new Set([
  'JFK', 'LHR', 'LAX', 'ORD', 'DFW', 'ATL', 'SFO', 'MIA', 'SEA', 'BOS',
  'CDG', 'FRA', 'AMS', 'FCO', 'MAD', 'BCN', 'MUC', 'ZRH', 'IST', 'NBO',
  'EBB', 'KGL', 'DKR', 'ABV', 'LOS', 'ACC', 'NBO', 'DAR', 'ZNZ', 'MBA',
  'JRO', 'ADD', 'CAI', 'CPT', 'JNB', 'DXB', 'AUH', 'DOH', 'RST', 'SIN',
  'HKG', 'NRT', 'HND', 'PEK', 'PVG', 'ICN', 'BKK', 'DEL', 'BOM', 'SYD',
  'MEL', 'AKL', 'YYZ', 'YVR', 'MEX', 'GRU', 'EZE', 'SCL', 'LIM', 'BOG',
  'HEL', 'ARN', 'OSL', 'CPH', 'DUB', 'LIS', 'VIE', 'BRU', 'WAW', 'PRG',
  'BUD', 'ATH', 'SOF', 'BEG', 'ZAG', 'TUN', 'CMN', 'RBA', 'ALG', 'TIP',
  'MBA', 'MYD', 'LAU', 'WIL', 'NBO', 'EBB',
]);

/* ─── Email Sender Signature Matching ─────────────────────────────────────── */

const TRAVEL_SENDERS = [
  /@(?:fly)?(?:delta|united|american|southwest|british|emirates|qatar|etihad|turkish|klm|airfrance|lufthansa|singaporeair|cathaypacific|jal|kenya-airways|ethiopian|rwandair|qantas|ryanair|easyjet|wizzair|airasia|jetblue|alaskaair|spirit|frontier|virginatlantic|aircanada|latam)\.com?$/i,
  /@(?:expedia|booking|orbitz|kayak|skyscanner|priceline|hotels|tripadvisor|travelocity|cheapoair|lastminute|gotogate|mytrip)\.com?$/i,
  /@(?:google\/travel|apple\/wallet)?$/i,
  /confirm(?:ation|@)|booking@|reservation@|travel@|trips@/i,
];

const CONFIRMATION_SUBJECT_PATTERNS = [
  /\b(?:flight|booking|reservation|confirmation|itinerary|receipt|ticket|boarding|travel|trip)\b/i,
  /\b(?:confirmed|booked|reserved|scheduled|upcoming)\b/i,
  /(?:e-?ticket|eticket|booking\s+ref|pnr|locator)/i,
];

/* ─── Parsing Logic ───────────────────────────────────────────────────────── */

function extractFlightNumbers(text: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = FLIGHT_NUM_REGEX.exec(text)) !== null) {
    matches.push(`${match[1]}${match[2]}`);
  }
  return [...new Set(matches)];
}

function extractDates(text: string): Array<{ raw: string; date: Date }> {
  const results: Array<{ raw: string; date: Date }> = [];
  for (const pattern of DATE_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      try {
        let date: Date;
        if (match[0].includes('-')) {
          // YYYY-MM-DD
          date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
        } else {
          // DD Mon YYYY or Mon DD YYYY
          const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          let day: string, month: string, year: string;
          if (months.includes((match[1] ?? '').toLowerCase().substring(0, 3))) {
            month = match[1]!;
            day = match[2]!;
            year = match[3]!;
          } else {
            day = match[1]!;
            month = match[2]!;
            year = match[3]!;
          }
          date = new Date(`${month} ${day}, ${year} 12:00:00 UTC`);
        }
        if (!isNaN(date.getTime())) {
          results.push({ raw: match[0], date });
        }
      } catch {
        // skip invalid dates
      }
    }
  }
  return results;
}

function extractTimes(text: string): Array<{ raw: string; hours: number; minutes: number }> {
  const results: Array<{ raw: string; hours: number; minutes: number }> = [];
  let match: RegExpExecArray | null;
  TIME_PATTERN.lastIndex = 0;
  while ((match = TIME_PATTERN.exec(text)) !== null) {
    let hours = parseInt(match[1]!, 10);
    const minutes = parseInt(match[2]!, 10);
    const ampm = (match[3] ?? '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      results.push({ raw: match[0], hours, minutes });
    }
  }
  return results;
}

function detectAirline(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [airline, keywords] of Object.entries(AIRLINES)) {
    if (keywords.some((k) => lower.includes(k))) {
      return airline;
    }
  }
  return undefined;
}

function extractAirportCodes(text: string): string[] {
  const codes: string[] = [];
  const codeRegex = /\b([A-Z]{3})\b/g;
  let match: RegExpExecArray | null;
  while ((match = codeRegex.exec(text)) !== null) {
    if (AIRPORT_CODES.has(match[1]!)) {
      codes.push(match[1]!);
    }
  }
  return [...new Set(codes)];
}

function extractCityBeforeCode(text: string, code: string): string | undefined {
  // Look for "City (CODE)" pattern
  const pattern = new RegExp(`([A-Za-z\\s-]+?)\\s*\\(${code}\\)`, 'i');
  const match = pattern.exec(text);
  return match?.[1]?.trim();
}

function extractLocation(
  text: string,
  patterns: RegExp[],
  airportCodes: string[],
): { location: string; code?: string } {
  // Try explicit patterns first
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const location = match[1]?.trim() ?? '';
      const code = match[2]?.toUpperCase();
      if (location) return { location, code: code || undefined };
    }
  }
  // Fallback: use airport codes
  if (airportCodes.length >= 2) {
    return { location: airportCodes[0]!, code: airportCodes[0] };
  }
  return { location: 'Unknown' };
}

function normalizeTimeWithDate(dateStr: string, hours: number, minutes: number): string {
  // Parse the date and set time
  const base = new Date(dateStr);
  if (isNaN(base.getTime())) return dateStr;
  base.setUTCHours(hours, minutes, 0, 0);
  return base.toISOString();
}

/* ─── Main Parse Function ─────────────────────────────────────────────────── */

export function parseEmailContent(
  subject: string,
  body: string,
  source: 'gmail' | 'outlook',
  emailId?: string,
): ParsedTripData | null {
  const text = `${subject}\n${body}`;

  // Detect if this is a travel confirmation
  const isConfirmation = CONFIRMATION_SUBJECT_PATTERNS.some((p) => p.test(subject));
  if (!isConfirmation) return null;

  const flightNumbers = extractFlightNumbers(text);
  const dates = extractDates(text);
  const times = extractTimes(text);
  const airline = detectAirline(text);
  const airportCodes = extractAirportCodes(text);

  if (dates.length === 0) {
    logger.info(`parseEmailContent: no dates found in email "${subject}"`);
    return null;
  }

  if (flightNumbers.length === 0 && airportCodes.length < 2 && !airline) {
    logger.info(`parseEmailContent: insufficient travel data in email "${subject}"`);
    return null;
  }

  // Determine departure and arrival
  const fromResult = extractLocation(text, FROM_PATTERNS, airportCodes);
  const toResult = extractLocation(text, TO_PATTERNS, airportCodes.slice(1).length > 0 ? airportCodes.slice(1) : airportCodes);

  // Build title
  const destCity = toResult.location !== 'Unknown' ? toResult.location : (toResult.code ?? 'destination');
  const title = `Trip to ${destCity}`;

  // Build departure time: combine earliest date with earliest time
  const sortedDates = dates.sort((a, b) => a.date.getTime() - b.date.getTime());
  const departureDate = sortedDates[0]!.date.toISOString().split('T')[0]!;
  const sortedTimes = times.sort((a, b) => (a.hours * 60 + a.minutes) - (b.hours * 60 + b.minutes));

  let departureTime: string;
  let arrivalTime: string;

  if (sortedTimes.length >= 2) {
    departureTime = normalizeTimeWithDate(sortedDates[0]!.date.toISOString(), sortedTimes[0]!.hours, sortedTimes[0]!.minutes);
    arrivalTime = normalizeTimeWithDate(sortedDates[0]!.date.toISOString(), sortedTimes[1]!.hours, sortedTimes[1]!.minutes);
    // If arrival time is before departure time, assume next day
    if (new Date(arrivalTime).getTime() <= new Date(departureTime).getTime()) {
      const nextDay = new Date(sortedDates[0]!.date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      arrivalTime = normalizeTimeWithDate(nextDay.toISOString(), sortedTimes[1]!.hours, sortedTimes[1]!.minutes);
    }
  } else if (sortedTimes.length === 1) {
    departureTime = normalizeTimeWithDate(sortedDates[0]!.date.toISOString(), sortedTimes[0]!.hours, sortedTimes[0]!.minutes);
    // Assume 2h flight as default
    const arr = new Date(departureTime);
    arr.setUTCHours(arr.getUTCHours() + 2);
    arrivalTime = arr.toISOString();
  } else {
    departureTime = sortedDates[0]!.date.toISOString();
    const arr = new Date(sortedDates[0]!.date);
    arr.setUTCHours(arr.getUTCHours() + 2);
    arrivalTime = arr.toISOString();
  }

  // Multi-day: use second date if available for arrival
  if (sortedDates.length >= 2 && times.length >= 2) {
    const arrDate = sortedDates[1]!.date.toISOString().split('T')[0]!;
    arrivalTime = `${arrDate}T${String(sortedTimes[1]!.hours).padStart(2, '0')}:${String(sortedTimes[1]!.minutes).padStart(2, '0')}:00.000Z`;
  }

  // Get the flight number
  const flightNumber = flightNumbers.length > 0 ? flightNumbers[0] : undefined;

  // Build a more descriptive title
  const titleParts: string[] = [];
  if (airline) titleParts.push(airline);
  if (flightNumber) titleParts.push(flightNumber);
  if (toResult.location !== 'Unknown') titleParts.push(`to ${toResult.location}`);
  if (titleParts.length === 0) {
    titleParts.push(`Trip to ${toResult.location !== 'Unknown' ? toResult.location : (toResult.code ?? destCity)}`);
  }
  const finalTitle = titleParts.length > 0 ? titleParts.join(' ') : title;

  return {
    title: finalTitle,
    from: fromResult.code ?? fromResult.location,
    to: toResult.code ?? toResult.location,
    departureTime,
    arrivalTime,
    airline: airline,
    flightNumber: flightNumber,
    bookingReference: extractBookingReference(text),
    source,
    emailId: emailId,
    rawSubject: subject,
    rawBody: body.substring(0, 500),
  };
}

function extractBookingReference(text: string): string | undefined {
  // PNR patterns: 6-character alphanumeric
  const pnrMatch = /\b(?:PNR|booking\s*(?:ref|reference|code|number)|confirmation\s*(?:#|number|code|id))\s*[:\s]*([A-Z0-9]{5,7})\b/i.exec(text);
  if (pnrMatch) return pnrMatch[1]!.toUpperCase();

  // Generic 6-char alphanumeric patterns often found in booking confirmations
  const genericMatch = /\b(?:Booking\s*(?:Reference|Code|Number|ID)\s*:?\s*)([A-Z0-9]{5,7})\b/i.exec(text);
  if (genericMatch) return genericMatch[1]!.toUpperCase();

  return undefined;
}

/* ─── Firestore Write ─────────────────────────────────────────────────────── */

export async function saveParsedTrip(
  uid: string,
  parsedTrip: ParsedTripData,
): Promise<string> {
  const tripData = {
    userId: uid,
    title: parsedTrip.title,
    from: parsedTrip.from,
    to: parsedTrip.to,
    departureTime: parsedTrip.departureTime,
    arrivalTime: parsedTrip.arrivalTime,
    airline: parsedTrip.airline ?? null,
    flightNumber: parsedTrip.flightNumber ?? null,
    bookingReference: parsedTrip.bookingReference ?? null,
    _emailSyncSource: parsedTrip.source,
    _emailSyncId: parsedTrip.emailId ?? null,
    monitoringStatus: 'unknown',
    lastMileStatus: 'none',
    status: 'upcoming',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection('trips').add(tripData);
  return ref.id;
}