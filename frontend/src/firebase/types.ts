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

  /** Centralized dynamic trip status */
  status?: 'upcoming' | 'boarding' | 'active' | 'airborne' | 'arriving' | 'completed' | 'canceled' | 'delayed';
  /** When the trip was marked completed */
  completedAt?: any;
  /** Monitoring toggle */
  monitoringEnabled?: boolean;
  /** Last time the status was synced */
  lastSyncedAt?: any;

  monitoringStatus?: 'on_track' | 'at_risk' | 'unknown';
  lastMileStatus?: 'scheduled' | 'none' | 'in_progress' | 'completed' | 'assigned' | 'pending';

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

  /** Booking reference / PNR from email sync or booking import */
  bookingReference?: string;
  /** Confirmation number from booking providers */
  confirmationNumber?: string;
  /** Booking provider name (Expedia, Booking.com, etc.) */
  bookingProvider?: string;
  /** Booking provider type */
  bookingProviderType?: string;
  /** Hotel name (from hotel bookings) */
  hotelName?: string;
  /** Number of passengers */
  passengers?: number;
  /** Total price paid */
  totalPrice?: string;
  /** Whether this trip was imported from a booking confirmation */
  _bookingImport?: boolean;
  /** Source provider for booking import */
  _bookingImportSource?: string;
  /** Email sync source (gmail/outlook) */
  _emailSyncSource?: string;
  /** Email sync message ID */
  _emailSyncId?: string;

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