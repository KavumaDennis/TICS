/**
 * DestinationDetailScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Rich destination detail screen with image gallery, overview, weather,
 * best time, travel tips, nearby places, events, map, reviews, related
 * destinations, emergency contacts, travel requirements, packing suggestions,
 * AI insights, and a bottom sticky "Coordinate My Journey" button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  FlatList,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDestinationDetail } from '@/src/modules/explore/hooks/useDestinationDetail';
import { useExploreAnalytics } from '@/src/modules/explore/hooks/useExploreAnalytics';
import { ExploreScreenSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import type { Destination } from '@/src/modules/explore/types';
// import { Text } from '@/src/components/responsive/Text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 300;

interface DestinationDetailScreenProps {
  destinationId: string;
  onCoordinateJourney: (destination: Destination) => void;
  onBack: () => void;
}

export function DestinationDetailScreen({
  destinationId,
  onCoordinateJourney,
  onBack,
}: DestinationDetailScreenProps) {
  const {
    destination,
    events,
    relatedDestinations,
    loading,
    error,
    saving,
    isSaved,
    saveDestination,
    unsaveDestination,
    refresh,
  } = useDestinationDetail(destinationId);

  const analytics = useExploreAnalytics();
  const scrollRef = useRef<ScrollView>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const handleCoordinateJourney = useCallback(() => {
    if (!destination) return;
    analytics.trackCoordinateJourney(destination.id, destination.name);
    onCoordinateJourney(destination);
  }, [destination, analytics, onCoordinateJourney]);

  const handleSaveToggle = useCallback(async () => {
    if (!destination) return;
    if (isSaved) {
      await unsaveDestination();
    } else {
      await saveDestination();
    }
  }, [destination, isSaved, saveDestination, unsaveDestination]);

  if (loading && !destination) {
    return (
      <View className="flex-1">
        {/* <View className="absolute top-0 left-0 right-0 z-10 flex-row justify-between px-4 py-2">
          <TouchableOpacity onPress={onBack} className="w-10 h-10 justify-center items-center rounded-full bg-black/30">
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View className="w-10" />
        </View> */}
        <ExploreScreenSkeleton />
      </View>
    );
  }

  if (error || !destination) {
    return (
      <View className="flex-1 bg-[#0a0b1e] p-1">
        <View className="absolute top-1 left-1 right-1 z-10 p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
          <TouchableOpacity
            onPress={onBack}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text className="text-lg font-sharetech text-white">Destination</Text>
          <View className="w-10" />
        </View>
        <View className="flex-1 justify-center items-center p-8">
          <Text className="text-lg font-sharetech text-gray-400 mb-4">{error || 'Destination not found'}</Text>
          <TouchableOpacity className="bg-tics-amber/35 border border-tics-amber/20 rounded-full px-8 py-6" onPress={refresh}>
            <Text className="text-white font-sharetech">Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0a0b1e] p-1">
      {/* Hero Image Gallery with fallback */}
      <View className="relative">
        {(destination.images && destination.images.length > 0) ? (
          <>
            <FlatList
              data={destination.images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveImageIndex(index);
              }}
              contentContainerStyle={{ paddingBottom: 0 }}
              keyExtractor={(_, i) => `img-${i}`}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item.url }}
                  className="w-full h-72 rounded-2xl"
                  resizeMode="cover"
                />
              )}
            />
            <View className="absolute bottom-4 left-0 right-0 flex-row justify-center gap-2">
              {destination.images.map((_, i) => (
                <View key={i} className={`w-2 h-2 rounded-full ${i === activeImageIndex ? 'bg-white' : 'bg-white/50'}`} />
              ))}
            </View>
          </>
        ) : (
          <View className="w-full h-72 bg-tics-amber/10 items-center justify-center rounded-[30px]">
            <Ionicons name="image-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text className="text-tics-muted font-sharetech mt-2">{destination.name}</Text>
          </View>
        )}
      </View>

      {/* Main Content */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-"
      >
        {/* Title & Actions */}
        <View className="px-1 mt-4 flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-2xl font-sharetech text-tics-text">{destination.name}</Text>
            <View className="flex-row items-center gap-2 mt-2">
              <View className="flex-row items-center gap-1">
                <Ionicons name="star" size={16} color="#F59E0B" />
                <Text className="text-sm font-sharetech text-gray-700">{destination.rating?.toFixed(1) || 'N/A'}</Text>
              </View>
              {(destination.reviewCount || 0) > 0 && (
                <Text className="text-sm font-sharetech text-tics-muted">({destination.reviewCount} reviews)</Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleSaveToggle}
            className="w-12 h-12 rounded-full bg-tics-amber/20 border border-tics-amber/10 justify-center items-center"
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={isSaved ? '#0984E3' : '#666'}
            />
          </TouchableOpacity>
        </View>

        {/* Categories */}
        {destination.categories && destination.categories.length > 0 && (
          <View className="px-1 mt-4 flex-row flex-wrap gap-2">
            {destination.categories.map((cat, i) => (
              <View key={i} className="bg-[#0984E3]/10 rounded-full px-3 py-1">
                <Text className="text-xs font-sharetech text-[#0984E3]">{cat}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        {destination.description && (
          <View className="px-1 mt-5">
            <Text className="text-base font-sharetech text-gray-700 leading-6">
              {showFullDescription ? destination.description : `${destination.description.slice(0, 200)}${destination.description.length > 200 ? '...' : ''}`}
            </Text>
            {destination.description.length > 200 && (
              <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
                <Text className="text-[#0984E3] font-semibold mt-2">
                  {showFullDescription ? 'Show less' : 'Read more'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Best Time to Visit */}
        {destination.bestTimeToVisit && (
          <View className="px-1 mt-5">
            <Text className="text-lg font-sharetech text-tics-text mb-2">Best Time to Visit</Text>
            <View className="flex-row items-center gap-3 bg-tics-amber/20 rounded-2xl p-4">
              <View className="w-10 h-10 rounded-full bg-amber-100 justify-center items-center">
                <Ionicons name="sunny-outline" size={20} color="#F59E0B" />
              </View>
              <Text className="text-base font-sharetech text-tics-muted flex-1">{destination.bestTimeToVisit}</Text>
            </View>
          </View>
        )}

        {/* Weather */}
        {destination.weatherSummary && (
          <View className="px-1 mt-5">
            <Text className="text-lg font-sharetech text-tics-text mb-2">Weather</Text>
            <View className="flex-row items-center gap-3 bg-blue-50 rounded-xl p-4">
              <View className="w-10 h-10 rounded-full bg-blue-100 justify-center items-center">
                <Ionicons name="partly-sunny-outline" size={20} color="#0984E3" />
              </View>
              <Text className="text-base text-gray-700 flex-1">
                {typeof destination.weatherSummary === 'string'
                  ? destination.weatherSummary
                  : JSON.stringify(destination.weatherSummary)}
              </Text>
            </View>
          </View>
        )}

        {/* Travel Tips */}
        {destination.travelTips && destination.travelTips.length > 0 && (
          <View className="px-1 mt-5">
            <Text className="text-lg font-sharetech text-tics-text mb-3">Travel Tips</Text>
            <View className="bg-tics-amber/20 rounded-2xl p-4 gap-3">
              {destination.travelTips.map((tip, i) => {
                const tipText = typeof tip === 'string' ? tip : JSON.stringify(tip);
                return (
                  <View key={i} className="flex-row items-start gap-3">
                    <View className="w-6 h-6 rounded-full bg-[#0984E3]/20 justify-center items-center mt-0.5">
                      <Text className="text-xs font-sharetech text-[#0984E3]">{i + 1}</Text>
                    </View>
                    <Text className="flex-1 text-base font-sharetech text-tics-muted leading-6">{tipText}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* AI Insights */}
        <View className="px-1 mt-5">
          <Text className="text-lg font-sharetech text-tics-text mb-3">AI Insights</Text>
          <View className="bg-tics-amber/20 rounded-2xl p-4 flex-row items-start gap-3">
            <View className="w-8 h-8 rounded-full bg-[#6C5CE7]/20 justify-center items-center">
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
            </View>
            <Text className="flex-1 text-base text-tics-muted font-sharetech leading-6">
              {destination.name} is a popular destination with a rating of {destination.rating?.toFixed(1) || 'N/A'}/5.
              {destination.bestSeason ? ` Best visited during ${destination.bestSeason}.` : ''}
              {destination.popularity ? ` Ranked #${Math.round(destination.popularity)} in popularity.` : ''}
            </Text>
          </View>
        </View>

        {/* Nearby Attractions */}
        {destination.nearbyAttractions && destination.nearbyAttractions.length > 0 && (
          <View className="px-4 mt-5">
            <Text className="text-lg font-bold text-gray-900 mb-3">Nearby Attractions</Text>
            <View className="gap-3">
              {destination.nearbyAttractions.map((attr, i) => (
                <View key={i} className="flex-row items-center gap-3 bg-tics-amber/20 rounded-xl p-4">
                  <View className="w-10 h-10 rounded-full bg-[#0984E3]/10 justify-center items-center">
                    <Ionicons name="location-outline" size={20} color="#0984E3" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-sharetech text-tics-text">{attr.name}</Text>
                    {attr.distance && <Text className="text-sm text-gray-500">{attr.distance} km away</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Nearby Hotels */}
        {destination.nearbyHotels && destination.nearbyHotels.length > 0 && (
          <View className="px-4 mt-5">
            <Text className="text-lg font-bold text-gray-900 mb-3">Nearby Hotels</Text>
            <View className="gap-3">
              {destination.nearbyHotels.map((hotel, i) => (
                <View key={i} className="flex-row items-center gap-3 bg-tics-amber/20 rounded-xl p-4">
                  <View className="w-10 h-10 rounded-full bg-[#00B894]/10 justify-center items-center">
                    <Ionicons name="bed-outline" size={20} color="#00B894" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-sharetech text-tics-text">{hotel.name}</Text>
                    {hotel.rating && (
                      <View className="flex-row items-center gap-1 mt-1">
                        <Ionicons name="star" size={14} color="#F59E0B" />
                        <Text className="text-sm text-gray-600">{hotel.rating}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Travel Requirements */}
        {destination.travelRequirements && destination.travelRequirements.length > 0 && (
          <View className="px-4 mt-5">
            <Text className="text-lg font-sharetech text-tics-text mb-3">Travel Requirements</Text>
            <View className="bg-tics-amber/20 rounded-xl p-4 gap-2">
              {destination.travelRequirements.map((req, i) => {
                const reqText = typeof req === 'string' ? req : JSON.stringify(req);
                return (
                  <View key={i} className="flex-row items-start gap-2">
                    <Ionicons name="checkmark-circle-outline" size={20} color="#00B894" />
                    <Text className="flex-1 text-base font-sharetech text-tics-text">{reqText}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Emergency Contacts */}
        {destination.emergencyContacts && destination.emergencyContacts.length > 0 && (
          <View className="px-4 mt-5">
            <Text className="text-lg font-bold text-gray-900 mb-3">Emergency Contacts</Text>
            <View className="bg-red-50 rounded-xl p-4 gap-3">
              {destination.emergencyContacts.map((contact, i) => (
                <View key={i} className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-red-100 justify-center items-center">
                    <Ionicons name="call-outline" size={20} color="#EF4444" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-sharetech text-tics-text">{contact.name}</Text>
                    {contact.phone && <Text className="text-sm font-sharetech text-tics-muted">{contact.phone}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Related Destinations */}
        {relatedDestinations.length > 0 && (
          <View className="px-4 mt-5">
            <Text className="text-lg font-sharetech text-tics-text mb-3">Related Destinations</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3">
                {relatedDestinations.map((rel) => (
                  <TouchableOpacity
                    key={rel.id}
                    className="w-40 bg-tics-amber/20 rounded-2xl overflow-hidden"
                  >
                    <Image
                      source={{ uri: rel.images?.[0]?.url || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400' }}
                      className="w-full h-32"
                      resizeMode="cover"
                    />
                    <View className="p-3">
                      <Text className="text-sm font-semibold text-gray-900" numberOfLines={2}>{rel.name}</Text>
                      {rel.rating && (
                        <View className="flex-row items-center gap-1 mt-1">
                          <Ionicons name="star" size={12} color="#F59E0B" />
                          <Text className="text-xs text-gray-600">{rel.rating.toFixed(1)}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Upcoming Events */}
        {events.length > 0 && (
          <View className="px-4 mt-5">
            <Text className="text-lg font-sharetech text-tics-text mb-3">Upcoming Events</Text>
            <View className="gap-3">
              {events.slice(0, 5).map((event) => (
                <View key={event.id} className="bg-tics-amber/25 rounded-xl p-4">
                  <Text className="text-base font-sharetech text-tics-text">{event.title}</Text>
                  <View className="flex-row items-center gap-2 mt-2">
                    <Ionicons name="calendar-outline" size={16} color="#0984E3" />
                    <Text className="text-sm text-gray-600">
                      {new Date(event.startDate).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </Text>
                  </View>
                  {event.venue && (
                    <View className="flex-row items-center gap-2 mt-1">
                      <Ionicons name="location-outline" size={16} color="#6C5CE7" />
                      <Text className="text-sm text-gray-600">{event.venue.name}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="h-10" />
      </ScrollView>

      {/* Bottom CTA */}
      <View className="pt-2">
        <TouchableOpacity
          className="bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 flex-row justify-center items-center gap-2"
          onPress={handleCoordinateJourney}
        >
          <Ionicons name="navigate-outline" size={20} color="#FFF" />
          <Text className="text-base font-sharetech text-tics-text">Coordinate My Journey</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}