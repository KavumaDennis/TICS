import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio,
  Users,
  Car,
  Clock,
  MapPin,
  ChevronRight,
  Loader2,
  CheckCircle,
  Navigation,
} from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import type { AssignmentDoc } from '../types';

function formatETA(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const mins = Math.round(diff / 60000);
    if (mins <= 0) return 'Now';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  } catch {
    return iso;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'assigned': return 'badge-blue';
    case 'ride_started':
    case 'in_progress':
    case 'en_route': return 'badge-yellow';
    case 'driver_arrived':
    case 'arrived': return 'badge-green';
    case 'near_destination': return 'badge-yellow';
    case 'completed': return 'badge-gray';
    case 'cancelled': return 'badge-red';
    default: return 'badge-gray';
  }
}

export default function LiveOperationsPage() {
  const [assignments, setAssignments] = useState<(AssignmentDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');

  useEffect(() => {
    const db = getFirebaseFirestore();
    // The mobile app uses ride_started / driver_arrived / near_destination statuses;
    // the web portal uses en_route / arrived. Both write to the same assignments
    // collection, so the active filter must include all variants.
    const activeStatuses = filter === 'active'
      ? ['assigned', 'en_route', 'arrived', 'ride_started', 'driver_arrived', 'near_destination', 'in_progress']
      : [filter];
    const q = query(
      collection(db, 'assignments'),
      where('status', 'in', activeStatuses),
      orderBy('assignedAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setAssignments(snap.docs.map(d => ({ ...d.data() as AssignmentDoc, id: d.id })));
      setLoading(false);
    }, (err) => {
      console.error('Failed to load assignments:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [filter]);

  const updateStatus = async (id: string, status: AssignmentDoc['status']) => {
    try {
      const db = getFirebaseFirestore();
      await updateDoc(doc(db, 'assignments', id), { status });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filters = [
    { value: 'active', label: 'Active' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'en_route', label: 'En Route' },
    { value: 'arrived', label: 'Arrived' },
    { value: 'completed', label: 'Completed' },
  ];

  const activeCount = assignments.filter(a =>
    ['assigned', 'en_route', 'arrived', 'ride_started', 'driver_arrived', 'near_destination', 'in_progress'].includes(a.status)
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Operations</h1>
          <p className="text-gray-400 mt-1">
            {activeCount} active pickup{activeCount !== 1 ? 's' : ''} in progress
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === f.value
                ? 'bg-teal-600 text-white'
                : 'bg-navy-800 text-gray-400 hover:text-white border border-navy-600/30'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Assignments */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="card text-center py-12">
          <Radio className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No {filter} pickups found</p>
          <Link to="/dashboard" className="text-teal-400 text-sm hover:underline mt-2 inline-block">
            View today's arrivals
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="card-hover">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    assignment.status === 'arrived' || assignment.status === 'driver_arrived' ? 'bg-green-500/20' :
                    assignment.status === 'en_route' || assignment.status === 'ride_started' || assignment.status === 'near_destination' ? 'bg-yellow-500/20' :
                    'bg-blue-500/20'
                  }`}>
                    {assignment.status === 'arrived' || assignment.status === 'driver_arrived' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : assignment.status === 'en_route' || assignment.status === 'ride_started' || assignment.status === 'near_destination' ? (
                      <Navigation className="w-5 h-5 text-yellow-400" />
                    ) : (
                      <Car className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium">{assignment.travelerName || 'Traveler'}</h3>
                      <span className={getStatusColor(assignment.status)}>
                        {assignment.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {assignment.driverName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Car className="w-3.5 h-3.5" />
                        {assignment.vehicle} ({assignment.plateNumber})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        ETA: {formatETA(assignment.eta)}
                      </span>
                      {assignment.pickupLocation && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {assignment.pickupLocation}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Actions */}
                <div className="flex items-center gap-2">
                  {assignment.status === 'assigned' && (
                    <button
                      onClick={() => assignment.id && updateStatus(assignment.id, 'en_route')}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Mark En Route
                    </button>
                  )}
                  {assignment.status === 'en_route' && (
                    <button
                      onClick={() => assignment.id && updateStatus(assignment.id, 'arrived')}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Mark Arrived
                    </button>
                  )}
                  {assignment.status === 'arrived' && (
                    <button
                      onClick={() => assignment.id && updateStatus(assignment.id, 'completed')}
                      className="btn-primary text-xs py-1.5 px-3"
                    >
                      Complete
                    </button>
                  )}
                  {assignment.travelerId && (
                    <Link
                      to={`/travelers/${assignment.travelerId}`}
                      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-navy-700"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}