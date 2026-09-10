/**
 * NearMeFilters.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Filter panel for the Near Me experience.
 * Allows users to filter by distance, rating, open now, free,
 * family friendly, indoor, outdoor, and accessible.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NearbyFilters, NearbySortOption } from '@/src/modules/explore/types/nearme';
import { SafeText } from '@/src/components/responsive/SafeText';

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface NearMeFiltersProps {
  filters: NearbyFilters;
  sortBy: NearbySortOption;
  isVisible: boolean;
  onClose: () => void;
  onApplyFilters: (filters: Partial<NearbyFilters>) => void;
  onApplySort: (sort: NearbySortOption) => void;
  onReset: () => void;
}

/* ── Sort Options ───────────────────────────────────────────────────────────── */

const SORT_OPTIONS: { key: NearbySortOption; label: string; icon: string }[] = [
  { key: 'distance', label: 'Distance', icon: 'location-outline' },
  { key: 'rating', label: 'Highest Rated', icon: 'star-outline' },
  { key: 'popularity', label: 'Most Popular', icon: 'trending-up-outline' },
  { key: 'travel_time', label: 'Travel Time', icon: 'time-outline' },
];

/* ── Toggle Filter Component ────────────────────────────────────────────────── */

interface ToggleFilterProps {
  label: string;
  icon: string;
  value: boolean;
  onToggle: () => void;
}

const ToggleFilter = memo(({ label, icon, value, onToggle }: ToggleFilterProps) => (
  <TouchableOpacity
    className={`flex-row items-center justify-between px-4 py-3 rounded-full mb-2 ${value ? 'bg-tics-amber/35 border border-tics-amber/20' : 'bg-white/[0.05] border border-tics-amber/30'
      }`}
    onPress={onToggle}
    activeOpacity={0.7}
  >
    <View className="flex-row items-center gap-3">
      <Ionicons name={icon as any} size={20} color={value ? '#3B82F6' : '#888'} />
      <SafeText className={`text-[14px] font-sharetech ${value ? 'text-white' : 'text-gray-400'}`}>{label}</SafeText>
    </View>
    <View
      className={`w-6 h-6 rounded-full items-center justify-center ${value ? 'bg-tics-amber/35 border border-tics-amber/20' : 'bg-white/[0.1] border border-tics-amber/30'
        }`}
    >
      {value && <Ionicons name="checkmark" size={16} color="#FFF" />}
    </View>
  </TouchableOpacity>
));

/* ── Slider Filter ──────────────────────────────────────────────────────────── */

interface SliderFilterProps {
  label: string;
  icon: string;
  value: number;
  options: number[];
  unit: string;
  onChange: (value: number) => void;
}

const DISTANCE_OPTIONS = [1, 2, 5, 10, 20, 50];
const RATING_OPTIONS = [0, 3, 3.5, 4, 4.5];

const SliderFilter = memo(({ label, icon, value, options, unit, onChange }: SliderFilterProps) => (
  <View className="mb-3">
    <View className="flex-row items-center justify-between px-1 mb-2">
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon as any} size={18} color="#888" />
        <SafeText className="text-gray-400 font-sharetech text-[14px]">{label}</SafeText>
      </View>
      <SafeText className="text-gray-300 text-[14px] font-sharetech">
        {value === 0 ? 'Any' : `${value}${unit}`}
      </SafeText>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          className={`px-4 py-2 rounded-full ${value === opt ? 'bg-tics-amber/35 border border-tics-amber/20' : 'bg-white/[0.07]'
            }`}
          onPress={() => onChange(opt)}
        >
          <SafeText className={`text-[13px] font-sharetech ${value === opt ? 'text-white' : 'text-gray-400'}`}>
            {opt === 0 ? 'Any' : `${opt}${unit}`}
          </SafeText>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
));

/* ── Component ──────────────────────────────────────────────────────────────── */

