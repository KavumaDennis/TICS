/**
 * AI-Powered Alert & Recommendation Engine
 * ──────────────────────────────────────
 * Uses Gemini to generate contextually relevant, unique alerts and
 * recommendations for each trip based on real-time weather, flight,
 * and trip data. Replaces the old template-based system.
 */

import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface TripContext {
  tripId: string;
  userId: string;
  title: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  airline?: string | null;
  flightNumber?: string | null;
  status?: string;
  monitoringStatus?: string;
}

interface WeatherContext {
  location: string;
  tempC: number | null;
  feelsLikeC: number | null;
  description: string | null;
  weatherMain: string | null;
  windKph: number | null;
  humidity: number | null;
  riskScore: number;
  riskSummary?: string;
}

interface FlightContext {
  status: string;
  gate: string | null;
  terminal: string | null;
  delayMinutes: number | null;
  departureActual?: string | null;
}

interface AlertData {
  severity: 'critical' | 'warning' | 'info' | 'low';
  category: 'flight' | 'weather' | 'transport' | 'general' | 'check_in' | 'boarding' | 'gate' | 'baggage';
  title: string;
  message: string;
  recommendation?: string;
}

interface RecommendationData {
  kind: 'alternative_flight' | 'smart_tip' | 'action' | 'transport' | 'weather_advisory' | 'time_optimization';
  category?: string;
  urgency?: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  details?: string;
  confidenceScore?: number;
  actionText?: string;
}

/* ─── Gemini API Call ─────────────────────────────────────────────────────── */

function extractGeminiText(json: any): string {
  return (json?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === 'string')
    .map((p: any) => p.text as string)
    .join('\n')
    .trim();
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          }),
        },
      );

      if (resp.ok) {
        const json = await resp.json();
        const text = extractGeminiText(json);
        if (text) return text;
      } else {
        const errorText = await resp.text();
        lastError = `${model} returned ${resp.status}: ${errorText.substring(0, 200)}`;
        logger.warn(`callGemini: ${lastError}`);
        if (resp.status === 401 || resp.status === 403 || resp.status === 404) break;
      }
    } catch (e: any) {
      lastError = `${model} threw: ${e?.message ?? 'unknown'}`;
      logger.warn(`callGemini: ${lastError}`);
    }
  }

  logger.error(`callGemini: all models failed — ${lastError}`);
  return '';
}

/* ─── Build Trip Context String ───────────────────────────────────────────── */

function buildContextString(
  trip: TripContext,
  weather?: WeatherContext | null,
  flight?: FlightContext | null,
): string {
  const lines: string[] = [];
  lines.push(`Trip: "${trip.title}"`);
  lines.push(`Route: ${trip.from} → ${trip.to}`);
  lines.push(`Departure: ${trip.departureTime}`);
  lines.push(`Arrival: ${trip.arrivalTime}`);
  if (trip.airline) lines.push(`Airline: ${trip.airline}`);
  if (trip.flightNumber) lines.push(`Flight: ${trip.flightNumber}`);
  if (trip.monitoringStatus) lines.push(`Monitoring Status: ${trip.monitoringStatus}`);

  if (flight) {
    lines.push(`\nFlight Data:`);
    lines.push(`  Status: ${flight.status}`);
    lines.push(`  Gate: ${flight.gate ?? 'Not assigned'}`);
    lines.push(`  Terminal: ${flight.terminal ?? 'Not assigned'}`);
    lines.push(`  Delay: ${flight.delayMinutes != null ? `${flight.delayMinutes} min` : 'None'}`);
    if (flight.departureActual) lines.push(`  Actual Departure: ${flight.departureActual}`);
  }

  if (weather) {
    lines.push(`\nWeather at Destination (${weather.location}):`);
    lines.push(`  Temperature: ${weather.tempC != null ? `${weather.tempC}°C` : 'Unknown'}`);
    lines.push(`  Feels Like: ${weather.feelsLikeC != null ? `${weather.feelsLikeC}°C` : 'Unknown'}`);
    lines.push(`  Conditions: ${weather.description ?? 'Unknown'}`);
    lines.push(`  Wind: ${weather.windKph != null ? `${weather.windKph} km/h` : 'Unknown'}`);
    lines.push(`  Humidity: ${weather.humidity != null ? `${weather.humidity}%` : 'Unknown'}`);
    lines.push(`  Weather Risk Score: ${weather.riskScore}/10`);
    if (weather.riskSummary) lines.push(`  Risk Summary: ${weather.riskSummary}`);
  }

  // Compute time deltas
  const now = Date.now();
  const depMs = Date.parse(trip.departureTime);
  const arrMs = Date.parse(trip.arrivalTime);

  if (Number.isFinite(depMs)) {
    const hoursToDep = (depMs - now) / 3_600_000;
    if (hoursToDep > 0) {
      lines.push(`\nTime until departure: ${Math.round(hoursToDep)} hours`);
    } else if (hoursToDep > -2) {
      lines.push(`\nDeparted ${Math.round(Math.abs(hoursToDep))} hours ago`);
    }
  }

  if (Number.isFinite(arrMs)) {
    const hoursToArr = (arrMs - now) / 3_600_000;
    if (hoursToArr > 0 && hoursToArr <= 3) {
      lines.push(`Arriving in ~${Math.round(hoursToArr * 60)} minutes`);
    }
  }

  return lines.join('\n');
}

