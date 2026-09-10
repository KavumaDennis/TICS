/**
 * AIDiscoveryScreen
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified AI-powered discovery experience.
 * Combines the personalized discovery feed (AIDiscoveryFeedScreen) with the
 * interactive AI search (AIDiscoveryScreen) into a single screen.
 *
 * - Top: Personalized discovery sections from the AI engine (feed)
 * - Bottom: Interactive AI search with suggested prompts and query input
 * TICS dark premium design system with NativeWind classes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, ScrollView, Pressable, TextInput, ActivityIndicator, Animated, Platform, Dimensions, KeyboardAvoidingView, RefreshControl, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useAIDiscovery } from '@/src/modules/explore/hooks/useAIDiscovery';
import { useAIDiscoveryFeed } from '@/src/modules/explore/hooks/useAIDiscoveryFeed';
import type { AIRecommendation, DiscoverySection } from '@/src/modules/explore/services/ai-discovery/types';
import { SafeText } from '@/src/components/responsive/SafeText';

const SCREEN_WIDTH = Dimensions.get('window').width;

const SUGGESTED_PROMPTS = [
  { id: '1', text: 'Hidden gems in Uganda', icon: '💎', category: 'Destinations' },
  { id: '2', text: 'Weekend escapes near Kampala', icon: '🏕️', category: 'Experiences' },
  { id: '3', text: 'Top restaurants in Nairobi', icon: '🍽️', category: 'Food' },
  { id: '4', text: 'Events happening this month', icon: '🎉', category: 'Events' },
  { id: '5', text: 'Budget travel tips for East Africa', icon: '💰', category: 'Tips' },
  { id: '6', text: 'Adventure activities in Kenya', icon: '🧗', category: 'Activities' },
  { id: '7', text: 'Romantic getaways', icon: '💑', category: 'Romance' },
  { id: '8', text: 'Beach destinations', icon: '🏖️', category: 'Beach' },
];

const LOADING_STEPS = [
  'Analyzing your preferences...',
  'Discovering destinations...',
  'Finding hidden gems...',
  'Curating experiences...',
  'Almost there...',
];

interface Props { userLocation?: { lat: number; lng: number }; }

/* ── Feed Recommendation Card ──────────────────────────────────────────────── */

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

/* ── Main Screen ───────────────────────────────────────────────────────────── */

