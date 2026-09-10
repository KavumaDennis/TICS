/**
 * ProfileScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Travel Dashboard — displays user identity, explorer level, XP progress,
 * travel statistics, and profile menu items.
 *
 * All statistics are computed dynamically by ProfileService.
 * No hardcoded values. No direct calculations in this screen.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { type ComponentProps, useMemo, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

import Card from '@/src/components/Card';
import { SafeText } from '@/src/components/responsive/SafeText';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import { useUserDocStore } from '@/src/store/userDocStore';
import { useSaveStore } from '@/src/store/saveStore';
import { ticsDisplayName } from '@/src/utils/displayName';
import { ExplorerLevelService } from '@/src/services/profile/ExplorerLevelService';
import { TravelStatsService, type TravelStats } from '@/src/services/profile/TravelStatsService';

/* ── Types ─────────────────────────────────────────────────────────────────── */

type MenuItem = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle: string;
  href: string;
};

type ExplorerInfo = ReturnType<typeof ExplorerLevelService.calculate>;

/* ── XP Progress Bar ───────────────────────────────────────────────────────── */

function XPProgressBar({ info }: { info: ExplorerInfo }) {
  return (
    <View className="mt-3 w-full">
      <View className="flex-row justify-between mb-1">
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">
          {info.totalXP.toLocaleString()} XP
        </SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">
          {info.xpForNextLevel.toLocaleString()} XP
        </SafeText>
      </View>
      <View className="h-2 rounded-full bg-white/10 overflow-hidden">
        <View style={{ width: `${info.progressPercent}%` }} className="h-full rounded-full bg-gradient-to-r from-tics-amber to-yellow-400" />
      </View>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[10px] text-center mt-1">
        {info.progress.toLocaleString()} / {info.xpForNextLevel.toLocaleString()} XP to Level {info.level + 1}
      </SafeText>
    </View>
  );
}

/* ── Level Badge ────────────────────────────────────────────────────────────── */

function LevelBadge({ level, title }: { level: number; title: string }) {
  return (
    <View className="flex-row items-center gap-2 rounded-full bg-tics-blue/20 border border-tics-blue/10 px-3 py-1.5">
      <Ionicons name="compass" size={14} color="#3B82F6" />
      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[11px]">
        Explorer Level {level}
      </SafeText>
      <View className="w-px h-3 bg-white/10" />
      <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">
        {title}
      </SafeText>
    </View>
  );
}

/* ── Menu Row Component ────────────────────────────────────────────────────── */

function MenuRow({ item, isLast }: { item: MenuItem; isLast: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(item.href as any)}
      className={`py-4 active:opacity-80 ${!isLast ? 'border-b border-white/10' : ''}`}
    >
      <View className="flex-row items-center">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-white/[0.07]">
          <Ionicons name={item.icon} size={17} color="rgba(248,250,252,0.90)" />
        </View>
        <View style={{ marginLeft: 16 }} className="flex-1">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[14px]">
            {item.label}
          </SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-0.5 text-[11px] text-tics-muted">
            {item.subtitle}
          </SafeText>
        </View>
        <Ionicons name="chevron-forward" size={16} color="rgba(248,250,252,0.35)" />
      </View>
    </Pressable>
  );
}

/* ── Main Screen ────────────────────────────────────────────────────────────── */

