/**
 * ExploreHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable header component for the Explore module with search trigger,
 * location display, and notification bell.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeText } from '@/src/components/responsive/SafeText';

interface ExploreHeaderProps {
  onSearchPress: () => void;
  onNotificationPress?: () => void;
  locationName?: string;
  searchQuery?: string;
}

export function ExploreHeader({
  onSearchPress,
  onNotificationPress,
  locationName,
  searchQuery,
}: ExploreHeaderProps) {
  return (
    <View className="bg-white px-4 pt-14 pb-3">
      {/* Location */}
      <View className="flex-row items-center mb-3">
        <SafeText className="text-2xl font-bold text-[#1A1A2E]">Explore</SafeText>
        {locationName && (
          <SafeText className="text-sm text-gray-500 ml-2">{locationName}</SafeText>
        )}
      </View>

      {/* Search Bar */}
      <TouchableOpacity 
        className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3" 
        onPress={onSearchPress} 
        activeOpacity={0.8}
      >
        <SafeText className="text-base mr-2">🔍</SafeText>
        <SafeText className="text-base text-gray-400 flex-1">
          {searchQuery || 'Where do you want to go?'}
        </SafeText>
      </TouchableOpacity>
    </View>
  );
}
