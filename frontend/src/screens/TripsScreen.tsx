import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import TripCard from '@/src/components/TripCard';
import { useTripStore } from '@/src/store/tripStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { isTripActive, isTripCompleted } from '@/src/utils/tripStatus';
import { useAlertModal } from '@/src/components/AlertModal';

export default function TripsScreen() {
  const router = useRouter();
  const uid = useAuthStore((s) => s.token);
  const trips = useTripStore((s) => s.trips);
  const loading = useTripStore((s) => s.loading);
  const refreshTrips = useTripStore((s) => s.refreshTrips);
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const { modal: deleteModal, showAlert: showDeleteAlert } = useAlertModal();

  // Filter trips by search query across all relevant fields
  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.from?.toLowerCase().includes(q) ||
        t.to?.toLowerCase().includes(q) ||
        t.flightNumber?.toLowerCase().includes(q) ||
        t.airline?.toLowerCase().includes(q)
    );
  }, [trips, search]);

  // Separate into active and completed using centralized status logic
  const { activeTrips, completedTrips } = useMemo(() => {
    const active: typeof trips = [];
    const completed: typeof trips = [];
    for (const t of filteredTrips) {
      if (isTripActive(t)) {
        active.push(t);
      } else {
        completed.push(t);
      }
    }
    return { activeTrips: active, completedTrips: completed };
  }, [filteredTrips]);

  if (!uid) {
    return (
      <View className="flex-1 px-2 pt-10">
        <View
          className='bg-tics-amber/25 border border-tics-amber/10 flex-row items-center gap-3 rounded-full p-2'
        >
          <Pressable 
          onPress={() => router.back()}
          className="rounded-full bg-tics-amber/35 border border-tics-amber/20 p-2"
           style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
          </Pressable>
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[17px]">My Trips</Text>
        </View>

        <Card accent="blue" className="py-6">
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-amber ml-2  text-[20px]">Sign in required</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 ml-2  text-tics-muted text-[12px] leading-5">Create and manage trips after signing in.</Text>

          <View className="mt-5 flex-row gap-3">
            <Pressable onPress={() => router.push('/auth/login')} className="flex-1 rounded-full bg-tics-amber/35 border border-tics-amber/20 p-6">
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-center text-[13px] text-tics-text">Login</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/auth/register')}
              className="flex-1 rounded-full border border-[#96C7B3]/50 bg-white/[0.06] p-6"
            >
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-center text-[13px] text-tics-text">Register</Text>
            </Pressable>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2 pt-10">
      <View className="p-2 flex-row items-center justify-between gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[17px] ml-2">My Trips</Text>
        <Pressable onPress={() => router.push('/trip/add' as any)} className="bg-tics-amber/35 border border-tics-amber/20 px-5 py-4 rounded-full">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-[12px] text-tics-text">+ New Trip</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View className="mt-1 flex-row items-center gap-2 rounded-full border border-[#96C7B3]/50 bg-white/[0.05] px-3 py-2">
        <Ionicons name="search-outline" size={16} color="rgba(248,250,252,0.4)" />
        <TextInput
          style={{ fontFamily: 'Syne_500Medium', flex: 1, color: 'rgba(248,250,252,0.9)', fontSize: 13 }}
          value={search}
          onChangeText={setSearch}
          placeholder="Search trips, flights, cities…"
          placeholderTextColor="rgba(248,250,252,0.3)"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="rgba(248,250,252,0.4)" />
          </Pressable>
        )}
      </View>

      {deleteModal}

      <FlatList
        className="mt-4"
        data={activeTrips.length > 0 ? ['active_header', ...activeTrips, 'completed_header', ...completedTrips] : completedTrips.length > 0 ? ['completed_header', ...completedTrips] : []}
        keyExtractor={(item, idx) => typeof item === 'string' ? item : item.id}
        refreshing={loading}
        onRefresh={() => (uid ? refreshTrips(uid).catch(() => { }) : undefined)}
        contentContainerStyle={{ paddingBottom: 12, gap: 12 }}
        renderItem={({ item }) => {
          if (item === 'active_header') {
            return (
              <View className="">
                <Text
                  style={{ fontFamily: 'Syne_700Bold' }}
                  className="text-tics-amber text-[16px] ml-2"
                >
                  Active Trips ({activeTrips.length})
                </Text>
              </View>
            );
          }

          if (item === 'completed_header') {
            if (completedTrips.length === 0) return null;
            return (
              <Pressable onPress={() => setShowCompleted(!showCompleted)} className="ml-2 ">
                <View className="flex-row items-center justify-between">
                  <Text
                    style={{ fontFamily: 'Syne_700Bold' }}
                    className="text-tics-amber text-[16px]"
                  >
                    Completed Trips ({completedTrips.length})
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => {
                        showDeleteAlert(
                          'Delete completed trips',
                          `This will permanently delete ${completedTrips.length} completed trip(s) from your account. This action cannot be undone.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => {
                                if (uid) {
                                  useTripStore.getState().deleteCompletedTrips(uid);
                                  refreshTrips(uid).catch(() => { });
                                }
                              },
                            },
                          ]
                        );
                      }}
                      className="bg-tics-red/20 border border-tics-red/30 rounded-xl px-3 py-1"
                    >
                      <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-red text-[11px]">
                        Delete all
                      </Text>
                    </Pressable>

                    <Ionicons
                      name={showCompleted ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="rgba(148,163,184,0.7)"
                    />

                  </View>
                </View>
                {!showCompleted && (
                  <Text
                    style={{ fontFamily: 'Syne_500Medium' }}
                    className="text-tics-muted/60 text-[12px] mt-1"
                  >
                    Tap to expand
                  </Text>
                )}
              </Pressable>
            );
          }

          if (typeof item === 'string') return null;

          // If it's a completed trip and collapsible section is closed, hide it
          if (completedTrips.includes(item) && !showCompleted) return null;

          return (
            <TripCard trip={item as any} onPress={() => router.push(`/trips/${item.id}`)} />
          );
        }}
        ListEmptyComponent={
          <View className="pt-10">
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[13px]">
              {search.trim() ? `No trips matching "${search}"` : 'No trips yet. Tap "+ New" to add one.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}