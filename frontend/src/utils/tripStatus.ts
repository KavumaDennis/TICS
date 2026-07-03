/**
 * Centralized Trip Status Engine
 *
 * Single source of truth for trip lifecycle state.
 * Every trip derives its status automatically from:
 * - departureTime / arrivalTime
 * - current server time
 * - flight monitoring data (if available)
 * - alerts (if available)
 *
 * Possible statuses: upcoming | boarding | active | airborne | arriving | completed | cancelled | delayed
 *
 * Example logic:
 * - Before departure → upcoming
 * - Within 2h of departure → boarding
 * - After departure before arrival → airborne
 * - After arrival time + grace period → completed
 * - If API says delayed → delayed
 * - If API says cancelled → cancelled
 */

import type { Trip } from '@/src/store/tripStore';
import type { FlightMonitoring } from '@/src/store/flightMonitoringStore';
import type { Alert } from '@/src/store/alertStore';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type TripStatus =
  | 'upcoming'
  | 'boarding'
  | 'active'
  | 'airborne'
  | 'arriving'
  | 'completed'
  | 'cancelled'
  | 'delayed';

export interface TripStatusInfo {
  status: TripStatus;
  label: string;
  color: string;
  bgColor: string;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  isDelayed: boolean;
  progress: number; // 0–1 based on departure → arrival window
}

