/**
 * NearMePlaceDetail.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Place detail modal/screen for the Near Me experience.
 * Shows hero image, photo gallery, description, address, opening hours,
 * Google Rating, reviews, phone, website, directions, travel time,
 * nearby places, weather, and action buttons.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NearbyPlace } from '@/src/modules/explore/types/nearme';
import { SafeText } from '@/src/components/responsive/SafeText';

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface NearMePlaceDetailProps {
  place: NearbyPlace;
  onClose: () => void;
  onCoordinateJourney: (place: NearbyPlace) => void;
  onSave: (place: NearbyPlace) => void;
  onShare: (place: NearbyPlace) => void;
  onDirections: (place: NearbyPlace, mode: 'walking' | 'driving') => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ── Component ──────────────────────────────────────────────────────────────── */

function NearMePlaceDetailComponent({
  place,
  onClose,
  onCoordinateJourney,
  onSave,
  onShare,
  onDirections,
}: NearMePlaceDetailProps) {
  const [showFullDescription, setShowFullDescription] = useState(false);

  const handleCall = useCallback(() => {
    if (place.phone) {
      Linking.openURL(`tel:${place.phone}`);
    }
  }, [place.phone]);

  const handleWebsite = useCallback(() => {
    if (place.website) {
      Linking.openURL(place.website);
    }
  }, [place.website]);

  const handleDirections = useCallback((mode: 'walking' | 'driving') => {
    onDirections(place, mode);
  }, [onDirections, place]);

  const handleCoordinate = useCallback(() => onCoordinateJourney(place), [onCoordinateJourney, place]);
  const handleSave = useCallback(() => onSave(place), [onSave, place]);
  const handleShare = useCallback(() => onShare(place), [onShare, place]);

  const distanceText = place.distance < 1
    ? `${Math.round(place.distance * 1000)}m`
    : `${place.distance.toFixed(1)}km`;

  return (
    <View className="flex-1 bg-[#0a0b1e] p-1">
      {/* Header */}
      <View className="relative">
        <Image
          source={{ uri: place.imageUrl }}
          className="w-full h-64 rounded-4xl"
          defaultSource={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==' }}
        />
        <View className="absolute inset-0 bg-black/30 rounded-4xl" />

        {/* Close button */}
        <TouchableOpacity
          style={{ width: 46, height: 46 }}
          className="absolute top-5 left-4 w-10 h-10 rounded-full bg-tics-amber/50 items-center justify-center"
          onPress={onClose}
        >
          <Ionicons name="close" size={22} color="#FFF" />
        </TouchableOpacity>

        {/* Action buttons overlay */}
        <View className="absolute top-5 right-4 flex-row gap-2">
          <TouchableOpacity
            style={{ width: 46, height: 46 }}
            className="rounded-full bg-tics-amber/50 items-center justify-center"
            onPress={handleSave}
          >
            <Ionicons name="bookmark-outline" size={20} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ width: 46, height: 46 }}
            className="rounded-full bg-tics-amber/50 items-center justify-center"
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Bottom gradient overlay with name */}
        <View className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <SafeText className="text-white text-2xl font-sharetech">{place.name}</SafeText>
          <View className="flex-row items-center gap-2 mt-1">
            <View className="flex-row items-center">
              <Ionicons name="star" size={16} color="#FDCB6E" />
              <SafeText className="text-yellow-400 text-[14px] font-sharetech ml-1">
                {place.rating.toFixed(1)}
              </SafeText>
            </View>
            <SafeText className="text-gray-400 text-[13px] font-sharetech">
              ({place.reviewCount} reviews)
            </SafeText>
            {place.priceLevel > 0 && (
              <SafeText className="text-gray-400 text-[13px] font-sharetech">{place.priceRange}</SafeText>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {/* Status badges */}
        <View className="flex-row flex-wrap gap-2 px-2 pt-4">
          {place.isOpen && (
            <View className="bg-green-500/20 rounded-full px-3 py-1.5 flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-green-500" />
              <SafeText className="text-green-400 text-[12px] font-medium font-sharetech">Open Now</SafeText>
            </View>
          )}
          {!place.isOpen && place.openingHours && (
            <View className="bg-red-500/20 rounded-full px-3 py-1.5 flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-red-500" />
              <SafeText className="text-red-400 text-[12px] font-medium font-sharetech">Closed</SafeText>
            </View>
          )}
          {place.isFree && (
            <View className="bg-[#3B82F6]/20 rounded-full px-3 py-1.5">
              <SafeText className="text-[#3B82F6] text-[12px] font-medium font-sharetech">Free Entry</SafeText>
            </View>
          )}
          {place.isFamilyFriendly && (
            <View className="bg-purple-500/20 rounded-full px-3 py-1.5">
              <SafeText className="text-purple-400 text-[12px] font-medium">Family Friendly</SafeText>
            </View>
          )}
        </View>

        {/* Distance & Travel Time */}
        <View className="flex-row items-center gap-4 px-2 mt-4">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="location-outline" size={18} color="#3B82F6" />
            <SafeText className="text-gray-300 text-[14px] font-sharetech">{distanceText} away</SafeText>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="walk-outline" size={18} color="#888" />
            <SafeText className="text-gray-400 text-[13px] font-sharetech">{place.travelTime.walking} min walk</SafeText>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="car-outline" size={18} color="#888" />
            <SafeText className="text-gray-400 text-[13px] font-sharetech">{place.travelTime.driving} min drive</SafeText>
          </View>
        </View>

        {/* Address */}
        <View className="flex-row items-start gap-2 px-2 mt-4">
          <Ionicons name="map-outline" size={18} color="#888" style={{ marginTop: 2 }} />
          <SafeText className="text-gray-400 text-[13px] font-sharetech flex-1">{place.address}</SafeText>
        </View>

        {/* Description */}
        {place.description && (
          <View className="px-2 mt-4">
            <SafeText className="text-white text-[16px] font-sharetech mb-2">About</SafeText>
            <SafeText
              className="text-gray-400 text-[13px] font-sharetech leading-5"
              numberOfLines={showFullDescription ? undefined : 3}
            >
              {place.description}
            </SafeText>
            {place.description.length > 150 && (
              <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
                <SafeText className="text-[#3B82F6] text-[13px] mt-1">
                  {showFullDescription ? 'Show less' : 'Read more'}
                </SafeText>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Opening Hours */}
        {place.openingHours?.weekdayText && place.openingHours.weekdayText.length > 0 && (
          <View className="px-2 mt-4">
            <SafeText className="text-white text-[16px] font-sharetech mb-2">Opening Hours</SafeText>
            {place.openingHours.weekdayText.map((day, index) => (
              <SafeText key={index} className="text-gray-400 text-[13px] font-sharetech leading-6">{day}</SafeText>
            ))}
          </View>
        )}

        {/* Contact */}
        {(place.phone || place.website) && (
          <View className="px-2 mt-4">
            <SafeText className="text-white text-[16px] font-sharetech mb-2">Contact</SafeText>
            {place.phone && (
              <TouchableOpacity
                className="flex-row items-center gap-2 mb-2"
                onPress={handleCall}
              >
                <Ionicons name="call-outline" size={18} color="#3B82F6" />
                <SafeText className="text-[#3B82F6] font-sharetech text-[13px]">{place.phone}</SafeText>
              </TouchableOpacity>
            )}
            {place.website && (
              <TouchableOpacity
                className="flex-row items-center gap-2"
                onPress={handleWebsite}
              >
                <Ionicons name="globe-outline" size={18} color="#3B82F6" />
                <SafeText className="text-[#3B82F6] font-sharetech text-[13px]" numberOfLines={1}>{place.website}</SafeText>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Tags */}
        {place.tags.length > 0 && (
          <View className="px-2 mt-4">
            <SafeText className="text-white text-[16px] font-sharetech mb-2">Tags</SafeText>
            <View className="flex-row flex-wrap gap-2">
              {place.tags.slice(0, 8).map((tag, index) => (
                <View key={index} className="bg-white/[0.07] rounded-full px-3 py-1.5">
                  <SafeText className="text-gray-400 text-[11px] font-sharetech capitalize">{tag.replace(/_/g, ' ')}</SafeText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Events */}
        {place.events && place.events.length > 0 && (
          <View className="px-4 mt-4">
            <SafeText className="text-white text-[16px] font-semibold mb-2">Nearby Events</SafeText>
            {place.events.map(event => (
              <View key={event.id} className="bg-white/[0.05] rounded-xl p-3 mb-2">
                <SafeText className="text-white text-[14px] font-medium">{event.title}</SafeText>
                <SafeText className="text-gray-400 text-[12px] mt-1">{event.description}</SafeText>
                <View className="flex-row items-center gap-2 mt-1.5">
                  <Ionicons name="calendar-outline" size={14} color="#888" />
                  <SafeText className="text-gray-500 text-[11px]">
                    {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                  </SafeText>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View className="bg-[#0a0b1e] border-t border-white/[0.08] py-3 pb-3">
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            className="flex-1 bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 items-center flex-row justify-center gap-2"
            onPress={handleCoordinate}
          >
            <Ionicons name="navigate-outline" size={18} color="#FFF" />
            <SafeText className="text-white text-[15px] font-sharetech">Coordinate Journey</SafeText>
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center gap-2 mt-2">
          <TouchableOpacity
            className="flex-1 bg-white/[0.08] rounded-full py-4 items-center flex-row justify-center gap-1.5"
            onPress={() => handleDirections('walking')}
          >
            <Ionicons name="walk-outline" size={16} color="#F8FAFC" />
            <SafeText className="text-gray-300 text-[13px] font-sharetech">Walk ({place.travelTime.walking}min)</SafeText>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-white/[0.08] rounded-full py-4 items-center flex-row justify-center gap-1.5"
            onPress={() => handleDirections('driving')}
          >
            <Ionicons name="car-outline" size={16} color="#F8FAFC" />
            <SafeText className="text-gray-300 text-[13px] font-sharetech">Drive ({place.travelTime.driving}min)</SafeText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export const NearMePlaceDetail = memo(NearMePlaceDetailComponent);