import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Car,
  Clock,
  MapPin,
  Navigation,
  Loader2,
  CheckCircle,
  User,
  UserCheck,
  XCircle,
  Phone,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import type { DriverDoc } from '../types';

interface RideRequest {
  id: string;
  travelerId: string;
  operatorId: string;
  tripId: string;
  pickupLocation: string;
  destination: string;
  destinationLat?: number;
  destinationLng?: number;
  status: string;
  travelerName?: string;
  notes?: string;
  createdAt: any;
}

export default function RideRequestsPage() {
  const { operator } = useAuthStore();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<DriverDoc[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RideRequest | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!operator?.uid) return;
    const db = getFirebaseFirestore();

    // Load pending ride requests
    const unsub = onSnapshot(
      query(
        collection(db, 'rideRequests'),
        where('operatorId', '==', operator.uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load ride requests:', err);
        setLoading(false);
      }
    );

    // Load drivers
    const driversUnsub = onSnapshot(
      query(collection(db, 'drivers'), where('operatorId', '==', operator.uid), where('active', '==', true)),
      (snap) => {
        setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
      }
    );

    return () => {
      unsub();
      driversUnsub();
    };
  }, [operator?.uid]);

  const handleAssignDriver = async (driverId: string) => {
    console.log('=== STARTING DRIVER ASSIGNMENT ===');
    console.log('Driver ID:', driverId);
    console.log('Request ID:', selectedRequest?.id);
    console.log('Operator UID:', operator?.uid);
    
    if (!selectedRequest || !operator) {
      const errorMsg = 'Missing selectedRequest or operator';
      console.error('ERROR:', errorMsg);
      alert(errorMsg);
      return;
    }
    
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      const errorMsg = `Driver not found: ${driverId}`;
      console.error('ERROR:', errorMsg);
      alert(errorMsg);
      return;
    }

    setAssigning(true);
    try {
      const db = getFirebaseFirestore();
      console.log('Firestore DB instance:', db);

      // Create assignment document
      const assignmentData = {
        travelerId: selectedRequest.travelerId,
        travelerName: selectedRequest.travelerName || 'Traveler',
        tripId: selectedRequest.tripId,
        operatorId: operator.uid,
        operatorName: (operator as any).name || '',
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone || 'N/A',
        vehicle: driver.vehicle,
        plateNumber: driver.plateNumber,
        destination: selectedRequest.destination,
        destinationLat: selectedRequest.destinationLat || null,
        destinationLng: selectedRequest.destinationLng || null,
        pickupLocation: selectedRequest.pickupLocation,
        rideRequestId: selectedRequest.id,
        status: 'assigned',
        assignedBy: operator.uid,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log('Creating assignment with data:', JSON.stringify(assignmentData, null, 2));

      const assignmentRef = await addDoc(collection(db, 'assignments'), assignmentData);

      console.log('✅ SUCCESS: Assignment created with ID:', assignmentRef.id);

      // Update ride request status
      const rideRequestUpdate = {
        status: 'assigned',
        assignedDriverId: driver.id,
        assignmentId: assignmentRef.id,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log('Updating ride request:', selectedRequest.id, 'with:', rideRequestUpdate);
      await updateDoc(doc(db, 'rideRequests', selectedRequest.id), rideRequestUpdate);

      console.log('✅ SUCCESS: Ride request updated to assigned');
      
      alert(`✅ Driver ${driver.name} assigned successfully!\n\nAssignment ID: ${assignmentRef.id}`);
      
      // Close modal and clear selection
      setShowAssignModal(false);
      setSelectedRequest(null);
      
      console.log('=== ASSIGNMENT COMPLETE ===');
      
    } catch (err: any) {
      console.error('❌ ERROR: Failed to assign driver:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      alert(`❌ Failed to assign driver: ${err.message || 'Please try again'}\n\nError Code: ${err.code || 'unknown'}\n\nCheck browser console (F12) for details.`);
    } finally {
      setAssigning(false);
    }
  };

  const formatTime = (timestamp: any) => {
    try {
      const d = timestamp?.toMillis ? new Date(timestamp.toMillis()) : new Date(timestamp);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ride Requests</h1>
          <p className="text-gray-400 mt-1">
            {requests.length} pending request{requests.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="card text-center py-12">
          <Car className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No pending ride requests</p>
          <p className="text-gray-500 text-sm mt-2">
            When travelers request a ride, they'll appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">
                      {req.travelerName || 'Traveler'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      ID: {req.travelerId.slice(0, 8)}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-yellow-400" />
                        Pickup: {req.pickupLocation}
                      </span>
                      <span className="flex items-center gap-1">
                        <Navigation className="w-3.5 h-3.5 text-purple-400" />
                        To: {req.destination}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        {formatTime(req.createdAt)}
                      </span>
                    </div>
                    {req.notes && (
                      <p className="text-sm text-gray-500 mt-2 italic">
                        "{req.notes}"
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded-full text-xs bg-yellow-500/10 text-yellow-400">
                    Pending
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-navy-700/50">
                <button
                  onClick={() => {
                    setSelectedRequest(req);
                    setShowAssignModal(true);
                  }}
                  className="flex-1 text-center py-2 px-4 rounded-lg bg-teal-600/10 text-teal-400 text-sm font-medium hover:bg-teal-600/20 transition-colors flex items-center justify-center gap-1"
                >
                  <UserCheck className="w-4 h-4" /> Assign Driver
                </button>
                <Link
                  to={`/travelers/${req.tripId}`}
                  className="flex-1 text-center py-2 px-4 rounded-lg bg-blue-600/10 text-blue-400 text-sm font-medium hover:bg-blue-600/20 transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowRight className="w-4 h-4" /> View Trip
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign Driver Modal */}
      {showAssignModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-800 rounded-2xl p-6 max-w-md w-full border border-navy-600/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Assign Driver</h3>
              <button
                onClick={() => { 
                  console.log('Closing modal');
                  setShowAssignModal(false); 
                  setSelectedRequest(null); 
                }}
                className="text-gray-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-1">
                Assigning driver for: <span className="text-white font-medium">{selectedRequest.travelerName || 'Traveler'}</span>
              </p>
              <p className="text-sm text-gray-500">
                Destination: <span className="text-gray-400">{selectedRequest.destination}</span>
              </p>
            </div>

            {drivers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 mb-3">No drivers available</p>
                <Link to="/drivers" className="text-teal-400 hover:text-teal-300 text-sm">
                  Add drivers first →
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                  {drivers.map((driver) => (
                    <button
                      key={driver.id}
                      onClick={() => {
                        console.log('Driver selected:', driver.name);
                        handleAssignDriver(driver.id);
                      }}
                      disabled={assigning}
                      className="w-full text-left p-3 rounded-xl bg-navy-700/30 hover:bg-navy-700/50 transition-colors border border-navy-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                          <Car className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">{driver.name}</p>
                          <p className="text-sm text-gray-400">{driver.vehicle} {driver.plateNumber && `(${driver.plateNumber})`}</p>
                          {driver.phone && (
                            <p className="text-xs text-gray-500 mt-0.5">{driver.phone}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                
                {assigning && (
                  <div className="flex items-center justify-center gap-2 py-3 text-sm text-teal-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Assigning driver...</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}