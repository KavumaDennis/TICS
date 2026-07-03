import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Car, User, Phone, Clock, CheckCircle, XCircle,
  Loader2, Calendar, MapPin, Star, Shield, TrendingUp,
} from 'lucide-react';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import type { DriverDoc, AssignmentDoc } from '../types';

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [driver, setDriver] = useState<(DriverDoc & { id: string }) | null>(null);
  const [assignments, setAssignments] = useState<(AssignmentDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const db = getFirebaseFirestore();
    const unsubDriver = onSnapshot(doc(db, 'drivers', id), (snap) => {
      if (snap.exists()) {
        setDriver({ id: snap.id, ...snap.data() } as DriverDoc & { id: string });
      } else { setDriver(null); }
      setLoading(false);
    });
    const unsubAssign = onSnapshot(
      query(collection(db, 'assignments'), where('status', 'in', ['completed', 'assigned', 'en_route', 'arrived', 'cancelled'])),
      (snap) => {
        setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentDoc & { id: string })));
      }
    );
    return () => { unsubDriver(); unsubAssign(); };
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-teal-400 animate-spin" /></div>;
  }
  if (!driver) {
    return <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Back</button>
      <div className="card text-center py-16">
        <Car className="w-12 h-12 mx-auto text-gray-600 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Driver Not Found</h2>
        <p className="text-gray-400">The driver does not exist.</p>
        <Link to="/drivers" className="btn-primary mt-4 inline-flex items-center gap-2">Back to Drivers</Link>
      </div>
    </div>;
  }

  const driverAssignments = assignments.filter(a => a.driverName === driver.name && a.driverPhone === driver.phone);
  const completedRides = driverAssignments.filter(a => a.status === 'completed').length;
  const activeRides = driverAssignments.filter(a => a.status !== 'completed' && a.status !== 'cancelled');
  const totalRides = driverAssignments.length;
  const completionRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 0;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-teal-600/20 flex items-center justify-center">
              <User className="w-8 h-8 text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{driver.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={driver.active ? 'badge-green' : 'badge-gray'}>{driver.active ? 'Active' : 'Inactive'}</span>
                <span className="text-gray-400 text-sm">{driver.vehicle}</span>
              </div>
              <p className="text-gray-500 text-sm mt-1">{driver.plateNumber}</p>
            </div>
          </div>
          <div className="flex md:flex-col gap-2">
            <Link to="/drivers" className="btn-secondary inline-flex items-center gap-2 text-sm">
              <Car className="w-4 h-4" /> All Drivers
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center"><Car className="w-6 h-6 text-teal-400 mx-auto mb-2" /><p className="text-2xl font-bold text-white">{totalRides}</p><p className="text-xs text-gray-400">Total Rides</p></div>
        <div className="card p-4 text-center"><CheckCircle className="w-6 h-6 text-green-400 mx-auto mb-2" /><p className="text-2xl font-bold text-white">{completedRides}</p><p className="text-xs text-gray-400">Completed</p></div>
        <div className="card p-4 text-center"><Clock className="w-6 h-6 text-yellow-400 mx-auto mb-2" /><p className="text-2xl font-bold text-white">{activeRides.length}</p><p className="text-xs text-gray-400">Active Rides</p></div>
        <div className="card p-4 text-center"><Star className="w-6 h-6 text-purple-400 mx-auto mb-2" /><p className="text-2xl font-bold text-white">{completionRate}%</p><p className="text-xs text-gray-400">Completion Rate</p></div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Performance Overview</h2>
        <div className="w-full bg-navy-700 rounded-full h-3 mb-2">
          <div
            className="bg-gradient-to-r from-teal-500 to-green-400 h-3 rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Progress</span>
          <span>{completedRides} of {totalRides} trips completed</span>
        </div>
      </div>

      <div className="card"><h2 className="text-lg font-semibold text-white mb-4">Driver Information</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="text-xs text-gray-500 uppercase">Phone</label><p className="text-white mt-1"><Phone className="w-4 h-4 text-gray-400 inline" /> {driver.phone}</p></div>
        <div><label className="text-xs text-gray-500 uppercase">Vehicle</label><p className="text-white mt-1">{driver.vehicle}</p></div>
        <div><label className="text-xs text-gray-500 uppercase">Plate Number</label><p className="text-white mt-1">{driver.plateNumber}</p></div>
        <div><label className="text-xs text-gray-500 uppercase">Status</label><p className="text-white mt-1">{driver.active ? 'Active and available' : 'Inactive'}</p></div>
      </div></div>

      <div className="card"><h2 className="text-lg font-semibold text-white mb-4">Ride History ({totalRides})</h2>
      {driverAssignments.length === 0 ? <div className="text-center py-8"><Car className="w-8 h-8 mx-auto text-gray-600 mb-2" /><p className="text-gray-500 text-sm">No ride history found</p></div> :
        <div className="space-y-2">{driverAssignments.slice().reverse().map((a) => (
          <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-navy-700/30 border border-navy-600/30">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${a.status === 'completed' ? 'bg-green-500/20' : a.status === 'en_route' ? 'bg-yellow-500/20' : a.status === 'arrived' ? 'bg-blue-500/20' : a.status === 'assigned' ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
                {a.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-400" /> : a.status === 'en_route' ? <MapPin className="w-4 h-4 text-yellow-400" /> : a.status === 'arrived' ? <Clock className="w-4 h-4 text-blue-400" /> : a.status === 'assigned' ? <Clock className="w-4 h-4 text-blue-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
              </div>
              <div><p className="text-sm text-white font-medium">{a.travelerName || 'Traveler'}</p><p className="text-xs text-gray-400">{a.pickupLocation || ''} {a.eta ? `· ETA ${new Date(a.eta).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</p></div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${a.status === 'completed' ? 'badge-green' : a.status === 'assigned' ? 'badge-blue' : a.status === 'en_route' ? 'badge-yellow' : a.status === 'arrived' ? 'badge-blue' : 'badge-red'}`}>{a.status.replace('_', ' ')}</span>
          </div>
        ))}</div>}
      </div>
    </div>
  );
}