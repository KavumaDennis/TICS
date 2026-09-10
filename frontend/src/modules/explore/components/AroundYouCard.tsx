/**
 * AroundYouCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Card component for displaying nearby places with distance and rating.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NearbyItem } from '@/src/modules/explore/types';
import {
  formatRating,
  formatDistance,
  toImageSource,
  resolveDestinationImage,
} from '@/src/modules/explore/utils';
import { SafeText } from '@/src/components/responsive/SafeText';

interface AroundYouCardProps {
  place: NearbyItem;
  onPress: (item: NearbyItem) => void;
  onCoordinatePress?: (item: NearbyItem) => void;
}

export function AroundYouCard({ place, onPress, onCoordinatePress }: AroundYouCardProps) {
  const [failed, setFailed] = useState(false);
  // resolveDestinationImage also honours Destination-shaped image fields;
  // toImageSource guarantees a deterministic LOCAL bundled asset when the
  // URL is missing/invalid, and onError swaps to the local asset ONCE.
  const candidate = failed ? null : (place.imageUrl || resolveDestinationImage(place as any) || null);
  const source = toImageSource(candidate);

  return (
    <TouchableOpacity
      className="w-[150] h-[190] rounded-[17px] overflow-hidden mr-2.5"
      onPress={() => onPress(place)}
      activeOpacity={0.8}
    >
      <Image
        source={source}
        className="w-full h-full"
        onError={() => {
          console.log(`[IMAGE RENDER]\ndestination: ${place.name}\nsourceType: remote-{uri}\nonError: fired\nfallbackAttempt: local-asset`);
          setFailed(true);
        }}
      />
      <View className="absolute bottom-1 left-1 right-1 p-2.5 bg-tics-amber/40 border border-tics-amber/60 rounded-2xl">
        <SafeText className="text-tics-text text-sm font-sharetech" numberOfLines={1}>
          {place.name}
        </SafeText>
        <SafeText className="text-tics-text text-[11px] font-sharetech mt-0.5" numberOfLines={1}>
          {place.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </SafeText>
        <View className="flex-row items-center gap-2 mt-1">
          <View className="flex-row items-center gap-0.5">
            <Ionicons name="location-outline" size={12} color="#FFF" />
            <SafeText className="text-tics-text text-[10px] font-sharetech">
              {formatDistance(place.distance)}
            </SafeText>
          </View>
          <View className="flex-row items-center gap-0.5">
            <Ionicons name="star" size={12} color="#FBBF24" />
            <SafeText className="text-tics-text text-[10px] font-sharetech">
              {formatRating(place.rating)}
            </SafeText>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}