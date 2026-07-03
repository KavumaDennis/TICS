/**
 * rideTrackingStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand store for live ride tracking state.
 * Manages assignment data, route, location, and UI state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import type { Unsubscribe } from 'firebase/firestore';

import type { AssignmentDoc, RideStatus } from '@/src/services/RideStatusService';
import type { TravelerLocation } from '@/src/services/LocationService';
import type { DirectionResult } from '@/src/services/DirectionsService';

export interface RideTrackingState {
  /* ── Assignment data ────── */
  assignment: AssignmentDoc | null;
  assignmentId: string | null;
  assignmentLoading: boolean;
  assignmentError: string | null;

  /* ── Location & route ───── */
  currentLocation: TravelerLocation | null;
  route: DirectionResult | null;
  routeLoading: boolean;

  /* ── UI state ───────────── */
  rideStep: 'idle' | 'driver_arrived' | 'selecting_destination' | 'tracking' | 'near_destination' | 'completed';
  distanceRemainingMeters: number;
  durationRemainingSeconds: number;
  rideStartTime: number | null; // ms timestamp when ride started

  /* ── Actions ────────────── */
  setAssignment: (id: string, data: AssignmentDoc) => void;
  clearAssignment: () => void;
  setAssignmentLoading: (v: boolean) => void;
  setAssignmentError: (e: string | null) => void;
  setCurrentLocation: (loc: TravelerLocation) => void;
  setRoute: (route: DirectionResult | null) => void;
  setRouteLoading: (v: boolean) => void;
  setRideStep: (step: RideTrackingState['rideStep']) => void;
  setDistanceRemaining: (m: number) => void;
  setDurationRemaining: (s: number) => void;
  setRideStartTime: (t: number | null) => void;
  reset: () => void;
}

const initialState = {
  assignment: null as AssignmentDoc | null,
  assignmentId: null as string | null,
  assignmentLoading: false,
  assignmentError: null as string | null,
  currentLocation: null as TravelerLocation | null,
  route: null as DirectionResult | null,
  routeLoading: false,
  rideStep: 'idle' as const,
  distanceRemainingMeters: 0,
  durationRemainingSeconds: 0,
  rideStartTime: null as number | null,
};

export const useRideTrackingStore = create<RideTrackingState>((set) => ({
  ...initialState,

  setAssignment: (id, data) =>
    set({
      assignmentId: id,
      assignment: data,
      assignmentLoading: false,
      assignmentError: null,
    }),

  clearAssignment: () => set(initialState),

  setAssignmentLoading: (v) => set({ assignmentLoading: v }),

  setAssignmentError: (e) =>
    set({ assignmentError: e, assignmentLoading: false }),

  setCurrentLocation: (loc) => set({ currentLocation: loc }),

  setRoute: (route) => set({ route, routeLoading: false }),

  setRouteLoading: (v) => set({ routeLoading: v }),

  setRideStep: (step) => set({ rideStep: step }),

  setDistanceRemaining: (m) => set({ distanceRemainingMeters: m }),

  setDurationRemaining: (s) => set({ durationRemainingSeconds: s }),

  setRideStartTime: (t) => set({ rideStartTime: t }),

  reset: () => set(initialState),
}));
