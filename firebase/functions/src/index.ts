import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

admin.initializeApp();

const db = admin.firestore();

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

type Id = string;

type UserDoc = {
  email: string;
  name?: string;
  premium?: boolean;
  devicePushTokens?: string[];
  createdAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
};

type TripDoc = {
  userId: Id;
  title: string;
  from: string;
  to: string;
  departureTime: string; // ISO string
  arrivalTime: string; // ISO string
  airline?: string | null;
  flightNumber?: string | null;
  monitoringStatus?: 'on_track' | 'at_risk' | 'unknown';
  lastMileStatus?: 'scheduled' | 'none' | 'in_progress' | 'completed';
  createdAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
};

type AlertDoc = {
  userId: Id;
  tripId: Id;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  category?: 'flight' | 'weather' | 'transport' | 'general';
  active?: boolean;
  read?: boolean;
  createdAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
};

type RecommendationDoc = {
  userId: Id;
  tripId: Id;
  title: string;
  message: string;
  kind?: 'alternative_flight' | 'smart_tip' | 'action';
  options?: Record<string, unknown>[];
  priceDifference?: string;
  timeDifference?: string;
  createdAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
};

type TransportOptionDoc = {
  userId: Id;
  tripId: Id;
  title: string;
  kind: 'ride_hailing' | 'taxi' | 'shuttle' | 'rental_car' | 'public_transit';
  etaMinutes?: number;
  estimatedCost?: string;
  status?: 'available' | 'limited' | 'unavailable';
  createdAt?: admin.firestore.FieldValue | admin.firestore.Timestamp;
};

type GeneratedRec = {
  title: string;
  message: string;
  kind: 'alternative_flight' | 'smart_tip' | 'action';
  options?: Array<{ flight?: string; departs?: string; arrives?: string; price?: string; label?: string }>;
  priceDifference?: string;
  timeDifference?: string;
};

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
  const hoursToDeparture = Number.isFinite(departure) ? (departure - now) / (1000 * 60 * 60) : null;
  const minutesToArrival = Number.isFinite(arrival) ? (arrival - now) / (1000 * 60) : null;
  return { hoursToDeparture, minutesToArrival };
}

function normalizeTripDoc(next: TripDoc): Partial<TripDoc> {
  const patch: Partial<TripDoc> = {};

  const departureIso = asIsoString(next.departureTime);
  const arrivalIso = asIsoString(next.arrivalTime);
  if (departureIso && departureIso !== next.departureTime) patch.departureTime = departureIso;
  if (arrivalIso && arrivalIso !== next.arrivalTime) patch.arrivalTime = arrivalIso;

  if (!next.monitoringStatus) patch.monitoringStatus = 'unknown';
  if (!next.lastMileStatus) patch.lastMileStatus = 'none';

  if (isNonEmptyString(next.title) && next.title !== next.title.trim()) patch.title = next.title.trim();
  if (isNonEmptyString(next.from) && next.from !== next.from.trim()) patch.from = next.from.trim();
  if (isNonEmptyString(next.to) && next.to !== next.to.trim()) patch.to = next.to.trim();

  return patch;
}

async function ensureTripSystemFields(tripId: string, before: TripDoc | null, after: TripDoc) {
  const patch: Partial<TripDoc> = normalizeTripDoc(after);
  if (!before?.createdAt) patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  if (!Object.keys(patch).length) return;
  await db.collection('trips').doc(tripId).set(patch, { merge: true });
}

async function fetchFlightData(_trip: TripDoc) {
  // TODO: Integrate a flight data provider (API keys via Secrets).
  return null;
}

async function fetchWeatherData(_trip: TripDoc) {
  // TODO: Integrate a weather provider.
  return null;
}

function buildGeneratedAlerts(tripId: string, trip: TripDoc) {
  const { hoursToDeparture, minutesToArrival } = computeTimeDeltas(trip);

  const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; message: string; active: boolean }> = [];

  if (hoursToDeparture != null && hoursToDeparture < 0) {
    alerts.push({
      severity: 'info',
      title: 'In Transit',
      message: `Your trip "${trip.title}" has started. Monitoring is active.`,
      active: true,
    });
  } else if (hoursToDeparture != null && hoursToDeparture <= 3 && hoursToDeparture >= 0) {
    alerts.push({
      severity: 'warning',
      title: 'Check-in Reminder',
      message: 'Departure is within 3 hours. Consider checking in and heading to the airport.',
      active: true,
    });
  }

  if (trip.monitoringStatus === 'at_risk') {
    alerts.push({
      severity: 'critical',
      title: 'Potential Disruption',
      message: 'Your trip looks at risk. Review alternatives and build extra buffer time.',
      active: true,
    });
  }

  if (minutesToArrival != null && minutesToArrival <= 30 && minutesToArrival >= -120) {
    alerts.push({
      severity: 'info',
      title: 'Arrival Soon',
      message: 'Arrival is soon. Last-mile coordination can be prepared.',
      active: true,
    });
  }

  return alerts.map((a) => ({ ...a, tripId }));
}

