/**
 * LoadingSkeleton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Loading skeleton components for explore screens.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { View, Text } from 'react-native';

export function ExploreScreenSkeleton() {
  return (
    <View className="flex-1 bg-[#0a0b1e] p-4">
      {/* Search skeleton */}
      <View className="bg-gray-800/50 rounded-2xl h-14 mb-6" />
      
      {/* Categories skeleton */}
      <View className="mb-6">
        <View className="bg-gray-800/50 rounded-lg h-6 w-32 mb-3" />
        <View className="flex-row gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} className="items-center">
              <View className="w-14 h-14 rounded-2xl bg-gray-800/50 mb-2" />
              <View className="bg-gray-800/50 rounded h-3 w-12" />
            </View>
          ))}
        </View>
      </View>

      {/* Destinations skeleton */}
      <View className="mb-6">
        <View className="bg-gray-800/50 rounded-lg h-6 w-40 mb-3" />
        {[1, 2, 3].map((i) => (
          <View key={i} className="bg-gray-800/50 rounded-2xl h-48 mb-3" />
        ))}
      </View>
    </View>
  );
}

export function FeedCardSkeleton() {
  return (
    <View className="flex-1 bg-white p-4">
      {[1, 2, 3].map((i) => (
        <View key={i} className="bg-gray-100 rounded-2xl h-80 mb-4" />
      ))}
    </View>
  );
}