import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plane,
  Clock,
  AlertTriangle,
  Users,
  ArrowRight,
  Car,
  Radio,
  CheckCircle,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import type { TripDoc, AlertDoc } from '../types';
import { useAuthStore } from '../store/authStore';

interface TripWithAlerts extends TripDoc {
  id: string;
  alerts?: AlertDoc[];
}

function getRiskColor(monitoringStatus?: string): string {
  switch (monitoringStatus) {
    case 'at_risk': return 'badge-red';
    case 'on_track': return 'badge-green';
    default: return 'badge-gray';
  }
}

function getStatusBadge(status?: string): { label: string; color: string } {
  switch (status) {
    case 'delayed': return { label: 'Delayed', color: 'badge-red' };
    case 'boarding': return { label: 'Boarding', color: 'badge-blue' };
    case 'active':
    case 'airborne': return { label: 'En Route', color: 'badge-yellow' };
    case 'arriving': return { label: 'Arriving', color: 'badge-green' };
    case 'completed': return { label: 'Completed', color: 'badge-gray' };
    case 'canceled': return { label: 'Canceled', color: 'badge-red' };
    default: return { label: 'Upcoming', color: 'badge-blue' };
  }
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return isoString;
  }
}

export default function DashboardPage() {
  const { operator } = useAuthStore();
  const [trips, setTrips] = useState<TripWithAlerts[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [stats, setStats] = useState({ today: 0, atRisk: 0, inProgress: 0, completed: 0 });

  useEffect(() => {
    const db = getFirebaseFirestore();

    async function loadTrips() {
      try {
        const snap = await getDocs(collection(db, 'trips'));
        const items: TripWithAlerts[] = [];
        let riskCount = 0;
        let progressCount = 0;
        let todayCount = 0;
        let completedCount = 0;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        snap.forEach((doc) => {
          const data = doc.data() as TripDoc;
          items.push({ ...data, id: doc.id });
          if (data.monitoringStatus === 'at_risk') riskCount++;
          if (data.lastMileStatus === 'in_progress' || data.lastMileStatus === 'scheduled' || data.lastMileStatus === 'assigned') progressCount++;
          if (data.status === 'completed' || data.status === 'canceled') completedCount++;
          const arrival = new Date(data.arrivalTime);
          if (arrival >= todayStart && arrival < todayEnd) todayCount++;
        });

        items.sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime());
        setTrips(items);
        setStats({ today: todayCount, atRisk: riskCount, inProgress: progressCount, completed: completedCount });
        setLoading(false);
      } catch (e: any) {
        console.error('Dashboard load error:', e.message);
        setLoading(false);
      }
    }

    loadTrips();
  }, []);

  const activeTrips = trips.filter(t => t.status !== 'completed' && t.status !== 'canceled');
  const completedTrips = trips.filter(t => t.status === 'completed' || t.status === 'canceled');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}, {operator?.name?.split(' ')[0] || 'Operator'}
        </h1>
        <p className="text-gray-400 mt-1">Trips overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Today's Arrivals</p>
              <p className="text-3xl font-bold text-white mt-1">{stats.today}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-teal-600/10 flex items-center justify-center">
              <Plane className="w-6 h-6 text-teal-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">At Risk</p>
              <p className="text-3xl font-bold text-red-400 mt-1">{stats.atRisk}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Active Pickups</p>
              <p className="text-3xl font-bold text-yellow-400 mt-1">{stats.inProgress}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Car className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Completed</p>
              <p className="text-3xl font-bold text-green-400 mt-1">{stats.completed}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Active Trips */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Active Trips</h2>
          <span className="text-sm text-gray-500">{activeTrips.length} total</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTrips.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Plane className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No active trips found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTrips.slice(0, 50).map((trip) => {
              const statusBadge = getStatusBadge(trip.status);
              return (
                <Link
                  key={trip.id}
                  to={`/travelers/${trip.id}`}
                  className="block card-hover"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center">
                        <Users className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{trip.title}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Plane className="w-3.5 h-3.5" />
                            {trip.flightNumber || 'N/A'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(trip.arrivalTime)}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {new Date(trip.arrivalTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={statusBadge.color}>{statusBadge.label}</span>
                      {trip.monitoringStatus && (
                        <span className={getRiskColor(trip.monitoringStatus)}>
                          {trip.monitoringStatus === 'at_risk' ? '⚠ Delay Risk' : 'On Time'}
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Trips */}
      {completedTrips.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Completed Trips</h2>
              <span className="text-sm text-gray-500">({completedTrips.length})</span>
            </div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              {showCompleted ? 'Hide' : 'Show all'}
            </button>
          </div>

          {showCompleted && (
            <div className="space-y-3">
              {completedTrips.slice(0, 50).map((trip) => {
                const statusBadge = getStatusBadge(trip.status);
                return (
                  <Link
                    key={trip.id}
                    to={`/travelers/${trip.id}`}
                    className="block card-hover opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{trip.title}</h3>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                            <span className="flex items-center gap-1">
                              <Plane className="w-3.5 h-3.5" />
                              {trip.flightNumber || 'N/A'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTime(trip.arrivalTime)}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {new Date(trip.arrivalTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={statusBadge.color}>{statusBadge.label}</span>
                        <ArrowRight className="w-4 h-4 text-gray-500" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {!showCompleted && (
            <p className="text-sm text-gray-500 text-center py-2">
              Click "Show all" to view {completedTrips.length} completed trip(s)
            </p>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            to="/live"
            className="flex items-center gap-3 p-4 rounded-2xl bg-teal-600/5 border border-teal-500/10 hover:bg-teal-600/10 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-teal-600/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <p className="text-white font-medium">Live Operations</p>
              <p className="text-sm text-gray-400">Monitor active pickups</p>
            </div>
          </Link>
          <Link
            to="/drivers"
            className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Car className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-white font-medium">Manage Drivers</p>
              <p className="text-sm text-gray-400">View and assign drivers</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}