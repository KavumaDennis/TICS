/**
 * NearMeCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Card component for displaying a nearby place in the Near Me experience.
 * Features large image, place name, category, distance, travel time,
 * Google Rating, open/closed status, and action buttons.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NearbyPlace } from '@/src/modules/explore/types/nearme';
import { toImageSource } from '@/src/modules/explore/utils';
import { SafeText } from '@/src/components/responsive/SafeText';

/**
 * Hero image with the shared RN source contract:
 *   remote URL → {uri}; missing/failed → deterministic LOCAL bundled asset.
 * onError swaps to the local asset once (no retry loops).
 */
function NearMeCardImage({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      source={toImageSource(failed ? null : imageUrl)}
      className="w-full h-full rounded-[28px]"
      onError={() => {
        console.log(`[IMAGE RENDER]\ndestination: ${name}\nsourceType: remote-{uri}\nonError: fired\nfallbackAttempt: local-asset`);
        setFailed(true);
      }}
    />
  );
}

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface NearMeCardProps {
  place: NearbyPlace;
  onPress: (place: NearbyPlace) => void;
  onCoordinateJourney: (place: NearbyPlace) => void;
  onSave: (place: NearbyPlace) => void;
  onShare: (place: NearbyPlace) => void;
  isSaved?: boolean;
}

/* ── Category Icon Map ──────────────────────────────────────────────────────── */

const CATEGORY_ICONS: Record<string, string> = {
  all: 'apps-outline',
  attractions: 'compass-outline',
  museums: 'color-palette-outline',
  parks: 'leaf-outline',
  wildlife: 'paw-outline',
  historical_sites: 'business-outline',
  beaches: 'water-outline',
  restaurants: 'restaurant-outline',
  cafes: 'cafe-outline',
  shopping: 'cart-outline',
  hotels: 'bed-outline',
  religious_sites: 'business-outline',
  entertainment: 'film-outline',
};

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  attractions: 'Attraction',
  museums: 'Museum',
  parks: 'Park',
  wildlife: 'Wildlife',
  historical_sites: 'History',
  beaches: 'Beach',
  restaurants: 'Restaurant',
  cafes: 'Cafe',
  shopping: 'Shopping',
  hotels: 'Hotel',
  religious_sites: 'Religious',
  entertainment: 'Entertainment',
};

/* ── Component ──────────────────────────────────────────────────────────────── */

