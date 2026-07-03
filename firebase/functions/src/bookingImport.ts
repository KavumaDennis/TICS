/**
 * Booking Import Engine for TICS
 * ────────────────────────────────
 * Parses booking confirmations from travel aggregators like Expedia, Booking.com,
 * Kayak, Skyscanner, etc. Supports structured HTML and text formats.
 */

import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface BookingProvider {
  name: string;
  type: 'ota' | 'airline' | 'hotel' | 'rail' | 'other';
  domains: string[];
}

export interface ParsedBookingData {
  title: string;
  from: string;
  to: string;
  departureTime: string; // ISO
  arrivalTime: string;   // ISO
  airline?: string;
  flightNumber?: string;
  bookingReference?: string;
  confirmationNumber?: string;
  provider: string;
  providerType: BookingProvider['type'];
  hotelName?: string;
  hotelAddress?: string;
  checkIn?: string;
  checkOut?: string;
  passengers?: number;
  totalPrice?: string;
  currency?: string;
  rawData?: Record<string, unknown>;
}

/* ─── Known Booking Providers ─────────────────────────────────────────────── */

const BOOKING_PROVIDERS: BookingProvider[] = [
  { name: 'Expedia', type: 'ota', domains: ['expedia.com', 'expedia.co.uk', 'expedia.com.au'] },
  { name: 'Booking.com', type: 'ota', domains: ['booking.com'] },
  { name: 'Kayak', type: 'ota', domains: ['kayak.com', 'kayak.co.uk'] },
  { name: 'Skyscanner', type: 'ota', domains: ['skyscanner.net', 'skyscanner.com'] },
  { name: 'Priceline', type: 'ota', domains: ['priceline.com'] },
  { name: 'Orbitz', type: 'ota', domains: ['orbitz.com'] },
  { name: 'Travelocity', type: 'ota', domains: ['travelocity.com'] },
  { name: 'CheapOair', type: 'ota', domains: ['cheapoair.com'] },
  { name: 'Hotels.com', type: 'ota', domains: ['hotels.com'] },
  { name: 'TripAdvisor', type: 'ota', domains: ['tripadvisor.com'] },
  { name: 'LastMinute', type: 'ota', domains: ['lastminute.com'] },
  { name: 'GoToGate', type: 'ota', domains: ['gotogate.com'] },
  { name: 'MyTrip', type: 'ota', domains: ['mytrip.com'] },
  { name: 'eDreams', type: 'ota', domains: ['edreams.com', 'edreams.net'] },
  { name: 'Opodo', type: 'ota', domains: ['opodo.com', 'opodo.co.uk'] },
  { name: 'Kiwi.com', type: 'ota', domains: ['kiwi.com'] },
  { name: 'Google Flights', type: 'ota', domains: ['google.com/travel', 'google.flights'] },
];

/* ─── Booking Data Patterns ───────────────────────────────────────────────── */