export default function ProfileScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const loading = useAuthStore((s) => s.loading);
  const trips = useTripStore((s) => s.trips);
  const userDoc = useUserDocStore((s) => s.doc);
  const displayName = ticsDisplayName(user);
  const profilePhotoURL = (userDoc as any)?.photoURL ?? null;

  // Compute explorer level from totalXP in userDoc
  const totalXP = (userDoc as any)?.totalXP ?? 0;
  const explorerInfo = useMemo(() => ExplorerLevelService.calculate(totalXP), [totalXP]);
  const levelTitle = useMemo(() => ExplorerLevelService.getLevelTitle(explorerInfo.level), [explorerInfo.level]);

  // Compute travel stats from trips
  const travelStats: TravelStats = useMemo(
    () => TravelStatsService.computeStatsFromTrips(trips),
    [trips],
  );

  // Fetch the real saved-places count from the savedPlaces collection.
  const [savedPlacesCount, setSavedPlacesCount] = useState(0);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebaseFirestore();
        const q = query(collection(db, 'savedPlaces'), where('userId', '==', token));
        const snap = await getDocs(q);
        if (cancelled) return;
        // Deduplicate by destinationId to match the Saved Places screen.
        const unique = new Set(snap.docs.map((d) => d.data().destinationId).filter(Boolean));
        setSavedPlacesCount(unique.size);
      } catch (err) {
        console.warn('[Profile] Error loading saved places count:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const menuItems: MenuItem[] = [
    { icon: 'compass', label: 'Travel Preferences', subtitle: 'Trip defaults & travel style', href: '/account/trips-preferences' },
    { icon: 'help-circle', label: 'Support Center', subtitle: 'Help articles & contact', href: '/account/support' },
    { icon: 'settings', label: 'Settings', subtitle: 'Notifications, privacy & account', href: '/account/notifications' },
  ];

  /* ── Not signed in ── */
  if (!token) {
    return (
      <View className="flex-1 p-1">
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full">
          <Pressable onPress={() => router.back()} style={{ width: 46, height: 46 }} className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
            <Ionicons name="chevron-back" size={22} color="rgba(248,250,252,0.9)" />
          </Pressable>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">Travel Dashboard</SafeText>
        </View>
        <Card accent="blue" className="py-6">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber ml-2 text-[20px]">Not signed in</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 ml-2 text-tics-muted text-[12px] leading-5">
            Sign in to see your travel dashboard, XP, and stats.
          </SafeText>
          <View className="mt-5 flex-row gap-3">
            <Pressable onPress={() => router.push('/auth/login')} className="flex-1 bg-tics-amber/35 border border-tics-amber/20 rounded-full px-5 py-6">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-[14px] text-tics-text">Login</SafeText>
            </Pressable>
            <Pressable onPress={() => router.push('/auth/register')} className="flex-1 rounded-full border border-tics-amber/50 bg-white/[0.06] px-5 py-6">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-[13px] text-tics-text">Register</SafeText>
            </Pressable>
          </View>
        </Card>
      </View>
    );
  }

  /* ── Signed in ── */
  return (
    <View className="flex-1 p-1">
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full">
        <Pressable onPress={() => router.back()} style={{ width: 46, height: 46 }} className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="chevron-back" size={22} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">Travel Dashboard</SafeText>
      </View>

      <ScrollView className="mt-2 px-1" contentContainerStyle={{ paddingBottom: 24, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* ── Profile Header Card ── */}
        <Pressable onPress={() => router.push('/account/edit')} className="active:opacity-90">
          <Card accent="purple" className="px-5 py-5">
            <View className="items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-white/[0.07] mb-3 overflow-hidden border-2 border-tics-amber/30">
                {profilePhotoURL ? (
                  <Image source={{ uri: profilePhotoURL }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Ionicons name="person" size={28} color="rgba(248,250,252,0.90)" />
                )}
              </View>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[22px]">{displayName}</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-0.5 text-tics-muted text-[11px]">{user?.email ?? '—'}</SafeText>
              <View className="mt-3"><LevelBadge level={explorerInfo.level} title={levelTitle} /></View>
              <XPProgressBar info={explorerInfo} />
              <View className="mt-3 rounded-full bg-tics-blue/20 px-3 py-1">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[10px]">Tap to edit profile</SafeText>
              </View>
            </View>
          </Card>
        </Pressable>

        {/* ── Travel Statistics ── */}
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[14px] ml-1">Travel Statistics</SafeText>

        <View className="flex-row gap-2.5">
          <View className="flex-1 items-center bg-tics-amber/25 border border-tics-amber/10 rounded-3xl py-4 px-2">
            <Ionicons name="airplane" size={20} color="#3B82F6" style={{ marginBottom: 4 }} />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[28px]">{travelStats.upcomingTrips}</SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px] mt-1 text-center">Upcoming Trips</SafeText>
          </View>
          <View className="flex-1 items-center bg-tics-amber/25 border border-tics-amber/10 rounded-3xl py-4 px-2">
            <Ionicons name="checkmark-circle" size={20} color="#22C55E" style={{ marginBottom: 4 }} />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[28px]">{travelStats.completedTrips}</SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px] mt-1 text-center">Completed Trips</SafeText>
          </View>
          <View className="flex-1 items-center bg-tics-amber/25 border border-tics-amber/10 rounded-3xl py-4 px-2">
            <Ionicons name="globe" size={20} color="#8B5CF6" style={{ marginBottom: 4 }} />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[28px]">{travelStats.countriesVisited}</SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px] mt-1 text-center">Countries Visited</SafeText>
          </View>
          <Pressable className="flex-1 active:opacity-70" onPress={() => router.push('/saved' as any)}>
            <View className="items-center bg-tics-amber/25 border border-tics-amber/10 rounded-3xl py-4 px-2">
              <Ionicons name="bookmark" size={20} color="#F59E0B" style={{ marginBottom: 4 }} />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[28px]">{savedPlacesCount}</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px] mt-1 text-center">Saved Places</SafeText>
            </View>
          </Pressable>
        </View>

        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber text-[14px] ml-1">Settings</SafeText>
        <View className="bg-tics-amber/25 border border-tics-amber/10 py-3 px-5 rounded-4xl">
          {menuItems.map((item, i) => (
            <MenuRow key={item.href} item={item} isLast={i === menuItems.length - 1} />
          ))}
        </View>

        {/* ── Logout ── */}
        <Pressable disabled={loading} onPress={logout} className="flex-row justify-center items-center gap-2 bg-tics-red/30 border border-tics-red/10 p-6 rounded-full" style={{ opacity: loading ? 0.6 : 1 }}>
          <Ionicons name="log-out" size={18} color="#EF4444" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-tics-red">
            {loading ? 'Signing out…' : 'Log out'}
          </SafeText>
        </Pressable>
      </ScrollView>
    </View>
  );
}