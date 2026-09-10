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
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const OPENWEATHER_API_KEY = defineSecret('OPENWEATHER_API_KEY');
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
  /** Centralized dynamic trip status */
  status?: 'upcoming' | 'boarding' | 'active' | 'airborne' | 'arriving' | 'completed' | 'canceled' | 'delayed';
  /** When the trip was marked completed */
  completedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  /** Monitoring toggle */
  monitoringEnabled?: boolean;
  /** Last time the status was synced */
  lastSyncedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
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

/* ─── Full monitoring cycle (AI-only) ────────────────────────────────────── */

async function runMonitoringCycle(tripId: string, trip: TripDoc): Promise<void> {
  const [weather, flight] = await Promise.all([
    writeWeatherForTrip(tripId, trip),
    writeFlightMonitoringForTrip(tripId, trip),
  ]);

  // STRICTLY AI-generated alerts and recommendations — no template fallback
  const apiKey = GEMINI_API_KEY.value() || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    logger.error(`runMonitoringCycle: GEMINI_API_KEY not configured — skipping AI generation for ${tripId}`);
    return;
  }

  try {
    const {
      generateAlertsWithAI,
      generateRecommendationsWithAI,
      writeAIAlerts,
      writeAIRecommendations,
    } = await import('./aiInsights');

    const tripContext = {
      tripId,
      userId: trip.userId,
      title: trip.title,
      from: trip.from,
      to: trip.to,
      departureTime: trip.departureTime,
      arrivalTime: trip.arrivalTime,
      airline: trip.airline,
      flightNumber: trip.flightNumber,
      status: trip.status,
      monitoringStatus: trip.monitoringStatus,
    };

    const weatherContext = weather ? {
      location: weather.location,
      tempC: weather.tempC,
      feelsLikeC: weather.feelsLikeC,
      description: weather.description,
      weatherMain: weather.weatherMain,
      windKph: weather.windKph,
      humidity: weather.humidity,
      riskScore: weather.riskScore,
      riskSummary: weather.riskSummary,
    } : null;

    const flightContext = flight ? {
      status: flight.status,
      gate: flight.gate,
      terminal: flight.terminal,
      delayMinutes: flight.delayMinutes,
      departureActual: flight.departureActual,
    } : null;

    const [aiAlerts, aiRecs] = await Promise.all([
      generateAlertsWithAI(apiKey, tripContext, weatherContext, flightContext),
      generateRecommendationsWithAI(apiKey, tripContext, weatherContext, flightContext),
    ]);

    await writeAIAlerts(tripId, tripContext, aiAlerts);
    await writeAIRecommendations(tripId, tripContext, aiRecs);

    logger.info(`runMonitoringCycle: AI generated ${aiAlerts.length} alerts and ${aiRecs.length} recommendations for ${tripId}`);
  } catch (e) {
    logger.error(`runMonitoringCycle: AI generation FAILED for ${tripId} — no alerts/recommendations generated`, e);
    // NO FALLBACK — strictly AI only
  }

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

/* ─── Unsave item callable ────────────────────────────────────────────────── */

export const unsaveItem = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { itemId } = req.data as { itemId: string };
  if (!itemId) throw new HttpsError('invalid-argument', 'itemId required.');

  const savedId = `${uid}_${itemId}`;
  await db.collection('users').doc(uid).collection('saved').doc(savedId).delete();

  return { ok: true };
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

/* ─── Auto-Completion Engine ──────────────────────────────────────────────── */

const GRACE_PERIOD_MS = 45 * 60 * 1000; // 45 minutes grace period after arrival

/**
 * Scheduled cloud function that runs every 15 minutes to auto-complete trips
 * that have passed their arrival time + grace period.
 */
