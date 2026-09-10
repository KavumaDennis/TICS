import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  MapPin,
  Car,
  Phone,
  Navigation,
  ChevronRight,
  Circle,
  RefreshCw,
  UserCheck,
  XCircle,
  Clock,
  MessageCircle,
  Eye,
  UserX,
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import type { AssignmentDoc } from '../types';

interface TravelerWithStatus {
  id: string;
  travelerId: string;
  travelerName?: string;
  tripId: string;
  operatorId: string;
  operatorName?: string;
  active: boolean;
  currentDriver?: string;
  currentDriverId?: string;
  driverPhone?: string;
  vehicle?: string;
  plateNumber?: string;
  rideStatus?: string;
  lastUpdate?: string;
  currentLat?: number;
  currentLng?: number;
  destination?: string;
  destinationLat?: number;
  destinationLng?: number;
  online?: boolean;
  assignmentId?: string;
}

export default function TravelerManagementPage() {
  const { operator } = useAuthStore();
  const navigate = useNavigate();
  const [travelers, setTravelers] = useState<TravelerWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTraveler, setSelectedTraveler] = useState<TravelerWithStatus | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string; phone?: string; vehicle: string; plateNumber: string; active: boolean }>>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningTraveler, setAssigningTraveler] = useState<TravelerWithStatus | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!operator?.uid) return;
    const db = getFirebaseFirestore();
    
    // Load operator's drivers
    const driversUnsub = onSnapshot(
      query(collection(db, 'drivers'), where('operatorId', '==', operator.uid), where('active', '==', true)),
      (snap) => {
        setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
      }
    );
    
    // Load travelers from travelerOperators
    const travelerUnsub = onSnapshot(
      query(
        collection(db, 'travelerOperators'),
        where('operatorId', '==', operator.uid),
        where('active', '==', true)
      ),
      async (snap) => {
        const items: TravelerWithStatus[] = [];
        
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const traveler: TravelerWithStatus = {
            id: docSnap.id,
            travelerId: data.travelerId || '',
            tripId: data.tripId || '',
            operatorId: data.operatorId || '',
            operatorName: data.operatorName || '',
            active: data.active || false,
            travelerName: data.travelerName || data.travelerId?.slice(0, 8) || 'Unknown',
            rideStatus: 'none',
            online: false,
          };

          // Fetch traveler's current assignment
          try {
            const assignQ = query(
              collection(db, 'assignments'),
              where('travelerId', '==', data.travelerId),
              where('tripId', '==', data.tripId)
            );
            const assignSnap = await getDocs(assignQ);
            if (!assignSnap.empty) {
              const assign = assignSnap.docs[0];
              const assignData = assign.data() as AssignmentDoc;
              traveler.assignmentId = assign.id;
              traveler.currentDriver = assignData.driverName;
              traveler.currentDriverId = assignData.driverId;
              traveler.driverPhone = assignData.driverPhone;
              traveler.vehicle = assignData.vehicle;
              traveler.plateNumber = assignData.plateNumber;
              traveler.rideStatus = assignData.status;
              traveler.destination = assignData.destination;
              traveler.destinationLat = assignData.destinationLat;
              traveler.destinationLng = assignData.destinationLng;
              traveler.currentLat = assignData.currentLat;
              traveler.currentLng = assignData.currentLng;
            }
          } catch {}

          // Check traveler location for online status
          try {
            const locDoc = await getDoc(doc(db, 'travelerLocations', data.travelerId));
            if (locDoc.exists()) {
              const locData = locDoc.data();
              traveler.currentLat = locData.lat;
              traveler.currentLng = locData.lng;
              const ts = locData.timestamp?.toMillis?.() || 0;
              traveler.online = (Date.now() - ts) < 120000; // 2 min threshold
              traveler.lastUpdate = new Date(ts).toLocaleTimeString();
            }
          } catch {}

          items.push(traveler);
        }
        
        setTravelers(items);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading travelers:', err);
        setLoading(false);
      }
    );

    return () => {
      travelerUnsub();
      driversUnsub();
    };
  }, [operator?.uid]);

  const handleRemoveAssignment = async (traveler: TravelerWithStatus) => {
    if (!traveler.assignmentId) return;
    setRemoving(traveler.id);
    try {
      const db = getFirebaseFirestore();
      await updateDoc(doc(db, 'assignments', traveler.assignmentId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      // Also deactivate the traveler-operator relationship
      await updateDoc(doc(db, 'travelerOperators', traveler.id), {
        active: false,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to remove assignment:', err);
    } finally {
      setRemoving(null);
    }
  };

  const handleAssignDriver = async (traveler: TravelerWithStatus, driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    
    setAssigning(true);
    try {
      const db = getFirebaseFirestore();
      
      if (traveler.assignmentId) {
        // Reassign: update the existing assignment with new driver info
        await updateDoc(doc(db, 'assignments', traveler.assignmentId), {
          driverId: driver.id,
          driverName: driver.name,
          driverPhone: driver.phone || '',
          vehicle: driver.vehicle,
          plateNumber: driver.plateNumber,
          status: 'assigned',
          assignedBy: operator?.uid || '',
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // New assignment: create a new document with addDoc
        await addDoc(collection(db, 'assignments'), {
          travelerId: traveler.travelerId,
          travelerName: traveler.travelerName || 'Traveler',
          tripId: traveler.tripId,
          operatorId: operator?.uid || '',
          operatorName: (operator as any)?.name || '',
          driverId: driver.id,
          driverName: driver.name,
          driverPhone: driver.phone || '',
          vehicle: driver.vehicle,
          plateNumber: driver.plateNumber,
          status: 'assigned',
          assignedBy: operator?.uid || '',
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      
      setShowAssignModal(false);
      setAssigningTraveler(null);
    } catch (err) {
      console.error('Failed to assign driver:', err);
    } finally {
      setAssigning(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'assigned': return 'bg-blue-500/10 text-blue-400';
      case 'driver_arrived': return 'bg-green-500/10 text-green-400';
      case 'ride_started': return 'bg-teal-500/10 text-teal-400';
      case 'near_destination': return 'bg-yellow-500/10 text-yellow-400';
      case 'completed': return 'bg-gray-500/10 text-gray-400';
      case 'cancelled': return 'bg-red-500/10 text-red-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Traveler Management</h1>
          <p className="text-gray-400 mt-1">Manage your assigned travelers</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{travelers.length} active</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : travelers.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No travelers assigned to you yet</p>
          <p className="text-gray-500 text-sm mt-2">
            When travelers select your company, they'll appear here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {travelers.map((traveler) => (
            <div
              key={traveler.id}
              className="card"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-navy-700 flex items-center justify-center relative">
                    <Users className="w-6 h-6 text-gray-400" />
                    {traveler.online && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-navy-800" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{traveler.travelerName}</h3>
                    <p className="text-sm text-gray-500">ID: {traveler.travelerId.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    traveler.online ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                  }`}>
                    {traveler.online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Current Status */}
              <div className="space-y-2 text-sm text-gray-400">
                {traveler.rideStatus && traveler.rideStatus !== 'none' && (
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-blue-400" />
                    <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(traveler.rideStatus)}`}>
                      {traveler.rideStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                {traveler.currentDriver && (
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-teal-400" />
                    <span>Driver: {traveler.currentDriver}</span>
                    {traveler.vehicle && <span className="text-gray-500">({traveler.vehicle} {traveler.plateNumber ? `- ${traveler.plateNumber}` : ''})</span>}
                  </div>
                )}
                {traveler.currentLat && traveler.currentLng && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-purple-400" />
                    <span>
                      {traveler.currentLat.toFixed(4)}, {traveler.currentLng.toFixed(4)}
                    </span>
                  </div>
                )}
                {traveler.destination && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-yellow-400" />
                    <span>Destination: {traveler.destination}</span>
                  </div>
                )}
                {traveler.lastUpdate && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span>Last update: {traveler.lastUpdate}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-navy-700/50">
                <Link
                  to={`/travelers/${traveler.tripId}`}
                  className="flex-1 text-center py-2 px-4 rounded-lg bg-teal-600/10 text-teal-400 text-sm font-medium hover:bg-teal-600/20 transition-colors flex items-center justify-center gap-1"
                >
                  <Eye className="w-4 h-4" /> View
                </Link>
                <button
                  onClick={() => {
                    setAssigningTraveler(traveler);
                    setShowAssignModal(true);
                  }}
                  className="flex-1 text-center py-2 px-4 rounded-lg bg-blue-600/10 text-blue-400 text-sm font-medium hover:bg-blue-600/20 transition-colors flex items-center justify-center gap-1"
                >
                  <UserCheck className="w-4 h-4" /> {traveler.currentDriver ? 'Reassign' : 'Assign'}
                </button>
                {traveler.currentDriver && (
                  <button
                    onClick={() => handleRemoveAssignment(traveler)}
                    disabled={removing === traveler.id}
                    className="flex-1 text-center py-2 px-4 rounded-lg bg-red-600/10 text-red-400 text-sm font-medium hover:bg-red-600/20 transition-colors flex items-center justify-center gap-1"
                  >
                    <UserX className="w-4 h-4" /> {removing === traveler.id ? '...' : 'Remove'}
                  </button>
                )}
                {traveler.driverPhone && (
                  <a
                    href={`https://wa.me/${traveler.driverPhone.replace(/[^\d]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 rounded-lg bg-green-600/10 text-green-400 text-sm hover:bg-green-600/20 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign Driver Modal */}
      {showAssignModal && assigningTraveler && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-800 rounded-2xl p-6 max-w-md w-full border border-navy-600/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {assigningTraveler.currentDriver ? 'Reassign Driver' : 'Assign Driver'}
              </h3>
              <button
                onClick={() => { setShowAssignModal(false); setAssigningTraveler(null); }}
                className="text-gray-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Select a driver for {assigningTraveler.travelerName}
            </p>
            {assigning ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400 text-sm ml-2">Assigning driver...</span>
              </div>
            ) : drivers.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                No drivers available. <Link to="/drivers" className="text-teal-400 hover:underline">Add drivers first</Link>
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {drivers.map((driver) => (
                  <button
                    key={driver.id}
                    onClick={() => handleAssignDriver(assigningTraveler, driver.id)}
                    className="w-full text-left p-3 rounded-xl bg-navy-700/50 hover:bg-navy-700/70 transition-colors border border-navy-600/30 hover:border-teal-500/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                        <Car className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">{driver.name}</p>
                        <p className="text-sm text-gray-400">{driver.vehicle} ({driver.plateNumber})</p>
                        {driver.phone && <p className="text-xs text-gray-500">{driver.phone}</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}