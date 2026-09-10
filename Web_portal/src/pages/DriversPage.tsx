import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Car,
  User,
  Phone,
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import type { DriverDoc } from '../types';

export default function DriversPage() {
  const [drivers, setDrivers] = useState<(DriverDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { operator } = useAuthStore();

  useEffect(() => {
    if (!operator?.uid) return;
    const db = getFirebaseFirestore();
    const q = query(collection(db, 'drivers'), where('operatorId', '==', operator.uid));
    const unsub = onSnapshot(q, (snap) => {
      setDrivers(snap.docs.map(d => ({ ...d.data() as DriverDoc, id: d.id })));
      setLoading(false);
    });
    return () => unsub();
  }, [operator?.uid]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !vehicle || !plateNumber) return;
    setSaving(true);
    try {
      const db = getFirebaseFirestore();
      await addDoc(collection(db, 'drivers'), {
        name,
        phone,
        vehicle,
        plateNumber,
        active: true,
        operatorId: operator?.uid || '',
        createdAt: serverTimestamp(),
      });
      setName('');
      setPhone('');
      setVehicle('');
      setPlateNumber('');
      setShowForm(false);
    } catch (err) {
      console.error('Failed to add driver:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (driver: DriverDoc & { id: string }) => {
    try {
      const db = getFirebaseFirestore();
      await updateDoc(doc(db, 'drivers', driver.id), {
        active: !driver.active,
      });
    } catch (err) {
      console.error('Failed to toggle driver:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this driver?')) return;
    try {
      const db = getFirebaseFirestore();
      await deleteDoc(doc(db, 'drivers', id));
    } catch (err) {
      console.error('Failed to delete driver:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Drivers</h1>
          <p className="text-gray-400 mt-1">Manage your pickup drivers and vehicles</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Driver
        </button>
      </div>

      {/* Add Driver Form */}
      {showForm && (
        <div className="card">
          <h2 className="text-white font-semibold mb-4">New Driver</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Driver Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+250 78x xxx xxx"
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Vehicle</label>
              <input
                type="text"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. Toyota Hiace"
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Plate Number</label>
              <input
                type="text"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="e.g. RAB 123 A"
                className="input-field"
                required
              />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Driver'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drivers List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      ) : drivers.length === 0 ? (
        <div className="card text-center py-12">
          <Car className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No drivers registered yet</p>
          <button onClick={() => setShowForm(true)} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Your First Driver
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map((driver) => (
            <div
              key={driver.id}
              onClick={() => navigate(`/drivers/${driver.id}`)}
              className={`card-hover cursor-pointer ${!driver.active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{driver.name}</h3>
                    <span className={driver.active ? 'badge-green' : 'badge-gray'}>
                      {driver.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(driver.id); }}
                  className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-400">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{driver.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Car className="w-3.5 h-3.5" />
                  <span>{driver.vehicle}</span>
                </div>
                <p className="text-gray-500 text-xs ml-5">{driver.plateNumber}</p>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); toggleActive(driver); }}
                className={`mt-3 w-full py-2 rounded-full text-sm font-medium transition-all ${
                  driver.active
                    ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                    : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                }`}
              >
                {driver.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}