function NearMeCardComponent({
  place,
  onPress,
  onCoordinateJourney,
  onSave,
  onShare,
  isSaved = false,
}: NearMeCardProps) {
  const iconName = CATEGORY_ICONS[place.category] || 'location-outline';
  const label = CATEGORY_LABELS[place.category] || place.category;
  const distanceText = place.distance < 1
    ? `${Math.round(place.distance * 1000)}m`
    : `${place.distance.toFixed(1)}km`;

  const handlePress = useCallback(() => onPress(place), [onPress, place]);
  const handleCoordinate = useCallback(() => onCoordinateJourney(place), [onCoordinateJourney, place]);
  const handleSave = useCallback(() => onSave(place), [onSave, place]);
  const handleShare = useCallback(() => onShare(place), [onShare, place]);

  return (
    <TouchableOpacity
      className="mx-1 p-2 mb-4 rounded-4xl overflow-hidden bg-tics-amber/25 border border-tics-amber/10 "
      onPress={handlePress}
      activeOpacity={0.9}
    >
      {/* Hero Image — shared contract: remote → {uri}, missing/failed →
          deterministic LOCAL bundled asset (never a blank tile). */}
      <View className="relative h-44">
        <NearMeCardImage imageUrl={place.imageUrl} name={place.name} />
        {/* Gradient overlay */}
        <View className="absolute inset-0 bg-black/30 rounded-[28px]" />

        {/* Top badges */}
        <View className="absolute top-3 left-3 flex-row gap-2">
          {place.isOpen && (
            <View className="bg-green-500/80 rounded-full px-2.5 py-1">
              <SafeText className="text-white text-[11px] font-sharetech">Open</SafeText>
            </View>
          )}
          {!place.isOpen && place.openingHours && (
            <View className="bg-red-500/80 rounded-full px-2.5 py-1">
              <SafeText className="text-white text-[11px] font-sharetech">Closed</SafeText>
            </View>
          )}
          {place.isFree && (
            <View className="bg-[#3B82F6]/80 rounded-full px-2.5 py-1">
              <SafeText className="text-white text-[11px] font-sharetech">Free</SafeText>
            </View>
          )}
        </View>

        {/* Rating badge */}
        <View className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-1 flex-row items-center">
          <Ionicons name="star" size={12} color="#FDCB6E" />
          <SafeText className="text-yellow-400 text-[12px] font-sharetech ml-1">
            {place.rating > 0 ? place.rating.toFixed(1) : 'New'}
          </SafeText>
        </View>

        {/* Bottom info overlay */}
        <View className="absolute bottom-2 left-3 rounded-full bg-tics-amber/40 px-3 border border-tics-amber/20 self-start">
          <SafeText className="text-white text-lg font-sharetech" numberOfLines={1}>
            {place.name}
          </SafeText>
        </View>
      </View>

      {/* Info section */}
      <View className="pt-2">
        {/* Category, distance, travel time */}
        <View className="flex-row items-center justify-between px-1">
          <View className="flex-row items-center gap-1.5">
            <View className="bg-[#3B82F6]/20 rounded-full p-1.5">
              <Ionicons name={iconName as any} size={14} color="#3B82F6" />
            </View>
            <SafeText className="text-[#3B82F6] text-[12px] font-sharetech capitalize">{label}</SafeText>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-1">
              <Ionicons name="location-outline" size={12} color="#888" />
              <SafeText className="text-gray-400 text-[11px] font-sharetech">{distanceText}</SafeText>
            </View>
            <View className="flex-row items-center gap-1">
              <Ionicons name="car-outline" size={12} color="#888" />
              <SafeText className="text-gray-400 text-[11px] font-sharetech">{place.travelTime.driving}min</SafeText>
            </View>
          </View>
        </View>

        {/* Address */}
        <SafeText className="text-gray-500 text-[12px] font-sharetech mt-1.5 px-1" numberOfLines={1}>
          {place.vicinity || place.address}
        </SafeText>

        {/* Review count */}
        {place.reviewCount > 0 && (
          <SafeText className="text-gray-500 text-[11px] font-sharetech mt-0.5 px-1">
            Based on {place.reviewCount} reviews
          </SafeText>
        )}

        {/* Price level */}
        {place.priceLevel > 0 && (
          <SafeText className="text-gray-400 text-[12px] font-sharetech mt-0.5 px-1">
            Price: {place.priceRange}
          </SafeText>
        )}

        {/* Action buttons */}
        <View className="flex-row items-center gap-2 mt-3">
          <TouchableOpacity
            className="flex-1 bg-tics-amber/35  border border-tics-amber/20 rounded-full py-6 items-center flex-row justify-center gap-1.5"
            onPress={handleCoordinate}
          >
            <Ionicons name="navigate-outline" size={16} color="#FFF" />
            <SafeText className="text-white text-[13px] font-sharetech">Coordinate Journey</SafeText>
          </TouchableOpacity>

          <TouchableOpacity
            className="p-6 rounded-full bg-white/[0.08] items-center justify-center"
            onPress={handleSave}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? '#F59E0B' : '#F8FAFC'} />
          </TouchableOpacity>

          <TouchableOpacity
            className="p-6 rounded-full bg-white/[0.08] items-center justify-center"
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={18} color="#F8FAFC" />
          </TouchableOpacity>
        </View>

        {/* Events attached to this place */}
        {place.events && place.events.length > 0 && (
          <View className="mt-2 pt-2 border-t border-white/[0.06]">
            {place.events.slice(0, 2).map(event => (
              <View key={event.id} className="flex-row items-center gap-1.5 mt-1">
                <View className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
                <SafeText className="text-gray-400 text-[11px]" numberOfLines={1}>
                  {event.title}
                </SafeText>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export const NearMeCard = memo(NearMeCardComponent);