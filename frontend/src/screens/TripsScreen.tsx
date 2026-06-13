import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import TripCard from '@/src/components/TripCard';
import { useTripStore } from '@/src/store/tripStore';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function TripsScreen() {
  const router = useRouter();
  const uid = useAuthStore((s) => s.token);
  const trips = useTripStore((s) => s.trips);
  const loading = useTripStore((s) => s.loading);
  const refreshTrips = useTripStore((s) => s.refreshTrips);
  const [search, setSearch] = useState('');

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

  if (!uid) {
    return (
      <View className="flex-1 px-2 pt-14">
        <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[22px]">My Trips</Text>

        <Card accent="blue" className="mt-5 py-6">
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[15px]">Sign in required</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5">Create and manage trips after signing in.</Text>

          <View className="mt-5 flex-row gap-3">
            <Pressable onPress={() => router.push('/auth/login')} className="flex-1 rounded-2xl bg-tics-amber px-5 py-4">
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-center text-[13px] text-[#05210f]">Login</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/auth/register')}
              className="flex-1 rounded-2xl border border-[#96C7B3]/50 bg-white/[0.06] px-5 py-4"
            >
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-center text-[13px] text-tics-text">Register</Text>
            </Pressable>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2 pt-14">
      <View className="flex-row items-center justify-between">
        <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[24px]">My Trips</Text>
        <Pressable style={{ borderRadius: 8 }} onPress={() => router.push('/trip/add' as any)} className="bg-tics-amber px-5 py-2">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-[12px] text-black">+ New Trip</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-[#96C7B3]/50 bg-white/[0.05] px-3 py-2">
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

      <FlatList
        className="mt-4"
        data={filteredTrips}
        keyExtractor={(t) => t.id}
        refreshing={loading}
        onRefresh={() => (uid ? refreshTrips(uid).catch(() => { }) : undefined)}
        contentContainerStyle={{ paddingBottom: 30, gap: 12 }}
        renderItem={({ item }) => (
          <TripCard trip={item as any} onPress={() => router.push(`/trips/${item.id}`)} />
        )}
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