export default function AIDiscoveryScreen({ userLocation }: Props) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialPrompt = typeof params.initialQuery === 'string' ? params.initialQuery : undefined;

  const [query, setQuery] = useState(initialPrompt || '');
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [dismissedError, setDismissedError] = useState(false);

  // Interactive AI search
  const {
    response,
    loading,
    error,
    discover,
    retry,
    clear,
  } = useAIDiscovery();

  // Personalized feed
  const { feed, loading: feedLoading, refreshing, error: feedError, refresh, trackInteraction } = useAIDiscoveryFeed({ location: userLocation });

  // Animation on mount
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  // Auto-submit initial prompt if provided
  useEffect(() => {
    if (initialPrompt && !loading && !response) {
      handleDiscover(initialPrompt);
    }
  }, [initialPrompt]);

  // Reset dismissed error when new response comes in or error clears
  useEffect(() => {
    if (response || !error) {
      setDismissedError(false);
    }
  }, [response, error]);

  const handleDiscover = async (text: string) => {
    if (!text.trim() || loading) return;
    setDismissedError(false);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await discover(text.trim());
  };

  const handleSuggestion = async (prompt: string) => {
    setQuery(prompt);
    await handleDiscover(prompt);
  };

  const handleDismissError = () => {
    setDismissedError(true);
  };

  const handleClear = () => {
    clear();
    setQuery('');
    setDismissedError(false);
  };

  /* ── Feed handlers ───────────────────────────────────────────────────────── */

  const handleFeedPress = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackInteraction('discovery_clicked', rec, section.type);
    if (rec.destinationId) router.push(`/explore/destination/${rec.destinationId}`);
    else if (rec.eventId) router.push(`/explore/event/${rec.eventId}`);
    else if (rec.coordinates) router.push('/explore/nearby');
  }, [trackInteraction, router]);

  const handleFeedSave = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackInteraction('discovery_saved', rec, section.type);
  }, [trackInteraction]);

  const handleFeedDismiss = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackInteraction('discovery_dismissed', rec, section.type);
  }, [trackInteraction]);

  /* ── Render: AI search loading ───────────────────────────────────────────── */

  const renderLoading = () => (
    <View className="items-center justify-center py-12">
      <ActivityIndicator size="large" color="#F59E0B" />
      <SafeText className="text-tics-text text-lg font-bold mt-6 mb-5 font-sharetech">
        AI is exploring...
      </SafeText>
      <View className="gap-3">
        {LOADING_STEPS.map((step, i) => (
          <SafeText key={i} className="text-gray-400 text-sm font-sharetech">
            {step}
          </SafeText>
        ))}
      </View>
    </View>
  );

  /* ── Render: AI search error banner ──────────────────────────────────────── */

  const renderErrorBanner = () => {
    if (!error || dismissedError) return null;

    const errorMessage = typeof error === 'string'
      ? error
      : error.message || 'Something went wrong. Please try again.';

    return (
      <View className="mx-4 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
        <View className="flex-row items-start gap-3">
          <Ionicons name="alert-circle-outline" size={20} color="#EF4444" style={{ marginTop: 2 }} />
          <View className="flex-1">
            <SafeText className="text-red-400 text-sm font-semibold mb-1 font-sharetech">
              Oops! Something went wrong
            </SafeText>
            <SafeText className="text-gray-400 text-xs leading-5 mb-2 font-sharetech">
              {errorMessage}
            </SafeText>
            <View className="flex-row gap-2">
              <Pressable
                onPress={retry}
                className="flex-row items-center bg-red-500/20 rounded-full px-4 py-1.5 active:opacity-70"
              >
                <Ionicons name="refresh" size={14} color="#EF4444" />
                <SafeText className="text-red-400 text-xs font-semibold ml-1.5 font-sharetech">Try Again</SafeText>
              </Pressable>
              <Pressable
                onPress={handleDismissError}
                className="flex-row items-center bg-white/5 rounded-full px-4 py-1.5 active:opacity-70"
              >
                <SafeText className="text-gray-400 text-xs font-sharetech">Dismiss</SafeText>
              </Pressable>
            </View>
          </View>
          <Pressable onPress={handleDismissError} className="p-1">
            <Ionicons name="close" size={16} color="#64748b" />
          </Pressable>
        </View>
      </View>
    );
  };

  /* ── Render: AI search response ──────────────────────────────────────────── */

  const renderResponse = () => {
    if (!response) return null;

    const items = (response as any).items || (response as any).recommendations || [];
    const images = (response as any).images || [];
    const resAny = response as any;

    if (items.length === 0) {
      return (
        <View className="items-center justify-center py-12 px-6">
          <Ionicons name="search-outline" size={40} color="#64748b" />
          <SafeText className="text-gray-400 text-sm text-center mt-4 font-sharetech">
            No results found. Try a different search.
          </SafeText>
        </View>
      );
    }

    return (
      <View className="gap-4">
        {/* Response Header */}
        <View className="rounded-2xl border border-tics-amber/15 bg-tics-amber/5 p-4">
          <View className="flex-row items-center justify-between mb-2">
            <SafeText className="text-tics-text text-xl font-bold font-sharetech">
              {resAny.title || 'AI Discovery'}
            </SafeText>
            {resAny.confidence && (
              <View className="rounded-md bg-tics-amber/10 px-2 py-1">
                <SafeText className="text-tics-amber text-xs font-sharetech">
                  {Math.round(resAny.confidence * 100)}% match
                </SafeText>
              </View>
            )}
          </View>
          {resAny.subtitle && (
            <SafeText className="text-gray-400 text-sm mb-2 font-sharetech">
              {resAny.subtitle}
            </SafeText>
          )}
          {resAny.query && (
            <SafeText className="text-tics-amber text-sm italic mb-2 font-sharetech">
              "{resAny.query}"
            </SafeText>
          )}
          <View className="flex-row items-center gap-2">
            {resAny.category && (
              <View className="rounded-md bg-tics-amber/10 px-2 py-1">
                <SafeText className="text-tics-amber text-xs font-sharetech">
                  {resAny.category}
                </SafeText>
              </View>
            )}
            {resAny.source && (
              <View className="rounded-md bg-tics-blue/10 px-2 py-1">
                <SafeText className="text-tics-blue text-xs font-sharetech">
                  {resAny.source === 'fallback' ? 'Smart Suggestions' : 'AI Powered'}
                </SafeText>
              </View>
            )}
          </View>
        </View>

        {/* Images Gallery */}
        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
            {images.map((img: any, i: number) => (
              <Image
                key={i}
                source={{ uri: (img.urls?.regular || img.url) as string }}
                style={{ width: SCREEN_WIDTH * 0.7, height: 200, borderRadius: 16 }}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        )}

        {/* Items Grid */}
        {items.length > 0 && (
          <View className="gap-3">
            <SafeText className="text-tics-text text-base font-semibold mb-1 font-sharetech">
              {items.length} result{items.length !== 1 ? 's' : ''} found
            </SafeText>
            {items.map((item: any, i: number) => (
              <Pressable
                key={item.id || i}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.04] overflow-hidden active:opacity-80"
              >
                {renderItemContent(item, i)}
              </Pressable>
            ))}
          </View>
        )}

        {/* Follow-up suggestions */}
        {resAny.followUpPrompts && resAny.followUpPrompts.length > 0 && (
          <View className="mt-2">
            <SafeText className="text-gray-400 text-sm font-semibold mb-2.5 font-sharetech">
              Follow-up ideas
            </SafeText>
            <View className="flex-row flex-wrap gap-2">
              {resAny.followUpPrompts.map((prompt: string, i: number) => (
                <Pressable
                  key={i}
                  onPress={() => handleSuggestion(prompt)}
                  className="rounded-full border border-tics-amber/20 bg-tics-amber/10 px-4 py-2 active:opacity-70"
                >
                  <SafeText className="text-tics-amber text-xs font-sharetech">{prompt}</SafeText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Clear button */}
        <Pressable
          onPress={handleClear}
          className="self-center rounded-full border border-white/10 bg-white/5 px-6 py-2 active:opacity-70"
        >
          <SafeText className="text-gray-400 text-xs font-sharetech">Start New Search</SafeText>
        </Pressable>
      </View>
    );
  };

  const renderItemContent = (item: any, index: number) => {
    const itemImages = item.images || item.imageUrls || [];
    const displayImage = itemImages[0] || (response as any)?.images?.[0];

    return (
      <>
        {displayImage && (
          <Image
            source={{ uri: typeof displayImage === 'string' ? displayImage : displayImage.urls?.regular || displayImage.url }}
            style={{ width: '100%', height: 180 }}
            contentFit="cover"
          />
        )}

        <View className="p-4">
          {item.category && (
            <View className="rounded-md bg-tics-blue/10 px-2 py-1 self-start mb-2">
              <SafeText className="text-tics-blue text-xs font-sharetech">
                {item.category}
              </SafeText>
            </View>
          )}

          <SafeText className="text-tics-text text-lg font-semibold mb-1.5 font-sharetech">
            {item.name || item.title}
          </SafeText>
          {item.description && (
            <SafeText className="text-gray-400 text-sm leading-6 mb-3 font-sharetech">
              {item.description.length > 150 ? item.description.slice(0, 150) + '...' : item.description}
            </SafeText>
          )}

          <View className="flex-row items-center gap-4 flex-wrap">
            {item.rating && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="star" size={14} color="#F59E0B" />
                <SafeText className="text-tics-amber text-xs font-sharetech">
                  {item.rating}
                </SafeText>
              </View>
            )}
            {item.distance && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="location" size={14} color="#94a3b8" />
                <SafeText className="text-gray-400 text-xs font-sharetech">
                  {item.distance}
                </SafeText>
              </View>
            )}
            {item.priceLevel && (
              <SafeText className="text-gray-400 text-xs font-sharetech">
                {'$'.repeat(item.priceLevel)}
              </SafeText>
            )}
          </View>

          <View className="flex-row gap-2 mt-4">
            <Pressable className="flex-1 rounded-full bg-tics-blue/20 border border-tics-blue/30 py-2.5 items-center active:opacity-70">
              <SafeText className="text-tics-blue text-xs font-semibold font-sharetech">Details</SafeText>
            </Pressable>
            <Pressable className="flex-1 rounded-full bg-tics-amber/20 border border-tics-amber/30 py-2.5 items-center active:opacity-70">
              <SafeText className="text-tics-amber text-xs font-semibold font-sharetech">Save</SafeText>
            </Pressable>
          </View>
        </View>
      </>
    );
  };

  /* ── Render: Feed section ────────────────────────────────────────────────── */

  const renderFeed = () => {
    if (feedLoading && !feed) {
      return (
        <View className="items-center justify-center py-8">
          <ActivityIndicator size="large" color="#F59E0B" />
          <SafeText className="text-gray-400 mt-4 font-sharetech">Discovering personalized experiences...</SafeText>
        </View>
      );
    }

    if (!feed || feed.sections.length === 0) {
      return (
        <View className="items-center justify-center py-8 px-8">
          <Ionicons name="compass-outline" size={48} color="#64748b" />
          <SafeText className="text-tics-text text-lg font-bold mt-4 mb-2 font-sharetech">No Discoveries Yet</SafeText>
          <SafeText className="text-gray-400 text-sm text-center leading-6 mb-5 font-sharetech">
            {feedError || "We're working on finding the perfect experiences for you. Pull to refresh."}
          </SafeText>
          <TouchableOpacity className="bg-tics-amber/25 rounded-full px-6 py-3" onPress={refresh}>
            <SafeText className="text-tics-amber font-semibold font-sharetech">Refresh</SafeText>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View>
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
                onPress={() => handleFeedPress(rec, section)}
                onSave={() => handleFeedSave(rec, section)}
                onDismiss={() => handleFeedDismiss(rec, section)} />
            ))}
          </View>
        ))}
      </View>
    );
  };

  /* ── Main render ─────────────────────────────────────────────────────────── */

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0b1e' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className='p-1'
    >
      {/* Header */}
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-2">
        <Pressable onPress={() => router.back()} style={{ width: 46, height: 46 }} className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
        </Pressable>
        <View className="flex-1">
          <SafeText className="text-tics-amber text-lg font-bold font-sharetech">
            AI Discovery
          </SafeText>
          <SafeText className="text-gray-500 text-xs font-sharetech">
            Personalized + Interactive
          </SafeText>
        </View>
        {response && (
          <Pressable onPress={handleClear} className="h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
            <Ionicons name="refresh" size={18} color="#F8FAFC" />
          </Pressable>
        )}
      </View>

      {/* Main Content */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#F59E0B" />}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Personalized Feed Section */}
          <View className="mb-4">
            <SafeText className="text-tics-text text-base font-semibold mb-2 px-1 font-sharetech">For You</SafeText>
            {renderFeed()}
          </View>

          {/* Divider */}
          <View className="h-px bg-white/10 my-2 mx-4" />

          {/* Interactive AI Search Section */}
          <View className="mb-4">
            <SafeText className="text-tics-text text-base font-semibold mb-2 px-1 font-sharetech">Ask AI</SafeText>

            {/* Suggested Prompts - always visible when no response */}
            {!response && (
              <ScrollView style={{ maxHeight: 50 }} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-4">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt.id}
                    onPress={() => handleSuggestion(prompt.text)}
                    disabled={loading}
                    className="rounded-full border border-tics-amber/20 bg-tics-amber/10 px-4 py-2.5 active:opacity-70 disabled:opacity-40"
                  >
                    <View className="flex-row items-center gap-2">
                      <SafeText className="text-base">{prompt.icon}</SafeText>
                      <SafeText className="text-tics-amber text-xs font-sharetech">{prompt.text}</SafeText>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* Error Banner */}
            {renderErrorBanner()}

            {/* AI Search Content */}
            {loading && renderLoading()}
            {!loading && response && renderResponse()}
            {!loading && !error && !response && (
              <View className="items-center justify-center py-8 px-6">
                <View className="w-20 h-20 rounded-full bg-tics-amber/10 items-center justify-center mb-4">
                  <Ionicons name="compass" size={40} color="#F59E0B" />
                </View>
                <SafeText className="text-tics-text text-lg font-bold mb-2 font-sharetech">
                  Discover with AI
                </SafeText>
                <SafeText className="text-gray-400 text-sm text-center leading-6 px-5 font-sharetech">
                  Ask me anything about destinations, events, restaurants, or travel tips.
                </SafeText>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Input Bar */}
      <View className="p-2 rounded-full border border-tics-amber/20">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center rounded-full border border-tics-amber/20 bg-white/[0.06] px-4 py-2">
            <Ionicons name="search" size={18} color="#64748b" />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Ask AI to explore..."
              placeholderTextColor="#64748b"
              onSubmitEditing={() => handleDiscover(query)}
              returnKeyType="send"
              className="flex-1 ml-2 text-white text-sm"
              style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 14, maxHeight: 46 }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} className="ml-1">
                <Ionicons name="close-circle" size={18} color="#64748b" />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => handleDiscover(query)}
            disabled={!query.trim() || loading}
            style={{
              width: 46, height: 46,
              alignItems: 'center', justifyContent: 'center',
            }}
            className="items-center justify-center rounded-full bg-tics-amber/35 active:opacity-70 "
          >
            <Ionicons name="send" size={20} color="#FFF" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}