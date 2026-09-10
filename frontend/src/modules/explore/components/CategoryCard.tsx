import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExploreCategory } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';

interface CategoryCardProps {
  category: ExploreCategory;
  onPress: (category: ExploreCategory) => void;
}

/* ── Map category slugs to distinct icons ───────────────────────────────────── */

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  beach: 'water-outline',
  mountain: 'triangle-outline',
  city: 'business-outline',
  cultural: 'globe-outline',
  adventure: 'compass-outline',
  wildlife: 'paw-outline',
  food: 'restaurant-outline',
  shopping: 'cart-outline',
  nightlife: 'moon-outline',
  wellness: 'fitness-outline',
  education: 'school-outline',
  sports: 'football-outline',
  nature: 'leaf-outline',
  history: 'time-outline',
  art: 'color-palette-outline',
  music: 'musical-notes-outline',
  festival: 'sparkles-outline',
  romance: 'heart-outline',
  family: 'people-outline',
  luxury: 'diamond-outline',
  budget: 'cash-outline',
  solo: 'person-outline',
  group: 'people-outline',
  default: 'location-outline',
};

function getIconForCategory(category: ExploreCategory): keyof typeof Ionicons.glyphMap {
  if (category.icon && category.icon !== 'compass' && category.icon !== 'default') {
    const mapped = CATEGORY_ICONS[category.icon] || CATEGORY_ICONS[category.slug];
    if (mapped) return mapped;
  }
  return CATEGORY_ICONS[category.slug] || CATEGORY_ICONS.default;
}

export function CategoryCard({ category, onPress }: CategoryCardProps) {
  const iconName = getIconForCategory(category);
  const bgColor = category.color || '#3B82F6';

  return (
    <TouchableOpacity
      className="items-center mr-3 w-[72]"
      onPress={() => onPress(category)}
      activeOpacity={0.7}
    >
      <View
        className="w-[56] h-[56] rounded-2xl items-center justify-center mb-1.5"
        style={{ backgroundColor: bgColor + '30' }}
      >
        <Ionicons name={iconName} size={24} color={bgColor} />
      </View>
      <SafeText className="text-[#F8FAFC] text-[11px] font-sharetech text-center" numberOfLines={2}>
        {category.name}
      </SafeText>
    </TouchableOpacity>
  );
}