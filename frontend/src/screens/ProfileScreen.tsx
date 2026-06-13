/**
 * ProfileScreen — shows user stats, settings menu, live ratings.
 * Rating system: users can submit 1–5 stars, stored in Firestore.
 * Global average is displayed from the aggregate document.
 */
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Card from '@/src/components/Card';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ticsDisplayName } from '@/src/utils/displayName';
import { useTripStore } from '@/src/store/tripStore';
import { useUserDocStore } from '@/src/store/userDocStore';
import { useRatingStore } from '@/src/store/ratingStore';

type Row = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle: string;
  href: '/account/edit' | '/account/payment' | '/account/trips-preferences' | '/account/notifications' | '/account/support';
};

function StarRow({ current, onRate }: { current: number | null; onRate: (stars: number) => void }) {
  const [hover, setHover] = useState(0);
  const display = hover || current || 0;
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginVertical: 12 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable
          key={s}
          onPress={() => onRate(s)}
          onPressIn={() => setHover(s)}
          onPressOut={() => setHover(0)}
          style={{ padding: 4 }}
        >
          <Ionicons
            name={display >= s ? 'star' : 'star-outline'}
            size={28}
            color={display >= s ? '#F59E0B' : 'rgba(248,250,252,0.3)'}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const loading = useAuthStore((s) => s.loading);
  const trips = useTripStore((s) => s.trips);
  const userDoc = useUserDocStore((s) => s.doc);
  const { userStars, averageRating, totalRatings, submitting, submitRating } = useRatingStore();

  const displayName = ticsDisplayName(user);
  const tripsCount = trips.length;
  const flightsCount = trips.filter((t) => t.flightNumber || t.airline).length;

  const [showRating, setShowRating] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function handleRate(stars: number) {
    try {
      await submitRating(stars, feedback || undefined);
      Alert.alert('Thank you!', `You rated TICS ${stars} star${stars === 1 ? '' : 's'}.`);
      setShowRating(false);
    } catch { /* shown by store */ }
  }

  const rows: Row[] = [
    { icon: 'person', label: 'Personal information', subtitle: 'Name, email · opens editor', href: '/account/edit' },
    { icon: 'card', label: 'Payment methods', subtitle: 'Cards & billing (future)', href: '/account/payment' },
    { icon: 'briefcase', label: 'Trips & preferences', subtitle: 'Trip count & travel defaults', href: '/account/trips-preferences' },
    { icon: 'notifications', label: 'Notifications', subtitle: 'Push & digest preferences', href: '/account/notifications' },
    { icon: 'help-circle', label: 'Support center', subtitle: 'Help articles & contact', href: '/account/support' },
  ];

  if (!token) {
    return (
      <View className="flex-1 px-5 pt-10">
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[22px]">Profile</Text>
        <Card accent="blue" className="mt-6 py-6">
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[20px]">Not signed in</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5">Sign in to sync trips, alerts, and preferences.</Text>
          <View className="mt-5 flex-row gap-3">
            <Pressable onPress={() => router.push('/auth/login')} className="flex-1 rounded-2xl bg-tics-amber px-5 py-4">
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-center text-[14px] text-[#05210f]">Login</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/auth/register')} className="flex-1 rounded-2xl border border-[#96C7B3]/50 bg-white/[0.06] px-5 py-4">
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-center text-[13px] text-tics-text">Register</Text>
            </Pressable>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2 pt-14">
      <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[24px]">Profile</Text>

      <ScrollView className="mt-6" contentContainerStyle={{ paddingBottom: 112, gap: 16 }} showsVerticalScrollIndicator={false}>

        {/* ── Avatar + name ── */}
        <Pressable onPress={() => router.push('/account/edit')} className="active:opacity-90">
          <Card accent="purple" className="px-5 py-5">
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-white/[0.07] mb-3">
                <Ionicons name="person" size={22} color="rgba(248,250,252,0.90)" />
              </View>
              <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[22px]">{displayName}</Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-1 text-tics-muted text-[12px]">{user?.email ?? '—'}</Text>
              <View className="mt-3 rounded-full bg-tics-blue/20 px-3 py-1">
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-blue text-[11px]">Tap to edit profile</Text>
              </View>
            </View>
          </Card>
        </Pressable>

        {/* ── Stats row ── */}
        <View className="flex-row gap-3">
          <View className="flex-1 items-center bg-tics-blue/20 rounded-2xl py-4">
            <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-blue text-[32px]">{tripsCount}</Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] mt-1">Trips</Text>
          </View>
          <View className="flex-1 items-center bg-tics-blue/20 rounded-2xl py-4">
            <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-blue text-[32px]">{flightsCount}</Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] mt-1">Flights</Text>
          </View>
          <Pressable
            className="flex-1 items-center bg-tics-amber/15 rounded-2xl py-4 active:opacity-80"
            onPress={() => setShowRating((v) => !v)}
          >
            <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-amber text-[32px]">
              {userStars != null ? userStars.toFixed(0) : '—'}
            </Text>
            <View className="flex-row items-center gap-1 mt-1">
              <Ionicons name="star" size={10} color="#F59E0B" />
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">My rating</Text>
            </View>
          </Pressable>
        </View>

        {/* ── Rating panel ── */}
        {showRating && (
          <Card accent="none" className="py-5 px-4">
            <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[15px] text-center">Rate TICS</Text>
            {averageRating != null && (
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px] text-center mt-1">
                Global average: {averageRating.toFixed(1)} ★ ({totalRatings} ratings)
              </Text>
            )}
            <StarRow current={userStars} onRate={handleRate} />
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] text-center">
              {userStars != null ? `Your current rating: ${userStars} star${userStars === 1 ? '' : 's'}. Tap to update.` : 'Tap a star to rate.'}
            </Text>
            {submitting && (
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] text-center mt-2">Saving…</Text>
            )}
          </Card>
        )}

        {/* ── Global app rating ── */}
        {averageRating != null && !showRating && (
          <Pressable onPress={() => setShowRating(true)} className="active:opacity-80">
            <View className="flex-row items-center gap-3 rounded-2xl border border-tics-amber/25 bg-tics-amber/10 px-4 py-3">
              <Ionicons name="star" size={18} color="#F59E0B" />
              <View className="flex-1">
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-amber text-[13px]">
                  TICS rated {averageRating.toFixed(1)} / 5
                </Text>
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] mt-0.5">
                  {totalRatings} review{totalRatings === 1 ? '' : 's'} · Tap to rate
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="rgba(248,250,252,0.4)" />
            </View>
          </Pressable>
        )}

        {/* ── Saved items quick link ── */}
        <Pressable onPress={() => router.push('/saved' as any)} className="active:opacity-80">
          <View className="flex-row items-center gap-3 rounded-2xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3">
            <Ionicons name="bookmark-outline" size={18} color="#3B82F6" />
            <View className="flex-1">
              <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[14px]">Saved items</Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] mt-0.5">
                Your saved alerts, recommendations & insights
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="rgba(248,250,252,0.3)" />
          </View>
        </Pressable>

        {/* ── Settings rows ── */}
        <View className="bg-tics-blue/20 py-3 px-5 rounded-3xl">
          {rows.map((row, i) => (
            <Pressable
              key={row.href}
              onPress={() => router.push(row.href as any)}
              className={`py-4 active:opacity-80 ${i < rows.length - 1 ? 'border-b border-white/10' : ''}`}
            >
              <View className="flex-row items-center">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-white/[0.07]">
                  <Ionicons name={row.icon} size={17} color="rgba(248,250,252,0.90)" />
                </View>
                <View style={{ marginLeft: 16 }} className="flex-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[14px]">{row.label}</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-0.5 text-[11px] text-tics-muted">{row.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(248,250,252,0.35)" />
              </View>
            </Pressable>
          ))}
        </View>

        {/* ── Logout ── */}
        <Pressable
          disabled={loading}
          onPress={logout}
          className="flex-row justify-center items-center gap-2 bg-tics-red/15 border border-tics-red/20 py-4 px-5 rounded-2xl"
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          <Ionicons name="log-out" size={18} color="#EF4444" />
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[14px] text-tics-red">
            {loading ? 'Signing out…' : 'Log out'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
