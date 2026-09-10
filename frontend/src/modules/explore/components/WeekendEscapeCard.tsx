/**
 * WeekendEscapeCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Card component for displaying weekend escape destinations.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WeekendEscape } from '@/src/modules/explore/types';
import {
  formatRating,
  toImageSource,
  resolveDestinationImage,
} from '@/src/modules/explore/utils';
import { SafeText } from '@/src/components/responsive/SafeText';

interface WeekendEscapeCardProps {
  escape: WeekendEscape;
  onPress: (escape: WeekendEscape) => void;
  onCoordinatePress?: (escape: WeekendEscape) => void;
}

export function WeekendEscapeCard({ escape, onPress, onCoordinatePress }: WeekendEscapeCardProps) {
  const [failed, setFailed] = useState(false);
  const candidate = failed
    ? null
    : (escape.destination.images?.[0]?.url
      || resolveDestinationImage(escape.destination as unknown as Record<string, unknown>)
      || null);
  const source = toImageSource(candidate);

  return (
    <TouchableOpacity
      className="w-[160] h-[200] rounded-[17px] overflow-hidden mr-2.5"
      onPress={() => onPress(escape)}
      activeOpacity={0.8}
    >
      <Image
        source={source}
        className="w-full h-full"
        onError={() => {
          console.log(`[IMAGE RENDER]\ndestination: ${escape.destination.name}\nsourceType: remote-{uri}\nonError: fired\nfallbackAttempt: local-asset`);
          setFailed(true);
        }}
      />
      <View className="absolute bottom-1 left-1 right-1 p-2.5 bg-tics-amber/40 border border-tics-amber/60 rounded-2xl">
        <SafeText className="text-tics-text text-sm font-sharetech" numberOfLines={1}>
          {escape.destination.name}
        </SafeText>
        <SafeText className="text-tics-text text-[11px] font-sharetech mt-0.5" numberOfLines={1}>
          {escape.destination.country}
        </SafeText>
        <View className="flex-row items-center gap-2 mt-1">
          <View className="flex-row items-center gap-0.5">
            <Ionicons name="location-outline" size={12} color="#FFF" />
            <SafeText className="text-tics-text text-[10px] font-sharetech">
              {escape.distance.toFixed(1)} km
            </SafeText>
          </View>
          <View className="flex-row items-center gap-0.5">
            <Ionicons name="time-outline" size={12} color="#FFF" />
            <SafeText className="text-tics-text text-[10px] font-sharetech">
              {escape.travelTime}
            </SafeText>
          </View>
        </View>
      </View>
      {escape.destination.rating > 0 && (
        <View className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-1">
          <SafeText className="text-yellow-400 text-[10px] font-sharetech">
            ⭐ {formatRating(escape.destination.rating)}
          </SafeText>
        </View>
      )}
    </TouchableOpacity>
  );
}