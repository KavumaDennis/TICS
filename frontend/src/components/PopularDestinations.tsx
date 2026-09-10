/**
 * PopularDestinations.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic, personalized destination recommendations carousel.
 * Uses the RecommendationEngine to show destinations tailored to each user.
 * Falls back to hardcoded destinations if personalization is unavailable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { SafeText } from '@/src/components/responsive/SafeText';
import {
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
  ViewToken,
  Modal,
  ScrollView,
  ActivityIndicator,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Entypo from '@expo/vector-icons/Entypo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/src/store/useAuthStore';
import { usePersonalizedRecommendationStore, type ScoredDestination } from '@/src/store/personalizedRecommendationStore';
import {
  POPULAR_DESTINATIONS,
  type PopularDestination,
} from '@/src/services/PexelsService';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_WIDTH - 32 - 12) / 2.3; // fits ~2.3 cards visible
const CARD_HEIGHT = 150;
const BORDER_RADIUS = 20;
const MAX_RECOMMENDATIONS = 10;

/* ── Types ─────────────────────────────────────────────────────────────────── */

type CardItem =
  | { kind: 'personalized'; data: ScoredDestination }
  | { kind: 'fallback'; data: PopularDestination };

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function PopularDestinations() {
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedDest, setSelectedDest] = useState<ScoredDestination | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [items, setItems] = useState<CardItem[]>([]);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const uid = useAuthStore((s) => s.token);
  const {
    recommendations,
    loading,
    loadRecommendations,
  } = usePersonalizedRecommendationStore();

  // Fetch personalized recommendations for logged-in users
  useEffect(() => {
    if (uid) {
      loadRecommendations(uid);
    }
  }, [uid]);

  // Transform recommendations or fallback into card items
  useEffect(() => {
    if (uid && recommendations.length > 0) {
      setItems(
        recommendations.slice(0, MAX_RECOMMENDATIONS).map((d) => ({
          kind: 'personalized' as const,
          data: d,
        }))
      );
    } else if (!uid) {
      // Not logged in - show fallback destinations
      setItems(
        POPULAR_DESTINATIONS.map((d) => ({
          kind: 'fallback' as const,
          data: d,
        }))
      );
    }
  }, [recommendations, uid]);

  const scrollToIndex = (direction: 'left' | 'right') => {
    const nextIndex =
      direction === 'right'
        ? Math.min(currentIndex + 2, items.length - 1)
        : Math.max(currentIndex - 2, 0);

    flatListRef.current?.scrollToIndex({
      index: nextIndex,
      animated: true,
    });
    setCurrentIndex(nextIndex);
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const openDestinationModal = (item: CardItem) => {
    if (item.kind === 'personalized') {
      setSelectedDest(item.data);
      setModalVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 90,
        useNativeDriver: true,
      }).start();
    } else {
      // For fallback destinations, navigate to a generic info
      // or use the old behavior (we keep the old modal fallback simple)
      const fallback = item.data;
      const scored: ScoredDestination = {
        name: fallback.name,
        country: fallback.name,
        countryCode: fallback.countryCode,
        image: fallback.image,
        description: 'A popular destination loved by travelers worldwide.',
        travelTips: [],
        bestTimeToVisit: 'Year-round',
        currency: '',
        language: '',
        timezone: '',
        topAttractions: [],
        travelCategories: ['general'],
        estimatedBudget: null,
        score: 0,
        scoreBreakdown: {
          proximity: 0,
          similarity: 0,
          season: 0,
          weather: 0,
          geminiRanking: 0,
          budget: 0,
        },
        reason: 'Popular destination',
        reasons: ['Popular destination'],
        aiInsight: '',
        lat: 0,
        lng: 0,
      };
      setSelectedDest(scored);
      setModalVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 90,
        useNativeDriver: true,
      }).start();
    }
  };

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
      setSelectedDest(null);
    });
  };

  const renderCardItem = ({ item }: { item: CardItem }) => {
    if (item.kind === 'personalized') {
      const dest = item.data;
      return (
        <Pressable
          onPress={() => openDestinationModal(item)}
          style={{
            width: CARD_SIZE,
            height: CARD_HEIGHT,
            borderRadius: BORDER_RADIUS,
            overflow: 'hidden',
            marginRight: 10,
          }}
        >
          <Image
            source={{ uri: dest.image || 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600' }}
            contentFit="cover"
            transition={200}
            style={{
              width: '100%',
              height: '100%',
            }}
          />
          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(10,11,30,0.85)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 80,
              justifyContent: 'flex-end',
              paddingHorizontal: 12,
              paddingBottom: 10,
            }}
          >
            <SafeText
              style={{
                fontFamily: 'ShareTech_400Regular',
                color: '#f8fafc',
                fontSize: 13,
              }}
              numberOfLines={1}
            >
              {dest.name}
            </SafeText>
            <SafeText
              style={{
                fontFamily: 'ShareTech_400Regular',
                color: '#FBBF24',
                fontSize: 9,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              Score: {dest.score} · {dest.country}
            </SafeText>
            <SafeText
              style={{
                fontFamily: 'ShareTech_400Regular',
                color: 'rgba(148,163,184,0.8)',
                fontSize: 8,
                marginTop: 1,
              }}
              numberOfLines={1}
            >
              {dest.reason}
            </SafeText>
          </LinearGradient>
        </Pressable>
      );
    }

    // Fallback destination card (for unauthenticated users)
    const dest = item.data;
    return (
      <Pressable
        onPress={() => openDestinationModal(item)}
        style={{
          width: CARD_SIZE,
          height: CARD_HEIGHT,
          borderRadius: BORDER_RADIUS,
          overflow: 'hidden',
          marginRight: 10,
        }}
      >
        <Image
          source={{ uri: dest.image }}
          contentFit="cover"
          transition={200}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
        <LinearGradient
          colors={['transparent', 'rgba(10,11,30,0.85)']}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            justifyContent: 'flex-end',
            paddingHorizontal: 12,
            paddingBottom: 10,
          }}
        >
          <SafeText
            style={{
              fontFamily: 'ShareTech_400Regular',
              color: '#f8fafc',
              fontSize: 13,
            }}
            numberOfLines={1}
          >
            {dest.name}
          </SafeText>
        </LinearGradient>
      </Pressable>
    );
  };

  // Loading skeletons
  if (loading && items.length === 0) {
    return (
      <View>
        <SafeText
          style={{
            fontFamily: 'ShareTech_400Regular',
            fontSize: 15,
          }}
          className="text-tics-amber ml-1 mb-3"
        >
          Personalized for you
        </SafeText>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: CARD_SIZE,
                height: CARD_HEIGHT,
                borderRadius: BORDER_RADIUS,
                backgroundColor: 'rgba(148,163,184,0.1)',
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View>
      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <SafeText
          style={{
            fontFamily: 'ShareTech_400Regular',
            fontSize: 15,
          }}
          className="text-tics-amber ml-1"
        >
          {uid ? 'Recommended for you' : 'Popular destinations'}
        </SafeText>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Pressable onPress={() => scrollToIndex('left')}>
            <Entypo
              name="arrow-with-circle-left"
              size={24}
              color="#1e56cd"
            />
          </Pressable>
          <Pressable onPress={() => scrollToIndex('right')}>
            <Entypo
              name="arrow-with-circle-right"
              size={24}
              color="#1e56cd"
            />
          </Pressable>
        </View>
      </View>

      {/* Horizontal list */}
      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderCardItem}
        keyExtractor={(item) =>
          item.kind === 'personalized'
            ? `${item.data.countryCode}_${item.data.name}`
            : `fallback_${item.data.countryCode}_${item.data.name}`
        }
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: CARD_SIZE + 10,
          offset: (CARD_SIZE + 10) * index,
          index,
        })}
      />

      {/* Destination Info Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <View className="flex-1 justify-end">
          {/* Backdrop */}
          <TouchableWithoutFeedback onPress={closeModal}>
            <View className="absolute inset-0 bg-black/60" />
          </TouchableWithoutFeedback>

          {/* Sheet */}
          <Animated.View
            style={{
              transform: [{ translateY: slideAnim }],
              maxHeight: SCREEN_HEIGHT * 0.88,
              paddingBottom: insets.bottom + 8,
            }}
            className="bg-[#0a0c18] rounded-t-4xl overflow-hidden"
          >
            {/* Handle */}
            <View className="items-center pt-3 pb-1">
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(148,163,184,0.3)',
                }}
              />
            </View>

            {selectedDest && (
              <ScrollView
                className="px-0"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Hero Image */}
                <View style={{ width: '100%', height: 200, borderTopRightRadius: 30, borderTopLeftRadius: 30, overflow: 'hidden' }}>
                  <Image
                    source={{
                      uri:
                        selectedDest.image ||
                        'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600',
                    }}
                    contentFit="cover"
                    style={{ width: '100%', height: '100%' }}
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(10,12,24,0.95)']}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 80,
                    }}
                  />
                  {/* Close button */}
                  <Pressable
                    onPress={closeModal}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 30,
                      height: 30,
                      borderRadius: 18,
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </Pressable>
                </View>

                <View className="px-2 -mt-8 relative z-10">
                  {/* Title + Score */}
                  <SafeText
                    style={{
                      fontFamily: 'ShareTech_400Regular',
                      color: '#96C7B3',
                      fontSize: 26,
                    }}
                  >
                    {selectedDest.name}
                  </SafeText>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Ionicons name="location" size={14} color="#96C7B3" />
                    <SafeText
                      style={{
                        fontFamily: 'ShareTech_400Regular',
                        color: '#96C7B3',
                        fontSize: 12,
                      }}
                    >
                      {selectedDest.countryCode} · {selectedDest.country} ·{' '}
                      {selectedDest.currency || 'Local'}
                    </SafeText>
                  </View>

                  {/* Score badge */}
                  {selectedDest.score > 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 10,
                        borderRadius: 20,
                        backgroundColor: 'rgba(245,158,11,0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(245,158,11,0.1)',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Ionicons name="trophy" size={14} color="#FBBF24" />
                      <SafeText
                        style={{
                          fontFamily: 'ShareTech_400Regular',
                          color: '#FBBF24',
                          fontSize: 11,
                        }}
                      >
                        Match Score: {selectedDest.score}/110
                      </SafeText>
                    </View>
                  )}

                  {/* AI Insight */}
                  {selectedDest.aiInsight ? (
                    <View
                      style={{
                        marginTop: 14,
                        backgroundColor: 'rgba(139,92,246,0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(139,92,246,0.1)',
                        padding: 14,
                      }}
                      className='rounded-3xl'
                    >
                      <View className="flex-row items-center gap-2 mb-1">
                        <Ionicons
                          name="bulb"
                          size={16}
                          color="#A78BFA"
                        />
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#A78BFA',
                            fontSize: 11,
                          }}
                        >
                          AI TRAVEL INSIGHT
                        </SafeText>
                      </View>
                      <SafeText
                        style={{
                          fontFamily: 'ShareTech_400Regular',
                          color: '#cbd5e1',
                          fontSize: 13,
                          lineHeight: 20,
                        }}
                      >
                        {selectedDest.aiInsight || selectedDest.reason}
                      </SafeText>
                    </View>
                  ) : (
                    /* Reason fallback */
                    <View
                      style={{
                        marginTop: 14,
                        backgroundColor: 'rgba(59,130,246,0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(59,130,246,0.1)',
                        padding: 14,
                      }}
                      className='rounded-3xl'
                    >
                      <SafeText
                        style={{
                          fontFamily: 'ShareTech_400Regular',
                          color: '#cbd5e1',
                          fontSize: 13,
                          lineHeight: 20,
                        }}
                      >
                        {selectedDest.reason}
                      </SafeText>
                    </View>
                  )}

                  {/* Description */}
                  {selectedDest.description && (
                    <View
                      style={{
                        marginTop: 14,
                        backgroundColor: 'rgba(59,130,246,0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(59,130,246,0.1)',
                        padding: 14,
                      }}
                      className='rounded-3xl'
                    >
                      <SafeText
                        style={{
                          fontFamily: 'ShareTech_400Regular',
                          color: '#cbd5e1',
                          fontSize: 13,
                          lineHeight: 20,
                        }}
                      >
                        {selectedDest.description}
                      </SafeText>
                    </View>
                  )}

                  {/* Best Time to Visit */}
                  {selectedDest.bestTimeToVisit && (
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 8,
                        marginTop: 14,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: 'rgba(245,158,11,0.2)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        className='rounded-xl'
                      >
                        <Ionicons name="sunny" size={16} color="#FBBF24" />
                      </View>
                      <View className="flex-1">
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#64748b',
                            fontSize: 10,
                          }}
                        >
                          BEST TIME TO VISIT
                        </SafeText>
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#f8fafc',
                            fontSize: 13,
                          }}
                        >
                          {selectedDest.bestTimeToVisit}
                        </SafeText>
                      </View>
                    </View>
                  )}

                  {/* Quick Info Row */}
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 14,
                    }}
                  >
                    {selectedDest.currency && (
                      <View
                        style={{
                          borderRadius: 20,
                          backgroundColor: 'rgba(59,130,246,0.2)',
                          borderWidth: 1,
                          borderColor: 'rgba(59,130,246,0.1)',
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                        }}
                      >
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#60A5FA',
                            fontSize: 10,
                          }}
                        >
                          {selectedDest.currency}
                        </SafeText>
                      </View>
                    )}
                    {selectedDest.language && (
                      <View
                        style={{
                          borderRadius: 20,
                          backgroundColor: 'rgba(34,197,94,0.2)',
                          borderWidth: 1,
                          borderColor: 'rgba(34,197,94,0.1)',
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                        }}
                      >
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#22C55E',
                            fontSize: 10,
                          }}
                        >
                          {selectedDest.language}
                        </SafeText>
                      </View>
                    )}
                    {selectedDest.timezone && (
                      <View
                        style={{
                          borderRadius: 20,
                          backgroundColor: 'rgba(168,85,247,0.2)',
                          borderWidth: 1,
                          borderColor: 'rgba(168,85,247,0.1)',
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                        }}
                      >
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#A855F7',
                            fontSize: 10,
                          }}
                        >
                          {selectedDest.timezone}
                        </SafeText>
                      </View>
                    )}
                  </View>

                  {/* Score Breakdown */}
                  {selectedDest.scoreBreakdown &&
                    selectedDest.scoreBreakdown.proximity +
                    selectedDest.scoreBreakdown.similarity +
                    selectedDest.scoreBreakdown.season +
                    selectedDest.scoreBreakdown.weather +
                    selectedDest.scoreBreakdown.geminiRanking >
                    0 && (
                      <View style={{ marginTop: 16 }}>
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#f8fafc',
                            fontSize: 14,
                          }}
                        >
                          Why this destination?
                        </SafeText>
                        {selectedDest.scoreBreakdown.proximity > 0 && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 8,
                            }}
                          >
                            <View
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: '#3B82F6',
                              }}
                            />
                            <SafeText
                              style={{
                                fontFamily: 'ShareTech_400Regular',
                                color: '#94a3b8',
                                fontSize: 11,
                              }}
                            >
                              Close to your location (+
                              {selectedDest.scoreBreakdown.proximity})
                            </SafeText>
                          </View>
                        )}
                        {selectedDest.scoreBreakdown.similarity > 0 && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 4,
                            }}
                          >
                            <View
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: '#22C55E',
                              }}
                            />
                            <SafeText
                              style={{
                                fontFamily: 'ShareTech_400Regular',
                                color: '#94a3b8',
                                fontSize: 11,
                              }}
                            >
                              Matches your travel style (+
                              {selectedDest.scoreBreakdown.similarity})
                            </SafeText>
                          </View>
                        )}
                        {selectedDest.scoreBreakdown.season > 0 && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 4,
                            }}
                          >
                            <View
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: '#F59E0B',
                              }}
                            />
                            <SafeText
                              style={{
                                fontFamily: 'ShareTech_400Regular',
                                color: '#94a3b8',
                                fontSize: 11,
                              }}
                            >
                              Great this season (+
                              {selectedDest.scoreBreakdown.season})
                            </SafeText>
                          </View>
                        )}
                      </View>
                    )}

                  {/* Top Attractions */}
                  {selectedDest.topAttractions?.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <SafeText
                        style={{
                          fontFamily: 'ShareTech_400Regular',
                          color: '#f8fafc',
                          fontSize: 14,
                        }}
                      >
                        Top Attractions
                      </SafeText>
                      {selectedDest.topAttractions.map((attraction, i) => (
                        <View
                          key={i}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            marginTop: 8,
                          }}
                        >
                          <LinearGradient
                            colors={[
                              'rgba(59,130,246,0.3)',
                              'rgba(139,92,246,0.2)',
                            ]}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <SafeText
                              style={{
                                fontFamily: 'ShareTech_400Regular',
                                color: '#fff',
                                fontSize: 11,
                              }}
                            >
                              {i + 1}
                            </SafeText>
                          </LinearGradient>
                          <SafeText
                            style={{
                              fontFamily: 'ShareTech_400Regular',
                              color: '#cbd5e1',
                              fontSize: 13,
                            }}
                          >
                            {attraction}
                          </SafeText>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Travel Tips */}
                  {selectedDest.travelTips?.length > 0 && (
                    <View
                      style={{
                        marginTop: 16,
                        borderRadius: 16,
                        backgroundColor: 'rgba(59,130,246,0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(59,130,246,0.1)',
                        padding: 14,
                      }}
                    >
                      <View className="flex-row items-center gap-2 mb-2">
                        <Ionicons
                          name="compass"
                          size={16}
                          color="#60A5FA"
                        />
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#60A5FA',
                            fontSize: 11,
                          }}
                        >
                          TRAVEL TIPS
                        </SafeText>
                      </View>
                      {selectedDest.travelTips.map((tip, i) => (
                        <SafeText
                          key={i}
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#cbd5e1',
                            fontSize: 12,
                            lineHeight: 19,
                            marginTop: i > 0 ? 6 : 0,
                          }}
                        >
                          • {tip}
                        </SafeText>
                      ))}
                    </View>
                  )}

                  {/* Budget Info */}
                  {selectedDest.estimatedBudget && (
                    <View
                      style={{
                        marginTop: 16,
                        borderRadius: 16,
                        backgroundColor: 'rgba(245,158,11,0.2)',
                        borderWidth: 1,
                        borderColor: 'rgba(245,158,11,0.1)',
                        padding: 14,
                      }}
                    >
                      <View className="flex-row items-center gap-2 mb-1">
                        <Ionicons
                          name="wallet"
                          size={16}
                          color="#FBBF24"
                        />
                        <SafeText
                          style={{
                            fontFamily: 'ShareTech_400Regular',
                            color: '#FBBF24',
                            fontSize: 11,
                          }}
                        >
                          ESTIMATED BUDGET
                        </SafeText>
                      </View>
                      <SafeText
                        style={{
                          fontFamily: 'ShareTech_400Regular',
                          color: '#cbd5e1',
                          fontSize: 12,
                          lineHeight: 19,
                        }}
                      >
                        {selectedDest.estimatedBudget.currency}{' '}
                        {selectedDest.estimatedBudget.min.toLocaleString()} –{' '}
                        {selectedDest.estimatedBudget.currency}{' '}
                        {selectedDest.estimatedBudget.max.toLocaleString()}
                      </SafeText>
                    </View>
                  )}

                  <View style={{ height: 40 }} />
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}