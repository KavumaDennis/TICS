/**
 * lastMileTypes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Type definitions for the Country-wide Last Mile Travel Assistance System.
 * All collections used by the traveler app, operator dashboard, and driver app.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Id } from './types';

/* ── Tour Operators (from operators collection, same as web portal) ──────── */

export interface OperatorDoc {
  id?: string;
  name: string;
  email: string;
  role?: 'operator' | 'admin';
  lodgeName?: string;
  phone?: string;
  description?: string;
  rating?: number;
  averageRating?: number;
  totalRatings?: number;
  languages?: string[];
  country?: string;
  logoUrl?: string;
  profileImage?: string;
  website?: string;
  availableDrivers?: number;
  active?: boolean;
  contactPhone?: string;
  contactEmail?: string;
  location?: string;
  createdAt?: any;
  updatedAt?: any;
}

/* ── Traveler ↔ Operator Relationship ────────────────────────────────────── */

export interface TravelerOperatorDoc {
  id?: string;
  travelerId: Id;
  operatorId: Id;
  operatorName?: string;
  operatorPhone?: string;
  operatorLogo?: string;
  travelerName?: string;
  tripId: Id;
  assignedAt: any;
  active: boolean;
  updatedAt?: any;
}

/* ── Ride Requests (traveler-initiated) ──────────────────────────────────── */

export interface RideRequestDoc {
  id?: string;
  travelerId: Id;
  operatorId: Id;
  tripId: Id;
  pickupLocation: string;
  pickupLat?: number;
  pickupLng?: number;
  destination: string;
  destinationLat?: number;
  destinationLng?: number;
  notes?: string;
  status: 'pending' | 'accepted' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: any;
  updatedAt?: any;
}

/* ── Rides (completed ride records) ──────────────────────────────────────── */

export interface RideDoc {
  id?: string;
  travelerId: Id;
  operatorId: Id;
  operatorName?: string;
  tripId: Id;
  rideRequestId?: Id;
  assignmentId?: Id;
  driverId?: Id;
  driverName?: string;
  driverPhone?: string;
  vehicle?: string;
  plateNumber?: string;
  pickupLocation: string;
  pickupLat?: number;
  pickupLng?: number;
  destination: string;
  destinationLat?: number;
  destinationLng?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  fare?: number;
  currency?: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt?: any;
  completedAt?: any;
  createdAt: any;
}

/* ── Live Traveler Location (updated every few seconds) ──────────────────── */

export interface TravelerLocationDoc {
  travelerId: Id;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: any;
}

/* ── Live Driver Location (updated every few seconds) ────────────────────── */

export interface DriverLocationDoc {
  driverId: Id;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: any;
}

/* ── Notifications (Firestore-based) ─────────────────────────────────────── */

export interface NotificationDoc {
  id?: string;
  userId: Id;
  userType: 'traveler' | 'operator' | 'driver';
  type:
    | 'operator_accepted'
    | 'driver_assigned'
    | 'driver_arriving'
    | 'driver_arrived'
    | 'ride_started'
    | 'near_destination'
    | 'ride_completed'
    | 'new_traveler'
    | 'ride_requested'
    | 'traveler_arrived'
    | 'new_assignment'
    | 'ride_cancelled'
    | 'destination_updated';
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: any;
}

/* ── Trip History (timeline entries) ─────────────────────────────────────── */

export interface TripHistoryDoc {
  id?: string;
  travelerId: Id;
  tripId: Id;
  type: 'flight_arrival' | 'hotel_checkin' | 'ride' | 'attraction' | 'meal' | 'other';
  title: string;
  subtitle?: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  rideId?: Id;
  timestamp: any;
  order: number;
  createdAt: any;
}