export interface TripLifecycleState {
  statusInfo: TripStatusInfo;
  canMonitor: boolean;
  showLiveTracking: boolean;
  showLiveAlerts: boolean;
  showLiveRecommendations: boolean;
  showCompletedUI: boolean;
  monitoringEnabled: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const GRACE_PERIOD_MS = 45 * 60 * 1000; // 45 minutes grace period after arrival
const BOARDING_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours before departure = boarding
const ARRIVING_WINDOW_MS = 30 * 60 * 1000; // 30 minutes before arrival = arriving

export const STATUS_META: Record<TripStatus, { label: string; color: string; bgColor: string; isActive: boolean; isCompleted: boolean }> = {
  upcoming: {
    label: 'Upcoming',
    color: '#3B82F6',
    bgColor: 'rgba(59,130,246,0.15)',
    isActive: true,
    isCompleted: false,
  },
  boarding: {
    label: 'Boarding',
    color: '#F59E0B',
    bgColor: 'rgba(245,158,11,0.15)',
    isActive: true,
    isCompleted: false,
  },
  active: {
    label: 'Active',
    color: '#22C55E',
    bgColor: 'rgba(34,197,94,0.15)',
    isActive: true,
    isCompleted: false,
  },
  airborne: {
    label: 'Airborne ✈',
    color: '#22C55E',
    bgColor: 'rgba(34,197,94,0.15)',
    isActive: true,
    isCompleted: false,
  },
  arriving: {
    label: 'Arriving',
    color: '#14B8A6',
    bgColor: 'rgba(20,184,166,0.15)',
    isActive: true,
    isCompleted: false,
  },
  completed: {
    label: 'Completed',
    color: 'rgba(150,199,179,0.6)',
    bgColor: 'rgba(150,199,179,0.4)',
    isActive: false,
    isCompleted: true,
  },
  cancelled: {
    label: 'Cancelled',
    color: '#EF4444',
    bgColor: 'rgba(239,68,68,0.15)',
    isActive: false,
    isCompleted: false,
  },
  delayed: {
    label: 'Delayed',
    color: '#F59E0B',
    bgColor: 'rgba(245,158,11,0.15)',
    isActive: true,
    isCompleted: false,
  },
};

// ─── Core Status Computation ───────────────────────────────────────────────────

/**
 * SINGLE SOURCE OF TRUTH for trip status.
 *
 * Order of precedence (highest first):
 * 1. Firestore `trip.status` — explicit "completed" or "canceled" always wins
 * 2. Flight API "canceled" — overrides time-based
 * 3. Time-based completion — if arrival + grace period passed
 * 4. Flight delay (≥30 min via AviationStack)
 * 5. Critical active alerts
 * 6. Time-based: boarding → airborne → arriving → active
 *
 * IMPORTANT: Every screen MUST use this function with the SAME inputs.
 * Do NOT compute status independently anywhere else.
 */
export function getTripStatus(
  trip: Trip | null | undefined,
  flight?: FlightMonitoring | null,
  alerts?: Alert[] | null,
  now?: number
): TripStatusInfo {
  const currentTime = now ?? Date.now();

  // Handle null/undefined trip
  if (!trip) {
    return buildStatusInfo('upcoming');
  }

  const depMs = Date.parse(trip.departureTime);
  const arrMs = Date.parse(trip.arrivalTime);

  // ── Step 1: Check Firestore explicit status (highest authority) ─────────
  if (trip.status === 'completed') {
    return buildStatusInfo('completed');
  }
  if (trip.status === 'canceled') {
    return buildStatusInfo('cancelled');
  }

  // ── Step 2: Flight API cancel override ──────────────────────────────────
  if (flight?.status === 'canceled') {
    return buildStatusInfo('cancelled');
  }

  // ── Step 3: Time-based completion (past arrival + grace period) ─────────
  if (Number.isFinite(arrMs) && currentTime > arrMs + GRACE_PERIOD_MS) {
    return buildStatusInfo('completed');
  }

  // ── Step 4: Flight delay ────────────────────────────────────────────────
  if (flight?.delayMinutes != null && flight.delayMinutes >= 30) {
    return buildStatusInfo('delayed');
  }

  // ── Step 5: Critical active alerts ──────────────────────────────────────
  if (alerts?.some((a) => a.active && a.severity === 'critical' && !a.read)) {
    return buildStatusInfo('delayed');
  }

  // ── Step 6: Time-based status derivation ────────────────────────────────
  if (!Number.isFinite(depMs) || !Number.isFinite(arrMs)) {
    return buildStatusInfo('upcoming');
  }

  if (currentTime < depMs) {
    // Before departure
    const timeUntilDep = depMs - currentTime;
    if (timeUntilDep <= BOARDING_WINDOW_MS) {
      return buildStatusInfo('boarding');
    }
    return buildStatusInfo('upcoming');
  }

  if (currentTime >= depMs && currentTime <= arrMs) {
    // Between departure and arrival
    if (flight?.status === 'active') {
      return buildStatusInfo('airborne');
    }
    // Check if close to arrival
    const timeUntilArr = arrMs - currentTime;
    if (timeUntilArr <= ARRIVING_WINDOW_MS) {
      return buildStatusInfo('arriving');
    }
    return buildStatusInfo('active');
  }

  // After arrival but within grace period
  if (currentTime > arrMs && currentTime <= arrMs + GRACE_PERIOD_MS) {
    return buildStatusInfo('arriving');
  }

  // Fallback
  return buildStatusInfo('upcoming');
}

function buildStatusInfo(status: TripStatus): TripStatusInfo {
  const meta = STATUS_META[status];
  return {
    status,
    label: meta.label,
    color: meta.color,
    bgColor: meta.bgColor,
    isActive: meta.isActive,
    isCompleted: meta.isCompleted,
    isCancelled: status === 'cancelled',
    isDelayed: status === 'delayed',
    progress: 0, // computed separately
  };
}

/**
 * Get full trip lifecycle state including monitoring flags
 */
export function getTripLifecycleState(
  trip: Trip | null | undefined,
  flight?: FlightMonitoring | null,
  alerts?: Alert[] | null,
  now?: number
): TripLifecycleState {
  const statusInfo = getTripStatus(trip, flight, alerts, now);
  const isCompletedState = statusInfo.isCompleted;
  const isCancelledState = statusInfo.isCancelled;

  // Compute progress for time-based trips
  const depMs = trip ? Date.parse(trip.departureTime) : NaN;
  const arrMs = trip ? Date.parse(trip.arrivalTime) : NaN;
  const currentTime = now ?? Date.now();

  let progress = 0;
  if (Number.isFinite(depMs) && Number.isFinite(arrMs) && arrMs > depMs) {
    if (currentTime <= depMs) {
      progress = 0;
    } else if (currentTime >= arrMs) {
      progress = 1;
    } else {
      progress = (currentTime - depMs) / (arrMs - depMs);
    }
  }

  return {
    statusInfo: { ...statusInfo, progress },
    canMonitor: !isCompletedState && !isCancelledState,
    showLiveTracking: !isCompletedState && !isCancelledState,
    showLiveAlerts: !isCompletedState && !isCancelledState,
    showLiveRecommendations: !isCompletedState && !isCancelledState,
    showCompletedUI: isCompletedState || isCancelledState,
    monitoringEnabled: !isCompletedState && !isCancelledState,
  };
}

/**
 * Simple check if a trip should be considered "active" (not completed/cancelled)
 */
export function isTripActive(
  trip: Trip,
  flight?: FlightMonitoring | null,
  alerts?: Alert[] | null
): boolean {
  const info = getTripStatus(trip, flight, alerts);
  return info.isActive && !info.isCompleted && !info.isCancelled;
}

/**
 * Check if a trip has completed (past arrival + grace period or explicitly marked).
 * Delegates to getTripStatus() to ensure consistency across the entire app.
 */
export function isTripCompleted(
  trip: Trip,
  flight?: FlightMonitoring | null
): boolean {
  return getTripStatus(trip, flight).isCompleted;
}

/**
 * Get display label for a trip (shorthand)
 */
export function getTripStatusLabel(trip: Trip, flight?: FlightMonitoring | null, alerts?: Alert[] | null): string {
  return getTripStatus(trip, flight, alerts).label;
}

/**
 * Returns the appropriate icon name based on trip status
 */
export function getTripStatusIcon(status: TripStatus): string {
  switch (status) {
    case 'upcoming':
      return 'calendar-outline';
    case 'boarding':
      return 'enter-outline';
    case 'active':
      return 'pulse-outline';
    case 'airborne':
      return 'airplane';
    case 'arriving':
      return 'location-outline';
    case 'completed':
      return 'checkmark-circle-outline';
    case 'cancelled':
      return 'close-circle-outline';
    case 'delayed':
      return 'time-outline';
    default:
      return 'ellipse-outline';
  }
}