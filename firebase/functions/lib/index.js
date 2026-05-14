"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantChat = exports.notifyOnNewAlert = exports.cleanupOnTripDelete = exports.syncTripOnUpdate = exports.seedTripArtifactsOnCreate = exports.monitorTrips = void 0;
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
admin.initializeApp();
const db = admin.firestore();
const OPENAI_API_KEY = (0, params_1.defineSecret)('OPENAI_API_KEY');
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
function asIsoString(v) {
    if (!isNonEmptyString(v))
        return null;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function utcNowIso() {
    return new Date().toISOString();
}
function computeTimeDeltas(trip) {
    const now = Date.now();
    const departure = Date.parse(trip.departureTime);
    const arrival = Date.parse(trip.arrivalTime);
    const hoursToDeparture = Number.isFinite(departure) ? (departure - now) / (1000 * 60 * 60) : null;
    const minutesToArrival = Number.isFinite(arrival) ? (arrival - now) / (1000 * 60) : null;
    return { hoursToDeparture, minutesToArrival };
}
function normalizeTripDoc(next) {
    const patch = {};
    const departureIso = asIsoString(next.departureTime);
    const arrivalIso = asIsoString(next.arrivalTime);
    if (departureIso && departureIso !== next.departureTime)
        patch.departureTime = departureIso;
    if (arrivalIso && arrivalIso !== next.arrivalTime)
        patch.arrivalTime = arrivalIso;
    if (!next.monitoringStatus)
        patch.monitoringStatus = 'unknown';
    if (!next.lastMileStatus)
        patch.lastMileStatus = 'none';
    if (isNonEmptyString(next.title) && next.title !== next.title.trim())
        patch.title = next.title.trim();
    if (isNonEmptyString(next.from) && next.from !== next.from.trim())
        patch.from = next.from.trim();
    if (isNonEmptyString(next.to) && next.to !== next.to.trim())
        patch.to = next.to.trim();
    return patch;
}
async function ensureTripSystemFields(tripId, before, after) {
    const patch = normalizeTripDoc(after);
    if (!before?.createdAt)
        patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    if (!Object.keys(patch).length)
        return;
    await db.collection('trips').doc(tripId).set(patch, { merge: true });
}
async function fetchFlightData(_trip) {
    // TODO: Integrate a flight data provider (API keys via Secrets).
    return null;
}
async function fetchWeatherData(_trip) {
    // TODO: Integrate a weather provider.
    return null;
}
function buildGeneratedAlerts(tripId, trip) {
    const { hoursToDeparture, minutesToArrival } = computeTimeDeltas(trip);
    const alerts = [];
    if (hoursToDeparture != null && hoursToDeparture < 0) {
        alerts.push({
            severity: 'info',
            title: 'In Transit',
            message: `Your trip "${trip.title}" has started. Monitoring is active.`,
            active: true,
        });
    }
    else if (hoursToDeparture != null && hoursToDeparture <= 3 && hoursToDeparture >= 0) {
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
function buildGeneratedRecommendations(tripId, trip) {
    const { hoursToDeparture } = computeTimeDeltas(trip);
    const recs = [];
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
async function generateAlerts(userId, tripId, trip) {
    const generated = buildGeneratedAlerts(tripId, trip);
    const alertsCol = db.collection('alerts');
    const batch = db.batch();
    for (const a of generated) {
        const id = `${tripId}_${a.title.replace(/\s+/g, '_').toLowerCase()}`;
        const ref = alertsCol.doc(id);
        batch.set(ref, ({
            userId,
            tripId,
            severity: a.severity,
            title: a.title,
            message: a.message,
            category: 'general',
            active: a.active,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }), { merge: true });
    }
    await batch.commit();
}
async function generateRecommendations(userId, tripId, trip) {
    const generated = buildGeneratedRecommendations(tripId, trip);
    const recCol = db.collection('recommendations');
    const batch = db.batch();
    for (const r of generated) {
        const id = `${tripId}_${r.title.replace(/\s+/g, '_').toLowerCase()}`;
        const ref = recCol.doc(id);
        batch.set(ref, ({
            userId,
            tripId,
            title: r.title,
            message: r.message,
            kind: r.kind,
            ...(r.options ? { options: r.options } : {}),
            ...(r.priceDifference ? { priceDifference: r.priceDifference } : {}),
            ...(r.timeDifference ? { timeDifference: r.timeDifference } : {}),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }), { merge: true });
    }
    await batch.commit();
}
function buildGeneratedTransportOptions(tripId, trip) {
    const { minutesToArrival } = computeTimeDeltas(trip);
    const shouldOfferLastMile = trip.lastMileStatus === 'scheduled' || (minutesToArrival != null && minutesToArrival <= 180 && minutesToArrival >= -180);
    if (!shouldOfferLastMile)
        return [];
    const base = [
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
async function generateTransportOptions(tripId, trip) {
    const generated = buildGeneratedTransportOptions(tripId, trip);
    if (!generated.length)
        return;
    const col = db.collection('transport_options');
    const batch = db.batch();
    for (const opt of generated) {
        batch.set(col.doc(opt.id), opt, { merge: true });
    }
    await batch.commit();
}
async function cleanupTripArtifacts(tripId) {
    const collections = ['alerts', 'recommendations', 'transport_options'];
    const batch = db.batch();
    for (const colName of collections) {
        const snap = await db.collection(colName).where('tripId', '==', tripId).get();
        for (const docSnap of snap.docs)
            batch.delete(docSnap.ref);
    }
    await batch.commit();
}
function withConcurrency(items, limit, fn) {
    let cursor = 0;
    const workers = Array.from({ length: Math.max(1, limit) }, async () => {
        while (cursor < items.length) {
            const idx = cursor++;
            // eslint-disable-next-line no-await-in-loop
            await fn(items[idx]);
        }
    });
    return Promise.all(workers).then(() => undefined);
}
exports.monitorTrips = (0, scheduler_1.onSchedule)('every 15 minutes', async () => {
    const nowIso = utcNowIso();
    const futureIso = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const pastArrivalIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const snap = await db.collection('trips').where('departureTime', '<=', futureIso).orderBy('departureTime', 'asc').limit(500).get();
    firebase_functions_1.logger.info(`monitorTrips: scanning ${snap.size} trips (departureTime <= ${futureIso})`);
    const activeTrips = snap.docs
        .map((d) => ({ id: d.id, trip: d.data() }))
        .filter(({ trip }) => isNonEmptyString(trip?.userId) && isNonEmptyString(trip?.departureTime) && isNonEmptyString(trip?.arrivalTime))
        .filter(({ trip }) => trip.arrivalTime >= pastArrivalIso);
    await withConcurrency(activeTrips, 10, async ({ id, trip }) => {
        await fetchFlightData(trip);
        await fetchWeatherData(trip);
        await generateAlerts(trip.userId, id, trip);
        await generateRecommendations(trip.userId, id, trip);
        await generateTransportOptions(id, trip);
    });
    firebase_functions_1.logger.info(`monitorTrips: completed for ${activeTrips.length} trips at ${nowIso}`);
});
exports.seedTripArtifactsOnCreate = (0, firestore_1.onDocumentCreated)('trips/{tripId}', async (event) => {
    const tripId = String(event.params.tripId);
    const trip = event.data?.data();
    if (!trip || !isNonEmptyString(trip.userId))
        return;
    await ensureTripSystemFields(tripId, null, trip);
    await generateAlerts(trip.userId, tripId, trip);
    await generateRecommendations(trip.userId, tripId, trip);
    await generateTransportOptions(tripId, trip);
});
exports.syncTripOnUpdate = (0, firestore_1.onDocumentUpdated)('trips/{tripId}', async (event) => {
    const tripId = String(event.params.tripId);
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || !isNonEmptyString(after.userId))
        return;
    await ensureTripSystemFields(tripId, before ?? null, after);
    const coreFieldsChanged = before?.title !== after.title ||
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
exports.cleanupOnTripDelete = (0, firestore_1.onDocumentDeleted)('trips/{tripId}', async (event) => {
    const tripId = String(event.params.tripId);
    await cleanupTripArtifacts(tripId);
});
exports.notifyOnNewAlert = (0, firestore_1.onDocumentCreated)('alerts/{alertId}', async (event) => {
    const alert = event.data?.data();
    if (!alert?.userId)
        return;
    const userSnap = await db.collection('users').doc(alert.userId).get();
    const tokens = userSnap.data()?.devicePushTokens ?? [];
    if (!tokens.length)
        return;
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
    }
    catch (e) {
        firebase_functions_1.logger.error('notifyOnNewAlert: failed', e);
    }
});
function extractResponseOutputText(json) {
    const outputs = Array.isArray(json?.output) ? json.output : [];
    const chunks = [];
    for (const item of outputs) {
        if (item?.type !== 'message')
            continue;
        const content = Array.isArray(item?.content) ? item.content : [];
        for (const c of content) {
            if (c?.type === 'output_text' && typeof c?.text === 'string')
                chunks.push(c.text);
        }
    }
    return chunks.join('\n').trim();
}
async function loadTripContext(uid, tripId) {
    if (!tripId)
        return { trip: null, alerts: [], recs: [] };
    const tripSnap = await db.collection('trips').doc(tripId).get();
    if (!tripSnap.exists)
        throw new https_1.HttpsError('not-found', 'Trip not found.');
    const trip = tripSnap.data();
    if (trip.userId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Trip does not belong to the current user.');
    const alertsSnap = await db.collection('alerts').where('tripId', '==', tripId).where('userId', '==', uid).limit(20).get();
    const recSnap = await db.collection('recommendations').where('tripId', '==', tripId).where('userId', '==', uid).limit(10).get();
    return {
        trip,
        alerts: alertsSnap.docs.map((d) => d.data()),
        recs: recSnap.docs.map((d) => d.data()),
    };
}
exports.assistantChat = (0, https_1.onCall)({ secrets: [OPENAI_API_KEY] }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const message = String(req.data?.message ?? '').trim();
    const tripIdRaw = req.data?.tripId ?? null;
    const tripId = tripIdRaw != null ? String(tripIdRaw) : null;
    const history = Array.isArray(req.data?.history) ? req.data.history : [];
    if (!message)
        throw new https_1.HttpsError('invalid-argument', 'Message is required.');
    if (message.length > 2000)
        throw new https_1.HttpsError('invalid-argument', 'Message too long.');
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
            .map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: [{ type: 'input_text', text: String(m?.text ?? '') }] })),
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
        firebase_functions_1.logger.error('assistantChat: OpenAI error', { status: resp.status, body: text.slice(0, 1000) });
        throw new https_1.HttpsError('internal', 'AI service error.');
    }
    const json = await resp.json();
    const answer = extractResponseOutputText(json);
    if (!answer)
        throw new https_1.HttpsError('internal', 'AI service returned no text.');
    return { answer };
});
