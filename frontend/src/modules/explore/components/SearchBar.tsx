/**
 * SearchBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Hero search bar component with autocomplete, search history, popular searches,
 * and voice search placeholder.
 * Uses NativeWind classes matching the TICS dark theme.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SearchSuggestion, SearchHistoryItem, PopularSearchItem } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onSuggestionSelect: (suggestion: SearchSuggestion) => void;
  suggestions?: SearchSuggestion[];
  searchHistory?: SearchHistoryItem[];
  popularSearches?: PopularSearchItem[];
  loading?: boolean;
}

export function SearchBar({
  onSearch,
  onSuggestionSelect,
  suggestions = [],
  searchHistory = [],
  popularSearches = [],
  loading = false,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      onSearch(query.trim());
      setShowSuggestions(false);
    }
  }, [query, onSearch]);

  const handleSuggestionPress = useCallback((suggestion: SearchSuggestion) => {
    setQuery(suggestion.text);
    onSuggestionSelect(suggestion);
    setShowSuggestions(false);
  }, [onSuggestionSelect]);

  const renderSuggestionItem = ({ item }: { item: SearchSuggestion }) => (
    <TouchableOpacity
      className="flex-row items-center gap-3 px-4 py-3 border-b border-white/10"
      onPress={() => handleSuggestionPress(item)}
    >
      <Ionicons name="search-outline" size={18} color="#9CA3AF" />
      <View className="flex-1">
        <SafeText className="text-[#F8FAFC] text-[15px]">{item.text}</SafeText>
        <SafeText className="text-gray-500 text-[12px] mt-0.5">{item.subtext}</SafeText>
      </View>
      <View className="bg-[#3B82F6]/20 rounded-md px-2 py-1">
        <SafeText className="text-[#3B82F6] text-[10px] font-medium capitalize">{item.type.replace('_', ' ')}</SafeText>
      </View>
    </TouchableOpacity>
  );

  const renderHistoryItem = ({ item }: { item: SearchHistoryItem }) => (
    <TouchableOpacity
      className="flex-row items-center gap-3 px-4 py-3 border-b border-white/10"
      onPress={() => handleSuggestionPress({ id: item.id, text: item.query, type: 'destination', subtext: 'Recent search', icon: 'time-outline' })}
    >
      <Ionicons name="time-outline" size={18} color="#9CA3AF" />
      <SafeText className="text-[#F8FAFC] text-[15px] flex-1">{item.query}</SafeText>
    </TouchableOpacity>
  );

  const renderPopularItem = ({ item }: { item: PopularSearchItem }) => (
    <TouchableOpacity
      className="flex-row items-center gap-3 px-4 py-3 border-b border-white/10"
      onPress={() => handleSuggestionPress({ id: item.id, text: item.query, type: item.category || 'destination', subtext: 'Popular', icon: 'trending-up-outline' })}
    >
      <Ionicons name="trending-up-outline" size={18} color="#F59E0B" />
      <SafeText className="text-[#F8FAFC] text-[15px] flex-1">{item.query}</SafeText>
      <SafeText className="text-gray-500 text-[12px]">{item.searchCount} searches</SafeText>
    </TouchableOpacity>
  );

  return (
    <View className="relative">
      <View className="flex-row items-center gap-2.5 bg-[#121332] rounded-full px-1.5 py-1.5 border border-[#3B82F6]/30">
        
        <TextInput
          className="flex-1 text-[#F8FAFC] text-[15px] font-sharetech"
          placeholder="Where do you want to go?"
          placeholderTextColor="#6B7280"
          value={query}
          onChangeText={setQuery}
          onFocus={() => setShowSuggestions(true)}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} className="p-1">
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleSearch} style={{width:46, height:46}} className="flex items-center justify-center bg-tics-amber/25 rounded-full">
          <Ionicons name="search-outline" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {showSuggestions && (
        <View className="absolute top-full left-0 right-0 mt-2 bg-[#1a1b3a] rounded-2xl border border-white/10 shadow-xl z-50 max-h-[400]">
          {loading && (
            <View className="px-4 py-3">
              <SafeText className="text-gray-400 text-[13px]">Searching...</SafeText>
            </View>
          )}

          {!loading && suggestions.length > 0 && (
            <View>
              <SafeText className="text-gray-500 text-[11px] font-semibold px-4 py-2 uppercase">Suggestions</SafeText>
              <FlatList
                data={suggestions}
                renderItem={renderSuggestionItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>
          )}

          {!loading && suggestions.length === 0 && searchHistory.length > 0 && (
            <View>
              <SafeText className="text-gray-500 text-[11px] font-semibold px-4 py-2 uppercase">Recent Searches</SafeText>
              <FlatList
                data={searchHistory.slice(0, 5)}
                renderItem={renderHistoryItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>
          )}

          {!loading && suggestions.length === 0 && searchHistory.length === 0 && popularSearches.length > 0 && (
            <View>
              <SafeText className="text-gray-500 text-[11px] font-semibold px-4 py-2 uppercase">Popular Searches</SafeText>
              <FlatList
                data={popularSearches.slice(0, 5)}
                renderItem={renderPopularItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>
          )}

          {!loading && suggestions.length === 0 && searchHistory.length === 0 && popularSearches.length === 0 && (
            <View className="px-4 py-6 items-center">
              <Ionicons name="search-outline" size={40} color="#6B7280" />
              <SafeText className="text-gray-400 text-[13px] mt-2 text-center">Start typing to search destinations, events, and places</SafeText>
            </View>
          )}
        </View>
      )}
    </View>
  );
}