/**
 * useTripStatus - React hook for centralized trip status
 *
 * Provides memoized trip status, lifecycle state, and helper booleans
 * for all screens to use consistently.
 */
import { useMemo } from 'react';

import type { Trip } from '@/src/store/tripStore';
import type { Alert } from '@/src/store/alertStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useAlertStore } from '@/src/store/alertStore';
import {
  getTripStatus,
  getTripLifecycleState,
  getTripStatusLabel,
  isTripActive,
  isTripCompleted,
  type TripStatusInfo,
  type TripLifecycleState,
} from '@/src/utils/tripStatus';

export interface UseTripStatusResult {
  statusInfo: TripStatusInfo;
  lifecycle: TripLifecycleState;
  label: string;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  isDelayed: boolean;
  canMonitor: boolean;
  showLiveTracking: boolean;
  showLiveAlerts: boolean;
  showLiveRecommendations: boolean;
  showCompletedUI: boolean;
  monitoringEnabled: boolean;
}

/**
 * Hook that provides full trip status for a given trip.
 * 
 * @param trip - The trip to get status for
 * @param alerts - Optional: pass alerts directly to avoid store subscription (prevents infinite loops)
 */
export function useTripStatus(trip: Trip | null | undefined, alerts: Alert[] = []): UseTripStatusResult {
  const flight = useFlightMonitoringStore((s) =>
    trip ? s.byTripId[trip.id] ?? null : null
  );
  
  // Alerts are passed as parameter - NO store subscription to prevent infinite loops
  const statusInfo = useMemo(
    () => getTripStatus(trip as Trip, flight, alerts),
    [trip, flight, alerts]
  );

  const lifecycle = useMemo(
    () => getTripLifecycleState(trip as Trip, flight, alerts),
    [trip, flight, alerts]
  );

  const label = useMemo(
    () => getTripStatusLabel(trip as Trip, flight, alerts),
    [trip, flight, alerts]
  );

  const active = useMemo(
    () => (trip ? isTripActive(trip, flight, alerts) : false),
    [trip, flight, alerts]
  );

  const completed = useMemo(
    () => (trip ? isTripCompleted(trip, flight) : false),
    [trip, flight]
  );

  return useMemo(
    () => ({
      statusInfo,
      lifecycle,
      label,
      isActive: active,
      isCompleted: completed,
      isCancelled: statusInfo.isCancelled,
      isDelayed: statusInfo.isDelayed,
      canMonitor: lifecycle.canMonitor,
      showLiveTracking: lifecycle.showLiveTracking,
      showLiveAlerts: lifecycle.showLiveAlerts,
      showLiveRecommendations: lifecycle.showLiveRecommendations,
      showCompletedUI: lifecycle.showCompletedUI,
      monitoringEnabled: lifecycle.monitoringEnabled,
    }),
    [statusInfo, lifecycle, label, active, completed]
  );
}

/**
 * Simplified hook for trip lists where you only need status and active/completed check.
 */
export function useTripListStatus(trip: Trip | null | undefined): {
  statusInfo: TripStatusInfo;
  label: string;
  isActive: boolean;
  isCompleted: boolean;
} {
  const statusInfo = useMemo(() => getTripStatus(trip as Trip), [trip]);
  const active = useMemo(() => (trip ? isTripActive(trip) : false), [trip]);
  const completed = useMemo(() => (trip ? isTripCompleted(trip) : false), [trip]);

  return useMemo(
    () => ({
      statusInfo,
      label: statusInfo.label,
      isActive: active,
      isCompleted: completed,
    }),
    [statusInfo, active, completed]
  );
}