function NearMeFiltersComponent({
  filters,
  sortBy,
  isVisible,
  onClose,
  onApplyFilters,
  onApplySort,
  onReset,
}: NearMeFiltersProps) {
  const [localFilters, setLocalFilters] = useState(filters);
  const [localSort, setLocalSort] = useState(sortBy);

  const handleApply = useCallback(() => {
    onApplyFilters(localFilters);
    if (localSort !== sortBy) {
      onApplySort(localSort);
    }
    onClose();
  }, [localFilters, localSort, sortBy, onApplyFilters, onApplySort, onClose]);

  const handleReset = useCallback(() => {
    setLocalFilters({
      maxDistance: 50,
      minRating: 0,
      minPopularity: 0,
      openNow: false,
      free: false,
      familyFriendly: false,
      indoor: false,
      outdoor: false,
      accessible: false,
    });
    setLocalSort('distance');
    onReset();
    onClose();
  }, [onReset, onClose]);

  const toggleFilter = useCallback((key: keyof NearbyFilters) => {
    setLocalFilters(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-[#0a0b1e] p-1">
        {/* Header */}
        <View className="flex-row items-center justify-between bg-tics-amber/35 border border-tics-amber/20 p-2 rounded-full">
          <TouchableOpacity onPress={onClose} className='bg-tics-amber/35 border border-tics-amber/20 p-3 px-4 rounded-full'>
            <SafeText className="text-tics-text text-[16px] font-sharetech">Cancel</SafeText>
          </TouchableOpacity>
          <SafeText className="text-white text-[17px] font-sharetech">Filters & Sort</SafeText>
          <TouchableOpacity onPress={handleApply} className='bg-tics-amber/35 border border-tics-amber/20 p-3 px-4 rounded-full'>
            <SafeText className="text-tics-text text-[16px] font-sharetech">Apply</SafeText>
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1 px-2 pt-2"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {/* Sort */}
          <SafeText className="text-white text-[16px] font-sharetech mb-3">Sort By</SafeText>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.key}
                className={`flex-row items-center px-4 py-2.5 rounded-full ${localSort === option.key ? 'bg-tics-amber/35 border border-tics-amber/20' : 'bg-white/[0.07]'
                  }`}
                onPress={() => setLocalSort(option.key)}
              >
                <Ionicons name={option.icon as any} size={16} color={localSort === option.key ? '#FFF' : '#888'} />
                <SafeText className={`text-[13px] font-sharetech ml-1.5 ${localSort === option.key ? 'text-white' : 'text-gray-400'}`}>
                  {option.label}
                </SafeText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Distance */}
          <SafeText className="text-white text-[16px] font-sharetech mb-3">Distance</SafeText>
          <SliderFilter
            label="Max Distance"
            icon="location-outline"
            value={localFilters.maxDistance}
            options={DISTANCE_OPTIONS}
            unit="km"
            onChange={(v) => setLocalFilters(prev => ({ ...prev, maxDistance: v }))}
          />

          {/* Rating */}
          <SafeText className="text-white text-[16px] font-sharetech mb-3 mt-2">Rating</SafeText>
          <SliderFilter
            label="Minimum Rating"
            icon="star-outline"
            value={localFilters.minRating}
            options={RATING_OPTIONS}
            unit=""
            onChange={(v) => setLocalFilters(prev => ({ ...prev, minRating: v }))}
          />

          {/* Toggle Filters */}
          <SafeText className="text-white text-[16px] font-sharetech mb-3 mt-4">Other Filters</SafeText>

          <ToggleFilter
            label="Open Now"
            icon="time-outline"
            value={localFilters.openNow}
            onToggle={() => toggleFilter('openNow')}
          />
          <ToggleFilter
            label="Free"
            icon="cash-outline"
            value={localFilters.free}
            onToggle={() => toggleFilter('free')}
          />
          <ToggleFilter
            label="Family Friendly"
            icon="people-outline"
            value={localFilters.familyFriendly}
            onToggle={() => toggleFilter('familyFriendly')}
          />
          <ToggleFilter
            label="Indoor"
            icon="home-outline"
            value={localFilters.indoor}
            onToggle={() => toggleFilter('indoor')}
          />
          <ToggleFilter
            label="Outdoor"
            icon="sunny-outline"
            value={localFilters.outdoor}
            onToggle={() => toggleFilter('outdoor')}
          />
          <ToggleFilter
            label="Accessible"
            icon="accessibility-outline"
            value={localFilters.accessible}
            onToggle={() => toggleFilter('accessible')}
          />

          {/* Reset */}
          <TouchableOpacity
            className="mt-6 py-6 rounded-full bg-tics-amber/35 border border-tics-amber/20 items-center"
            onPress={handleReset}
          >
            <SafeText className="text-tics-text text-[14px] font-sharetech">Reset All Filters</SafeText>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export const NearMeFilters = memo(NearMeFiltersComponent);