function buildGeneratedRecommendations(tripId: string, trip: TripDoc) {
  const { hoursToDeparture } = computeTimeDeltas(trip);

  const recs: GeneratedRec[] = [];

  recs.push({
    title: 'Keep monitoring enabled',
    message: 'TICS will automatically notify you if anything changes with your trip.',
    kind: 'smart_tip',
  });

  recs.push({
    title: 'Consider an earlier flight',
    message: 'Departing earlier on the same route can add buffer against delays.',
    kind: 'alternative_flight',
    options: [
      {
        flight: `${trip.airline ?? 'Airline'} · earlier departure (sample)`,
        departs: '11:30 AM (sample)',
        arrives: 'Same destination (sample)',
        price: 'Comparable fare class (sample)',
      },
    ],
    priceDifference: '~ $0 – $45',
    timeDifference: 'Earlier departure · more connection buffer',
  });

  if (hoursToDeparture != null && hoursToDeparture <= 6 && hoursToDeparture > 0) {
    recs.push({
      title: 'Head to the airport early',
      message: 'Leaving earlier reduces the risk of missing check-in or security windows.',
      kind: 'action',
    });
  }

  return recs.map((r) => ({ ...r, tripId }));
}

async function generateAlerts(userId: string, tripId: string, trip: TripDoc) {
  const generated = buildGeneratedAlerts(tripId, trip);
  const alertsCol = db.collection('alerts');

  const batch = db.batch();
  for (const a of generated) {
    const id = `${tripId}_${a.title.replace(/\s+/g, '_').toLowerCase()}`;
    const ref = alertsCol.doc(id);
    batch.set(
      ref,
      ({
        userId,
        tripId,
        severity: a.severity,
        title: a.title,
        message: a.message,
        category: 'general',
        active: a.active,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }) satisfies AlertDoc,
      { merge: true }
    );
  }
  await batch.commit();
}

async function generateRecommendations(userId: string, tripId: string, trip: TripDoc) {
  const generated = buildGeneratedRecommendations(tripId, trip);
  const recCol = db.collection('recommendations');

  const batch = db.batch();
  for (const r of generated) {
    const id = `${tripId}_${r.title.replace(/\s+/g, '_').toLowerCase()}`;
    const ref = recCol.doc(id);
    batch.set(
      ref,
      ({
        userId,
        tripId,
        title: r.title,
        message: r.message,
        kind: r.kind,
        ...(r.options ? { options: r.options } : {}),
        ...(r.priceDifference ? { priceDifference: r.priceDifference } : {}),
        ...(r.timeDifference ? { timeDifference: r.timeDifference } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }) satisfies RecommendationDoc,
      { merge: true }
    );
  }
  await batch.commit();
}

function buildGeneratedTransportOptions(tripId: string, trip: TripDoc): Array<TransportOptionDoc & { id: string }> {
  const { minutesToArrival } = computeTimeDeltas(trip);
  const shouldOfferLastMile = trip.lastMileStatus === 'scheduled' || (minutesToArrival != null && minutesToArrival <= 180 && minutesToArrival >= -180);
  if (!shouldOfferLastMile) return [];

  const base: Array<Omit<TransportOptionDoc, 'createdAt'> & { id: string }> = [
    {
      id: `${tripId}_ride_hailing`,
      userId: trip.userId,
      tripId,
      title: 'Ride hailing',
      kind: 'ride_hailing',
      etaMinutes: 8,
      estimatedCost: '$$',
      status: 'available',
    },
    {
      id: `${tripId}_taxi`,
      userId: trip.userId,
      tripId,
      title: 'Taxi stand',
      kind: 'taxi',
      etaMinutes: 12,
      estimatedCost: '$$',
      status: 'available',
    },
    {
      id: `${tripId}_public_transit`,
      userId: trip.userId,
      tripId,
      title: 'Public transit',
      kind: 'public_transit',
      etaMinutes: 20,
      estimatedCost: '$',
      status: 'available',
    },
  ];

  return base.map((o) => ({ ...o, createdAt: admin.firestore.FieldValue.serverTimestamp() }));
}

async function generateTransportOptions(tripId: string, trip: TripDoc) {
  const generated = buildGeneratedTransportOptions(tripId, trip);
  if (!generated.length) return;

  const col = db.collection('transport_options');
  const batch = db.batch();
  for (const opt of generated) {
    batch.set(col.doc(opt.id), opt satisfies TransportOptionDoc, { merge: true });
  }
  await batch.commit();
}

async function cleanupTripArtifacts(tripId: string) {
  const collections = ['alerts', 'recommendations', 'transport_options'] as const;
  const batch = db.batch();
  for (const colName of collections) {
    const snap = await db.collection(colName).where('tripId', '==', tripId).get();
    for (const docSnap of snap.docs) batch.delete(docSnap.ref);
  }
  await batch.commit();
}

function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      // eslint-disable-next-line no-await-in-loop
      await fn(items[idx]!);
    }
  });
  return Promise.all(workers).then(() => undefined);
}

