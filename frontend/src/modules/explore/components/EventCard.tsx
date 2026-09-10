/**
 * EventCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable event card with banner, location, date, distance, weather, and CTA.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Event } from '@/src/modules/explore/types';
import { formatDateRange, truncateText } from '@/src/modules/explore/utils';
import { SafeText } from '@/src/components/responsive/SafeText';

interface EventCardProps {
  event: Event;
  onPress: (event: Event) => void;
  onCoordinatePress?: (event: Event) => void;
  onSavePress?: (event: Event) => void;
  compact?: boolean;
  showWeather?: boolean;
  showDistance?: boolean;
  distance?: number;
}

export function EventCard({
  event,
  onPress,
  onCoordinatePress,
  onSavePress,
  compact = false,
  showWeather = false,
  showDistance = false,
  distance,
}: EventCardProps) {
  const imageUrl = event.images?.[0]?.url || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400';
  const dateRange = formatDateRange(event.startDate, event.endDate);

  if (compact) {
    return (
      <TouchableOpacity
        className="w-[160] h-[200] rounded-[17px] overflow-hidden mr-2.5"
        onPress={() => onPress(event)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: imageUrl }}
          className="w-full h-full"
          defaultSource={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==' }}
        />
        <View className="absolute bottom-1 left-1 right-1 p-2.5 bg-tics-amber/40 border border-tics-amber/60 rounded-2xl">
          <SafeText className="text-white text-sm font-sharetech" numberOfLines={1}>
            {event.title}
          </SafeText>
          <SafeText className="text-gray-300 text-[11px] font-sharetech mt-0.5" numberOfLines={1}>
            {event.city}, {event.country}
          </SafeText>
          <SafeText className="text-gray-300 text-[10px] font-sharetech mt-0.5">
            {dateRange}
          </SafeText>
        </View>
        {event.trending && (
          <View className="absolute top-2 right-2 bg-orange-500 rounded-md px-1.5 py-0.5">
            <SafeText className="text-white text-[10px] font-sharetech">🔥 Trending</SafeText>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      className="mb-4 rounded-4xl overflow-hidden bg-tics-amber/25 border border-tics-amber/10"
      onPress={() => onPress(event)}
      activeOpacity={0.9}
    >
      <Image
        source={{ uri: imageUrl }}
        className="w-full h-[180]"
        defaultSource={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==' }}
      />
      <View className="absolute top-4 left-4 bg-[#3B82F6] rounded-full px-2 py-1">
        <SafeText className="text-white text-[10px] font-sharetech uppercase">{event.category}</SafeText>
      </View>
      {event.trending && (
        <View className="absolute top-4 right-4 bg-orange-500 rounded-full px-2 py-1">
          <SafeText className="text-white text-[10px] font-sharetech">🔥 Trending</SafeText>
        </View>
      )}
      <View className="p-3.5">
        <SafeText className="text-[#F8FAFC] text-lg font-sharetech" numberOfLines={1}>
          {event.title}
        </SafeText>
        <SafeText className="text-gray-400 font-sharetech text-[13px] mt-1" numberOfLines={1}>
          📍 {event.venue.name}, {event.city}
        </SafeText>
        
        <View className="flex-row items-center gap-3 mt-2">
          <View className="flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
            <SafeText className="text-gray-400 font-sharetech text-[12px]">{dateRange}</SafeText>
          </View>
          {showDistance && distance !== undefined && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="location-outline" size={14} color="#9CA3AF" />
              <SafeText className="text-gray-400 font-sharetech text-[12px]">{distance.toFixed(1)} km</SafeText>
            </View>
          )}
          {showWeather && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="partly-sunny-outline" size={14} color="#9CA3AF" />
              <SafeText className="text-gray-400 font-sharetech text-[12px]">24°C</SafeText>
            </View>
          )}
        </View>

        <SafeText className="text-gray-400 font-sharetech text-[13px] mt-2 leading-[18px]" numberOfLines={2}>
          {truncateText(event.shortDescription || event.description, 100)}
        </SafeText>

        <View className="flex-row items-center gap-2 mt-3">
          {onCoordinatePress && (
            <TouchableOpacity
              className="flex-1  bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 items-center"
              onPress={() => onCoordinatePress(event)}
            >
              <SafeText className="text-white text-[13px] font-sharetech">Coordinate Journey</SafeText>
            </TouchableOpacity>
          )}
          {onSavePress && (
            <TouchableOpacity
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
              onPress={() => onSavePress(event)}
            >
              <Ionicons name="bookmark-outline" size={18} color="#F8FAFC" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}