/**
 * TrendingBadge.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Badge component for displaying trending/popular status.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { View, Text } from 'react-native';
import { SafeText } from '@/src/components/responsive/SafeText';

interface TrendingBadgeProps {
  type?: 'trending' | 'event' | 'popular' | 'featured';
  size?: 'small' | 'medium';
}

export function TrendingBadge({ type = 'trending', size = 'small' }: TrendingBadgeProps) {
  const getBadgeConfig = () => {
    switch (type) {
      case 'trending':
        return {
          bgColor: 'bg-orange-500',
          textColor: 'text-white',
          icon: '🔥',
          label: 'Trending',
        };
      case 'event':
        return {
          bgColor: 'bg-[#3B82F6]',
          textColor: 'text-white',
          icon: '📅',
          label: 'Event',
        };
      case 'popular':
        return {
          bgColor: 'bg-green-500',
          textColor: 'text-white',
          icon: '⭐',
          label: 'Popular',
        };
      case 'featured':
        return {
          bgColor: 'bg-purple-500',
          textColor: 'text-white',
          icon: '✨',
          label: 'Featured',
        };
      default:
        return {
          bgColor: 'bg-orange-500',
          textColor: 'text-white',
          icon: '🔥',
          label: 'Trending',
        };
    }
  };

  const config = getBadgeConfig();
  const isSmall = size === 'small';

  return (
    <View className={`${config.bgColor} rounded-md ${isSmall ? 'px-1.5 py-0.5' : 'px-2 py-1'} flex-row items-center gap-1`}>
      <SafeText className={`${config.textColor} ${isSmall ? 'text-[10px]' : 'text-xs'} font-sharetech`}>
        {config.icon} {config.label}
      </SafeText>
    </View>
  );
}