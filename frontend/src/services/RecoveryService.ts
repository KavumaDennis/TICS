/**
 * RecoveryService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trip Recovery Engine — Detect → Analyze → Recommend → Execute → Update
 *
 * Core Principle:
 *   Trip Recovery = Detect → Analyze → Recommend → Execute → Update
 *
 * Architecture:
 *   Monitoring Engine (flight, weather, time, maps, location)
 *       → Disruption Detection (rule-based)
 *       → Recovery Engine (applies business logic rules)
 *       → Recovery Actions (checklist)
 *       → Notifications (traveler, operator, driver, hotel)
 *
 * This is NOT AI — it's business logic stored as JSON rules.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Timestamp } from 'firebase/firestore';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface FlightData {
  status: string; // 'scheduled' | 'active' | 'landed' | 'canceled' | 'delayed'
  delayMinutes: number | null;
  gate: string | null;
  terminal: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
}

export interface WeatherData {
  tempC: number | null;
  feelsLikeC: number | null;
  description: string | null;
  windKph: number | null;
  riskScore: number;
  label: string;
}

export interface MonitoringContext {
  tripId: string;
  flight: FlightData | null;
  weather: WeatherData | null;
  currentETA: number | null; // minutes until arrival
  plannedETA: number | null; // originally planned ETA in minutes
  userLocation: { lat: number; lng: number } | null;
  departureTime: string | null;
  arrivalTime: string | null;
  lastMileStatus: string;
  pickupTime: string | null;
  checkinTime: string | null;
}

/* ── Disruption Types ──────────────────────────────────────────────────────── */

export type DisruptionType =
  | 'flight_delayed'
  | 'flight_cancelled'
  | 'weather_severe'
  | 'late_arrival'
  | 'missed_pickup'
  | 'traffic_delay'
  | 'none';

export interface DisruptionEvent {
  type: DisruptionType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  detectedAt: string;
  details: Record<string, any>;
}

/* ── Recovery Action ───────────────────────────────────────────────────────── */

export interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  target: 'traveler' | 'operator' | 'driver' | 'hotel';
  completed: boolean;
  icon: string;
}

export interface RecoveryPlan {
  disruption: DisruptionEvent;
  actions: RecoveryAction[];
  newETA: string | null;
  summary: string;
  status: 'active' | 'completed' | 'dismissed';
}

/* ── Recovery Rule ─────────────────────────────────────────────────────────── */