/* ─── AI Alert Generation ─────────────────────────────────────────────────── */

function parseAlertsFromGemini(text: string): AlertData[] {
  const alerts: AlertData[] = [];

  // Expecting JSON array format from Gemini
  try {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.title && item.message) {
            alerts.push({
              severity: item.severity ?? 'info',
              category: item.category ?? 'general',
              title: item.title,
              message: item.message,
              recommendation: item.recommendation,
            });
          }
        }
      }
    }
  } catch {
    // If JSON parsing fails, try line-by-line parsing
    const lines = text.split('\n').filter((l) => l.trim());
    for (let i = 0; i < lines.length; i += 3) {
      if (lines[i] && lines[i + 1]) {
        alerts.push({
          severity: 'info',
          category: 'general',
          title: lines[i]!.replace(/^[#*•\-]+\s*/, '').trim(),
          message: lines[i + 1]!.replace(/^[#*•\-]+\s*/, '').trim(),
          recommendation: lines[i + 2]?.replace(/^[#*•\-]+\s*/, '').trim(),
        });
      }
    }
  }

  return alerts;
}

const ALERT_SYSTEM_PROMPT = `You are TICS AI, a smart travel intelligence engine. Generate 1-3 concise, actionable alerts for a traveler based on their trip data, flight status, and weather conditions.

Rules:
- Return a JSON array ONLY, no markdown, no explanations outside the JSON
- Each alert object: { "severity": "critical"|"warning"|"info", "category": "flight"|"weather"|"transport"|"general"|"check_in"|"boarding"|"gate"|"baggage", "title": "short title", "message": "1-2 sentence explanation", "recommendation": "actionable next step" }
- Be specific to this trip's actual data (flight number, city names, temperatures, delays)
- If the trip is completed or cancelled, generate 0 alerts (return empty array [])
- If weather risk is high (>=7), generate a severe weather alert
- If flight is delayed >=30min, generate a delay alert
- If flight is within 2 hours of departure, generate a boarding reminder
- If flight is within 30 min of arrival, generate an arrival alert
- NEVER use placeholder text like "[Flight number]" — use the actual values
- Keep messages under 150 characters`;

export async function generateAlertsWithAI(
  apiKey: string,
  trip: TripContext,
  weather?: WeatherContext | null,
  flight?: FlightContext | null,
): Promise<AlertData[]> {
  const context = buildContextString(trip, weather, flight);
  const userPrompt = `Based on this trip data, generate relevant alerts:\n\n${context}\n\nReturn a JSON array of alerts. If none needed, return [].`;

  const geminiResponse = await callGemini(apiKey, ALERT_SYSTEM_PROMPT, userPrompt);
  if (!geminiResponse) {
    logger.info('generateAlertsWithAI: Gemini returned empty, no alerts generated');
    return [];
  }

  const alerts = parseAlertsFromGemini(geminiResponse);
  logger.info(`generateAlertsWithAI: generated ${alerts.length} alerts for trip ${trip.tripId}`);
  return alerts;
}

/* ─── AI Recommendation Generation ────────────────────────────────────────── */

function parseRecommendationsFromGemini(text: string): RecommendationData[] {
  const recs: RecommendationData[] = [];

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.title && item.message) {
            recs.push({
              kind: item.kind ?? 'smart_tip',
              category: item.category,
              urgency: item.urgency,
              title: item.title,
              message: item.message,
              details: item.details,
              confidenceScore: item.confidenceScore,
              actionText: item.actionText,
            });
          }
        }
      }
    }
  } catch {
    const lines = text.split('\n').filter((l) => l.trim());
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i] && lines[i + 1]) {
        recs.push({
          kind: 'smart_tip',
          title: lines[i]!.replace(/^[#*•\-]+\s*/, '').trim(),
          message: lines[i + 1]!.replace(/^[#*•\-]+\s*/, '').trim(),
        });
      }
    }
  }

  return recs;
}

const RECOMMENDATION_SYSTEM_PROMPT = `You are TICS AI, a smart travel intelligence engine. Generate 2-4 personalized recommendations for a traveler based on their trip data, flight status, and weather conditions.

Rules:
- Return a JSON array ONLY, no markdown, no explanations outside the JSON
- Each recommendation object: { "kind": "smart_tip"|"action"|"transport"|"weather_advisory"|"time_optimization"|"alternative_flight", "category": "string (e.g. 'Weather Prep', 'Delay Management', 'Ground Transport')", "urgency": "high"|"medium"|"low", "title": "short title", "message": "1-2 sentence explanation", "details": "optional longer explanation with tips", "confidenceScore": 0.0-1.0, "actionText": "optional CTA button text" }
- Be specific to this trip's actual data (flight number, city names, temperatures, delays)
- If the trip is completed or cancelled, generate 0 recommendations (return empty array [])
- If weather is hot/cold/rainy, give packing advice
- If flight is delayed, suggest delay management
- If arrival is imminent, suggest last-mile transport
- If trip is days away, suggest pre-trip checklist items
- NEVER use placeholder text
- Keep titles under 60 chars, messages under 200 chars`;

export async function generateRecommendationsWithAI(
  apiKey: string,
  trip: TripContext,
  weather?: WeatherContext | null,
  flight?: FlightContext | null,
): Promise<RecommendationData[]> {
  const context = buildContextString(trip, weather, flight);
  const userPrompt = `Based on this trip data, generate personalized recommendations:\n\n${context}\n\nReturn a JSON array of recommendations. If none needed, return [].`;

  const geminiResponse = await callGemini(apiKey, RECOMMENDATION_SYSTEM_PROMPT, userPrompt);
  if (!geminiResponse) {
    logger.info('generateRecommendationsWithAI: Gemini returned empty, no recommendations generated');
    return [];
  }

  const recs = parseRecommendationsFromGemini(geminiResponse);
  logger.info(`generateRecommendationsWithAI: generated ${recs.length} recommendations for trip ${trip.tripId}`);
  return recs;
}

/* ─── Firestore Write Functions ───────────────────────────────────────────── */

export async function writeAIAlerts(
  tripId: string,
  trip: TripContext,
  alerts: AlertData[],
): Promise<void> {
  const batch = db.batch();

  // Clear ALL old alerts for this trip (regardless of source) to remove stale static content
  const oldAlerts = await db.collection('alerts').where('tripId', '==', tripId).get();
  oldAlerts.docs.forEach((d) => batch.delete(d.ref));

  // Also clear from subcollection
  const oldTripAlerts = await db.collection('trips').doc(tripId).collection('alerts').get();
  oldTripAlerts.docs.forEach((d) => batch.delete(d.ref));

  // Write new AI-generated alerts
  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i]!;
    const alertId = `${tripId}_ai_alert_${i}_${Date.now()}`;
    const data = {
      userId: trip.userId,
      tripId,
      severity: a.severity,
      category: a.category,
      title: a.title,
      message: a.message,
      recommendation: a.recommendation ?? null,
      source: 'ai' as const,
      active: true,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    };

    batch.set(db.collection('alerts').doc(alertId), data, { merge: true });
    batch.set(
      db.collection('trips').doc(tripId).collection('alerts').doc(alertId),
      data,
      { merge: true },
    );
  }

  await batch.commit();
  logger.info(`writeAIAlerts: wrote ${alerts.length} alerts for trip ${tripId}`);
}

