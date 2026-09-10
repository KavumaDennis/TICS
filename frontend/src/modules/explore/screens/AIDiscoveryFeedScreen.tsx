/**
 * AIDiscoveryFeedScreen - AI Discovery feed.
 * Shows personalized discovery sections from the AI engine.
 */
import React, { useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Image, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeText } from '@/src/components/responsive/SafeText';
import { useAIDiscoveryFeed } from '@/src/modules/explore/hooks/useAIDiscoveryFeed';
import type { AIRecommendation, DiscoverySection } from '@/src/modules/explore/services/ai-discovery/types';

interface Props { userLocation?: { lat: number; lng: number }; }

function RecCard({ rec, section, onPress, onSave, onDismiss }: {
  rec: AIRecommendation; section: DiscoverySection;
  onPress: () => void; onSave: () => void; onDismiss: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="rounded-3xl border border-white/[0.02] bg-white/[0.04] overflow-hidden active:opacity-80 mb-3">
      <View className="flex-row">
        {rec.imageUrl ? (
          <Image source={{ uri: rec.imageUrl }} className="w-24" style={{ minHeight: 110 }} />
        ) : (
          <View className="w-24 min-h-[110px] bg-tics-amber/10 items-center justify-center">
            <Ionicons name="compass" size={24} color="#F59E0B" />
          </View>
        )}
        <View className="flex-1 p-2">
          <View className="flex-row items-center gap-2 mb-1">
            <View className="bg-tics-blue/10 rounded-md px-2 py-0.5">
              <SafeText className="text-tics-blue text-[10px] font-sharetech">{rec.category}</SafeText>
            </View>
            {rec.distanceKm !== undefined && (
              <View className="flex-row items-center">
                <Ionicons name="location" size={12} color="#94a3b8" />
                <SafeText className="text-gray-400 text-[11px] ml-0.5 font-sharetech">{rec.distanceKm < 1 ? `${Math.round(rec.distanceKm * 1000)}m` : `${rec.distanceKm.toFixed(1)}km`}</SafeText>
              </View>
            )}
          </View>
          <SafeText className="text-tics-text text-sm font-semibold mb-1 font-sharetech" numberOfLines={1}>{rec.title}</SafeText>
          <SafeText className="text-gray-400 text-[11px] leading-4 mb-2 font-sharetech" numberOfLines={2}>{rec.description}</SafeText>
          {rec.reason ? (
            <View className="bg-tics-amber/10 self-start rounded-full px-2 py-1.5">
              <SafeText className="text-tics-amber text-[10px] font-sharetech" numberOfLines={2}>💡 {rec.reason}</SafeText>
            </View>
          ) : null}
          <View className="flex-row items-center gap-3 mt-2 p-1 bg-tics-amber/30 rounded-full">
            {rec.rating ? (
              <View className="flex-row items-center p-1 bg-tics-amber/30 rounded-full">
                <Ionicons name="star" size={12} color="#F59E0B" />
                <SafeText className="text-tics-amber text-[11px] ml-0.5 font-sharetech">{rec.rating.toFixed(1)}</SafeText>
              </View>
            ) : null}
            {rec.relevanceScore ? <SafeText className="text-gray-400 text-[10px] font-sharetech">{rec.relevanceScore}% match</SafeText> : null}
            <View className="flex-1" />
            <TouchableOpacity onPress={onDismiss} className="p-1 bg-tics-amber/30 rounded-full"><Ionicons name="close" size={14} color="#64748b" /></TouchableOpacity>
            <TouchableOpacity onPress={onSave} className="p-1 bg-tics-amber/30 rounded-full"><Ionicons name="bookmark-outline" size={14} color="#94a3b8" /></TouchableOpacity>
            <TouchableOpacity onPress={onPress} className="p-1 bg-tics-amber/30 rounded-full"><Ionicons name="arrow-forward" size={14} color="#3B82F6" /></TouchableOpacity>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function AIDiscoveryFeedScreen({ userLocation }: Props) {
  const router = useRouter();
  const { feed, loading, refreshing, error, refresh, trackInteraction } = useAIDiscoveryFeed({ location: userLocation });

  const handlePress = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackInteraction('discovery_clicked', rec, section.type);
    if (rec.destinationId) router.push(`/explore/destination/${rec.destinationId}`);
    else if (rec.eventId) router.push(`/explore/event/${rec.eventId}`);
    else if (rec.coordinates) router.push('/explore/nearby');
  }, [trackInteraction, router]);

  const handleSave = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackInteraction('discovery_saved', rec, section.type);
  }, [trackInteraction]);

  const handleDismiss = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackInteraction('discovery_dismissed', rec, section.type);
  }, [trackInteraction]);

  if (loading && !feed) {
    return (
      <View className="flex-1 bg-[#0a0b1e] items-center justify-center">
        <ActivityIndicator size="large" color="#F59E0B" />
        <SafeText className="text-gray-400 mt-4 font-sharetech">Discovering personalized experiences...</SafeText>
      </View>
    );
  }

  if (!feed || feed.sections.length === 0) {
    return (
      <View className="flex-1 bg-[#0a0b1e] items-center justify-center px-8">
        <Ionicons name="compass-outline" size={48} color="#64748b" />
        <SafeText className="text-tics-text text-lg font-bold mt-4 mb-2 font-sharetech">No Discoveries Yet</SafeText>
        <SafeText className="text-gray-400 text-sm text-center leading-6 mb-5 font-sharetech">
          {error || "We're working on finding the perfect experiences for you. Pull to refresh."}
        </SafeText>
        <TouchableOpacity className="bg-tics-amber/25 rounded-full px-6 py-3" onPress={refresh}>
          <SafeText className="text-tics-amber font-semibold font-sharetech">Refresh</SafeText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0a0b1e] p-1">
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#F59E0B" />}>
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-2">
          <Pressable
            onPress={() => router.back()}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
            <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
          </Pressable>
          <View className="flex-1">
            <SafeText className="text-tics-text text-2xl font-bold font-sharetech">AI Discovery</SafeText>
            <SafeText className="text-gray-400 text-sm font-sharetech">Personalized travel experiences just for you</SafeText>
          </View>

        </View>
        {feed.source === 'ranked' && (
          <View className="mt-2 bg-tics-blue/10 rounded-full px-3 py-1 self-start">
            <SafeText className="text-tics-blue text-[11px] font-sharetech">Smart Suggestions (AI unavailable)</SafeText>
          </View>
        )}

        {feed.sections.map((section) => (
          <View key={section.id} className="mb-6 px-1">
            <SafeText className="text-tics-text text-lg font-semibold mb-0.5 font-sharetech">{section.title}</SafeText>
            <SafeText className="text-gray-400 text-xs mb-3 font-sharetech">{section.subtitle}</SafeText>
            {section.recommendations.map((rec) => (
              <RecCard key={rec.id} rec={rec} section={section}
                onPress={() => handlePress(rec, section)}
                onSave={() => handleSave(rec, section)}
                onDismiss={() => handleDismiss(rec, section)} />
            ))}
          </View>
        ))}

        <View className="px-4 pb-10 items-center">
          <SafeText className="text-gray-500 text-xs text-center font-sharetech">
            Recommendations are based on your preferences, location, trips, and behavior.
          </SafeText>
        </View>
      </ScrollView>
    </View>
  );
}