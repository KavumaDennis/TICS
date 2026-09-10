/**
 * SavedPlacesScreen — shows all saved destinations/places for the user.
 * Reads from the savedPlaces Firestore collection (where explore saves to).
 * Uses stored imageUrl when available, falls back to Pexels images.
 */
import { useMemo, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { useAuthStore } from '@/src/store/useAuthStore';
import { SafeText } from '@/src/components/responsive/SafeText';
import { fetchCountryImages } from '@/src/services/PexelsService';
import { DestinationCache } from '@/src/modules/explore/services/discovery/DestinationCache';
import type { Destination } from '@/src/modules/explore/types';

type SavedPlace = {
  id: string;
  destinationId: string;
  name: string;
  country?: string;
  countryCode?: string;
  imageUrl?: string;
  description?: string;
  city?: string;
  rating?: number;
  coordinates?: { lat: number; lng: number };
  savedAt?: Date;
};

// Fallback images by country code — always works even if Pexels API fails
const FALLBACK_IMAGES: Record<string, string> = {
  UG: 'https://images.pexels.com/photos/3935702/pexels-photo-3935702.jpeg?auto=compress&cs=tinysrgb&w=600',
  KE: 'https://images.pexels.com/photos/3935702/pexels-photo-3935702.jpeg?auto=compress&cs=tinysrgb&w=600',
  TZ: 'https://images.pexels.com/photos/1287460/pexels-photo-1287460.jpeg?auto=compress&cs=tinysrgb&w=600',
  FR: 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600',
  JP: 'https://images.pexels.com/photos/2614818/pexels-photo-2614818.jpeg?auto=compress&cs=tinysrgb&w=600',
  US: 'https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600',
  AE: 'https://images.pexels.com/photos/1470502/pexels-photo-1470502.jpeg?auto=compress&cs=tinysrgb&w=600',
  ID: 'https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=600',
  GB: 'https://images.pexels.com/photos/460672/pexels-photo-460672.jpeg?auto=compress&cs=tinysrgb&w=600',
  ZA: 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600',
  IT: 'https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg?auto=compress&cs=tinysrgb&w=600',
  AU: 'https://images.pexels.com/photos/1878293/pexels-photo-1878293.jpeg?auto=compress&cs=tinysrgb&w=600',
  GR: 'https://images.pexels.com/photos/1010657/pexels-photo-1010657.jpeg?auto=compress&cs=tinysrgb&w=600',
  MV: 'https://images.pexels.com/photos/1287460/pexels-photo-1287460.jpeg?auto=compress&cs=tinysrgb&w=600',
};

const DEFAULT_IMAGE = 'https://images.pexels.com/photos/1620040/pexels-photo-1620040.jpeg?auto=compress&cs=tinysrgb&w=600';

function getImageForPlace(place: SavedPlace): string {
  if (place.imageUrl) return place.imageUrl;
  if (place.countryCode && FALLBACK_IMAGES[place.countryCode.toUpperCase()]) {
    return FALLBACK_IMAGES[place.countryCode.toUpperCase()];
  }
  return DEFAULT_IMAGE;
}

export default function SavedPlacesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.token);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [pexelsImages, setPexelsImages] = useState<Record<string, string[]>>({});

  // Load saved places from Firestore savedPlaces collection
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const db = getFirebaseFirestore();
        // Use a simple `where` query (no compound index required).
        // Sort client-side to avoid needing a composite index on
        // `savedPlaces(userId + savedAt)`.
        const q = query(
          collection(db, 'savedPlaces'),
          where('userId', '==', uid)
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        const places: SavedPlace[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              destinationId: data.destinationId || '',
              name: data.name || data.destinationName || data.destinationId || 'Unknown Place',
              country: data.country || '',
              countryCode: data.countryCode || '',
              imageUrl: data.imageUrl || '',
              description: data.description || '',
              city: data.city || '',
              rating: data.rating || 0,
              coordinates: data.coordinates || { lat: 0, lng: 0 },
              savedAt: data.savedAt?.toDate?.() || new Date(),
            };
          })
          .sort((a, b) => (b.savedAt?.getTime() || 0) - (a.savedAt?.getTime() || 0))
          // Deduplicate by destinationId — keep the most recent save.
          .filter((place, index, arr) =>
            arr.findIndex((p) => p.destinationId === place.destinationId) === index
          );
        setSavedPlaces(places);
      } catch (err) {
        console.warn('[SavedPlaces] Error loading:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  // Load Pexels images on mount (only for places without a stored image)
  useEffect(() => {
    if (savedPlaces.length === 0) return;
    let cancelled = false;

    (async () => {
      const results: Record<string, string[]> = {};
      for (const place of savedPlaces) {
        if (cancelled) break;
        if (place.imageUrl) continue; // Skip if we already have a stored image
        if (place.country && place.countryCode) {
          try {
            const imgs = await fetchCountryImages(place.country, place.countryCode);
            if (imgs.length > 0) results[place.id] = imgs;
          } catch { /* fallback used */ }
        }
      }
      if (!cancelled) setPexelsImages(results);
    })();

    return () => { cancelled = true; };
  }, [savedPlaces]);

  return (
    <View className="flex-1 p-1">
      {/* Header */}
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <Pressable onPress={() => router.back()} style={{ width: 46, height: 46 }} className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="flex-1">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">Saved Places</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px]">
            {savedPlaces.length} place{savedPlaces.length !== 1 ? 's' : ''} saved
          </SafeText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ gap: 12, paddingHorizontal: 4, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {savedPlaces.map((place) => {
          const pexels = pexelsImages[place.id] || [];
          const displayImage = place.imageUrl || pexels[0] || getImageForPlace(place);

          return (
            <Pressable
              key={place.id}
              className="rounded-3xl p-1 overflow-hidden border border-tics-amber/20"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              onPress={() => {
                if (place.destinationId) {
                  // API-derived places are not in the destinations collection.
                  // Rehydrate their saved metadata into the in-memory cache so
                  // DestinationDetailScreen can render them after navigation.
                  DestinationCache.set({
                    id: place.destinationId,
                    name: place.name,
                    slug: place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    description: place.description || '',
                    country: place.country || '',
                    countryCode: place.countryCode || '',
                    city: place.city || '',
                    coordinates: place.coordinates || { lat: 0, lng: 0 },
                    images: displayImage ? [{ url: displayImage, caption: '', credit: '' }] : [],
                    categories: [],
                    travelTips: [],
                    nearbyAirport: null,
                    nearbyHotels: [],
                    nearbyAttractions: [],
                    weatherSummary: null,
                    bestSeason: '',
                    bestTimeToVisit: '',
                    popularity: 0,
                    rating: place.rating || 0,
                    reviewCount: 0,
                    reviews: [],
                    travelRequirements: [],
                    emergencyContacts: [],
                    currency: '',
                    language: '',
                    timezone: '',
                    timezoneOffset: '',
                    estimatedBudget: null,
                    topAttractions: [],
                    relatedDestinationIds: [],
                    featured: false,
                    trending: false,
                    active: true,
                    createdAt: place.savedAt || new Date(),
                    updatedAt: place.savedAt || new Date(),
                  } as Destination);
                  router.push(`/explore/destination/${place.destinationId}`);
                }
              }}
            >
              <View style={{ height: 160, position: 'relative' }}>
                <Image
                  source={{ uri: displayImage }}
                  className='rounded-[17px]'
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                <View className='rounded-[17px]' style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
                <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 16 }}>
                    {place.name}
                  </SafeText>
                  {place.country && (
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
                      {place.country}
                    </SafeText>
                  )}
                </View>
              </View>
              <View className="p-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="bookmark" size={16} color="#F59E0B" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
                    Saved {place.savedAt?.toLocaleDateString?.() || ''}
                  </SafeText>
                </View>
                <View className="flex-row gap-1">
                  {pexels.slice(1, 3).map((url, i) => (
                    <Image
                      key={i}
                      source={{ uri: url }}
                      style={{ width: 40, height: 40, borderRadius: 6 }}
                      contentFit="cover"
                    />
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}

        {!loading && !savedPlaces.length && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Ionicons name="bookmark-outline" size={48} color="rgba(248,250,252,0.1)" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 16, marginTop: 16 }}>
              No saved places yet
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 }}>
              Explore destinations and save your favorites to see them here.
            </SafeText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}