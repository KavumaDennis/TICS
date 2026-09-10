/**
 * DestinationCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable destination card with image, rating, name, location, and CTA.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import type { Destination } from '@/src/modules/explore/types';
import {
  formatRating,
  getDestinationPrimaryImage,
  toImageSource,
} from '@/src/modules/explore/utils';
import { Ionicons } from '@expo/vector-icons';
import { SafeText } from '@/src/components/responsive/SafeText';

/**
 * Non-blocking destination image.
 * - Renders the card immediately; image loads independently.
 * - On load error, swaps to the deterministic LOCAL bundled fallback ONCE
 *   (no infinite retry loops during React re-renders).
 * - A failed image never removes or hides the destination card.
 */
function CardImage({ destination, className }: { destination: Destination; className?: string }) {
  const initialUrl = getDestinationPrimaryImage(destination);
  const [uri, setUri] = useState<string | null>(initialUrl);
  const [failed, setFailed] = useState(false);

  // ── [IMAGE RENDER] proves what <Image> actually receives ───────────────────
  const source = toImageSource(failed ? null : uri);
  const sourceType = typeof source === 'number' ? 'local-asset(require())' : 'remote-{uri}';
  // ────────────────────────────────────────────────────────────────────────────

  // Reset when the destination (or its resolved image) changes.
  useEffect(() => {
    setUri(initialUrl);
    setFailed(false);
  }, [initialUrl]);

  const handleError = (e: unknown) => {
    // ── [IMAGE RENDER] onError ────────────────────────────────────────────────
    console.log(
      `[IMAGE RENDER]\ndestination: ${destination.name}\nsource: ${typeof uri === 'string' ? uri : '(none)'}\nsourceType: remote-{uri}\nonError: fired\nfallbackAttempt: local-asset`
    );
    // ──────────────────────────────────────────────────────────────────────────
    if (failed) return; // already on local fallback — never retry-loop
    console.log(
      `[DestinationImage] load failed\ndestinationId: ${destination.id}\nurl: ${uri}\nfallbackUsed: true (local bundled asset)`
    );
    setFailed(true);
    setUri(null); // null → toImageSource returns the local asset
  };

  const handleLoad = () => {
    console.log(
      `[IMAGE RENDER]\ndestination: ${destination.name}\nsource: ${typeof uri === 'string' ? uri : '(bundled asset)'}\nsourceType: ${sourceType}\nonLoad: fired\nfallbackAttempt: ${failed ? 'local-asset (succeeded)' : 'none'}`
    );
  };

  return (
    <Image
      source={source}
      className={className}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}

interface DestinationCardProps {
  destination: Destination;
  onPress: (destination: Destination) => void;
  onCoordinatePress?: (destination: Destination) => void;
  onSavePress?: (destination: Destination) => void;
  isSaved?: boolean;
  compact?: boolean;
}

export function DestinationCard({
  destination,
  onPress,
  onCoordinatePress,
  onSavePress,
  isSaved = false,
  compact = false,
}: DestinationCardProps) {
  if (compact) {
    return (
      <TouchableOpacity
        className="w-[140] h-[180] rounded-[17px] overflow-hidden mr-2.5"
        onPress={() => onPress(destination)}
        activeOpacity={0.8}
      >
        <CardImage destination={destination} className="w-full h-full" />
        {onSavePress && (
          <TouchableOpacity
            className="absolute top-8 right-1.5 w-8 h-8 rounded-full bg-tics-amber/55 border border-tics-amber/60 items-center justify-center"
            onPress={() => onSavePress(destination)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color={isSaved ? '#F59E0B' : '#FFF'} />
          </TouchableOpacity>
        )}
        <View className="absolute bottom-1 left-1 right-1 p-2.5 bg-tics-amber/40 border border-tics-amber/60 rounded-2xl">
          <SafeText className="text-tics-text text-sm font-sharetech" numberOfLines={1}>
            {destination.name}
          </SafeText>
          <SafeText className="text-tics-text text-[11px] font-sharetech mt-0.5" numberOfLines={1}>
            {destination.name}, {destination.country}
          </SafeText>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      className="mx-1 p-2 mb-4 rounded-4xl overflow-hidden bg-tics-amber/25 border border-tics-amber/10"
      onPress={() => onPress(destination)}
      activeOpacity={0.9}
    >
      <CardImage destination={destination} className="w-full h-[180] rounded-[28px]" />
      <View className="absolute top-5 right-5 bg-black/60 rounded-full px-2 py-1">
        <SafeText className="text-yellow-400 text-xs font-sharetech">
          ⭐ {formatRating(destination.rating)}
        </SafeText>
      </View>
      {onSavePress && (
        <TouchableOpacity
          className="absolute top-5 left-5 w-10 h-10 rounded-full bg-black/70 items-center justify-center"
          onPress={() => onSavePress(destination)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={isSaved ? '#F59E0B' : '#FFF'} />
        </TouchableOpacity>
      )}
      <View className="">
        {/* <SafeText className="text-tics-text text-lg font-sharetech mt-1 px-1" numberOfLines={1}>
          {destination.name}
        </SafeText> */}
        <View className="mt-1 px-1 flex-row items-center">
         <Ionicons name="location-outline" size={15} color="#FFF" />
         <SafeText className='ml-1 text-tics-text text-lg font-sharetech mt-1 px-1'>
          {destination.name}, {destination.country}
         </SafeText>
        </View>
        <SafeText className="text-tics-muted px-1 text-[13px] font-sharetech mt-2 leading-[18px]" numberOfLines={2}>
          {destination.description}
        </SafeText>
        {onCoordinatePress && (
          <TouchableOpacity
            className="bg-tics-amber/35 border border-tics-amber/20 py-6 rounded-full items-center mt-3"
            onPress={() => onCoordinatePress(destination)}
          >
            <SafeText className="text-white font-sharetech">Coordinate My Journey</SafeText>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}