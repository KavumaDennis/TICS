import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Plane,
  Hotel,
  Clock,
  Phone,
  AlertTriangle,
  Shield,
  Car,
  Brain,
  Calendar,
  MapPin,
  Loader2,
  ChevronRight,
  Navigation,
  MessageCircle,
  History,
  Route,
  CheckCircle,
  Circle,
} from 'lucide-react';
import { doc, collection, query, where, onSnapshot, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import type { TripDoc, AlertDoc, RecommendationDoc, AssignmentDoc } from '../types';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface RideRecord {
  id: string;
  pickupLocation: string;
  destination: string;
  distanceMeters?: number;
  durationSeconds?: number;
  driverName?: string;
  operatorName?: string;
  vehicle?: string;
  plateNumber?: string;
  status: string;
  completedAt?: any;
  createdAt?: any;
}

interface HistoryEntry {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  location?: string;
  timestamp: any;
  order: number;
  rideId?: string;
}

function formatDateTime(iso: string | number | Date | undefined): string {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(iso);
  }
}

function formatDuration(sec?: number): string {
  if (!sec) return '—';
  const mins = Math.round(sec / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatDist(meters?: number): string {
  if (!meters) return '—';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function LiveMap({ assignment }: { assignment: AssignmentDoc & { id: string } }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);

  const hasLocation = assignment.currentLat != null && assignment.currentLng != null;
  const hasDest = assignment.destinationLat != null && assignment.destinationLng != null;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    // Clean up previous map instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markersRef.current = [];
      polylineRef.current = null;
    }
    
    if (!hasLocation && !hasDest) return;

    const centerLat = assignment.currentLat || assignment.destinationLat || 0;
    const centerLng = assignment.currentLng || assignment.destinationLng || 0;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Add destination marker
    if (hasDest && assignment.destinationLat && assignment.destinationLng) {
      const destMarker = L.marker([assignment.destinationLat, assignment.destinationLng], {
        icon: L.divIcon({
          html: `<div style="width: 24px; height: 24px; background: #8B5CF6; border: 4px solid white; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.4);"></div>`,
          className: 'custom-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(map);
      destMarker.bindPopup(`<strong>Destination</strong><br/>${assignment.destination || 'Drop-off point'}`);
      markersRef.current.push(destMarker);
    }

    // Add traveler/driver location marker
    if (hasLocation && assignment.currentLat && assignment.currentLng) {
      const travelerMarker = L.marker([assignment.currentLat, assignment.currentLng], {
        icon: L.divIcon({
          html: `<div style="width: 24px; height: 24px; background: #3B82F6; border: 4px solid white; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.4);"></div>`,
          className: 'custom-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(map);
      travelerMarker.bindPopup(`<strong>Current Location</strong><br/>${assignment.driverName || 'Traveler'}`);
      markersRef.current.push(travelerMarker);
    }

    // Draw route line if we have both points
    if (hasLocation && hasDest && assignment.currentLat && assignment.currentLng && assignment.destinationLat && assignment.destinationLng) {
      const routeLine = L.polyline(
        [[assignment.currentLat, assignment.currentLng], [assignment.destinationLat, assignment.destinationLng]],
        {
          color: '#8B5CF6',
          weight: 5,
          opacity: 0.8,
          dashArray: '10, 10',
          lineCap: 'round',
        }
      ).addTo(map);
      polylineRef.current = routeLine;
    }

    // Fit bounds to show all markers
    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      if (polylineRef.current) {
        group.addLayer(polylineRef.current);
      }
      map.fitBounds(group.getBounds().pad(0.3));
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
        polylineRef.current = null;
      }
    };
  }, [assignment.currentLat, assignment.currentLng, assignment.destinationLat, assignment.destinationLng, assignment.destination, assignment.driverName, hasLocation, hasDest]);

  if (!hasLocation && !hasDest) return null;

  return (
    <div className="mt-3">
      <div className="relative rounded-xl overflow-hidden border border-navy-600/50">
        <div ref={mapContainerRef} className="w-full" style={{ height: '300px', minHeight: '300px' }} />
        <div className="absolute top-2 left-2 bg-black/70 rounded-lg px-3 py-1.5 z-[1000]">
          <span className="text-xs text-white font-medium capitalize flex items-center gap-1">
            <Navigation className="w-3 h-3" />
            {assignment.status?.replace(/_/g, ' ') || 'Tracking'}
          </span>
        </div>
        {hasLocation && hasDest && (
          <div className="absolute top-2 right-2 bg-purple-500/90 rounded-lg px-3 py-1.5 z-[1000]">
            <span className="text-xs text-white font-medium">
              {assignment.distanceRemaining != null ? `${(assignment.distanceRemaining / 1000).toFixed(1)} km` : 'En route'}
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
        {hasLocation && (
          <div className="flex items-center gap-2 p-2 rounded bg-navy-700/30">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <div>
              <span className="text-gray-400 block">Current</span>
              <span className="text-white font-medium">{assignment.currentLat?.toFixed(4)}, {assignment.currentLng?.toFixed(4)}</span>
            </div>
          </div>
        )}
        {hasDest && (
          <div className="flex items-center gap-2 p-2 rounded bg-navy-700/30">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <div>
              <span className="text-gray-400 block">Destination</span>
              <span className="text-white font-medium truncate">{assignment.destination?.slice(0, 25)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TravelerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<(TripDoc & { id: string }) | null>(null);
  const [alerts, setAlerts] = useState<(AlertDoc & { id: string })[]>([]);
  const [recommendations, setRecommendations] = useState<(RecommendationDoc & { id: string })[]>([]);
  const [assignments, setAssignments] = useState<(AssignmentDoc & { id: string })[]>([]);
  const [rides, setRides] = useState<RideRecord[]>([]);
  const [timeline, setTimeline] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'rides' | 'timeline' | 'map'>('overview');

  useEffect(() => {
    if (!id) return;
    const db = getFirebaseFirestore();
    const cleanupFns: (() => void)[] = [];

    const tripRef = doc(db, 'trips', id);
    const unsubTrip = onSnapshot(tripRef, (snap) => {
      if (snap.exists()) {
        const tripData = { id: snap.id, ...snap.data() } as TripDoc & { id: string };
        setTrip(tripData);

        const userId = tripData.userId;
        if (!userId) return;

        // Alerts
        const alertsQ = query(
          collection(db, 'alerts'),
          where('userId', '==', userId),
          where('tripId', '==', snap.id),
          where('active', '==', true)
        );
        const unsubAlerts = onSnapshot(alertsQ, (alertsSnap) => {
          setAlerts(alertsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AlertDoc & { id: string })));
        });
        cleanupFns.push(unsubAlerts);

        // Recommendations
        const recsQ = query(
          collection(db, 'recommendations'),
          where('userId', '==', userId),
          where('tripId', '==', snap.id)
        );
        const unsubRecs = onSnapshot(recsQ, (recsSnap) => {
          setRecommendations(recsSnap.docs.map(d => ({ id: d.id, ...d.data() } as RecommendationDoc & { id: string })));
        });
        cleanupFns.push(unsubRecs);

        // Assignments
        const assignQ = query(
          collection(db, 'assignments'),
          where('tripId', '==', snap.id)
        );
        const unsubAssign = onSnapshot(assignQ, (assignSnap) => {
          setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentDoc & { id: string })));
        });
        cleanupFns.push(unsubAssign);

        // Ride history
        const ridesQ = query(
          collection(db, 'rides'),
          where('travelerId', '==', userId),
          where('tripId', '==', snap.id),
          orderBy('completedAt', 'desc'),
          firestoreLimit(50)
        );
        const unsubRides = onSnapshot(ridesQ, (ridesSnap) => {
          setRides(ridesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RideRecord)));
        });
        cleanupFns.push(unsubRides);

        // Trip timeline
        const timelineQ = query(
          collection(db, 'tripHistory'),
          where('travelerId', '==', userId),
          where('tripId', '==', snap.id),
          orderBy('order', 'asc'),
          firestoreLimit(100)
        );
        const unsubTimeline = onSnapshot(timelineQ, (tlSnap) => {
          setTimeline(tlSnap.docs.map(d => ({ id: d.id, ...d.data() } as HistoryEntry)));
        });
        cleanupFns.push(unsubTimeline);
      } else {
        setTrip(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error loading trip:', err);
      setLoading(false);
    });
    cleanupFns.push(unsubTrip);

    return () => { cleanupFns.forEach(fn => fn()); };
  }, [id]);

  const handleAskAI = async () => {
    setAiLoading(true);
    setAiSummary(null);
    try {
      const riskLevel = alerts.length > 2 ? 'HIGH' : alerts.length > 0 ? 'MEDIUM' : 'LOW';
      const risk = alerts.reduce((sum, a) => sum + (a.riskScore || 0), 0) / Math.max(alerts.length, 1);
      const summary = `TRAVEL SUMMARY
- Risk Level: ${riskLevel} (avg score ${risk.toFixed(1)})
- Total Alerts: ${alerts.length}
- Assigned Drivers: ${assignments.length}
- Completed Rides: ${rides.length}
- Timeline Entries: ${timeline.length}

KEY ALERTS:
${alerts.slice(0, 3).map(a => `- ${a.type}: ${a.explanation}`).join('\n') || 'None'}

RECOMMENDATIONS:
${recommendations.slice(0, 2).map(r => `- ${r.title}: ${r.message}`).join('\n') || 'None'}

RECENT RIDES:
${rides.slice(0, 3).map(r => `- ${r.pickupLocation} → ${r.destination} (${r.status})`).join('\n') || 'No rides yet'}`;
      setAiSummary(summary);
    } catch (err) {
      console.error('AI summary failed:', err);
      setAiSummary('Analysis failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="card text-center py-16">
          <Plane className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Trip Not Found</h2>
          <p className="text-gray-400">The trip does not exist.</p>
          <Link to="/dashboard" className="btn-primary mt-4 inline-flex items-center gap-2">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const actAssign = assignments.find(a => a.status !== 'cancelled' && a.status !== 'completed');
  const trackableAssign = assignments.find(a =>
    // Include assigned (when operator assigns via web portal, status is 'assigned')
    // Include all active ride statuses for live tracking
    ['assigned', 'driver_arrived', 'ride_started', 'near_destination', 'in_progress'].includes(a.status)
  );
  const showMap = trackableAssign != null && (trackableAssign.currentLat != null || trackableAssign.destinationLat != null);

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: User },
    { key: 'rides' as const, label: 'Ride History', icon: History },
    { key: 'timeline' as const, label: 'Timeline', icon: Route },
    { key: 'map' as const, label: 'Map', icon: Navigation },
  ];

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Trip Header */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Plane className="w-6 h-6 text-teal-400" />
              <h1 className="text-2xl font-bold text-white">{trip.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-400">
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{trip.from} &rarr; {trip.to}</span>
              <span className="flex items-center gap-1"><Plane className="w-3.5 h-3.5" />{trip.flightNumber || 'N/A'} - {trip.airline || 'N/A'}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Departs {formatDateTime(trip.departureTime)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {trip.monitoringEnabled && (
              <span className={`badge ${trip.monitoringStatus === 'on_track' ? 'badge-green' : trip.monitoringStatus === 'at_risk' ? 'badge-yellow' : 'badge-gray'}`}>
                {trip.monitoringStatus === 'on_track' ? 'On Track' : trip.monitoringStatus === 'at_risk' ? 'At Risk' : 'Unknown'}
              </span>
            )}
            <span className={`badge ${trip.status === 'active' || trip.status === 'airborne' ? 'badge-yellow' : trip.status === 'completed' ? 'badge-green' : trip.status === 'canceled' ? 'badge-red' : 'badge-blue'}`}>
              {trip.status || 'upcoming'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-700/50 pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-teal-600/10 text-teal-400 border border-teal-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          {/* Live Tracking Map */}
          {showMap && trackableAssign && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Navigation className="w-5 h-5 text-teal-400" />
                <h2 className="text-lg font-semibold text-white">Live Tracking</h2>
                <span className="badge badge-yellow ml-2">LIVE</span>
              </div>
              <LiveMap assignment={trackableAssign} />
            </div>
          )}
          
          {/* Quick Map Access Button */}
          {!showMap && actAssign && (
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Tracking Map</h2>
                  <p className="text-sm text-gray-400 mt-1">Map will activate when the ride starts</p>
                </div>
                <span className="badge badge-gray">Waiting</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
              <h2 className="text-lg font-semibold text-white mb-4">Trip Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Departure</label>
                  <p className="text-white mt-1"><Calendar className="w-4 h-4 text-gray-400 inline" /> {formatDateTime(trip.departureTime)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Arrival</label>
                  <p className="text-white mt-1"><Clock className="w-4 h-4 text-gray-400 inline" /> {formatDateTime(trip.arrivalTime)}</p>
                </div>
                {trip.hotels && trip.hotels.length > 0 && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 uppercase">Hotel</label>
                    <p className="text-white mt-1"><Hotel className="w-4 h-4 text-gray-400 inline" /> {trip.hotels[0].name || 'N/A'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Current Assignment */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-teal-400" />
                  <h2 className="text-lg font-semibold text-white">Current Ride</h2>
                </div>
                {!actAssign && (
                  <button onClick={() => navigate('/assignments/new/' + id)} className="btn-primary text-sm">
                    Assign Driver
                  </button>
                )}
              </div>
              {actAssign ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-teal-500/5">
                    <User className="w-5 h-5 text-teal-400" />
                    <div>
                      <p className="text-white font-medium">{actAssign.driverName}</p>
                      <p className="text-sm text-gray-400">{actAssign.vehicle} ({actAssign.plateNumber})</p>
                    </div>
                  </div>
                  {actAssign.driverPhone && (
                    <a href={`https://wa.me/${actAssign.driverPhone.replace(/[^\d]/g, '')}`}
                       target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 text-sm text-green-400 hover:underline">
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </a>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between p-2 rounded bg-navy-700/30">
                      <span className="text-gray-400">Status</span>
                      <span className="text-white font-medium capitalize">{actAssign.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Car className="w-8 h-8 mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">No active ride</p>
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h2 className="text-lg font-semibold text-white">Active Alerts ({alerts.length})</h2>
              </div>
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg bg-red-500/5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
                      <div>
                        <p className="text-sm text-white">{a.explanation}</p>
                        <p className="text-xs text-gray-400 mt-1">Severity: {a.severity} | Risk: {a.riskScore}/100</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Intelligence */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-white">AI Travel Intelligence</h2>
              </div>
              <button
                onClick={handleAskAI}
                disabled={aiLoading}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {aiLoading ? 'Analyzing...' : 'Ask AI'}
              </button>
            </div>
            {aiSummary ? (
              <div className="p-4 rounded-lg bg-navy-700/30">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{aiSummary}</pre>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Click "Ask AI" for intelligence summary</p>
            )}
          </div>
        </>
      )}

      {/* MAP TAB */}
      {activeTab === 'map' && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-teal-400" />
              <h2 className="text-lg font-semibold text-white">Journey Map</h2>
            </div>
            {trackableAssign && (
              <span className="badge badge-yellow">LIVE</span>
            )}
          </div>
          {trackableAssign ? (
            <LiveMap assignment={trackableAssign} />
          ) : (
            <div className="text-center py-12">
              <MapPin className="w-12 h-12 mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">No active journey to display</p>
              <p className="text-sm text-gray-500 mt-2">
                The map will appear when a driver is assigned and the ride begins
              </p>
            </div>
          )}
        </div>
      )}

      {/* RIDE HISTORY TAB */}
      {activeTab === 'rides' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Ride History</h2>
            <span className="text-sm text-gray-500">{rides.length} ride{rides.length !== 1 ? 's' : ''}</span>
          </div>
          {rides.length === 0 ? (
            <div className="text-center py-8">
              <Car className="w-8 h-8 mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">No rides completed yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rides.map((ride) => (
                <div key={ride.id} className="p-4 rounded-xl bg-navy-700/30 border border-navy-600/20">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-teal-400 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {ride.pickupLocation} → {ride.destination}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                        <span>{formatDist(ride.distanceMeters)}</span>
                        <span>{formatDuration(ride.durationSeconds)}</span>
                        {ride.driverName && <span>Driver: {ride.driverName}</span>}
                        {ride.vehicle && <span>{ride.vehicle} {ride.plateNumber ? `(${ride.plateNumber})` : ''}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ride.status === 'completed' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                        }`}>
                          {ride.status}
                        </span>
                        {ride.completedAt && (
                          <span className="text-xs text-gray-500">
                            {ride.completedAt?.toDate ? 
                              new Date(ride.completedAt.toDate()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric' }) :
                              ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TRIP TIMELINE TAB */}
      {activeTab === 'timeline' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Trip Timeline</h2>
            <span className="text-sm text-gray-500">{timeline.length} entries</span>
          </div>
          {timeline.length === 0 ? (
            <div className="text-center py-8">
              <Route className="w-8 h-8 mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">No timeline entries yet</p>
              <p className="text-xs text-gray-600 mt-1">Activity will appear here as the trip progresses</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline connector line */}
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-navy-600/50" />
              
              <div className="space-y-4">
                {timeline.map((entry) => {
                  const iconColor = entry.type === 'ride' ? 'text-teal-400' :
                    entry.type === 'flight_arrival' ? 'text-blue-400' :
                    entry.type === 'hotel_checkin' ? 'text-yellow-400' :
                    entry.type === 'attraction' ? 'text-purple-400' :
                    entry.type === 'meal' ? 'text-orange-400' : 'text-gray-400';
                  
                  const bgColor = entry.type === 'ride' ? 'bg-teal-500/10' :
                    entry.type === 'flight_arrival' ? 'bg-blue-500/10' :
                    entry.type === 'hotel_checkin' ? 'bg-yellow-500/10' :
                    entry.type === 'attraction' ? 'bg-purple-500/10' :
                    entry.type === 'meal' ? 'bg-orange-500/10' : 'bg-gray-500/10';
                  
                  return (
                    <div key={entry.id} className="relative pl-10">
                      <div className={`absolute left-2.5 w-3 h-3 rounded-full ${bgColor} border-2 border-navy-800 ${iconColor.replace('text-', 'bg-').replace('-400', '-400/30')}`} />
                      <div className="p-3 rounded-xl bg-navy-700/20">
                        <p className="text-white text-sm font-medium">{entry.title}</p>
                        {entry.subtitle && <p className="text-gray-400 text-xs mt-0.5">{entry.subtitle}</p>}
                        {entry.location && (
                          <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {entry.location}
                          </p>
                        )}
                        {entry.timestamp && (
                          <p className="text-gray-600 text-xs mt-1">
                            {entry.timestamp?.toDate ? 
                              new Date(entry.timestamp.toDate()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) :
                              ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="card">
          <h3 className="text-white font-medium mb-3">Recommendations</h3>
          <div className="space-y-2">
            {recommendations.map((r) => (
              <div key={r.id} className="p-3 rounded-lg bg-teal-500/5">
                <p className="text-sm text-white font-medium">{r.title}</p>
                <p className="text-xs text-gray-400 mt-1">{r.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}