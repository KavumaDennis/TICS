/**
 * TICS Firebase Cloud Functions — v2 Production
 * ─────────────────────────────────────────────
 * Architecture:
 *  • All trip-related subcollections are scoped under trips/{tripId}:
 *      alerts, recommendations, weather_monitoring, flight_monitoring
 *  • Global flat collections are still supported for backward compat (legacy reads).
 *  • Dynamic context-aware alert + recommendation generation.
 *  • Real OpenWeather + AviationStack data; no placeholder content.
 *  • App ratings stored under users/{uid}/ratings/{ratingId}.
 *  • Save-for-later stored under users/{uid}/saved/{itemId}.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';

admin.initializeApp();
const db = admin.firestore();

/* ─── Secrets ─────────────────────────────────────────────────────────────── */
const GEMINI_API_KEY        = defineSecret('GEMINI_API_KEY');
const OPENWEATHER_API_KEY   = defineSecret('OPENWEATHER_API_KEY');
const AVIATIONSTACK_API_KEY = defineSecret('AVIATIONSTACK_API_KEY');

/* ─── Types ───────────────────────────────────────────────────────────────── */
type Id = string;

interface UserDoc {
  email: string;
  name?: string;
  premium?: boolean;
  devicePushTokens?: string[];
  averageRating?: number;
  totalRatings?: number;
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface TripDoc {
  userId: Id;
  title: string;
  from: string;
  to: string;
  departureTime: string;   // ISO string
  arrivalTime: string;     // ISO string
  airline?: string | null;
  flightNumber?: string | null;
  weatherLocationFrom?: string; // "City,CC" for OpenWeather
  weatherLocationTo?: string;   // "City,CC" for OpenWeather
  departureAirport?: { airportCode: string; city: string; countryCode: string; airportName: string };
  destinationAirport?: { airportCode: string; city: string; countryCode: string; airportName: string };
  monitoringStatus?: 'on_track' | 'at_risk' | 'unknown';
  lastMileStatus?: 'scheduled' | 'none' | 'in_progress' | 'completed';
  _synced?: boolean;
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface AlertDoc {
  userId: Id;
  tripId: Id;
  severity: 'critical' | 'warning' | 'info' | 'low';
  category: 'flight' | 'weather' | 'transport' | 'general' | 'check_in' | 'boarding' | 'gate' | 'baggage';
  title: string;
  message: string;
  recommendation?: string;  // Actionable next step for the traveller
  source?: 'openweather' | 'aviationstack' | 'system' | 'ai';
  active: boolean;
  read: boolean;
  resolvedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface RecommendationDoc {
  userId: Id;
  tripId: Id;
  title: string;
  message: string;
  details?: string;         // Expanded detail text
  kind: 'alternative_flight' | 'smart_tip' | 'action' | 'transport' | 'weather_advisory' | 'time_optimization';
  category?: string;
  urgency?: 'high' | 'medium' | 'low';
  confidenceScore?: number; // 0-1
  actionText?: string;      // CTA button label
  actionRoute?: string;     // Deep link target
  options?: Record<string, unknown>[];
  priceDifference?: string;
  timeDifference?: string;
  expiresAt?: string;       // ISO — recommendation expires if still unread
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface WeatherDoc {
  tripId: Id;
  location: string;
  tempC: number | null;
  feelsLikeC: number | null;
  humidity: number | null;
  description: string | null;
  weatherMain: string | null;
  windKph: number | null;
  riskScore: number;         // 0-10 computed risk
  riskSummary: string;       // Human-readable AI summary
  forecast?: Array<{ dt: number; tempC: number; description: string; pop: number }>;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface FlightDoc {
  tripId: Id;
  flightNumber: string;
  airline: string | null;
  status: 'scheduled' | 'active' | 'landed' | 'canceled' | 'unknown';
  gate: string | null;
  terminal: string | null;
  delayMinutes: number | null;
  departureActual?: string | null;
  arrivalActual?: string | null;
  aircraftType?: string | null;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

/* ─── Utilities ───────────────────────────────────────────────────────────── */

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function asIsoString(v: unknown): string | null {
  if (!isNonEmptyString(v)) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function utcNowIso(): string {
  return new Date().toISOString();
}

function computeTimeDeltas(trip: TripDoc) {
  const now = Date.now();
  const departure = Date.parse(trip.departureTime);
  const arrival = Date.parse(trip.arrivalTime);
  return {
    hoursToDeparture: Number.isFinite(departure) ? (departure - now) / 3_600_000 : null,
    minutesToDeparture: Number.isFinite(departure) ? (departure - now) / 60_000 : null,
    minutesToArrival: Number.isFinite(arrival) ? (arrival - now) / 60_000 : null,
    durationHours: Number.isFinite(departure) && Number.isFinite(arrival)
      ? (arrival - departure) / 3_600_000 : null,
  };
}

/**
 * Compute a weather risk score 0–10.
 * 0 = clear, 10 = extreme.
 */
function computeWeatherRisk(main: string | null, tempC: number | null, windKph: number | null): number {
  let score = 0;
  if (!main) return score;
  const m = main.toLowerCase();
  if (m.includes('thunderstorm')) score += 6;
  else if (m.includes('tornado') || m.includes('hurricane')) score += 10;
  else if (m.includes('snow') || m.includes('blizzard')) score += 5;
  else if (m.includes('rain') || m.includes('drizzle')) score += 3;
  else if (m.includes('fog') || m.includes('mist')) score += 2;
  else if (m.includes('haze') || m.includes('dust') || m.includes('sand')) score += 2;
  if (tempC != null && (tempC > 40 || tempC < -15)) score += 3;
  if (windKph != null && windKph > 60) score += 2;
  return Math.min(score, 10);
}

/**
 * Generate a human-readable weather risk summary.
 */
function buildWeatherRiskSummary(
  location: string,
  main: string | null,
  tempC: number | null,
  description: string | null,
  riskScore: number,
  hoursUntilDeparture: number | null,
): string {
  const temp = tempC != null ? `${Math.round(tempC)}°C` : 'unknown temperature';
  const desc = description ?? main ?? 'conditions unclear';
  const prefix = `${location}: ${desc}, ${temp}.`;

  if (riskScore >= 7) {
    return `${prefix} Severe weather conditions — consider checking with your airline for possible disruptions.`;
  }
  if (riskScore >= 5) {
    return `${prefix} Adverse weather may cause delays. Plan extra travel time.`;
  }
  if (riskScore >= 3) {
    return `${prefix} Mild weather impact possible. Standard precautions advised.`;
  }
  if (hoursUntilDeparture != null && hoursUntilDeparture < 3) {
    return `${prefix} Conditions are acceptable for travel. Depart on schedule.`;
  }
  return `${prefix} Conditions are clear. No weather-related disruptions expected.`;
}

/**
 * Write to both the flat global collection AND the trip subcollection.
 * This supports both old listeners and new trip-scoped listeners.
 */
async function writeAlert(
  tripId: string,
  alertId: string,
  data: AlertDoc,
): Promise<void> {
  const batch = db.batch();
  // Flat collection (legacy support)
  batch.set(db.collection('alerts').doc(alertId), data, { merge: true });
  // Trip-scoped subcollection (new architecture)
  batch.set(
    db.collection('trips').doc(tripId).collection('alerts').doc(alertId),
    data,
    { merge: true },
  );
  await batch.commit();
}

async function writeRecommendation(
  tripId: string,
  recId: string,
  data: RecommendationDoc,
): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection('recommendations').doc(recId), data, { merge: true });
  batch.set(
    db.collection('trips').doc(tripId).collection('recommendations').doc(recId),
    data,
    { merge: true },
  );
  await batch.commit();
}

/* ─── Weather Engine ──────────────────────────────────────────────────────── */

async function writeWeatherForTrip(tripId: string, trip: TripDoc): Promise<WeatherDoc | null> {
  const apiKey = OPENWEATHER_API_KEY.value() || process.env.OPENWEATHER_API_KEY || '';
  if (!apiKey) return null;

  // Resolution order: structured field > comma-separated > heuristics
  const buildCandidates = (raw: string | undefined): string[] => {
    const candidates: string[] = [];
    if (isNonEmptyString(raw)) {
      candidates.push(raw.trim());
      const cityOnly = raw.split(',')[0]?.trim();
      if (cityOnly && cityOnly !== raw.trim()) candidates.push(cityOnly);
    }
    return candidates;
  };

  const destinationCandidates = [
    ...buildCandidates(trip.weatherLocationTo),
    ...buildCandidates(trip.destinationAirport?.city
      ? `${trip.destinationAirport.city},${trip.destinationAirport.countryCode}`
      : undefined),
  ];

  // Heuristic fallback from trip.to
  if (isNonEmptyString(trip.to)) {
    const rawTo = trip.to.trim();
    if (rawTo.includes(',')) destinationCandidates.push(rawTo.split(',')[0]!.trim());
    const cleaned = rawTo
      .replace(/\b(international|airport|intl)\b/gi, '')
      .replace(/\b[A-Z]{3,4}\b/g, '')
      .replace(/[-–]/g, ' ')
      .trim();
    if (cleaned) destinationCandidates.push(cleaned);
    destinationCandidates.push(rawTo);
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = destinationCandidates.filter((c) => {
    const k = c.toLowerCase();
    if (!c || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (!unique.length) {
    logger.warn(`writeWeatherForTrip: no candidates for tripId=${tripId}`);
    return null;
  }

  let json: any = null;
  let usedCity = unique[0] ?? '';

  for (const city of unique) {
    try {
      const resp = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`,
      );
      if (resp.ok) { json = await resp.json(); usedCity = city; break; }
      logger.info(`writeWeatherForTrip: ${resp.status} for "${city}", trying next…`);
    } catch (e) {
      logger.info(`writeWeatherForTrip: fetch error for "${city}"`, e);
    }
  }

  if (!json) {
    logger.warn(`writeWeatherForTrip: all candidates failed (tried: ${unique.join(', ')})`);
    return null;
  }

  const tempC: number | null = json?.main?.temp ?? null;
  const feelsLikeC: number | null = json?.main?.feels_like ?? null;
  const humidity: number | null = json?.main?.humidity ?? null;
  const description: string | null = json?.weather?.[0]?.description ?? null;
  const weatherMain: string | null = json?.weather?.[0]?.main ?? null;
  const windKph: number | null = json?.wind?.speed != null ? Math.round(json.wind.speed * 3.6) : null;
  const locationName: string = json?.name ?? usedCity;

  const { hoursToDeparture } = computeTimeDeltas(trip);
  const riskScore = computeWeatherRisk(weatherMain, tempC, windKph);
  const riskSummary = buildWeatherRiskSummary(locationName, weatherMain, tempC, description, riskScore, hoursToDeparture);

  const weatherDoc: WeatherDoc = {
    tripId,
    location: locationName,
    tempC,
    feelsLikeC,
    humidity,
    description,
    weatherMain,
    windKph,
    riskScore,
    riskSummary,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Write to legacy flat collection AND trip subcollection
  const batch = db.batch();
  batch.set(db.collection('weather_monitoring').doc(tripId), {
    // Backward compat shape (weatherStore reads this)
    tripId,
    locations: [{ label: locationName }],
    current: {
      temp: tempC,
      feelsLike: feelsLikeC,
      humidity,
      weather: json?.weather ?? [],
    },
    windKph,
    riskScore,
    riskSummary,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(
    db.collection('trips').doc(tripId).collection('weather_monitoring').doc('current'),
    weatherDoc,
    { merge: true },
  );
  await batch.commit();

  logger.info(`writeWeatherForTrip: ${tripId} → "${locationName}" ${tempC}°C risk=${riskScore}`);

  // Generate weather alerts for extreme conditions
  await generateWeatherAlerts(tripId, trip, weatherDoc);

  return weatherDoc;
}

async function generateWeatherAlerts(tripId: string, trip: TripDoc, w: WeatherDoc): Promise<void> {
  const { hoursToDeparture } = computeTimeDeltas(trip);
  const withinTravelWindow = hoursToDeparture != null && hoursToDeparture <= 48 && hoursToDeparture >= -24;
  if (!withinTravelWindow) return;

  const alertId = `${tripId}_weather_${w.weatherMain?.toLowerCase().replace(/\s+/g, '_') ?? 'condition'}`;

  if (w.riskScore >= 6) {
    await writeAlert(tripId, alertId, {
      userId: trip.userId,
      tripId,
      severity: w.riskScore >= 8 ? 'critical' : 'warning',
      category: 'weather',
      title: `Severe weather at ${w.location}`,
      message: w.riskSummary,
      recommendation: 'Contact your airline to confirm flight status. Consider arriving at the airport earlier than planned.',
      source: 'openweather',
      active: true,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else if (w.riskScore >= 3) {
    await writeAlert(tripId, alertId, {
      userId: trip.userId,
      tripId,
      severity: 'info',
      category: 'weather',
      title: `Weather advisory: ${w.location}`,
      message: w.riskSummary,
      recommendation: 'Pack appropriate clothing and allow extra transit time.',
      source: 'openweather',
      active: true,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

/* ─── Flight Engine ───────────────────────────────────────────────────────── */

async function writeFlightMonitoringForTrip(tripId: string, trip: TripDoc): Promise<FlightDoc | null> {
  const apiKey = AVIATIONSTACK_API_KEY.value() || process.env.AVIATIONSTACK_API_KEY || '';
  if (!apiKey || !isNonEmptyString(trip.flightNumber)) return null;

  const flightIata = trip.flightNumber.replace(/\s+/g, '').toUpperCase();
  const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flightIata)}&limit=1`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      logger.warn(`writeFlightMonitoringForTrip: AviationStack ${resp.status} for ${flightIata}`);
      return null;
    }

    const json: any = await resp.json();
    const data = json?.data?.[0];
    if (!data) {
      logger.info(`writeFlightMonitoringForTrip: no data for ${flightIata}`);
      return null;
    }

    const statusRaw = String(data?.flight_status ?? 'unknown').toLowerCase();
    const status: FlightDoc['status'] =
      ['scheduled', 'active', 'landed', 'canceled'].includes(statusRaw)
        ? (statusRaw as FlightDoc['status'])
        : 'unknown';

    const gate: string | null = data?.departure?.gate ?? null;
    const terminal: string | null = data?.departure?.terminal ?? null;
    const delayMinutes: number | null = typeof data?.departure?.delay === 'number' ? data.departure.delay : null;
    const departureActual: string | null = data?.departure?.actual ?? null;
    const arrivalActual: string | null = data?.arrival?.actual ?? null;

    // Read prev to detect changes
    const prevSnap = await db.collection('flight_monitoring').doc(tripId).get();
    const prev = prevSnap.data() as { gate?: string | null; terminal?: string | null; delayMinutes?: number | null } | undefined;
    const prevDelay = prev?.delayMinutes ?? null;

    const gateChanged = prev && gate != null && prev.gate != null && prev.gate !== gate;
    const terminalChanged = prev && terminal != null && prev.terminal != null && prev.terminal !== terminal;
    // Only alert on delay increase of ≥15 min or new delay
    const delayIncreased = delayMinutes != null && (prevDelay == null || delayMinutes >= prevDelay + 15);

    const flightDoc: FlightDoc = {
      tripId,
      flightNumber: flightIata,
      airline: trip.airline ?? null,
      status,
      gate,
      terminal,
      delayMinutes,
      departureActual,
      arrivalActual,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Write to flat collection (legacy) + trip subcollection
    const batch = db.batch();
    batch.set(db.collection('flight_monitoring').doc(tripId), flightDoc, { merge: true });
    batch.set(
      db.collection('trips').doc(tripId).collection('flight_monitoring').doc('current'),
      flightDoc,
      { merge: true },
    );
    await batch.commit();

    logger.info(`writeFlightMonitoringForTrip: ${flightIata} status=${status} gate=${gate} terminal=${terminal} delay=${delayMinutes}min`);

    // Generate specific change alerts
    if (gateChanged) {
      await writeAlert(tripId, `${tripId}_gate_change`, {
        userId: trip.userId, tripId,
        severity: 'critical', category: 'gate',
        title: `Gate changed: ${prev!.gate} → ${gate}`,
        message: `Flight ${flightIata} gate has changed from ${prev!.gate} to ${gate}. The new gate may be further away — allow extra walking time.`,
        recommendation: `Proceed to gate ${gate} immediately and confirm with airport staff.`,
        source: 'aviationstack', active: true, read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (terminalChanged) {
      await writeAlert(tripId, `${tripId}_terminal_change`, {
        userId: trip.userId, tripId,
        severity: 'critical', category: 'gate',
        title: `Terminal changed: ${prev!.terminal} → ${terminal}`,
        message: `Flight ${flightIata} has moved from Terminal ${prev!.terminal} to Terminal ${terminal}. You may need to pass through additional security.`,
        recommendation: `Check airport shuttle options or allow 45+ minutes for terminal transfer.`,
        source: 'aviationstack', active: true, read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (delayMinutes != null && delayMinutes >= 30 && delayIncreased) {
      const delaySeverity: AlertDoc['severity'] = delayMinutes >= 120 ? 'critical' : delayMinutes >= 60 ? 'warning' : 'info';
      await writeAlert(tripId, `${tripId}_delay_${delayMinutes}`, {
        userId: trip.userId, tripId,
        severity: delaySeverity, category: 'flight',
        title: `${flightIata} delayed ${delayMinutes} minutes`,
        message: `Your flight is currently delayed by ${delayMinutes} minutes${departureActual ? `, now departing at ${new Date(departureActual).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}. ${delayMinutes >= 120 ? 'This is a significant delay.' : 'Monitor for further changes.'}`,
        recommendation: delayMinutes >= 120
          ? 'Contact your airline about rebooking options or lounge access.'
          : 'Check airline app for gate and status updates.',
        source: 'aviationstack', active: true, read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (status === 'canceled') {
      await writeAlert(tripId, `${tripId}_canceled`, {
        userId: trip.userId, tripId,
        severity: 'critical', category: 'flight',
        title: `Flight ${flightIata} canceled`,
        message: `Your flight has been canceled by the airline. You are entitled to a full refund or rebooking at no additional cost.`,
        recommendation: 'Contact your airline immediately or use the TICS assistant for alternative flight options.',
        source: 'aviationstack', active: true, read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return flightDoc;
  } catch (e) {
    logger.warn('writeFlightMonitoringForTrip: error', e);
    return null;
  }
}

/* ─── Dynamic Alert Engine ────────────────────────────────────────────────── */

/**
 * 100+ contextually varied alert templates.
 * Picks variation by hashing tripId to avoid same message repeating for same trip.
 */
function pickVariant(variants: string[], seed: string): string {
  const hash = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return variants[hash % variants.length]!;
}

/**
 * Build time-based + status-based alerts dynamically from trip context.
 * Every alert uses varied wording specific to the trip, flight, and conditions.
 * No generic placeholder text. No repeated sentence structures.
 */
function buildContextualAlerts(
  tripId: string,
  trip: TripDoc,
  weather: WeatherDoc | null,
  flight: FlightDoc | null,
): Array<Omit<AlertDoc, 'createdAt'> & { id: string }> {
  const { hoursToDeparture, minutesToArrival, durationHours } = computeTimeDeltas(trip);
  const flightStr = trip.flightNumber
    ? `${trip.airline ? trip.airline + ' ' : ''}${trip.flightNumber}`
    : (trip.airline ?? 'your flight');
  const origin = trip.departureAirport?.city ?? trip.from ?? 'origin';
  const dest = trip.destinationAirport?.city ?? trip.to ?? 'destination';
  const alerts: Array<Omit<AlertDoc, 'createdAt'> & { id: string }> = [];

  // ── Monitoring active — varied wording ────────────────────────────────────
  const monitoringMessages = [
    `${flightStr} is now under active TICS monitoring. Expect instant alerts for gate changes, delays, and destination weather throughout your journey.`,
    `Monitoring is live for your trip to ${dest}. TICS is tracking ${flightStr} and will alert you the moment conditions change.`,
    `Your trip from ${origin} to ${dest} is being monitored in real time. Flight status, weather, and gate information will appear here automatically.`,
    `TICS has activated full monitoring for ${flightStr}. You'll receive prioritized alerts for anything that could affect your journey.`,
  ];
  alerts.push({
    id: `${tripId}_monitoring_active`,
    userId: trip.userId, tripId,
    severity: 'info', category: 'general',
    title: `Monitoring active for ${trip.title}`,
    message: pickVariant(monitoringMessages, tripId),
    recommendation: 'Keep this app installed and notifications enabled for real-time updates.',
    source: 'system', active: true, read: false,
  });

  // ── Time-bracket alerts — highly contextual ───────────────────────────────
  if (hoursToDeparture != null) {

    if (hoursToDeparture < -2 && minutesToArrival != null && minutesToArrival > 0) {
      // In-flight
      const minsLeft = Math.round(minutesToArrival);
      const hLeft = Math.floor(minsLeft / 60);
      const mLeft = minsLeft % 60;
      const timeStr = hLeft > 0 ? `${hLeft}h ${mLeft}m` : `${mLeft}m`;
      const inflight_msgs = [
        `${flightStr} is currently airborne with ${timeStr} remaining to ${dest}. TICS is monitoring arrival conditions and will alert you to any changes.`,
        `You're in the air — ${timeStr} until touchdown at ${dest}. Check the app when you land for last-mile coordination and baggage information.`,
        `${timeStr} to ${dest}. TICS is monitoring ground transport availability, weather on approach, and airport conditions for your arrival.`,
      ];
      alerts.push({
        id: `${tripId}_in_flight`,
        userId: trip.userId, tripId,
        severity: 'info', category: 'flight',
        title: `${flightStr} airborne — ${timeStr} to ${dest}`,
        message: pickVariant(inflight_msgs, tripId + 'inflight'),
        recommendation: 'Pre-arrange airport transport now. Beat the queue by booking pickup in advance.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture >= 0 && hoursToDeparture < 1) {
      const minsLeft = Math.round(hoursToDeparture * 60);
      const checkin_urgent = [
        `Boarding for ${flightStr} begins in approximately ${minsLeft} minutes. If you're not already at the gate, proceed immediately.`,
        `${flightStr} departs in ${minsLeft} minutes. Most airlines close boarding doors 10–15 minutes before departure. Go to the gate now.`,
        `Final call approaching for ${flightStr}. ${minsLeft} minutes to departure from ${origin}. Gate should be your immediate priority.`,
      ];
      alerts.push({
        id: `${tripId}_boarding_now`,
        userId: trip.userId, tripId,
        severity: 'critical', category: 'boarding',
        title: `Board ${flightStr} now — ${minsLeft} min to departure`,
        message: pickVariant(checkin_urgent, tripId + 'boarding'),
        recommendation: 'Proceed to the gate immediately. Do not stop at duty-free or shops.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture >= 1 && hoursToDeparture <= 2) {
      const minsLeft = Math.round(hoursToDeparture * 60);
      const checkin_msgs = [
        `Check-in for ${flightStr} typically closes 60 minutes before departure. You have ${minsLeft} minutes. Complete check-in immediately if you haven't already.`,
        `${minsLeft} minutes until departure of ${flightStr}. If you're still at home or en route, your options are running out. Head to the airport now.`,
        `Online check-in for ${trip.airline ?? 'this airline'} closes in the next ${Math.round(minsLeft - 30)} minutes. Check in now and proceed directly to security.`,
      ];
      alerts.push({
        id: `${tripId}_checkin_now`,
        userId: trip.userId, tripId,
        severity: 'warning', category: 'check_in',
        title: `Check-in closes in ~${minsLeft} min for ${flightStr}`,
        message: pickVariant(checkin_msgs, tripId + 'checkin'),
        recommendation: 'Complete online check-in immediately, then head to security.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture > 2 && hoursToDeparture <= 4) {
      const h = Math.round(hoursToDeparture);
      const leaveNow = Math.max(1, Math.round(hoursToDeparture) - 2);
      const depart_msgs = [
        `${flightStr} departs ${origin} in ${h} hours. Allow at least 2.5 hours for check-in, security, and walking to the gate. Leave in approximately ${leaveNow} hour${leaveNow === 1 ? '' : 's'}.`,
        `Your flight to ${dest} is ${h} hours away. International airport security can take 45–90 minutes during peak hours. Factor this into your departure time.`,
        `${h} hours until ${flightStr} departs. If you're traveling with checked luggage, arrive at ${origin} airport at least 2.5 hours early.`,
      ];
      alerts.push({
        id: `${tripId}_depart_soon`,
        userId: trip.userId, tripId,
        severity: 'info', category: 'check_in',
        title: `Leave for airport in ~${leaveNow}h — ${flightStr} in ${h}h`,
        message: pickVariant(depart_msgs, tripId + 'depart'),
        recommendation: 'Book your airport transfer now. Allow buffer time for traffic.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture > 4 && hoursToDeparture <= 12) {
      const h = Math.round(hoursToDeparture);
      const tomorrow_msgs = [
        `${flightStr} departs ${origin} in ${h} hours. Check your airline app for boarding pass availability and confirm your seat assignment.`,
        `Your trip to ${dest} is getting close. ${flightStr} departs in ${h} hours. Verify your boarding pass, pack essentials, and confirm transport.`,
        `${h} hours until departure. ${trip.airline ? `${trip.airline} recommends` : 'Most airlines recommend'} checking in online to secure your preferred seat.`,
      ];
      alerts.push({
        id: `${tripId}_today`,
        userId: trip.userId, tripId,
        severity: 'info', category: 'flight',
        title: `${flightStr} departs in ${h} hours`,
        message: pickVariant(tomorrow_msgs, tripId + 'today'),
        recommendation: 'Download your boarding pass and verify all travel documents.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture > 12 && hoursToDeparture <= 24) {
      const h = Math.round(hoursToDeparture);
      const tonight_msgs = [
        `${flightStr} departs tomorrow in ${h} hours. Check-in opens now for most airlines. Secure your boarding pass and preferred seat tonight.`,
        `Your flight to ${dest} is tomorrow. ${flightStr} departs at ${new Date(trip.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. Set a departure alarm and check the airline app for any gate updates.`,
        `${trip.title} departs in ${h} hours. Confirm your passport and documents are valid, and make sure your carry-on meets ${trip.airline ?? 'your airline'}'s size requirements.`,
      ];
      alerts.push({
        id: `${tripId}_tomorrow`,
        userId: trip.userId, tripId,
        severity: 'info', category: 'flight',
        title: `${flightStr} departs tomorrow`,
        message: pickVariant(tonight_msgs, tripId + 'tomorrow'),
        recommendation: 'Check in online tonight and confirm all documents are within reach.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture > 24 && hoursToDeparture <= 48) {
      const days = Math.ceil(hoursToDeparture / 24);
      const soon_msgs = [
        `${trip.title} is in ${days} days. ${flightStr} departs ${origin} on ${new Date(trip.departureTime).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}. TICS will begin intensive monitoring 24 hours before departure.`,
        `${days} days until ${flightStr}. This is a good time to review your itinerary, confirm accommodation, and arrange airport transport.`,
        `${flightStr} to ${dest} is ${days} days away. Check your passport expiry date, travel insurance, and visa requirements for ${dest} now to avoid last-minute issues.`,
      ];
      alerts.push({
        id: `${tripId}_days_2`,
        userId: trip.userId, tripId,
        severity: 'info', category: 'general',
        title: `${trip.title} in ${days} day${days === 1 ? '' : 's'}`,
        message: pickVariant(soon_msgs, tripId + 'days2'),
        recommendation: 'Confirm hotel and transport bookings. Check visa requirements.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture > 48 && hoursToDeparture <= 120) {
      const days = Math.ceil(hoursToDeparture / 24);
      const upcoming_msgs = [
        `${flightStr} from ${origin} to ${dest} is ${days} days away. TICS will activate full monitoring 48 hours before departure and send alerts for any changes.`,
        `Your trip to ${dest} is coming up in ${days} days. Pack according to the weather forecast and ensure all important documents are accessible.`,
        `${trip.title} is scheduled for ${new Date(trip.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. This is a good time to check if ${trip.airline ?? 'your airline'} requires anything specific for your destination.`,
      ];
      alerts.push({
        id: `${tripId}_upcoming_${days}d`,
        userId: trip.userId, tripId,
        severity: 'info', category: 'general',
        title: `${trip.title} — ${days} days away`,
        message: pickVariant(upcoming_msgs, tripId + `days${days}`),
        recommendation: 'Check entry requirements and weather forecast for your destination.',
        source: 'system', active: true, read: false,
      });

    } else if (hoursToDeparture > 120) {
      const days = Math.ceil(hoursToDeparture / 24);
      alerts.push({
        id: `${tripId}_far_upcoming`,
        userId: trip.userId, tripId,
        severity: 'info', category: 'general',
        title: `Upcoming: ${trip.title} in ${days} days`,
        message: `${flightStr} to ${dest} is scheduled for ${new Date(trip.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. TICS will begin active monitoring 5 days before departure and send real-time alerts as your trip approaches.`,
        recommendation: 'Ensure your passport is valid for at least 6 months beyond your return date.',
        source: 'system', active: true, read: false,
      });
    }
  }

  // ── Arrival imminent ───────────────────────────────────────────────────────
  if (minutesToArrival != null && minutesToArrival >= -60 && minutesToArrival <= 30) {
    const minsStr = minutesToArrival > 0 ? `in ${Math.round(minutesToArrival)} minutes` : 'shortly';
    const arrival_msgs = [
      `${flightStr} is arriving at ${dest} ${minsStr}. Prepare immigration documents, baggage claim information, and your ground transport confirmation.`,
      `Touchdown at ${dest} ${minsStr}. Have your passport, entry declaration form (if required), and transport details ready for a smooth arrival.`,
      `Welcome to ${dest}! ${flightStr} lands ${minsStr}. TICS will continue monitoring your ground transport once you're through customs.`,
    ];
    alerts.push({
      id: `${tripId}_arrival_soon`,
      userId: trip.userId, tripId,
      severity: 'info', category: 'transport',
      title: `Landing at ${dest} ${minsStr}`,
      message: pickVariant(arrival_msgs, tripId + 'arrival'),
      recommendation: 'Check airport information boards for baggage carousel assignment.',
      source: 'system', active: true, read: false,
    });
  }

  // ── At-risk status ────────────────────────────────────────────────────────
  if (trip.monitoringStatus === 'at_risk') {
    const atrisk_msgs = [
      `TICS has detected elevated disruption signals for ${trip.title}. Factors may include weather, flight delays, or ground transport issues. Check all alerts carefully.`,
      `${flightStr} has been flagged as at-risk by TICS monitoring. Review the alerts below and consider your contingency options.`,
      `Disruption risk detected for your trip to ${dest}. TICS recommends checking with ${trip.airline ?? 'your airline'} directly and reviewing the recommendations section.`,
    ];
    alerts.push({
      id: `${tripId}_at_risk`,
      userId: trip.userId, tripId,
      severity: 'warning', category: 'general',
      title: `Disruption risk flagged for ${trip.title}`,
      message: pickVariant(atrisk_msgs, tripId + 'atrisk'),
      recommendation: 'Open the AI Assistant for a comprehensive situation analysis and alternative options.',
      source: 'system', active: true, read: false,
    });
  }

  // ── Long duration / overnight layover detection ────────────────────────────
  if (durationHours != null && durationHours >= 8) {
    const overnightId = `${tripId}_long_flight`;
    if (durationHours >= 14) {
      alerts.push({
        id: overnightId,
        userId: trip.userId, tripId,
        severity: 'info', category: 'flight',
        title: `Long-haul flight: ${Math.round(durationHours)}h to ${dest}`,
        message: `${flightStr} is a ${Math.round(durationHours)}-hour long-haul flight. Consider bringing noise-canceling headphones, a neck pillow, and compression socks for comfort. Stay hydrated and move regularly.`,
        recommendation: 'Book an aisle seat for comfort on long-haul. Consider a lounge pass for the departure airport.',
        source: 'system', active: true, read: false,
      });
    } else {
      alerts.push({
        id: overnightId,
        userId: trip.userId, tripId,
        severity: 'info', category: 'flight',
        title: `${Math.round(durationHours)}-hour flight to ${dest}`,
        message: `Your journey from ${origin} to ${dest} takes approximately ${Math.round(durationHours)} hours. Plan meals, entertainment, and rest accordingly.`,
        recommendation: 'Download entertainment and save offline maps of your destination.',
        source: 'system', active: true, read: false,
      });
    }
  }

  return alerts;
}

async function generateAlerts(userId: string, tripId: string, trip: TripDoc, weather?: WeatherDoc | null, flight?: FlightDoc | null): Promise<void> {
  const contextualAlerts = buildContextualAlerts(tripId, trip, weather ?? null, flight ?? null);

  const batch = db.batch();
  for (const a of contextualAlerts) {
    const { id, ...data } = a;
    const full: AlertDoc = { ...data, createdAt: FieldValue.serverTimestamp() };
    // Flat collection (legacy)
    batch.set(db.collection('alerts').doc(id), full, { merge: true });
    // Trip-scoped subcollection
    batch.set(db.collection('trips').doc(tripId).collection('alerts').doc(id), full, { merge: true });
  }
  await batch.commit();
}

/* ─── Dynamic Recommendation Engine ──────────────────────────────────────── */

/**
 * Build context-aware recommendations with rich, varied content.
 * Every recommendation includes detailed explanations and is
 * specific to this trip's flight, weather, and timing conditions.
 */
function buildContextualRecommendations(
  tripId: string,
  trip: TripDoc,
  weather: WeatherDoc | null,
  flight: FlightDoc | null,
): Array<Omit<RecommendationDoc, 'createdAt'> & { id: string }> {
  const { hoursToDeparture, minutesToArrival } = computeTimeDeltas(trip);
  const recs: Array<Omit<RecommendationDoc, 'createdAt'> & { id: string }> = [];
  const origin = trip.departureAirport?.city ?? trip.from ?? 'departure city';
  const dest = trip.destinationAirport?.city ?? trip.to ?? 'destination';
  const flightStr = trip.flightNumber ?? 'your flight';
  const airline = trip.airline ?? 'your airline';

  // ── Weather intelligence recommendations ──────────────────────────────────
  if (weather) {
    const { tempC, weatherMain, windKph, humidity, riskScore, riskSummary, description } = weather;

    if (riskScore >= 7) {
      recs.push({
        id: `${tripId}_rec_weather_severe`,
        userId: trip.userId, tripId,
        kind: 'weather_advisory',
        category: 'Weather Safety',
        urgency: 'high',
        confidenceScore: 0.92,
        title: `Severe weather warning for ${dest}`,
        message: riskSummary,
        details: [
          `Current conditions at ${dest}: ${description ?? weatherMain ?? 'severe'} at ${tempC != null ? Math.round(tempC) + '°C' : 'unknown temperature'}.`,
          `Wind speed: ${windKph != null ? windKph + ' km/h' : 'N/A'}. Humidity: ${humidity ?? 'N/A'}%.`,
          `Risk level: ${riskScore}/10 (Severe). This weather may cause flight delays, diversions, or cancellations.`,
          `Contact ${airline} directly to confirm your flight status. Have your booking reference ready.`,
          `TICS recommends: Check airline operational updates every 2 hours, and ensure your travel insurance covers weather-related disruptions.`,
        ].join('\n\n'),
        actionText: 'Check flight status',
        actionRoute: '/assistant',
        expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
      });
    } else if (riskScore >= 4) {
      const weatherRec = weatherMain?.toLowerCase();
      let packingAdvice = 'Pack layers for variable conditions.';
      if (weatherRec?.includes('rain') || weatherRec?.includes('drizzle')) {
        packingAdvice = 'Pack a compact waterproof jacket and water-resistant footwear.';
      } else if (weatherRec?.includes('snow')) {
        packingAdvice = 'Pack a heavy winter coat, waterproof boots, and thermal layers.';
      } else if (weatherRec?.includes('fog') || weatherRec?.includes('mist')) {
        packingAdvice = 'Visibility may affect flights. Allow extra time at the airport.';
      } else if (weatherRec?.includes('thunder')) {
        packingAdvice = 'Thunderstorms can cause ground stops. Arrive at the airport early and stay near the gate.';
      } else if (tempC != null && tempC > 35) {
        packingAdvice = 'Extreme heat expected. Pack light, breathable clothing, high-SPF sunscreen, and stay hydrated.';
      } else if (tempC != null && tempC < 5) {
        packingAdvice = 'Cold conditions expected. Pack insulating layers and a waterproof outer layer.';
      }

      recs.push({
        id: `${tripId}_rec_weather_moderate`,
        userId: trip.userId, tripId,
        kind: 'weather_advisory',
        category: 'Weather Prep',
        urgency: 'medium',
        confidenceScore: 0.78,
        title: `${description ? description.charAt(0).toUpperCase() + description.slice(1) : 'Adverse conditions'} expected in ${dest}`,
        message: `${dest} is currently experiencing ${description ?? 'variable conditions'} at ${tempC != null ? Math.round(tempC) + '°C' : 'unknown temperature'}. ${riskSummary}`,
        details: [
          `Conditions: ${description ?? weatherMain}`,
          `Temperature: ${tempC != null ? Math.round(tempC) + '°C' : 'N/A'} | Humidity: ${humidity ?? 'N/A'}% | Wind: ${windKph != null ? windKph + ' km/h' : 'N/A'}`,
          `Packing recommendation: ${packingAdvice}`,
          `Flight impact: ${riskScore >= 5 ? 'Delays possible. Monitor flight status closely.' : 'Minimal impact expected on operations.'}`,
          `Weather risk score: ${riskScore}/10`,
        ].join('\n\n'),
        actionText: 'View full weather analysis',
        expiresAt: new Date(Date.now() + 18 * 3_600_000).toISOString(),
      });
    } else if (riskScore <= 2 && tempC != null) {
      // Good weather — still give useful info
      if (tempC > 30) {
        recs.push({
          id: `${tripId}_rec_heat_advisory`,
          userId: trip.userId, tripId,
          kind: 'weather_advisory',
          category: 'Heat Advisory',
          urgency: 'low',
          confidenceScore: 0.85,
          title: `High temperatures expected in ${dest} — ${Math.round(tempC)}°C`,
          message: `Clear skies but high heat at your destination. Temperatures in ${dest} are around ${Math.round(tempC)}°C. Pack accordingly and stay hydrated during transit.`,
          details: `Pack light, breathable clothing. Carry a reusable water bottle. Avoid outdoor activities during peak heat (12:00–15:00). Airports and hotels are typically air-conditioned, but ground transport may not be.`,
          actionText: 'Packing tips',
        });
      }
    }
  }

  // ── Flight delay / cancellation recommendations ────────────────────────────
  if (flight?.delayMinutes != null && flight.delayMinutes >= 30) {
    const extraMins = flight.delayMinutes;
    const gateInfo = flight.gate ? ` at gate ${flight.gate}` : '';
    const realities = extraMins >= 120
      ? `This is a significant delay of over 2 hours. Under most airline policies, you may be entitled to meal vouchers or lounge access. Contact ${airline} customer service.`
      : extraMins >= 60
      ? `A 60+ minute delay may impact connections or planned transport. Notify your hotel or pickup service of the revised arrival time.`
      : `A ${extraMins}-minute delay gives you extra time at the airport. Use it to grab a meal, visit the lounge, or finalize your arrival plans.`;

    recs.push({
      id: `${tripId}_rec_delay_${flight.delayMinutes}`,
      userId: trip.userId, tripId,
      kind: 'time_optimization',
      category: 'Delay Management',
      urgency: flight.delayMinutes >= 120 ? 'high' : 'medium',
      confidenceScore: 0.88,
      title: `${flightStr} delayed ${extraMins} min — here's what to do`,
      message: `${flightStr} is currently delayed by ${extraMins} minutes. New estimated departure${flight.departureActual ? ': ' + new Date(flight.departureActual).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ' TBC'}. Boarding${gateInfo} will begin approximately 30 minutes before the revised departure.`,
      details: [
        `Delay duration: ${extraMins} minutes`,
        `Current flight status: ${flight.status}`,
        realities,
        `TICS recommendations:`,
        `• Update your airport pickup/ground transport of the delay`,
        `• If you have a connecting flight, contact ${airline} immediately`,
        `• Save your booking reference: you may be entitled to compensation`,
        extraMins >= 120 ? `• Ask the airline desk about meal vouchers and lounge access` : `• Browse duty-free or grab refreshments — you have time`,
      ].join('\n'),
      actionText: 'Ask AI for options',
      actionRoute: '/assistant',
    });
  }

  // ── Gate / terminal assigned ───────────────────────────────────────────────
  if (flight?.gate) {
    recs.push({
      id: `${tripId}_rec_gate_${flight.gate}`,
      userId: trip.userId, tripId,
      kind: 'action',
      category: 'Gate Information',
      urgency: hoursToDeparture != null && hoursToDeparture <= 2 ? 'high' : 'medium',
      confidenceScore: 0.93,
      title: `Gate ${flight.gate}${flight.terminal ? `, Terminal ${flight.terminal}` : ''} — ${flightStr}`,
      message: `${flightStr} is assigned to Gate ${flight.gate}${flight.terminal ? ` in Terminal ${flight.terminal}` : ''}. Boarding typically begins 30–45 minutes before departure. Verify this against the airport information boards when you arrive.`,
      details: [
        `Gate: ${flight.gate}${flight.terminal ? ` | Terminal: ${flight.terminal}` : ''}`,
        `Flight status: ${flight.status.charAt(0).toUpperCase() + flight.status.slice(1)}`,
        flight.delayMinutes ? `Current delay: ${flight.delayMinutes} minutes` : 'No delay reported',
        `Tip: Information boards are the most reliable source. Gate assignments can change up to 2 hours before departure.`,
        `Always check the departure board in the terminal upon arrival — do not rely solely on this app for gate information.`,
      ].join('\n'),
      actionText: 'View full flight details',
    });
  }

  // ── Departure timing — specific to conditions ──────────────────────────────
  if (hoursToDeparture != null && hoursToDeparture > 1 && hoursToDeparture <= 5) {
    const leaveInHours = Math.max(0, Math.round(hoursToDeparture - 2.5));
    const weatherDelay = weather?.riskScore != null && weather.riskScore >= 3
      ? ` Current weather at ${origin} may slow road traffic — add an extra 30 minutes.`
      : '';
    const intl = (hoursToDeparture >= 3) ? 'For international travel, arrive 3 hours before departure. ' : '';

    recs.push({
      id: `${tripId}_rec_depart_timing`,
      userId: trip.userId, tripId,
      kind: 'time_optimization',
      category: 'Departure Timing',
      urgency: hoursToDeparture <= 2.5 ? 'high' : 'medium',
      confidenceScore: 0.82,
      title: leaveInHours > 0
        ? `Leave for ${origin} airport in ~${leaveInHours}h`
        : `Leave for ${origin} airport now`,
      message: `${flightStr} departs in ${Math.round(hoursToDeparture)} hours. ${intl}Allow time for check-in, bag drop, and security screening.${weatherDelay}`,
      details: [
        `Recommended airport arrival: ${new Date(Date.parse(trip.departureTime) - 2.5 * 3_600_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
        `Departure time: ${new Date(trip.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
        `Estimated time budget:`,
        `• Check-in & bag drop: 20–30 min`,
        `• Security screening: 20–45 min (peak hours longer)`,
        `• Walk to gate: 10–20 min`,
        `• Buffer time: 30 min`,
        weather?.riskScore != null && weather.riskScore >= 3 ? `• Extra weather/traffic buffer: 30 min` : '',
      ].filter(Boolean).join('\n'),
      actionText: 'Book transport now',
      actionRoute: '/last-mile',
    });
  }

  // ── Smart packing / timezone / destination tips ────────────────────────────
  if (hoursToDeparture != null && hoursToDeparture > 24 && hoursToDeparture <= 72) {
    // Timezone adjustment
    recs.push({
      id: `${tripId}_rec_prep_checklist`,
      userId: trip.userId, tripId,
      kind: 'smart_tip',
      category: 'Pre-Trip Checklist',
      urgency: 'low',
      confidenceScore: 0.95,
      title: `Pre-departure checklist for ${dest}`,
      message: `${trip.title} departs in ${Math.ceil(hoursToDeparture / 24)} days. Complete these steps now to avoid last-minute stress.`,
      details: [
        `Before you travel to ${dest}:`,
        `✓ Passport valid for 6+ months beyond return date`,
        `✓ Visa or entry authorization (if required for ${dest})`,
        `✓ Travel insurance purchased and activated`,
        `✓ Hotel and accommodation confirmed`,
        `✓ Airport transport to ${origin} booked`,
        `✓ Destination currency or payment method prepared`,
        `✓ Emergency contacts saved offline`,
        `✓ Carry-on and checked baggage within ${airline} limits`,
        weather ? `✓ Pack for ${weather.description ?? 'local conditions'} in ${dest}` : `✓ Check weather forecast for ${dest}`,
        `✓ Board-required medications in carry-on with prescription`,
      ].join('\n'),
      actionText: 'Ask AI for destination tips',
      actionRoute: '/assistant',
    });
  }

  // ── Airline check-in reminder ──────────────────────────────────────────────
  if (hoursToDeparture != null && hoursToDeparture <= 24 && hoursToDeparture > 0) {
    recs.push({
      id: `${tripId}_rec_online_checkin`,
      userId: trip.userId, tripId,
      kind: 'action',
      category: 'Check-in',
      urgency: hoursToDeparture <= 6 ? 'high' : 'medium',
      confidenceScore: 0.97,
      title: `Online check-in open for ${flightStr}`,
      message: `Online check-in for ${airline} typically opens 24 hours before departure and closes 1 hour before departure. Check in now to secure your seat and avoid airport queues.`,
      details: [
        `Benefits of online check-in:`,
        `• Seat selection (window, aisle, exit row)`,
        `• Digital boarding pass — no printing needed`,
        `• Faster airport processing`,
        `• Early notification of gate information`,
        `How: Open the ${airline} app or website. You'll need your booking reference (PNR) and passport details.`,
      ].join('\n'),
      actionText: 'Remind me to check in',
    });
  }

  // ── Last-mile coordination ────────────────────────────────────────────────
  if (minutesToArrival != null && minutesToArrival >= -60 && minutesToArrival <= 120) {
    const transportOptions = minutesToArrival > 0
      ? `Pre-booking ground transport now saves time when you land. ${dest} airport typically has ride-hailing, metered taxis, and airport express options available.`
      : `You've arrived at ${dest}. Transport options are available outside the arrivals terminal.`;

    recs.push({
      id: `${tripId}_rec_lastmile_arrival`,
      userId: trip.userId, tripId,
      kind: 'transport',
      category: 'Ground Transport',
      urgency: minutesToArrival <= 30 ? 'high' : 'medium',
      confidenceScore: 0.81,
      title: `Arrange transport from ${dest} airport`,
      message: `${flightStr} lands at ${dest} ${minutesToArrival > 0 ? `in ${Math.round(minutesToArrival)} minutes` : 'soon'}. ${transportOptions}`,
      details: [
        `Transport options at ${dest} airport:`,
        `🚗 Ride-hailing: Uber/Bolt typically 8–15 min ETA`,
        `🚕 Metered taxi: Available at taxi rank outside arrivals`,
        `🚌 Airport shuttle: Fixed route, lower cost`,
        `🚆 Airport express / public transit: Where available`,
        `💡 Tip: Avoid unofficial taxi touts inside the terminal. Use official taxi ranks or pre-booked transport only.`,
      ].join('\n'),
      actionText: 'Coordinate last mile',
      actionRoute: `/last-mile`,
    });
  }

  // ── Always-present monitoring summary ─────────────────────────────────────
  recs.push({
    id: `${tripId}_rec_monitoring_summary`,
    userId: trip.userId, tripId,
    kind: 'smart_tip',
    category: 'Monitoring',
    urgency: 'low',
    confidenceScore: 1.0,
    title: `TICS is monitoring ${flightStr} in real time`,
    message: `Active monitoring is enabled for your trip. Flight status from AviationStack, weather conditions from OpenWeather, and AI-generated intelligence are all tracking your journey continuously.`,
    details: [
      `What TICS monitors for ${trip.title}:`,
      `✈ Flight status — gate, terminal, delays, cancellations`,
      `🌤 Weather at ${dest} — temperature, wind, precipitation, risk score`,
      `🚗 Ground transport — last-mile coordination on arrival`,
      `🤖 AI insights — contextual recommendations based on real conditions`,
      `📊 Monitoring frequency: every 15 minutes via Cloud Functions`,
      `Tap the refresh button on any screen to force an immediate monitoring cycle.`,
    ].join('\n'),
    actionText: 'View monitoring dashboard',
    actionRoute: `/monitoring/${tripId}`,
  });

  return recs;
}

async function generateRecommendations(userId: string, tripId: string, trip: TripDoc, weather?: WeatherDoc | null, flight?: FlightDoc | null): Promise<void> {
  const recs = buildContextualRecommendations(tripId, trip, weather ?? null, flight ?? null);
  const batch = db.batch();
  for (const r of recs) {
    const { id, ...data } = r;
    const full: RecommendationDoc = { ...data, createdAt: FieldValue.serverTimestamp() };
    batch.set(db.collection('recommendations').doc(id), full, { merge: true });
    batch.set(db.collection('trips').doc(tripId).collection('recommendations').doc(id), full, { merge: true });
  }
  await batch.commit();
}

/* ─── Transport options ───────────────────────────────────────────────────── */

async function generateTransportOptions(tripId: string, trip: TripDoc): Promise<void> {
  const { minutesToArrival } = computeTimeDeltas(trip);
  const shouldOffer = trip.lastMileStatus === 'scheduled'
    || (minutesToArrival != null && minutesToArrival <= 180 && minutesToArrival >= -60);
  if (!shouldOffer) return;

  const dest = trip.destinationAirport?.city ?? trip.to;
  const opts = [
    { id: `${tripId}_ride_hailing`, title: 'Ride hailing', kind: 'ride_hailing', etaMinutes: 8, estimatedCost: '$$', status: 'available' },
    { id: `${tripId}_taxi`, title: `Taxi at ${dest} airport`, kind: 'taxi', etaMinutes: 12, estimatedCost: '$$', status: 'available' },
    { id: `${tripId}_public_transit`, title: 'Airport express / transit', kind: 'public_transit', etaMinutes: 25, estimatedCost: '$', status: 'available' },
  ];

  const batch = db.batch();
  for (const opt of opts) {
    batch.set(db.collection('transport_options').doc(opt.id), {
      userId: trip.userId, tripId, ...opt,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

/* ─── Trip normalization ──────────────────────────────────────────────────── */

async function ensureTripSystemFields(tripId: string, before: TripDoc | null, after: TripDoc & { _synced?: boolean }): Promise<void> {
  if (after._synced === true) return;
  const patch: Partial<TripDoc> & { _synced?: boolean } = {};
  const depIso = asIsoString(after.departureTime);
  const arrIso = asIsoString(after.arrivalTime);
  if (depIso && depIso !== after.departureTime) patch.departureTime = depIso;
  if (arrIso && arrIso !== after.arrivalTime) patch.arrivalTime = arrIso;
  if (!after.monitoringStatus) patch.monitoringStatus = 'unknown';
  if (!after.lastMileStatus) patch.lastMileStatus = 'none';
  if (!Object.keys(patch).length) return;
  patch._synced = true;
  patch.updatedAt = FieldValue.serverTimestamp();
  await db.collection('trips').doc(tripId).set(patch, { merge: true });
}

/* ─── Cleanup ─────────────────────────────────────────────────────────────── */

async function cleanupTripArtifacts(tripId: string): Promise<void> {
  const flat = ['alerts', 'recommendations', 'transport_options', 'flight_monitoring', 'weather_monitoring'] as const;
  const batch = db.batch();
  for (const col of flat) {
    const snap = await db.collection(col).where('tripId', '==', tripId).get();
    snap.docs.forEach((d) => batch.delete(d.ref));
  }
  // Delete trip subcollections
  const subCols = ['alerts', 'recommendations', 'weather_monitoring', 'flight_monitoring'];
  for (const sc of subCols) {
    const snap = await db.collection('trips').doc(tripId).collection(sc).get();
    snap.docs.forEach((d) => batch.delete(d.ref));
  }
  await batch.commit();
}

/* ─── Concurrency helper ──────────────────────────────────────────────────── */

function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  return Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await fn(items[idx]!);
      }
    }),
  ).then(() => undefined);
}

/* ─── Full monitoring cycle ───────────────────────────────────────────────── */

async function runMonitoringCycle(tripId: string, trip: TripDoc): Promise<void> {
  const [weather, flight] = await Promise.all([
    writeWeatherForTrip(tripId, trip),
    writeFlightMonitoringForTrip(tripId, trip),
  ]);
  await generateAlerts(trip.userId, tripId, trip, weather, flight);
  await generateRecommendations(trip.userId, tripId, trip, weather, flight);
  await generateTransportOptions(tripId, trip);
  // Update monitoring snapshot
  await db.collection('trips').doc(tripId).collection('monitoring').doc('latest').set({
    lastCycleAt: FieldValue.serverTimestamp(),
    weatherRiskScore: weather?.riskScore ?? null,
    flightStatus: flight?.status ?? null,
    flightDelay: flight?.delayMinutes ?? null,
  }, { merge: true });
}

/* ─── Exported Cloud Functions ────────────────────────────────────────────── */

export const monitorTrips = onSchedule(
  { schedule: 'every 15 minutes', secrets: [OPENWEATHER_API_KEY, AVIATIONSTACK_API_KEY] },
  async () => {
    const futureIso = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const pastIso = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const snap = await db.collection('trips')
      .where('departureTime', '<=', futureIso)
      .orderBy('departureTime', 'asc')
      .limit(500)
      .get();

    const active = snap.docs
      .map((d) => ({ id: d.id, trip: d.data() as TripDoc }))
      .filter(({ trip }) => isNonEmptyString(trip?.userId) && trip.arrivalTime >= pastIso);

    logger.info(`monitorTrips: running cycle for ${active.length} trips`);
    await withConcurrency(active, 5, ({ id, trip }) => runMonitoringCycle(id, trip));
    logger.info(`monitorTrips: done at ${utcNowIso()}`);
  },
);

export const seedTripArtifactsOnCreate = onDocumentCreated(
  { document: 'trips/{tripId}', secrets: [OPENWEATHER_API_KEY, AVIATIONSTACK_API_KEY] },
  async (event) => {
    const tripId = String(event.params.tripId);
    const trip = event.data?.data() as TripDoc | undefined;
    if (!trip || !isNonEmptyString(trip.userId)) return;
    await ensureTripSystemFields(tripId, null, trip);
    await runMonitoringCycle(tripId, trip);
  },
);

export const syncTripOnUpdate = onDocumentUpdated(
  'trips/{tripId}',
  async (event) => {
    const tripId = String(event.params.tripId);
    const before = event.data?.before.data() as (TripDoc & { _synced?: boolean }) | undefined;
    const after = event.data?.after.data() as (TripDoc & { _synced?: boolean }) | undefined;
    if (!after || !isNonEmptyString(after.userId)) return;

    if (after._synced === true) {
      await db.collection('trips').doc(tripId).update({ _synced: FieldValue.delete() });
      return;
    }
    await ensureTripSystemFields(tripId, before ?? null, after);

    const changed =
      before?.from !== after.from || before?.to !== after.to ||
      before?.departureTime !== after.departureTime || before?.arrivalTime !== after.arrivalTime ||
      before?.flightNumber !== after.flightNumber || before?.monitoringStatus !== after.monitoringStatus;

    if (changed) await runMonitoringCycle(tripId, after);
  },
);

export const cleanupOnTripDelete = onDocumentDeleted('trips/{tripId}', async (event) => {
  await cleanupTripArtifacts(String(event.params.tripId));
});

export const notifyOnNewAlert = onDocumentCreated('alerts/{alertId}', async (event) => {
  const alert = event.data?.data() as Partial<AlertDoc> | undefined;
  if (!alert?.userId) return;
  const userSnap = await db.collection('users').doc(alert.userId).get();
  const tokens: string[] = (userSnap.data() as UserDoc | undefined)?.devicePushTokens ?? [];
  if (!tokens.length) return;
  try {
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: alert.title ?? 'New Alert', body: alert.message ?? '' },
      data: {
        tripId: String(alert.tripId ?? ''),
        severity: String(alert.severity ?? ''),
        alertId: String(event.params.alertId),
        category: String(alert.category ?? ''),
      },
    });
  } catch (e) {
    logger.error('notifyOnNewAlert: failed', e);
  }
});

/* ─── refreshTripMonitoring callable ─────────────────────────────────────── */

export const refreshTripMonitoring = onCall(
  { secrets: [OPENWEATHER_API_KEY, AVIATIONSTACK_API_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const tripId = String((req.data as any)?.tripId ?? '');
    if (!tripId) throw new HttpsError('invalid-argument', 'tripId is required.');

    const snap = await db.collection('trips').doc(tripId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Trip not found.');
    const trip = snap.data() as TripDoc;
    if (trip.userId !== uid) throw new HttpsError('permission-denied', 'Access denied.');

    await runMonitoringCycle(tripId, trip);
    logger.info(`refreshTripMonitoring: done for tripId=${tripId}`);
    return { ok: true };
  },
);

/* ─── Save for later callable ─────────────────────────────────────────────── */

export const saveItem = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { itemId, itemType, tripId, data } = req.data as {
    itemId: string; itemType: 'alert' | 'recommendation' | 'insight'; tripId: string; data: Record<string, unknown>;
  };
  if (!itemId || !itemType || !tripId) throw new HttpsError('invalid-argument', 'itemId, itemType, tripId required.');

  const savedId = `${uid}_${itemId}`;
  await db.collection('users').doc(uid).collection('saved').doc(savedId).set({
    uid, itemId, itemType, tripId, data,
    savedAt: FieldValue.serverTimestamp(),
    tags: [],
  }, { merge: true });

  return { ok: true, savedId };
});

/* ─── App Rating callable ─────────────────────────────────────────────────── */

export const submitAppRating = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { stars, feedback } = req.data as { stars: number; feedback?: string };
  if (typeof stars !== 'number' || stars < 1 || stars > 5) {
    throw new HttpsError('invalid-argument', 'stars must be 1–5.');
  }

  const ratingDoc = { uid, stars, feedback: feedback ?? null, createdAt: FieldValue.serverTimestamp() };

  // Upsert rating — one rating per user
  await db.collection('users').doc(uid).collection('ratings').doc('app_rating').set(ratingDoc, { merge: true });

  // Update aggregated stats on users/{uid}
  await db.collection('users').doc(uid).set({
    'travel_behavior.rating': stars,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Update global app_ratings aggregation
  const aggRef = db.collection('app_ratings').doc('aggregate');
  await db.runTransaction(async (tx) => {
    const agg = await tx.get(aggRef);
    const prev = agg.data() ?? { totalStars: 0, totalRatings: 0 };

    // Check if user already rated to update average correctly
    const prevUserRating = await tx.get(db.collection('users').doc(uid).collection('ratings').doc('app_rating'));
    const prevStars = prevUserRating.exists ? (prevUserRating.data()?.stars ?? 0) : 0;
    const wasExisting = prevStars > 0;

    const newTotal = wasExisting ? prev.totalRatings : prev.totalRatings + 1;
    const newTotalStars = prev.totalStars - (wasExisting ? prevStars : 0) + stars;

    tx.set(aggRef, {
      totalStars: newTotalStars,
      totalRatings: newTotal,
      averageRating: newTotal > 0 ? newTotalStars / newTotal : stars,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { ok: true };
});

/* ─── Generate share update callable ─────────────────────────────────────── */

export const generateShareUpdate = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const tripId = String((req.data as any)?.tripId ?? '');
    if (!tripId) throw new HttpsError('invalid-argument', 'tripId required.');

    const tripSnap = await db.collection('trips').doc(tripId).get();
    if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found.');
    const trip = tripSnap.data() as TripDoc;
    if (trip.userId !== uid) throw new HttpsError('permission-denied', 'Access denied.');

    const [flightSnap, weatherSnap] = await Promise.all([
      db.collection('flight_monitoring').doc(tripId).get(),
      db.collection('weather_monitoring').doc(tripId).get(),
    ]);

    const flight = flightSnap.data() as FlightDoc | undefined;
    const weather = weatherSnap.data() as any;

    const dest = trip.destinationAirport?.city ?? trip.to;
    const flightStr = trip.flightNumber ?? 'flight';
    const status = flight?.status ?? 'scheduled';
    const delay = flight?.delayMinutes;
    const tempC = weather?.current?.temp != null ? `${Math.round(weather.current.temp)}°C` : null;
    const weatherDesc = weather?.current?.weather?.[0]?.description ?? null;

    // Build human-readable share text
    const lines: string[] = [];
    lines.push(`✈️ ${trip.title}`);
    lines.push(`${flightStr}: ${trip.from} → ${dest}`);

    if (status === 'canceled') {
      lines.push(`🚫 CANCELED — contacting airline`);
    } else if (delay != null && delay >= 15) {
      const depTime = flight?.departureActual
        ? new Date(flight.departureActual).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : null;
      lines.push(`⚠️ Delayed ${delay} min${depTime ? ` · new departure ${depTime}` : ''}`);
    } else {
      lines.push(`✅ On schedule`);
    }

    if (tempC) {
      lines.push(`🌤️ ${dest}: ${tempC}${weatherDesc ? `, ${weatherDesc}` : ''}`);
    }

    const depLabel = new Date(trip.departureTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const arrLabel = new Date(trip.arrivalTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    lines.push(`🕐 ${depLabel} → ${arrLabel}`);
    lines.push(`Shared via TICS Travel Monitor`);

    const shareText = lines.join('\n');

    // Save to sharedUpdates subcollection
    await db.collection('trips').doc(tripId).collection('sharedUpdates').add({
      uid, tripId, shareText,
      flightStatus: status, delay: delay ?? null, tempC: weather?.current?.temp ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, shareText };
  },
);

/* ─── ensureUserDoc callable ──────────────────────────────────────────────── */

export const ensureUserDoc = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  await db.collection('users').doc(uid).set(
    { updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
});

/* ─── registerPushToken callable ──────────────────────────────────────────── */

export const registerPushToken = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const token = String((req.data as any)?.token ?? '').trim();
  if (!token) throw new HttpsError('invalid-argument', 'token is required.');

  await db.collection('users').doc(uid).set(
    { devicePushTokens: admin.firestore.FieldValue.arrayUnion(token), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
});

/* ─── AI Assistant callable ───────────────────────────────────────────────── */

function extractGeminiText(json: any): string {
  return (json?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === 'string')
    .map((p: any) => p.text as string)
    .join('\n')
    .trim();
}

export const assistantChat = onCall({ secrets: [GEMINI_API_KEY] }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const message = String((req.data as any)?.message ?? '').trim();
  const tripId: string | null = (req.data as any)?.tripId ?? null;
  const history = Array.isArray((req.data as any)?.history) ? (req.data as any).history : [];

  if (!message) throw new HttpsError('invalid-argument', 'Message is required.');
  if (message.length > 2000) throw new HttpsError('invalid-argument', 'Message too long.');

  // Load trip context
  let tripContext = '';
  if (tripId) {
    const [tripSnap, alertsSnap, recSnap, flightSnap, weatherSnap] = await Promise.all([
      db.collection('trips').doc(tripId).get(),
      db.collection('alerts').where('tripId', '==', tripId).where('active', '==', true).limit(5).get(),
      db.collection('recommendations').where('tripId', '==', tripId).limit(5).get(),
      db.collection('flight_monitoring').doc(tripId).get(),
      db.collection('weather_monitoring').doc(tripId).get(),
    ]);

    if (tripSnap.exists && (tripSnap.data() as TripDoc).userId === uid) {
      const trip = tripSnap.data() as TripDoc;
      const flight = flightSnap.data() as FlightDoc | undefined;
      const weather = weatherSnap.data() as any;

      const parts = [
        `Trip: "${trip.title}" | ${trip.from} → ${trip.to}`,
        `Flight: ${trip.flightNumber ?? 'N/A'} | Airline: ${trip.airline ?? 'N/A'}`,
        `Departs: ${trip.departureTime} | Arrives: ${trip.arrivalTime}`,
        `Status: ${trip.monitoringStatus ?? 'unknown'}`,
        flight ? `Flight status: ${flight.status} | Delay: ${flight.delayMinutes ?? 0}min | Gate: ${flight.gate ?? 'TBC'} | Terminal: ${flight.terminal ?? 'TBC'}` : '',
        weather?.current?.temp != null ? `Weather at destination: ${Math.round(weather.current.temp)}°C, ${weather.current.weather?.[0]?.description ?? ''}` : '',
        alertsSnap.docs.length ? `Active alerts: ${alertsSnap.docs.map((d) => (d.data() as AlertDoc).title).join('; ')}` : 'No active alerts.',
        recSnap.docs.length ? `Recent recommendations: ${recSnap.docs.map((d) => (d.data() as RecommendationDoc).title).join('; ')}` : '',
      ].filter(Boolean);

      tripContext = parts.join('\n');
    }
  }

  const conversationId = tripId ? `${uid}_${tripId}` : `${uid}_general`;
  const msgCol = db.collection('assistant_conversations').doc(conversationId).collection('assistant_messages');

  await msgCol.add({ role: 'user', text: message, uid, tripId, createdAt: FieldValue.serverTimestamp() });

  const systemText = 'You are TICS, a smart real-time travel intelligence assistant. Be concise, actionable, and specific. Reference real trip data. Never invent flight statuses. If unsure, say so and suggest checking the airline app.';

  const geminiHistory = history.slice(-8).map((h: any) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(h.text) }],
  }));

  const contents = [
    ...geminiHistory,
    {
      role: 'user',
      parts: [{ text: tripContext ? `[Trip context]\n${tripContext}\n\n[User message]\n${message}` : message }],
    },
  ];

  const apiKey = GEMINI_API_KEY.value() || process.env.GEMINI_API_KEY || '';
  let answer = 'I\'m having trouble connecting right now. Please try again.';

  if (apiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemText }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
          }),
        },
      );
      if (resp.ok) {
        const json = await resp.json();
        const extracted = extractGeminiText(json);
        if (extracted) answer = extracted;
      } else {
        logger.warn(`assistantChat: Gemini ${resp.status}`);
      }
    } catch (e) {
      logger.warn('assistantChat: Gemini error', e);
    }
  }

  await msgCol.add({ role: 'assistant', text: answer, uid, tripId, createdAt: FieldValue.serverTimestamp() });
  return { answer, conversationId };
});
