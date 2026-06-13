export type Id = string;

/* =========================
   USER
========================= */

export type UserDoc = {
  email: string;
  name?: string;
  premium?: boolean;
  devicePushTokens?: string[];
  createdAt?: any;
  updatedAt?: any;
};

/* =========================
   TRIP (ALIGNED WITH BACKEND)
========================= */

export type TripDoc = {
  userId: Id;
  title: string;

  from: string;
  to: string;

  departureTime: string; // ISO
  arrivalTime: string; // ISO

  airline?: string;
  flightNumber?: string;

  monitoringStatus?: 'on_track' | 'at_risk' | 'unknown';
  lastMileStatus?: 'scheduled' | 'none' | 'in_progress' | 'completed';

  monitoring?: {
    enabled?: boolean;
    lastPollAt?: string;
  };

  // Backend-required for weather + mobility
  destinations?: Array<{
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
  }>;

  hotels?: Array<{
    name?: string;
    lat?: number;
    lng?: number;
  }>;

  createdAt?: any;
  updatedAt?: any;
};

/* =========================
   ALERTS (FULL BACKEND MATCH)
========================= */

export type AlertDoc = {
  userId: Id;
  tripId: Id;

  type:
    | 'flight_delay'
    | 'gate_change'
    | 'cancellation'
    | 'severe_weather'
    | 'traffic'
    | 'advisory';

  severity: 'critical' | 'warning' | 'info';

  riskScore: number; // 0–100
  probability: number; // 0–1

  explanation: string;

  active: boolean;
  read: boolean;

  generatedAt?: any;
};

/* =========================
   RECOMMENDATIONS (BACKEND MATCH)
========================= */

export type RecommendationDoc = {
  userId: Id;
  tripId: Id;

  title: string;
  message: string;

  kind:
    | 'action'
    | 'smart_tip'
    | 'alternative_route'
    | 'alternative_flight'
    | 'transport';

  payload?: Record<string, any>;

  createdAt?: any;
};