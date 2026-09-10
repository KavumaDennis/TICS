/**
 * SearchScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Search experience screen with autocomplete, search history, combined
 * Google Places and Firestore results, and ranked search output.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSearch } from '@/src/modules/explore/hooks/useSearch';
import type { SearchResult, SearchSuggestion } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';
import { toImageSource } from '@/src/modules/explore/utils';

interface SearchScreenProps {
  initialQuery?: string;
  onNavigateToDestination: (destination: any) => void;
  onNavigateToEvent: (eventId: string) => void;
  onBack: () => void;
}

export function SearchScreen({ initialQuery, onNavigateToDestination, onNavigateToEvent, onBack }: SearchScreenProps) {
  const {
    query,
    results,
    suggestions,
    recentSearches,
    loading,
    hasSearched,
    setQuery,
    performSearch,
    clearSearch,
    clearHistory,
  } = useSearch();

  // Auto-search if initialQuery provided
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      performSearch(initialQuery);
    }
  }, []);

  const handleSubmit = () => {
    if (query.trim()) {
      performSearch(query.trim());
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 p-1 bg-[#0a0b1e]"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Search Header */}
      <View className="p-1 flex-row items-center gap-2 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <TouchableOpacity
          onPress={onBack}
          className="h-[46px] w-[46px] items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20"
        >
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View className="flex-1  p-1 flex-row items-center border border-tics-amber/20 rounded-full pl-2">
          <TextInput
            className="flex-1 text-[16px] py-3 text-tics-text font-sharetech"
            placeholder="Where do you want to go?"
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoFocus={!initialQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={clearSearch} className="h-[40px] w-[40px] items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
              <SafeText className="text-[18px] text-gray-400">✕</SafeText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {query.length === 0 && !hasSearched && recentSearches.length > 0 && (
        <View className="px-4 mt-4">
          <View className="flex-row justify-between items-center mb-3">
            <SafeText className="text-[18px] font-bold text-tics-text font-sharetech">Recent Searches</SafeText>
            <TouchableOpacity onPress={clearHistory}>
              <SafeText className="text-[14px] text-tics-blue font-sharetech">Clear</SafeText>
            </TouchableOpacity>
          </View>
          {recentSearches.map((search, index) => (
            <TouchableOpacity
              key={index}
              className="flex-row items-center py-2.5"
              onPress={() => {
                setQuery(search);
                performSearch(search);
              }}
            >
              <SafeText className="text-[16px] mr-3">🕐</SafeText>
              <SafeText className="text-[15px] text-tics-text font-sharetech">{search}</SafeText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && !hasSearched && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center py-3 px-4 border-b border-gray-800/60"
              onPress={() => {
                setQuery(item.text);
                performSearch(item.text);
              }}
            >
              <SafeText className="text-[18px] mr-3">
                {item.icon === 'history' ? '🕐' : '📍'}
              </SafeText>
              <View className="flex-1">
                <SafeText className="text-[15px] text-tics-text font-medium font-sharetech">{item.text}</SafeText>
                <SafeText className="text-[12px] text-gray-400 mt-0.5 font-sharetech">{item.subtext}</SafeText>
              </View>
            </TouchableOpacity>
          )}
          className="px-4 mt-2"
        />
      )}

      {/* Loading */}
      {loading && (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}

      {/* Results */}
      {hasSearched && !loading && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row bg-tics-amber/10 rounded-3xl mb-3 overflow-hidden border border-tics-amber/10"
              onPress={() => {
                if (item.type === 'event') {
                  onNavigateToEvent(item.id);
                } else {
                  onNavigateToDestination(item);
                }
              }}
              activeOpacity={0.85}
            >
              <Image
                source={toImageSource(item.imageUrl)}
                className="w-[100px] h-[110px]"
              />
              <View className="flex-1 p-3 justify-center">
                <View className="flex-row items-center justify-between gap-2">
                  <SafeText className="flex-1 text-[15px] text-tics-text font-sharetech" numberOfLines={1}>{item.name}</SafeText>
                  {item.rating > 0 && (
                    <View className="flex-row items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded-lg">
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <SafeText className="text-[12px] font-bold text-amber-700">{item.rating.toFixed(1)}</SafeText>
                    </View>
                  )}
                </View>
                {(item.city || item.country) && (
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <Ionicons name="location-outline" size={13} color="#94a3b8" />
                    <SafeText className="flex-1 text-[12px] text-gray-400 font-sharetech" numberOfLines={1}>
                      {[item.city, item.country].filter(Boolean).join(', ')}
                    </SafeText>
                  </View>
                )}
                <View className="flex-row items-center gap-2 mt-2">
                  <View className="flex-row items-center gap-1 bg-tics-blue/20 px-1.5 py-0.5 rounded-md">
                    <Ionicons name={item.type === 'event' ? 'calendar' : 'compass'} size={11} color="#3B82F6" />
                    <SafeText className="text-[10px] text-tics-blue capitalize font-semibold font-sharetech">{item.type}</SafeText>
                  </View>
                  {item.description ? (
                    <SafeText className="flex-1 text-[11px] text-gray-500 font-sharetech" numberOfLines={1}>{item.description}</SafeText>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          )}
          className="px-4 mt-2"
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {/* No Results */}
      {hasSearched && !loading && results.length === 0 && (
        <View className="flex-1 justify-center items-center p-8">
          <SafeText className="text-[48px] mb-4">🔍</SafeText>
          <SafeText className="text-[20px] font-bold text-tics-text font-sharetech mb-2">No Results Found</SafeText>
          <SafeText className="text-[14px] text-gray-400 text-center font-sharetech">Try adjusting your search or explore categories</SafeText>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
