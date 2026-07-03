import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Car,
  User,
  Clock,
  CheckCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { doc, getDoc, addDoc, collection, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import type { TripDoc, DriverDoc } from '../types';

const assignSchema = z.object({
  driverId: z.string().min(1, 'Please select a driver'),
  eta: z.string().min(1, 'Please set an ETA'),
  notes: z.string().optional(),
});

type AssignForm = z.infer<typeof assignSchema>;

export default function AssignPickupPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { operator } = useAuthStore();
  const [trip, setTrip] = useState<TripDoc | null>(null);
  const [drivers, setDrivers] = useState<DriverDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<AssignForm>({
    resolver: zodResolver(assignSchema),
  });

  const selectedDriverId = watch('driverId');
  const selectedDriver = drivers.find(d => d.id === selectedDriverId);

  useEffect(() => {
    if (!tripId) return;
    const db = getFirebaseFirestore();

    // Load trip
    const tripRef = doc(db, 'trips', tripId);
    getDoc(tripRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as TripDoc;
        setTrip(data);
      }
      setLoading(false);
    });

    // Load drivers
    const unsub = onSnapshot(collection(db, 'drivers'), (snap) => {
      setDrivers(
        snap.docs
          .map(d => ({ ...d.data() as DriverDoc, id: d.id }))
          .filter(d => d.active)
      );
    });

    return () => unsub();
  }, [tripId]);

  const onSubmit = async (data: AssignForm) => {
    if (!tripId || !operator || !selectedDriver) return;
    setSubmitting(true);
    setError(null);

    try {
      const db = getFirebaseFirestore();
      const etaDate = new Date(data.eta).toISOString();

      // Create assignment
      let assignmentRef;
      try {
        assignmentRef = await addDoc(collection(db, 'assignments'), {
          tripId,
          travelerId: trip?.userId || '',
          travelerName: trip?.title || '',
          driverName: selectedDriver.name,
          driverPhone: selectedDriver.phone,
          vehicle: selectedDriver.vehicle,
          plateNumber: selectedDriver.plateNumber,
          eta: etaDate,
          assignedBy: operator.uid,
          assignedAt: serverTimestamp(),
          status: 'assigned',
          notes: data.notes || '',
          pickupLocation: trip?.to || '',
        });
        console.log('Assignment created:', assignmentRef.id);
      } catch (err: any) {
        console.error('Assignment creation failed:', err);
        throw new Error(`Failed to create assignment: ${err.message}`);
      }

      // Update trip lastMileStatus
      try {
        await updateDoc(doc(db, 'trips', tripId), {
          lastMileStatus: 'assigned',
          assignmentId: assignmentRef.id,
        });
        console.log('Trip updated with assignment');
      } catch (err: any) {
        console.error('Trip status update failed:', err);
        throw new Error(`Failed to update trip: ${err.message}`);
      }

      setSuccess(true);
      // Navigate using trip document ID, not user ID
      setTimeout(() => navigate(`/travelers/${tripId}`), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to create assignment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl text-white font-semibold mb-2">Pickup Assigned!</h2>
        <p className="text-gray-400 text-center max-w-md">
          Driver {selectedDriver?.name} has been assigned to pick up {trip?.title}.
          The traveler will be notified.
        </p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-16 h-16 mx-auto text-gray-600 mb-4" />
        <h2 className="text-xl text-white font-semibold mb-2">Trip Not Found</h2>
        <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link to={`/travelers/${tripId}`} className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Traveler
      </Link>

      {/* Header */}
      <div className="card">
        <h1 className="text-xl font-bold text-white mb-1">Assign Pickup</h1>
        <p className="text-gray-400 text-sm">{trip.title} — {trip.flightNumber || 'No flight'}</p>
        <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Arrives: {new Date(trip.arrivalTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </span>
          <span>{trip.to}</span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Driver Selection */}
        <div className="card">
          <h2 className="text-white font-semibold mb-4">Select Driver</h2>

          {drivers.length === 0 ? (
            <div className="text-center py-6">
              <User className="w-8 h-8 mx-auto text-gray-600 mb-2" />
              <p className="text-gray-500 text-sm">No active drivers available</p>
              <Link to="/drivers" className="text-teal-400 text-sm hover:underline mt-2 inline-block">
                Add a driver first
              </Link>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {drivers.map((driver) => (
                <label
                  key={driver.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedDriverId === driver.id
                      ? 'border-teal-500/50 bg-teal-500/5'
                      : 'border-navy-600/30 hover:border-navy-500'
                  }`}
                >
                  <input
                    type="radio"
                    value={driver.id}
                    {...register('driverId')}
                    className="sr-only"
                  />
                  <div className="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">{driver.name}</p>
                    <p className="text-gray-400 text-xs">{driver.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-300 text-sm">{driver.vehicle}</p>
                    <p className="text-gray-500 text-xs">{driver.plateNumber}</p>
                  </div>
                  {selectedDriverId === driver.id && (
                    <CheckCircle className="w-5 h-5 text-teal-400" />
                  )}
                </label>
              ))}
            </div>
          )}
          {errors.driverId && (
            <p className="text-red-400 text-xs mt-2">{errors.driverId.message}</p>
          )}
        </div>

        {/* ETA */}
        <div className="card">
          <h2 className="text-white font-semibold mb-4">Pickup Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Pickup ETA <span className="text-gray-500">(when driver should arrive)</span>
              </label>
              <input
                type="datetime-local"
                className="input-field"
                {...register('eta')}
                min={new Date().toISOString().slice(0, 16)}
              />
              {errors.eta && (
                <p className="text-red-400 text-xs mt-1">{errors.eta.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Notes <span className="text-gray-500">(optional)</span>
              </label>
              <textarea
                className="input-field resize-none"
                rows={3}
                placeholder="Special instructions for the driver..."
                {...register('notes')}
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        {selectedDriver && (
          <div className="card bg-teal-600/5 border-teal-500/20">
            <h3 className="text-white font-medium mb-2">Assignment Summary</h3>
            <div className="text-sm text-gray-300 space-y-1">
              <p>Driver: <span className="text-white">{selectedDriver.name}</span></p>
              <p>Vehicle: <span className="text-white">{selectedDriver.vehicle} ({selectedDriver.plateNumber})</span></p>
              <p>Contact: <span className="text-white">{selectedDriver.phone}</span></p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || drivers.length === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Assigning Pickup...
            </>
          ) : (
            <>
              <Car className="w-5 h-5" />
              Confirm Pickup Assignment
            </>
          )}
        </button>
      </form>
    </div>
  );
}