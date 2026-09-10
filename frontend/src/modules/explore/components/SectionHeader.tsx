import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeText } from '@/src/components/responsive/SafeText';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  onViewAll?: () => void;
}

export function SectionHeader({ title, subtitle, onViewAll }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-2 py-2">
      <View className="flex-1">
        <SafeText className="text-tics-text text-lg font-sharetech">{title}</SafeText>
        {subtitle && (
          <SafeText className="text-tics-muted text-sm font-sharetech mt-0.5">{subtitle}</SafeText>
        )}
      </View>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll} className="py-1 px-2">
          <SafeText className="text-[#3B82F6] text-sm font-sharetech">View All</SafeText>
        </TouchableOpacity>
      )}
    </View>
  );
}