interface RecoveryRule {
  event: DisruptionType;
  condition?: (ctx: MonitoringContext) => boolean;
  actions: Omit<RecoveryAction, 'id' | 'completed'>[];
  summary: string;
  newETA?: (ctx: MonitoringContext) => string | null;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Step 1 — Monitor the Journey
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Monitors a trip's journey by checking all data sources.
 * This is the entry point called by the monitoring engine on each cycle.
 */
export function monitorJourney(ctx: MonitoringContext): MonitoringContext {
  // Validate all data sources are present
  // The actual monitoring is done by the existing services (flight, weather, etc.)
  // This function serves as the orchestration point
  return ctx;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Step 2 — Detect a Disruption
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Detects disruptions by comparing live data with the original itinerary.
 * Returns the first detected disruption or 'none' if everything is clear.
 */
export function detectDisruption(ctx: MonitoringContext): DisruptionEvent {
  // Rule 1: Flight delayed > 30 minutes
  if (ctx.flight && ctx.flight.delayMinutes != null && ctx.flight.delayMinutes > 30) {
    return {
      type: 'flight_delayed',
      severity: ctx.flight.delayMinutes > 90 ? 'critical' : ctx.flight.delayMinutes > 60 ? 'warning' : 'info',
      title: 'Flight Delayed',
      message: `Your flight has been delayed by ${ctx.flight.delayMinutes} minutes.`,
      detectedAt: new Date().toISOString(),
      details: { delayMinutes: ctx.flight.delayMinutes, gate: ctx.flight.gate, terminal: ctx.flight.terminal },
    };
  }

  // Rule 2: Flight cancelled
  if (ctx.flight && (ctx.flight.status === 'canceled' || ctx.flight.status === 'cancelled')) {
    return {
      type: 'flight_cancelled',
      severity: 'critical',
      title: 'Flight Cancelled',
      message: 'Your flight has been cancelled. Please contact your airline for rebooking.',
      detectedAt: new Date().toISOString(),
      details: { status: ctx.flight.status, gate: ctx.flight.gate },
    };
  }

  // Rule 3: Severe weather
  if (ctx.weather && ctx.weather.riskScore >= 7) {
    return {
      type: 'weather_severe',
      severity: 'warning',
      title: 'Severe Weather Warning',
      message: `Severe weather conditions detected at your destination: ${ctx.weather.description ?? 'adverse conditions'}.`,
      detectedAt: new Date().toISOString(),
      details: {
        tempC: ctx.weather.tempC,
        windKph: ctx.weather.windKph,
        riskScore: ctx.weather.riskScore,
        description: ctx.weather.description,
      },
    };
  }

  // Rule 4: Late arrival (user ETA > planned ETA)
  if (ctx.currentETA != null && ctx.plannedETA != null && ctx.currentETA > ctx.plannedETA + 15) {
    const lateBy = ctx.currentETA - ctx.plannedETA;
    return {
      type: 'late_arrival',
      severity: lateBy > 30 ? 'warning' : 'info',
      title: 'Late Arrival Detected',
      message: `You're estimated to arrive ${Math.round(lateBy)} minutes later than planned.`,
      detectedAt: new Date().toISOString(),
      details: { currentETA: ctx.currentETA, plannedETA: ctx.plannedETA, lateBy: Math.round(lateBy) },
    };
  }

  // Rule 5: Road traffic (ETA recalculated)
  if (ctx.currentETA != null && ctx.plannedETA != null && ctx.currentETA > ctx.plannedETA + 10) {
    return {
      type: 'traffic_delay',
      severity: 'info',
      title: 'Traffic Delay',
      message: 'Traffic is heavier than expected. Your ETA has been updated.',
      detectedAt: new Date().toISOString(),
      details: { currentETA: ctx.currentETA, plannedETA: ctx.plannedETA },
    };
  }

  // No disruption detected
  return {
    type: 'none',
    severity: 'info',
    title: 'All Clear',
    message: 'Everything is on track for your trip.',
    detectedAt: new Date().toISOString(),
    details: {},
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * Recovery Rules Table — stored as JSON instead of hardcoded
 * ════════════════════════════════════════════════════════════════════════════ */

const RECOVERY_RULES: RecoveryRule[] = [
  {
    event: 'flight_delayed',
    severity: 'warning',
    title: 'Flight Delayed',
    message: 'Your flight has been delayed. Here\'s your recovery plan.',
    summary: 'Coordinating updates with your driver, operator, and accommodations.',
    newETA: (ctx) => {
      if (ctx.flight?.arrivalTime) {
        const arrival = new Date(ctx.flight.arrivalTime);
        if (ctx.flight.delayMinutes) {
          arrival.setMinutes(arrival.getMinutes() + ctx.flight.delayMinutes);
        }
        return arrival.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      return null;
    },
    actions: [
      {
        label: 'Notify operator',
        description: 'Alert your tour operator about the schedule change',
        target: 'operator',
        icon: 'business-outline',
      },
      {
        label: 'Update pickup time',
        description: 'Adjust driver pickup to match new arrival',
        target: 'driver',
        icon: 'car-outline',
      },
      {
        label: 'Notify driver',
        description: 'Send updated arrival details to your driver',
        target: 'driver',
        icon: 'person-outline',
      },
      {
        label: 'Notify hotel',
        description: 'Inform hotel of late check-in',
        target: 'hotel',
        icon: 'bed-outline',
      },
    ],
  },
  {
    event: 'flight_cancelled',
    severity: 'critical',
    title: 'Flight Cancelled',
    message: 'Your flight has been cancelled. Contact your airline for rebooking options.',
    summary: 'Showing airline support options and notifying your contacts.',
    newETA: () => null,
    actions: [
      {
        label: 'Contact airline',
        description: 'Call or chat with airline support for rebooking',
        target: 'traveler',
        icon: 'airplane-outline',
      },
      {
        label: 'Contact operator',
        description: 'Advise your tour operator of the cancellation',
        target: 'operator',
        icon: 'business-outline',
      },
      {
        label: 'Cancel pickup',
        description: 'Notify driver pickup is cancelled',
        target: 'driver',
        icon: 'car-outline',
      },
      {
        label: 'Cancel hotel',
        description: 'Inform hotel you won\'t arrive tonight',
        target: 'hotel',
        icon: 'bed-outline',
      },
    ],
  },
  {
    event: 'weather_severe',
    severity: 'warning',
    title: 'Weather Alert',
    message: 'Severe weather may affect your travel plans.',
    summary: 'Warnings issued and alternate plans being prepared.',
    newETA: (ctx) => {
      if (ctx.flight?.arrivalTime) {
        const arrival = new Date(ctx.flight.arrivalTime);
        arrival.setMinutes(arrival.getMinutes() + 30);
        return arrival.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      return null;
    },
    actions: [
      {
        label: 'Warn traveler',
        description: 'Advise on weather preparation and safety',
        target: 'traveler',
        icon: 'warning-outline',
      },
      {
        label: 'Update travel timing',
        description: 'Adjust schedule based on weather delays',
        target: 'operator',
        icon: 'time-outline',
      },
      {
        label: 'Notify operator',
        description: 'Alert operator about weather conditions',
        target: 'operator',
        icon: 'business-outline',
      },
    ],
  },
  {
    event: 'late_arrival',
    severity: 'info',
    title: 'Late Arrival',
    message: 'You\'re arriving later than planned. Adjustments are being made.',
    summary: 'Your pickup and schedule have been updated for the new arrival time.',
    newETA: (ctx) => {
      if (ctx.currentETA != null) {
        const eta = new Date();
        eta.setMinutes(eta.getMinutes() + ctx.currentETA);
        return eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      return null;
    },
    actions: [
      {
        label: 'Update pickup time',
        description: 'Adjust driver pickup to match new arrival',
        target: 'driver',
        icon: 'car-outline',
      },
      {
        label: 'Notify driver',
        description: 'Send updated ETA to your driver',
        target: 'driver',
        icon: 'person-outline',
      },
      {
        label: 'Notify operator',
        description: 'Alert operator of schedule change',
        target: 'operator',
        icon: 'business-outline',
      },
    ],
  },
  {
    event: 'traffic_delay',
    severity: 'info',
    title: 'Traffic Delay',
    message: 'Heavier traffic than expected. Your ETA has been recalculated.',
    summary: 'Routes recalculated and schedules adjusted.',
    newETA: (ctx) => {
      if (ctx.currentETA != null) {
        const eta = new Date();
        eta.setMinutes(eta.getMinutes() + ctx.currentETA);
        return eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      return null;
    },
    actions: [
      {
        label: 'Recalculate ETA',
        description: 'Routes optimized for current traffic conditions',
        target: 'traveler',
        icon: 'map-outline',
      },
      {
        label: 'Notify driver',
        description: 'Update driver with new arrival estimate',
        target: 'driver',
        icon: 'person-outline',
      },
    ],
  },
  {
    event: 'missed_pickup',
    severity: 'critical',
    title: 'Missed Pickup',
    message: 'Your driver was unable to complete the pickup.',
    summary: 'Operator has been notified and alternative arrangements are being made.',
    newETA: () => null,
    actions: [
      {
        label: 'Notify operator immediately',
        description: 'Emergency alert sent to operator dashboard',
        target: 'operator',
        icon: 'alert-circle-outline',
      },
      {
        label: 'Arrange alternative',
        description: 'Operator is arranging a new pickup',
        target: 'traveler',
        icon: 'car-outline',
      },
    ],
  },
];

/* ════════════════════════════════════════════════════════════════════════════
 * Step 3 & 4 — Recovery Engine: Analyze & Generate Actions
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Generates a recovery plan based on the detected disruption.
 * The engine looks up the matching rule and generates a checklist of actions.
 */
export function generateRecoveryPlan(disruption: DisruptionEvent, ctx: MonitoringContext): RecoveryPlan {
  // Find matching rule
  const rule = RECOVERY_RULES.find((r) => r.event === disruption.type);

  if (!rule) {
    // Default plan for unknown disruptions
    return {
      disruption,
      actions: [
        {
          id: 'notify-operator',
          label: 'Notify operator',
          description: 'Alert your tour operator about the situation',
          target: 'operator',
          completed: false,
          icon: 'business-outline',
        },
      ],
      newETA: null,
      summary: 'Monitoring the situation and will update you shortly.',
      status: 'active',
    };
  }

  const newETA = rule.newETA ? rule.newETA(ctx) : null;

  // Generate action checklist
  const actions: RecoveryAction[] = rule.actions.map((a, index) => ({
    id: `action-${index}-${a.label.toLowerCase().replace(/\s+/g, '-')}`,
    label: a.label,
    description: a.description,
    target: a.target,
    completed: false,
    icon: a.icon,
  }));

  return {
    disruption: {
      ...disruption,
      title: rule.title,
      message: rule.message,
      severity: rule.severity,
    },
    actions,
    newETA,
    summary: rule.summary,
    status: 'active',
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * Step 5 — Mark Action Complete
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Marks a specific action in the recovery plan as completed.
 */
export function completeAction(plan: RecoveryPlan, actionId: string): RecoveryPlan {
  return {
    ...plan,
    actions: plan.actions.map((a) =>
      a.id === actionId ? { ...a, completed: true } : a
    ),
  };
}

/**
 * Checks if all actions in the plan are completed.
 */
export function isPlanComplete(plan: RecoveryPlan): boolean {
  return plan.actions.every((a) => a.completed);
}

/* ════════════════════════════════════════════════════════════════════════════
 * Helper — Create Monitoring Context from Trip Data
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Creates a MonitoringContext from trip data and live service data.
 */
export function buildMonitoringContext(
  tripId: string,
  trip: any,
  flightData: any,
  weatherData: any,
  currentETA: number | null,
  plannedETA: number | null,
  userLocation: { lat: number; lng: number } | null,
): MonitoringContext {
  return {
    tripId,
    flight: flightData
      ? {
          status: flightData.status ?? 'scheduled',
          delayMinutes: flightData.delayMinutes ?? null,
          gate: flightData.gate ?? null,
          terminal: flightData.terminal ?? null,
          departureAirport: flightData.departureAirport ?? null,
          arrivalAirport: flightData.arrivalAirport ?? null,
          departureTime: flightData.departureTime ?? null,
          arrivalTime: flightData.arrivalTime ?? null,
        }
      : null,
    weather: weatherData
      ? {
          tempC: weatherData.tempC ?? null,
          feelsLikeC: weatherData.feelsLikeC ?? null,
          description: weatherData.description ?? null,
          windKph: weatherData.windKph ?? null,
          riskScore: weatherData.riskScore ?? 0,
          label: weatherData.label ?? 'Unknown',
        }
      : null,
    currentETA,
    plannedETA,
    userLocation,
    departureTime: trip?.departureTime ?? null,
    arrivalTime: trip?.arrivalTime ?? null,
    lastMileStatus: trip?.lastMileStatus ?? 'none',
    pickupTime: trip?.pickupTime ?? null,
    checkinTime: trip?.checkinTime ?? null,
  };
}

export { RECOVERY_RULES };