export const monitorTrips = onSchedule('every 15 minutes', async () => {
  const nowIso = utcNowIso();
  const futureIso = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const pastArrivalIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const snap = await db.collection('trips').where('departureTime', '<=', futureIso).orderBy('departureTime', 'asc').limit(500).get();
  logger.info(`monitorTrips: scanning ${snap.size} trips (departureTime <= ${futureIso})`);

  const activeTrips = snap.docs
    .map((d) => ({ id: d.id, trip: d.data() as TripDoc }))
    .filter(({ trip }) => isNonEmptyString(trip?.userId) && isNonEmptyString(trip?.departureTime) && isNonEmptyString(trip?.arrivalTime))
    .filter(({ trip }) => trip.arrivalTime >= pastArrivalIso);

  await withConcurrency(activeTrips, 10, async ({ id, trip }) => {
    await fetchFlightData(trip);
    await fetchWeatherData(trip);
    await generateAlerts(trip.userId, id, trip);
    await generateRecommendations(trip.userId, id, trip);
    await generateTransportOptions(id, trip);
  });

  logger.info(`monitorTrips: completed for ${activeTrips.length} trips at ${nowIso}`);
});

export const seedTripArtifactsOnCreate = onDocumentCreated('trips/{tripId}', async (event) => {
  const tripId = String(event.params.tripId);
  const trip = event.data?.data() as TripDoc | undefined;
  if (!trip || !isNonEmptyString(trip.userId)) return;

  await ensureTripSystemFields(tripId, null, trip);
  await generateAlerts(trip.userId, tripId, trip);
  await generateRecommendations(trip.userId, tripId, trip);
  await generateTransportOptions(tripId, trip);
});

export const syncTripOnUpdate = onDocumentUpdated('trips/{tripId}', async (event) => {
  const tripId = String(event.params.tripId);
  const before = event.data?.before.data() as TripDoc | undefined;
  const after = event.data?.after.data() as TripDoc | undefined;
  if (!after || !isNonEmptyString(after.userId)) return;

  await ensureTripSystemFields(tripId, before ?? null, after);

  const coreFieldsChanged =
    before?.title !== after.title ||
    before?.from !== after.from ||
    before?.to !== after.to ||
    before?.departureTime !== after.departureTime ||
    before?.arrivalTime !== after.arrivalTime ||
    before?.monitoringStatus !== after.monitoringStatus ||
    before?.lastMileStatus !== after.lastMileStatus;

  if (coreFieldsChanged) {
    await generateAlerts(after.userId, tripId, after);
    await generateRecommendations(after.userId, tripId, after);
    await generateTransportOptions(tripId, after);
  }
});

export const cleanupOnTripDelete = onDocumentDeleted('trips/{tripId}', async (event) => {
  const tripId = String(event.params.tripId);
  await cleanupTripArtifacts(tripId);
});

