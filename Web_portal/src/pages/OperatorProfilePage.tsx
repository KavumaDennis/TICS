import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { CheckCircle, Save, AlertCircle } from 'lucide-react';

export default function OperatorProfilePage() {
  const { user, operator, logout } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    logoUrl: '',
    companyName: '',
    description: '',
    location: '',
    country: '',
    contactPhone: '',
    contactEmail: '',
    availableDrivers: 0,
    lodgeName: '',
  });

  useEffect(() => {
    if (operator) {
      setForm({
        name: operator.name || '',
        email: operator.email || '',
        logoUrl: operator.logoUrl || '',
        companyName: operator.lodgeName || operator.name || '',
        description: operator.description || '',
        location: operator.location || '',
        country: operator.country || '',
        contactPhone: operator.contactPhone || '',
        contactEmail: operator.contactEmail || operator.email || '',
        availableDrivers: operator.availableDrivers || 0,
        lodgeName: operator.lodgeName || '',
      });
    }
  }, [operator]);

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const db = getFirebaseFirestore();
      const userRef = doc(db, 'users', user.uid);
      
      const updateData: any = {
        name: form.name,
        lodgeName: form.companyName,
        logoUrl: form.logoUrl,
        description: form.description,
        location: form.location,
        country: form.country,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        availableDrivers: form.availableDrivers,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(userRef, updateData);

      // If the operator also has an "operators" collection document, sync there
      try {
        const operatorsRef = doc(db, 'operators', user.uid);
        const opSnap = await getDoc(operatorsRef);
        if (opSnap.exists()) {
          await updateDoc(operatorsRef, {
            ...updateData,
            active: true,
          });
        } else {
          // Create operator document in operators collection
          const { setDoc } = await import('firebase/firestore');
          await setDoc(operatorsRef, {
            ...updateData,
            name: form.name,
            email: form.email,
            phone: form.contactPhone,
            logoUrl: form.logoUrl,
            description: form.description,
            location: form.location,
            country: form.country,
            contactPhone: form.contactPhone,
            contactEmail: form.contactEmail,
            availableDrivers: form.availableDrivers,
            active: true,
            role: 'operator',
            createdAt: serverTimestamp(),
          });
        }
      } catch { /* operators collection optional */ }

      // Update local store
      useAuthStore.setState((state) => ({
        operator: {
          ...state.operator!,
          name: form.name,
          lodgeName: form.companyName,
          logoUrl: form.logoUrl,
          description: form.description,
          location: form.location,
          country: form.country,
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail,
          availableDrivers: form.availableDrivers,
        },
      }));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Edit Profile</h1>
        <p className="text-gray-400 mt-1">Update your operator information</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-400">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm">Profile updated successfully!</span>
        </div>
      )}

      <div className="card max-w-2xl">
        <div className="space-y-6">
          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Logo URL</label>
            <input
              type="text"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
            />
            {form.logoUrl && (
              <div className="mt-2 w-16 h-16 rounded-lg overflow-hidden bg-navy-700">
                <img src={form.logoUrl} alt="Logo preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Company Name</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="Your company name"
              className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Tell travelers about your services..."
              rows={4}
              className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors resize-none"
            />
          </div>

          {/* Location & Country */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Location / City</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Kampala, Entebbe"
                className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="e.g. Uganda"
                className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Contact Phone</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                placeholder="+256 700 000 000"
                className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Contact Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                placeholder="contact@example.com"
                className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Available Drivers */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Number of Available Drivers</label>
            <input
              type="number"
              value={form.availableDrivers}
              onChange={(e) => setForm({ ...form, availableDrivers: parseInt(e.target.value) || 0 })}
              min={0}
              className="w-full bg-navy-700 border border-navy-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
            />
          </div>

          {/* Save Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}