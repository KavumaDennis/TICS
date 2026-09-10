/**
 * AIDiscoveryButton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating AI discovery button component.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AIDiscoveryButtonProps {
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function AIDiscoveryButton({ onPress, size = 'medium' }: AIDiscoveryButtonProps) {
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'w-12 h-12';
      case 'large':
        return 'w-20 h-20';
      case 'medium':
      default:
        return 'w-16 h-16';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 20;
      case 'large':
        return 32;
      case 'medium':
      default:
        return 24;
    }
  };

  return (
    <TouchableOpacity
      className={`${getSizeClasses()} rounded-full bg-tics-amber border border-tics-text/20 items-center justify-center shadow-lg`}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name="sparkles" size={getIconSize()} color="#fff" />
    </TouchableOpacity>
  );
}