import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import PersistentTabBar from '@/src/components/PersistentTabBar';

const STATUS_CFG: Record<string, { color: string; label: string; icon: string }> = {
  assigned: { color: '#3B82F6', label: 'Assigned', icon: 'car' },
  en_route: { color: '#F59E0B', label: 'En Route', icon: 'navigate' },
  arrived: { color: '#22C55E', label: 'Arrived', icon: 'location' },
  picked_up: { color: '#8B5CF6', label: 'Picked Up', icon: 'checkmark-circle' },
  completed: { color: '#10B981', label: 'Completed', icon: 'checkmark-done-circle' },
  cancelled: { color: '#EF4444', label: 'Cancelled', icon: 'close-circle' },
};

export default function MyPickupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.token);
  const trips = useTripStore((s) => s.trips);

  // Find the active trip (one with lastMileStatus not 'none' or 'scheduled')
  const activeTrip = useMemo(
    () => trips.find((t) => t.lastMileStatus && t.lastMileStatus !== 'none' && t.lastMileStatus !== 'scheduled') ?? null,
    [trips],
  );

  const [assignment, setAssignment] = useState<{ driverName: string; driverPhone: string; vehicle: string; plateNumber: string; eta: string; status: string } | null>(null);

  // Load assignment for active trip
  useEffect(() => {
    if (!activeTrip?.id) return;
    const db = getFirebaseFirestore();
    const q = query(collection(db, 'assignments'), where('tripId', '==', activeTrip.id), where('travelerId', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setAssignment({
          driverName: data.driverName || '',
          driverPhone: data.driverPhone || '',
          vehicle: data.vehicle || '',
          plateNumber: data.plateNumber || '',
          eta: data.eta || '',
          status: data.status || 'assigned',
        });
      } else {
        setAssignment(null);
      }
    });
    return () => unsub();
  }, [activeTrip?.id, uid]);

  const status = activeTrip?.lastMileStatus ?? 'none';
  const statusCfg = STATUS_CFG[status] ?? { color: '#64748B', label: 'No Pickup', icon: 'car-outline' };

  const handleCall = async () => {
    console.log('Call button pressed');
    if (!assignment?.driverPhone) {
      console.log('No driver phone available');
      return;
    }
    const url = `tel:${assignment.driverPhone}`;
    console.log('Opening dialer:', url);
    try {
      const supported = await Linking.canOpenURL(url);
      console.log('Dialer supported:', supported);
      if (!supported) {
        console.error('Cannot open dialer app');
        return;
      }
      await Linking.openURL(url);
      console.log('Dialer opened successfully');
    } catch (err) {
      console.error('Failed to open dialer:', err);
    }
  };

  const handleWhatsApp = async () => {
    console.log('WhatsApp button pressed');
    if (!assignment?.driverPhone) {
      console.log('No driver phone available for WhatsApp');
      return;
    }
    // Remove leading + and any non-digit characters for wa.me
    const phone = assignment.driverPhone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent('Hello, I am your assigned traveler for the TICS pickup. I would like to confirm our pickup arrangements.');
    const url = `https://wa.me/${phone}?text=${message}`;
    console.log('Opening WhatsApp:', url);
    try {
      const supported = await Linking.canOpenURL(url);
      console.log('WhatsApp supported:', supported);
      if (!supported) {
        console.error('Cannot open WhatsApp app or browser');
        return;
      }
      await Linking.openURL(url);
      console.log('WhatsApp opened successfully');
    } catch (err) {
      console.error('Failed to open WhatsApp:', err);
    }
  };

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingBottom: 12 }}>
        <Pressable
          onPress={() => router.back()}
          className="border border-[#96C7B3]/50 bg-white/[0.06]"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 18 }}>My Pickup</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }} numberOfLines={1}>
            {activeTrip ? `Arriving at ${activeTrip.to}` : 'No active trip'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 8, paddingBottom: 112 }} showsVerticalScrollIndicator={false}>

        {!activeTrip ? (
          /* Empty state */
          <View style={{ borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)', padding: 24, alignItems: 'center', gap: 12 }}>
            <Ionicons name="car-outline" size={48} color="rgba(248,250,252,0.15)" />
            <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#94a3b8', fontSize: 14 }}>
              No pickup assigned
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
              When an operator assigns a driver to your trip, you'll see the details here.
            </Text>
          </View>
        ) : (
          <>
            {/* Status Banner */}
            <View style={{ borderRadius: 18, backgroundColor: `${statusCfg.color}15`, padding: 20, borderWidth: 1, borderColor: `${statusCfg.color}30` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: `${statusCfg.color}25`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={statusCfg.icon as any} size={24} color={statusCfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 16 }}>
                    {statusCfg.label}
                  </Text>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                    {activeTrip.title}
                  </Text>
                </View>
              </View>
            </View>

            {/* Trip Info */}
            <View style={{ borderRadius: 18, backgroundColor: 'rgba(139,92,246,0.10)', padding: 20, borderWidth: 1, borderColor: 'rgba(139,92,246,0.20)' }}>
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#A78BFA', fontSize: 11, letterSpacing: 0.8, marginBottom: 12 }}>
                TRIP DETAILS
              </Text>

              {activeTrip.flightNumber && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="airplane" size={16} color="#A78BFA" />
                  <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 14 }}>
                    {activeTrip.airline || ''} {activeTrip.flightNumber}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="location" size={16} color="#A78BFA" />
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13 }}>
                  Arriving at {activeTrip.to}
                </Text>
              </View>

              {activeTrip.arrivalTime && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="time" size={16} color="#A78BFA" />
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13 }}>
                    {new Date(activeTrip.arrivalTime).toLocaleString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </View>
              )}
            </View>

            {/* Assignment Details */}
            <View style={{ borderRadius: 18, backgroundColor: 'rgba(59,130,246,0.08)', padding: 20, borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)' }}>
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#60A5FA', fontSize: 11, letterSpacing: 0.8, marginBottom: 12 }}>
                PICKUP DETAILS
              </Text>

              {assignment ? (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="person" size={18} color="#60A5FA" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14 }}>{assignment.driverName}</Text>
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{assignment.driverPhone}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="car" size={18} color="#60A5FA" />
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13 }}>
                      {assignment.vehicle} ({assignment.plateNumber})
                    </Text>
                  </View>

                  {assignment.eta ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="time" size={18} color="#60A5FA" />
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13 }}>
                        ETA: {new Date(assignment.eta).toLocaleString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                  <Ionicons name="car" size={32} color="rgba(248,250,252,0.2)" />
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, textAlign: 'center' }}>
                    Assignment details will appear here once the operator assigns a driver.
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            {assignment ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={handleCall}
                  style={{ 
                    flex: 1, 
                    borderRadius: 14, 
                    backgroundColor: assignment.driverPhone ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.05)',
                    paddingVertical: 14, 
                    alignItems: 'center', 
                    borderWidth: 1, 
                    borderColor: assignment.driverPhone ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.1)',
                    opacity: assignment.driverPhone ? 1 : 0.5,
                  }}
                >
                  <Ionicons name="call" size={18} color={assignment.driverPhone ? "#22C55E" : "#22C55E80"} />
                  <Text style={{ fontFamily: 'Syne_700Bold', color: assignment.driverPhone ? '#22C55E' : '#22C55E80', fontSize: 12, marginTop: 4 }}>Call Driver</Text>
                </Pressable>
                <Pressable
                  onPress={handleWhatsApp}
                  style={{ 
                    flex: 1, 
                    borderRadius: 14, 
                    backgroundColor: assignment.driverPhone ? 'rgba(37,211,102,0.15)' : 'rgba(37,211,102,0.05)',
                    paddingVertical: 14, 
                    alignItems: 'center', 
                    borderWidth: 1, 
                    borderColor: assignment.driverPhone ? 'rgba(37,211,102,0.25)' : 'rgba(37,211,102,0.1)',
                    opacity: assignment.driverPhone ? 1 : 0.5,
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={assignment.driverPhone ? "#25D366" : "#25D36680"} />
                  <Text style={{ fontFamily: 'Syne_700Bold', color: assignment.driverPhone ? '#25D366' : '#25D36680', fontSize: 12, marginTop: 4 }}>WhatsApp</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <PersistentTabBar />
    </View>
  );
}