export const notifyOnNewAlert = onDocumentCreated('alerts/{alertId}', async (event) => {
  const alert = event.data?.data() as Partial<AlertDoc> | undefined;
  if (!alert?.userId) return;

  const userSnap = await db.collection('users').doc(alert.userId).get();
  const tokens = (userSnap.data() as UserDoc | undefined)?.devicePushTokens ?? [];
  if (!tokens.length) return;

  const message = {
    tokens,
    notification: {
      title: alert.title ?? 'New Alert',
      body: alert.message ?? '',
    },
    data: {
      tripId: String(alert.tripId ?? ''),
      severity: String(alert.severity ?? ''),
      alertId: String(event.params.alertId),
    },
  };

  try {
    await admin.messaging().sendEachForMulticast(message);
  } catch (e) {
    logger.error('notifyOnNewAlert: failed', e);
  }
});

function extractResponseOutputText(json: any): string {
  const outputs = Array.isArray(json?.output) ? json.output : [];
  const chunks: string[] = [];
  for (const item of outputs) {
    if (item?.type !== 'message') continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') chunks.push(c.text);
    }
  }
  return chunks.join('\n').trim();
}

async function loadTripContext(uid: string, tripId: string | null) {
  if (!tripId) return { trip: null as TripDoc | null, alerts: [] as AlertDoc[], recs: [] as RecommendationDoc[] };

  const tripSnap = await db.collection('trips').doc(tripId).get();
  if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found.');
  const trip = tripSnap.data() as TripDoc;
  if (trip.userId !== uid) throw new HttpsError('permission-denied', 'Trip does not belong to the current user.');

  const alertsSnap = await db.collection('alerts').where('tripId', '==', tripId).where('userId', '==', uid).limit(20).get();
  const recSnap = await db.collection('recommendations').where('tripId', '==', tripId).where('userId', '==', uid).limit(10).get();

  return {
    trip,
    alerts: alertsSnap.docs.map((d) => d.data() as AlertDoc),
    recs: recSnap.docs.map((d) => d.data() as RecommendationDoc),
  };
}

export const assistantChat = onCall({ secrets: [OPENAI_API_KEY] }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const message = String((req.data as any)?.message ?? '').trim();
  const tripIdRaw = (req.data as any)?.tripId ?? null;
  const tripId = tripIdRaw != null ? String(tripIdRaw) : null;
  const history = Array.isArray((req.data as any)?.history) ? (req.data as any).history : [];

  if (!message) throw new HttpsError('invalid-argument', 'Message is required.');
  if (message.length > 2000) throw new HttpsError('invalid-argument', 'Message too long.');

  const { trip, alerts, recs } = await loadTripContext(uid, tripId);

  const system = [
    'You are TICS, a travel monitoring assistant.',
    'Be concise, actionable, and clear.',
    'If you do not have live data (gate/terminal), say so and suggest safe next steps.',
    'Never invent flight status; refer to the provided trip status fields.',
  ].join(' ');

  const tripSummary = trip
    ? {
        title: trip.title,
        route: `${trip.from} -> ${trip.to}`,
        departureTime: trip.departureTime,
        arrivalTime: trip.arrivalTime,
        airline: trip.airline ?? null,
        flightNumber: trip.flightNumber ?? null,
        monitoringStatus: trip.monitoringStatus ?? 'unknown',
        lastMileStatus: trip.lastMileStatus ?? 'none',
      }
    : null;

  const input = [
    { role: 'system', content: [{ type: 'input_text', text: system }] },
    ...(tripSummary
      ? [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: `Active trip context (JSON):\n${JSON.stringify(tripSummary)}` }],
          },
          {
            role: 'developer',
            content: [{ type: 'input_text', text: `Recent alerts (JSON):\n${JSON.stringify(alerts.slice(0, 20))}` }],
          },
          {
            role: 'developer',
            content: [{ type: 'input_text', text: `Recent recommendations (JSON):\n${JSON.stringify(recs.slice(0, 10))}` }],
          },
        ]
      : [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: 'No active trip context is available for this user.' }],
          },
        ]),
    ...history
      .slice(-10)
      .map((m: any) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: [{ type: 'input_text', text: String(m?.text ?? '') }] })),
    { role: 'user', content: [{ type: 'input_text', text: message }] },
  ];

  const apiKey = OPENAI_API_KEY.value();
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      input,
      max_output_tokens: 350,
      reasoning: { effort: 'low' },
      store: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    logger.error('assistantChat: OpenAI error', { status: resp.status, body: text.slice(0, 1000) });
    throw new HttpsError('internal', 'AI service error.');
  }

  const json = await resp.json();
  const answer = extractResponseOutputText(json);
  if (!answer) throw new HttpsError('internal', 'AI service returned no text.');

  return { answer };
});