export async function writeAIRecommendations(
  tripId: string,
  trip: TripContext,
  recs: RecommendationData[],
): Promise<void> {
  const batch = db.batch();

  // Clear ALL old recommendations for this trip (regardless of source)
  const oldRecs = await db.collection('recommendations').where('tripId', '==', tripId).get();
  oldRecs.docs.forEach((d) => batch.delete(d.ref));

  const oldTripRecs = await db.collection('trips').doc(tripId).collection('recommendations').get();
  oldTripRecs.docs.forEach((d) => batch.delete(d.ref));

  // Write new AI-generated recommendations
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]!;
    const recId = `${tripId}_ai_rec_${i}_${Date.now()}`;
    const data = {
      userId: trip.userId,
      tripId,
      kind: r.kind,
      category: r.category ?? null,
      urgency: r.urgency ?? 'medium',
      title: r.title,
      message: r.message,
      details: r.details ?? null,
      confidenceScore: r.confidenceScore ?? 0.85,
      actionText: r.actionText ?? null,
      createdAt: FieldValue.serverTimestamp(),
    };

    batch.set(db.collection('recommendations').doc(recId), data, { merge: true });
    batch.set(
      db.collection('trips').doc(tripId).collection('recommendations').doc(recId),
      data,
      { merge: true },
    );
  }

  await batch.commit();
  logger.info(`writeAIRecommendations: wrote ${recs.length} recommendations for trip ${tripId}`);
}