// Flight segments in booking confirmations
const FLIGHT_SEGMENT_REGEX = /(?:flight|segment|leg|departure|outbound|going\s+there)\s*(?::|#)?\s*(\d+)?/gi;

// Confirmation number / booking ID patterns
const CONFIRMATION_REGEX = /(?:confirmation\s*(?:#|number|code|id|no\.?|no)?|booking\s*(?:ref|reference|code|id|no\.?|no)?)\s*:?\s*([A-Z0-9]{5,8})\b/i;

// Total price patterns
const PRICE_REGEX = /(?:total|price|amount|cost|paid|charged)\s*(?::|\s)\s*(?:USD|EUR|GBP|KES|RWF|UGX|TZS|ZAR)?\s*\$?([0-9,]+(?:\.[0-9]{1,2})?)/i;

// Passenger count
const PASSENGER_REGEX = /(?:passenger|traveler|guest|adult|pax)\s*(?:s|es)?\s*(?::|\s)\s*(\d+)/i;

// Hotel check-in/check-out
const CHECK_IN_REGEX = /\bcheck[- ]?in\s*(?::|date)?\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/i;
const CHECK_OUT_REGEX = /\bcheck[- ]?out\s*(?::|date)?\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/i;

// Hotel name patterns
const HOTEL_NAME_REGEX = /\bhotel\s*(?::|name)?\s*([A-Za-z0-9\s&'-]+?)(?:,|\.|\sat\s|\son\s|\sin\s|\s-|\s–|$)/i;

// Itinerary/route patterns
const ROUTE_PATTERN = /(?:from|departing|leaving)\s+([A-Za-z\s-]+?)\s*(?:to|for|arriving|-\s*>|→|➡️)\s+([A-Za-z\s-]+?)(?:\s+(?:on|at|,)|$)/i;

const ROUTE_PATTERN_SYMBOL = /([A-Za-z\s-]+?)\s*(?:[→➡️>])\s*([A-Za-z\s-]+)/i;

// Date ranges: "March 15-18, 2026" or "15-18 Mar 2026"
const DATE_RANGE_REGEX = /(\d{1,2})\s*(?:[-–])\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i;
const DATE_RANGE_MONTH_FIRST_REGEX = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s*(?:[-–])\s*(\d{1,2}),?\s*(\d{4})\b/i;

/* ─── Provider Detection ──────────────────────────────────────────────────── */

export function detectProvider(subject: string, body: string, fromEmail?: string): BookingProvider | undefined {
  const text = `${subject}\n${body}\n${fromEmail ?? ''}`.toLowerCase();

  for (const provider of BOOKING_PROVIDERS) {
    // Check by domain in email address or body
    if (fromEmail && provider.domains.some((d) => fromEmail!.toLowerCase().includes(d))) {
      return provider;
    }
    if (provider.domains.some((d) => text.includes(d))) {
      return provider;
    }
  }

  // Extended: detect by known sender patterns
  const senderPatterns: Array<{ name: string; type: BookingProvider['type']; pattern: RegExp }> = [
    { name: 'Expedia', type: 'ota', pattern: /@expedia/i },
    { name: 'Booking.com', type: 'ota', pattern: /@booking\.com/i },
    { name: 'Skyscanner', type: 'ota', pattern: /@skyscanner/i },
    { name: 'PayPal', type: 'other', pattern: /@paypal/i },
    { name: 'Stripe', type: 'other', pattern: /@stripe/i },
  ];

  for (const sp of senderPatterns) {
    if (sp.pattern.test(text)) {
      return { name: sp.name, type: sp.type, domains: [] };
    }
  }

  return undefined;
}

/* ─── Booking Data Parsing ────────────────────────────────────────────────── */

function parseDateString(dateStr: string): Date | null {
  // Try multiple formats
  const formats = [
    // "DD Mon YYYY"
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i,
    // "Mon DD YYYY"
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i,
    // "YYYY-MM-DD"
    /^(\d{4})[-/](\d{2})[-/](\d{2})$/,
    // "DD/MM/YYYY"
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
  ];

  const trimmed = dateStr.trim();

  for (const fmt of formats) {
    const match = fmt.exec(trimmed);
    if (match) {
      try {
        if (fmt === formats[0]!) {
          return new Date(`${match[2]} ${match[1]}, ${match[3]} 12:00:00 UTC`);
        }
        if (fmt === formats[1]!) {
          return new Date(`${match[1]} ${match[2]}, ${match[3]} 12:00:00 UTC`);
        }
        if (fmt === formats[2]!) {
          return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
        }
        if (fmt === formats[3]!) {
          return new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00Z`);
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* ─── Main Parse Function ─────────────────────────────────────────────────── */

export function parseBookingConfirmation(
  subject: string,
  body: string,
  fromEmail?: string,
): ParsedBookingData | null {
  const text = `${subject}\n${body}`;
  const provider = detectProvider(subject, body, fromEmail);

  if (!provider) {
    logger.info(`parseBookingConfirmation: no known booking provider detected`);
    return null;
  }

  logger.info(`parseBookingConfirmation: detected provider=${provider.name}`);

  // Extract route/locations
  let from = 'Unknown';
  let to = 'Unknown';

  const routeMatch = ROUTE_PATTERN.exec(text) || ROUTE_PATTERN_SYMBOL.exec(text);
  if (routeMatch) {
    from = routeMatch[1]?.trim() ?? from;
    to = routeMatch[2]?.trim() ?? to;
  }

  // Extract dates
  const dateRangeMatch = DATE_RANGE_REGEX.exec(text) || DATE_RANGE_MONTH_FIRST_REGEX.exec(text);
  let departureTime: string;
  let arrivalTime: string;

  if (dateRangeMatch) {
    // Range found: "15-18 Mar 2026" or "Mar 15-18, 2026"
    if (dateRangeMatch[1] && dateRangeMatch[2] && dateRangeMatch[3] && dateRangeMatch[4]) {
      // DD-DD Mon YYYY format
      const startDay = dateRangeMatch[1]!;
      const endDay = dateRangeMatch[2]!;
      const month = dateRangeMatch[3]!;
      const year = dateRangeMatch[4]!;
      departureTime = new Date(`${month} ${startDay}, ${year} 08:00:00 UTC`).toISOString();
      arrivalTime = new Date(`${month} ${endDay}, ${year} 18:00:00 UTC`).toISOString();
    } else if (dateRangeMatch[1] && dateRangeMatch[2] && dateRangeMatch[3] && !dateRangeMatch[4]) {
      // Mon DD-DD, YYYY format
      const month = dateRangeMatch[1]!;
      const startDay = dateRangeMatch[2]!;
      const endDay = dateRangeMatch[3]!;
      // Year may be at position 4, but this pattern was caught by the MONTH_FIRST variant
      departureTime = new Date(`${month} ${startDay}, ${new Date().getFullYear()} 08:00:00 UTC`).toISOString();
      arrivalTime = new Date(`${month} ${endDay}, ${new Date().getFullYear()} 18:00:00 UTC`).toISOString();
    } else {
      // Fallback
      departureTime = new Date().toISOString();
      const arr = new Date();
      arr.setDate(arr.getDate() + 1);
      arrivalTime = arr.toISOString();
    }
  } else {
    // Try extracting individual dates
    const checkInMatch = CHECK_IN_REGEX.exec(text);
    const checkOutMatch = CHECK_OUT_REGEX.exec(text);

    if (checkInMatch) {
      const d = parseDateString(checkInMatch[1]!);
      departureTime = d ? d.toISOString() : new Date().toISOString();
    } else {
      departureTime = new Date().toISOString();
    }

    if (checkOutMatch) {
      const d = parseDateString(checkOutMatch[1]!);
      arrivalTime = d ? d.toISOString() : new Date(Date.now() + 86400000).toISOString();
    } else {
      const arr = new Date(departureTime);
      arr.setDate(arr.getDate() + 1);
      arrivalTime = arr.toISOString();
    }
  }

  // Extract confirmation number
  const confirmationMatch = CONFIRMATION_REGEX.exec(text);
  const confirmationNumber = confirmationMatch?.[1]?.toUpperCase();

  // Extract price
  const priceMatch = PRICE_REGEX.exec(text);
  const totalPrice = priceMatch?.[1] ? priceMatch[1].replace(/,/g, '') : undefined;

  // Extract passenger count
  const paxMatch = PASSENGER_REGEX.exec(text);
  const passengers = paxMatch ? parseInt(paxMatch[1]!, 10) : undefined;

  // Extract hotel name (for hotel bookings)
  const hotelMatch = HOTEL_NAME_REGEX.exec(text);
  const hotelName = hotelMatch?.[1]?.trim();

  // Extract airline from body text
  const airlineMatch = /\b(airline|carrier)\s*(?::|)\s*([A-Za-z\s]+?)(?:\s*\(|\s*,|$)/i.exec(text);
  let airline = airlineMatch?.[2]?.trim();

  // If no explicit airline, try to infer from common airline names
  if (!airline) {
    const knownAirlines = [
      'Delta', 'United', 'American', 'Southwest', 'British Airways', 'Emirates',
      'Qatar', 'Etihad', 'Turkish', 'KLM', 'Air France', 'Lufthansa',
      'Singapore', 'Cathay', 'Japan Airlines', 'JetBlue', 'Virgin',
      'Ryanair', 'EasyJet', 'Wizz Air', 'AirAsia', 'Spirit', 'Frontier',
      'Alaska', 'Air Canada', 'LATAM', 'Kenya Airways', 'Ethiopian',
    ];
    for (const al of knownAirlines) {
      if (text.toLowerCase().includes(al.toLowerCase())) {
        airline = al;
        break;
      }
    }
  }

  // Extract flight number
  const flightMatch = /\b([A-Z]{2,3})\s*(\d{1,4})\b/.exec(text);
  const flightNumber = flightMatch ? `${flightMatch[1]}${flightMatch[2]}` : undefined;

  // Build title
  const titleParts: string[] = [];
  if (provider.name) titleParts.push(provider.name);
  if (airline) titleParts.push(airline);
  if (flightNumber) titleParts.push(flightNumber);
  if (hotelName) {
    titleParts.push(`- ${hotelName}`);
  } else if (to !== 'Unknown') {
    titleParts.push(`to ${to}`);
  }
  const title = titleParts.length > 0 ? titleParts.join(' ') : `Trip via ${provider.name}`;

  return {
    title,
    from,
    to,
    departureTime,
    arrivalTime,
    airline,
    flightNumber,
    bookingReference: confirmationNumber,
    confirmationNumber,
    provider: provider.name,
    providerType: provider.type,
    hotelName,
    passengers,
    totalPrice,
    rawData: {
      subject,
      bodyPreview: body.substring(0, 300),
    },
  };
}

/* ─── Firestore Write ─────────────────────────────────────────────────────── */

export async function saveBookingImport(
  uid: string,
  booking: ParsedBookingData,
): Promise<string> {
  const tripData = {
    userId: uid,
    title: booking.title,
    from: booking.from,
    to: booking.to,
    departureTime: booking.departureTime,
    arrivalTime: booking.arrivalTime,
    airline: booking.airline ?? null,
    flightNumber: booking.flightNumber ?? null,
    bookingReference: booking.bookingReference ?? null,
    confirmationNumber: booking.confirmationNumber ?? null,
    bookingProvider: booking.provider,
    bookingProviderType: booking.providerType,
    hotelName: booking.hotelName ?? null,
    passengers: booking.passengers ?? null,
    totalPrice: booking.totalPrice ?? null,
    _bookingImport: true,
    _bookingImportSource: booking.provider,
    monitoringStatus: 'unknown',
    lastMileStatus: 'none',
    status: 'upcoming',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection('trips').add(tripData);
  return ref.id;
}