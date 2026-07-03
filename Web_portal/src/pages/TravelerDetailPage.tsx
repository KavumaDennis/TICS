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
} from 'lucide-react';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import type { TripDoc, AlertDoc, RecommendationDoc, AssignmentDoc } from '../types';

const API_KEY = (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY : '') || '';

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

function LiveMap({ assignment }: { assignment: AssignmentDoc & { id: string } }) {
  const hasLocation = assignment.currentLat != null && assignment.currentLng != null;
  const hasDest = assignment.destinationLat != null && assignment.destinationLng != null;

  if (!hasLocation && !hasDest) return null;

  // Build static map URL with markers
  const centerLat = assignment.currentLat || assignment.destinationLat || 0;
  const centerLng = assignment.currentLng || assignment.destinationLng || 0;
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=14&size=600x250&maptype=roadmap&key=${API_KEY}` +
    (hasDest ? `&markers=color:purple%7Clabel:D%7C${assignment.destinationLat},${assignment.destinationLng}` : '') +
    (hasLocation ? `&markers=color:blue%7Clabel:T%7C${assignment.currentLat},${assignment.currentLng}` : '');

  return (
    <div className="mt-3">
      <div className="relative rounded-xl overflow-hidden border border-navy-600/50">
        {API_KEY ? (
          <img
            src={mapUrl}
            alt="Live tracking map"
            className="w-full h-48 object-cover"
            style={{ minHeight: '200px' }}
          />
        ) : (
          <div className="w-full h-48 bg-navy-800 flex items-center justify-center">
            <Navigation className="w-8 h-8 text-teal-400 mb-2" />
            <p className="text-gray-500 text-sm">Map requires Google Maps API key</p>
          </div>
        )}
        <div className="absolute top-2 left-2 bg-black/70 rounded-lg px-2 py-1">
          <span className="text-xs text-white font-medium capitalize">
            {assignment.status?.replace(/_/g, ' ') || 'Tracking'}
          </span>
        </div>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        {hasLocation && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Traveler: {assignment.currentLat?.toFixed(4)}, {assignment.currentLng?.toFixed(4)}
          </span>
        )}
        {hasDest && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Destination: {assignment.destination?.slice(0, 30)}
          </span>
        )}
        {assignment.distanceRemaining != null && (
          <span className="flex items-center gap-1">
            <Navigation className="w-3 h-3 text-teal-400" />
            {(assignment.distanceRemaining / 1000).toFixed(1)} km
          </span>
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
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const db = getFirebaseFirestore();
    const cleanupFns: (() => void)[] = [];
    console.log('Loading trip by doc ID:', id);

    const tripRef = doc(db, 'trips', id);
    const unsubTrip = onSnapshot(tripRef, (snap) => {
      if (snap.exists()) {
        const tripData = { id: snap.id, ...snap.data() } as TripDoc & { id: string };
        console.log('Trip loaded:', tripData.title);
        setTrip(tripData);

        const userId = tripData.userId;
        if (!userId) return;

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

        const recsQ = query(
          collection(db, 'recommendations'),
          where('userId', '==', userId),
          where('tripId', '==', snap.id)
        );
        const unsubRecs = onSnapshot(recsQ, (recsSnap) => {
          setRecommendations(recsSnap.docs.map(d => ({ id: d.id, ...d.data() } as RecommendationDoc & { id: string })));
        });
        cleanupFns.push(unsubRecs);

        const assignQ = query(
          collection(db, 'assignments'),
          where('tripId', '==', snap.id)
        );
        const unsubAssign = onSnapshot(assignQ, (assignSnap) => {
          setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentDoc & { id: string })));
        });
        cleanupFns.push(unsubAssign);
      } else {
        console.log('No trip found with ID:', id);
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
- Recommendations: ${recommendations.length}

KEY ALERTS:
${alerts.slice(0, 3).map(a => `- ${a.type}: ${a.explanation}`).join('\n') || 'None'}

RECOMMENDATIONS:
${recommendations.slice(0, 2).map(r => `- ${r.title}: ${r.message}`).join('\n') || 'None'}`;
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
  // Find any assignment with ride tracking data for the map
  const trackableAssign = assignments.find(a =>
    a.status === 'driver_arrived' || a.status === 'ride_started' || a.status === 'near_destination'
  );
  const showMap = trackableAssign != null && (trackableAssign.currentLat != null || trackableAssign.destinationLat != null);

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

      {/* Live Tracking Map - shown when driver has arrived or ride in progress */}
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

        {/* Last-Mile Pickup */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Car className="w-5 h-5 text-teal-400" />
              <h2 className="text-lg font-semibold text-white">Last-Mile Pickup</h2>
            </div>
            {!actAssign && (
              <button onClick={() => navigate('/assignments/new/' + id)} className="btn-primary text-sm">
                Assign Pickup
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between p-2 rounded bg-navy-700/30">
                  <span className="text-gray-400">Status</span>
                  <span className="text-white font-medium capitalize">{actAssign.status.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-navy-700/30">
                  <span className="text-gray-400">ETA</span>
                  <span className="text-white font-medium">{formatDateTime(actAssign.eta)}</span>
                </div>
              </div>
              {actAssign.phone && (
                <a href={`tel:${actAssign.phone}`} className="flex items-center gap-2 text-sm text-teal-400 hover:underline">
                  <Phone className="w-4 h-4" /> {actAssign.phone}
                </a>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <Car className="w-8 h-8 mx-auto text-gray-600 mb-2" />
              <p className="text-gray-500 text-sm">No pickup assigned yet</p>
              <button onClick={() => navigate('/assignments/new/' + id)} className="btn-primary mt-3 text-sm">
                Assign Pickup <ChevronRight className="w-4 h-4 inline" />
              </button>
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
            {alerts.map((a: AlertDoc & { id: string }, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-red-500/5">
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
        {recommendations.length > 0 && (
          <div className="mt-4 pt-4 border-t border-navy-700/50">
            <h3 className="text-white font-medium mb-3">Recommendations</h3>
            <div className="space-y-2">
              {recommendations.map((r: RecommendationDoc & { id: string }, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-teal-500/5">
                  <p className="text-sm text-white font-medium">{r.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{r.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}