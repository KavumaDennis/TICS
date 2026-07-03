export interface OperatorUser {
  uid?: string;
  name: string;
  email: string;
  role: 'operator' | 'admin';
  lodgeName?: string;
  createdAt?: any;
}

export interface TripDoc {
  userId: string;
  title: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  airline?: string;
  flightNumber?: string;
  status?: 'upcoming' | 'boarding' | 'active' | 'airborne' | 'arriving' | 'completed' | 'canceled' | 'delayed';
  monitoringEnabled?: boolean;
  monitoringStatus?: 'on_track' | 'at_risk' | 'unknown';
  lastMileStatus?: 'scheduled' | 'none' | 'in_progress' | 'completed' | 'assigned' | 'pending';
  hotels?: Array<{ name?: string; lat?: number; lng?: number }>;
  destinations?: Array<{ city?: string; country?: string; lat?: number; lng?: number }>;
  createdAt?: any;
  updatedAt?: any;
}

export interface DriverDoc {
  id?: string;
  name: string;
  phone: string;
  vehicle: string;
  plateNumber: string;
  active: boolean;
  lodgeId?: string;
  createdAt?: any;
}

export interface AssignmentDoc {
  id?: string;
  tripId: string;
  travelerId: string;
  travelerName?: string;
  driverName: string;
  driverPhone: string;
  vehicle: string;
  plateNumber: string;
  eta: string;
  assignedBy: string;
  assignedAt: any;
  status: 'assigned' | 'en_route' | 'arrived' | 'completed' | 'cancelled' | 'driver_arrived' | 'ride_started' | 'near_destination';
  pickupLocation?: string;
  notes?: string;
  phone?: string;

  // Ride tracking fields (updated by traveler app)
  driverArrivedAt?: any;
  rideStartedAt?: any;
  completedAt?: any;
  destination?: string;
  destinationLat?: number;
  destinationLng?: number;
  currentLat?: number;
  currentLng?: number;
  distanceRemaining?: number;
  rideDurationSeconds?: number;
  finalDistanceMeters?: number;
  updatedAt?: any;
}

export interface AlertDoc {
  userId: string;
  tripId: string;
  type: 'flight_delay' | 'gate_change' | 'cancellation' | 'severe_weather' | 'traffic' | 'advisory';
  severity: 'critical' | 'warning' | 'info';
  riskScore: number;
  probability: number;
  explanation: string;
  active: boolean;
  read: boolean;
  generatedAt?: any;
}

export interface RecommendationDoc {
  userId: string;
  tripId: string;
  title: string;
  message: string;
  kind: 'action' | 'smart_tip' | 'alternative_route' | 'alternative_flight' | 'transport';
  payload?: Record<string, any>;
  createdAt?: any;
}