export const autoCompleteTrips = onSchedule('every 15 minutes', async () => {
  const now = Date.now();
  const cutoff = new Date(now - GRACE_PERIOD_MS).toISOString();

  logger.info(`autoCompleteTrips: checking for trips before ${cutoff}`);

  try {
    // Find trips where arrivalTime is past the grace period and status is not already completed/canceled
    const tripsSnap = await db.collection('trips')
      .where('arrivalTime', '<', cutoff)
      .where('status', 'not-in', ['completed', 'canceled'])
      .get();

    let completed = 0;
    const batch = db.batch();

    for (const doc of tripsSnap.docs) {
      const trip = doc.data() as TripDoc;
      const arrMs = Date.parse(trip.arrivalTime);

      if (!Number.isFinite(arrMs)) continue;
      if (now <= arrMs + GRACE_PERIOD_MS) continue;

      logger.info(`autoCompleteTrips: completing trip "${trip.title}" (${doc.id})`);

      batch.update(db.collection('trips').doc(doc.id), {
        status: 'completed',
        monitoringEnabled: false,
        completedAt: FieldValue.serverTimestamp(),
        lastSyncedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Also update the flight_monitoring to stop listeners
      batch.set(db.collection('flight_monitoring').doc(doc.id), {
        status: 'landed',
      }, { merge: true });

      completed++;
    }

    if (completed > 0) {
      await batch.commit();
      logger.info(`autoCompleteTrips: completed ${completed} trips`);
    } else {
      logger.info('autoCompleteTrips: no trips to complete');
    }
  } catch (e) {
    logger.error('autoCompleteTrips: error', e);
  }
});

/**
 * When a trip is updated, auto-complete it if arrival time + grace period has passed.
 */
export const onTripUpdateAutoComplete = onDocumentUpdated('trips/{tripId}', async (event) => {
  const tripId = event.params.tripId;
  const before = event.data?.before?.data() as TripDoc | undefined;
  const after = event.data?.after?.data() as TripDoc | undefined;

  if (!after || after.status === 'completed' || after.status === 'canceled') return;

  const now = Date.now();
  const arrMs = Date.parse(after.arrivalTime);

  if (!Number.isFinite(arrMs)) return;
  if (now <= arrMs + GRACE_PERIOD_MS) return;

  logger.info(`onTripUpdateAutoComplete: auto-completing trip ${tripId}`);

  await event.data?.after.ref.update({
    status: 'completed',
    monitoringEnabled: false,
    completedAt: FieldValue.serverTimestamp(),
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
});

/* ─── Monitoring Status Sync ──────────────────────────────────────────────── */

/**
 * When flight_monitoring gets updated, sync the trip's monitoring status
 * and potentially auto-complete the trip if it's landed and past arrival.
 */
export const onFlightMonitoringUpdate = onDocumentUpdated('flight_monitoring/{tripId}', async (event) => {
  const tripId = event.params.tripId;
  const before = event.data?.before?.data() as FlightDoc | undefined;
  const after = event.data?.after?.data() as FlightDoc | undefined;

  if (!after) return;

  // Get the trip doc
  const tripSnap = await db.collection('trips').doc(tripId).get();
  if (!tripSnap.exists) return;
  const trip = tripSnap.data() as TripDoc;

  // If flight has landed and trip is past arrival + grace period, auto-complete
  if (after.status === 'landed') {
    const now = Date.now();
    const arrMs = Date.parse(trip.arrivalTime);

    if (Number.isFinite(arrMs) && now > arrMs + GRACE_PERIOD_MS && trip.status !== 'completed' && trip.status !== 'canceled') {
      logger.info(`onFlightMonitoringUpdate: auto-completing trip ${tripId} (flight landed)`);

      await tripSnap.ref.update({
        status: 'completed',
        monitoringEnabled: false,
        completedAt: FieldValue.serverTimestamp(),
        lastSyncedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Sync monitoring status changes
  if (after.status !== (before?.status ?? 'unknown')) {
    const monitoringStatus = after.status === 'active' || after.status === 'scheduled'
      ? 'on_track'
      : after.status === 'canceled'
        ? 'at_risk'
        : 'unknown';

    await tripSnap.ref.update({
      monitoringStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
});

export { notifyAssignmentCreated, notifyAssignmentUpdated } from './assignmentNotifications';
export { generateDestinationRecommendations, logDestinationInteraction } from './destinationRecommendations';
export const assistantChat = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const message = String((req.data as any)?.message ?? '').trim();
    const conversationId: string | null = (req.data as any)?.conversationId ?? null;
    const tripId: string | null = (req.data as any)?.tripId ?? null;

    if (!message) throw new HttpsError('invalid-argument', 'Message is required.');
    if (message.length > 2000) throw new HttpsError('invalid-argument', 'Message too long.');

    // ─── Import context builders ───────────────────────────────────────
    const {
      buildAssistantContext,
      buildSystemPromptFromContext,
      getUserMemory,
      saveUserMemory,
      getConversationHistory,
      createConversation,
      archiveConversation,
      updateConversationSummary,
      incrementMessageCount,
    } = await import('./assistant/context');

    // ─── Resolve conversation ID ───────────────────────────────────────
    const effectiveConvId = conversationId ?? `conv_${uid}_${Date.now()}`;
    const isNewConversation = !conversationId;

    // If this is a new conversation, archive any old active ones and create new
    if (isNewConversation) {
      await createConversation(uid, effectiveConvId, tripId);
    }

    // ─── Save user message to new structure ────────────────────────────
    const msgCol = db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .doc(effectiveConvId)
      .collection('messages');

    await msgCol.add({
      role: 'user',
      content: message,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Also write to legacy collection for backward compat
    // Use the effectiveConvId so the frontend listener picks up the messages
    const legacyMsgCol = db
      .collection('assistant_conversations')
      .doc(effectiveConvId)
      .collection('assistant_messages');
    await legacyMsgCol.add({
      role: 'user',
      text: message,
      uid,
      tripId,
      createdAt: FieldValue.serverTimestamp(),
    });

    await incrementMessageCount(uid, effectiveConvId);

    // ─── Build rich context ────────────────────────────────────────────
    const context = await buildAssistantContext(uid, effectiveConvId);

    // Get recent messages from new structure
    const recentHistory = await getConversationHistory(uid, effectiveConvId, 10);

    // Build smart system prompt
    const systemText = buildSystemPromptFromContext(context);

    // ─── Prepare Gemini payload ────────────────────────────────────────
    const geminiHistory = recentHistory
      .slice(-8)
      .map((h: any) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(h.text) }],
      }));

    const contents = [
      ...geminiHistory,
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    // ─── Call Gemini ──────────────────────────────────────────────────
    const apiKey = GEMINI_API_KEY.value() || process.env.GEMINI_API_KEY || '';
    let answer = 'I\'m having trouble connecting right now. Please try again.';

    if (apiKey) {
      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
      let lastError = '';

      for (const model of modelsToTry) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemText }] },
                contents,
                generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
              }),
            },
          );

          if (resp.ok) {
            const json = await resp.json();
            const extracted = extractGeminiText(json);
            if (extracted) {
              answer = extracted;
              logger.info(`assistantChat: ${model} succeeded`);
              break;
            }
          } else {
            const errorText = await resp.text();
            lastError = `${model} returned ${resp.status}: ${errorText.substring(0, 200)}`;
            logger.warn(`assistantChat: ${lastError}`);
            if (resp.status === 401 || resp.status === 403) {
              lastError = 'API key is invalid or Generative Language API is not enabled.';
              break;
            }
            if (resp.status === 404) continue;
            if (resp.status >= 500) continue;
            break;
          }
        } catch (e: any) {
          lastError = `${model} threw: ${e?.message ?? 'Unknown error'}`;
          logger.warn(`assistantChat: ${lastError}`);
          continue;
        }
      }

      if (answer === 'I\'m having trouble connecting right now. Please try again.') {
        const errorMsg = lastError || 'All Gemini models failed';
        logger.error(`assistantChat: all models exhausted — ${errorMsg}`);
        answer = `⚠️ ${errorMsg}.`;
      }
    } else {
      answer = '⚠️ Gemini API key is not configured.';
    }

    // ─── Save assistant response ──────────────────────────────────────
    await msgCol.add({
      role: 'assistant',
      content: answer,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Also write to legacy collection
    await legacyMsgCol.add({
      role: 'assistant',
      text: answer,
      uid,
      tripId,
      createdAt: FieldValue.serverTimestamp(),
    });

    await incrementMessageCount(uid, effectiveConvId);

    // ─── Periodically update conversation summary ─────────────────────
    const currentCount = context.recentTrips.length;
    if (currentCount > 0 && currentCount % 5 === 0) {
      // For now just store last message as summary
      await updateConversationSummary(uid, effectiveConvId, message, answer);
    }

    return {
      answer,
      conversationId: effectiveConvId,
    };
  },
);

/* ─── Email Sync callable ─────────────────────────────────────────────────── */

export const syncFromEmail = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { subject, body, source, emailId } = req.data as {
    subject: string;
    body: string;
    source: 'gmail' | 'outlook';
    emailId?: string;
  };

  if (!subject || !body) {
    throw new HttpsError('invalid-argument', 'subject and body are required.');
  }

  const { parseEmailContent, saveParsedTrip } = await import('./emailSync');
  const parsed = parseEmailContent(subject, body, source, emailId);

  if (!parsed) {
    return { ok: false, reason: 'Could not parse travel data from this email.' };
  }

  const tripId = await saveParsedTrip(uid, parsed);

  logger.info(`syncFromEmail: created trip ${tripId} for user ${uid} from ${source}`);

  return {
    ok: true,
    tripId,
    trip: {
      title: parsed.title,
      from: parsed.from,
      to: parsed.to,
      departureTime: parsed.departureTime,
      arrivalTime: parsed.arrivalTime,
      airline: parsed.airline,
      flightNumber: parsed.flightNumber,
    },
  };
});

/* ─── Booking Import callable ─────────────────────────────────────────────── */

export const importFromBooking = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { subject, body, fromEmail } = req.data as {
    subject: string;
    body: string;
    fromEmail?: string;
  };

  if (!subject || !body) {
    throw new HttpsError('invalid-argument', 'subject and body are required.');
  }

  const { parseBookingConfirmation, saveBookingImport } = await import('./bookingImport');
  const parsed = parseBookingConfirmation(subject, body, fromEmail);

  if (!parsed) {
    return { ok: false, reason: 'Could not parse booking data. Unsupported provider or missing travel details.' };
  }

  const tripId = await saveBookingImport(uid, parsed);

  logger.info(`importFromBooking: created trip ${tripId} for user ${uid} from ${parsed.provider}`);

  return {
    ok: true,
    tripId,
    trip: {
      title: parsed.title,
      from: parsed.from,
      to: parsed.to,
      departureTime: parsed.departureTime,
      arrivalTime: parsed.arrivalTime,
      airline: parsed.airline,
      flightNumber: parsed.flightNumber,
      provider: parsed.provider,
      hotelName: parsed.hotelName,
      totalPrice: parsed.totalPrice,
    },
  };
});
