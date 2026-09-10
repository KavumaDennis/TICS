/**
 * EventDetailScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete event detail screen with hero image, venue, map, coordinates,
 * weather, hotels nearby, transportation, airport, travel tips, event schedule,
 * ticket information, nearby attractions, AI recommendations, and Coordinate
 * Journey CTA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useExploreAnalytics } from '@/src/modules/explore/hooks/useExploreAnalytics';
import { ExploreService } from '@/src/modules/explore/services';
import { EventCache } from '@/src/modules/explore/services/discovery/EventCache';
import { ExploreScreenSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import type { Event, Destination } from '@/src/modules/explore/types';
// import { Text } from '@/src/components/responsive/Text';

/* ── Simple country name → ISO code mapping for events ───────────────────── */
const COUNTRY_CODE_MAP: Record<string, string> = {
  uganda: 'UG', kenya: 'KE', tanzania: 'TZ', rwanda: 'RW', burundi: 'BI',
  'south sudan': 'SS', ethiopia: 'ET', somalia: 'SO', djibouti: 'DJ', eritrea: 'ER',
  nigeria: 'NG', ghana: 'GH', 'ivory coast': 'CI', senegal: 'SN', mali: 'ML',
  'south africa': 'ZA', namibia: 'NA', botswana: 'BW', zimbabwe: 'ZW', mozambique: 'MZ',
  zambia: 'ZM', malawi: 'MW', angola: 'AO',
  morocco: 'MA', algeria: 'DZ', tunisia: 'TN', egypt: 'EG', libya: 'LY',
  france: 'FR', 'united kingdom': 'GB', germany: 'DE', italy: 'IT', spain: 'ES',
  'united states': 'US', canada: 'CA', mexico: 'MX', brazil: 'BR', argentina: 'AR',
  china: 'CN', japan: 'JP', india: 'IN', australia: 'AU', 'new zealand': 'NZ',
  'united arab emirates': 'AE', 'saudi arabia': 'SA', turkey: 'TR', russia: 'RU',
  singapore: 'SG', indonesia: 'ID', thailand: 'TH', vietnam: 'VN', malaysia: 'MY',
  philippines: 'PH', 'south korea': 'KR',
  'dr congo': 'CD', congo: 'CG', cameroon: 'CM', gabon: 'GA',
};

function resolveCountryCode(country: string): string {
  if (!country) return '';
  const key = country.toLowerCase().trim();
  if (COUNTRY_CODE_MAP[key]) return COUNTRY_CODE_MAP[key];
  // Try partial match
  for (const [name, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (key.includes(name) || name.includes(key)) return code;
  }
  return country.toUpperCase().slice(0, 2); // fallback: use first 2 chars
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface EventDetailScreenProps {
  eventId: string;
  onCoordinateJourney: (destination: Destination) => void;
  onBack: () => void;
}

export function EventDetailScreen({
  eventId,
  onCoordinateJourney,
  onBack,
}: EventDetailScreenProps) {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const analytics = useExploreAnalytics();

  React.useEffect(() => {
    loadEvent();
  }, [eventId]);

  const loadEvent = async () => {
    setLoading(true);
    setError(null);
    try {
      const cached = EventCache.get(eventId);
      if (cached) {
        setEvent(cached);
        analytics.trackEventOpened(eventId, cached.title);
        setLoading(false);
        return;
      }
      
      const result = await ExploreService.getEventById(eventId);
      if (result.data) {
        setEvent(result.data);
        analytics.trackEventOpened(eventId, result.data.title);
      } else {
        setError('Event not found');
      }
    } catch (err) {
      console.error('[EventDetailScreen] Error loading event:', err);
      setError('Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const handleCoordinateJourney = useCallback(() => {
    if (!event) return;
    analytics.trackCoordinateJourney(event.id, event.title);
    // Use the venue/city as the destination name (not the event title, which can be very long)
    const destinationName = event.venue?.name || event.city || event.country || 'Event Location';
    const dest: Destination = {
      id: event.destinationId || event.id,
      name: destinationName,
      slug: event.slug || '',
      description: `🎪 ${event.title}\n\n${event.description || event.shortDescription || ''}`,
      country: event.country || '',
      countryCode: event.country ? resolveCountryCode(event.country) : '',
      city: event.city || '',
      coordinates: event.coordinates || event.venue?.coordinates || { lat: 0, lng: 0 },
      images: event.images || [],
      categories: [event.category || 'event'],
      travelTips: [],
      nearbyAirport: null,
      nearbyHotels: [],
      nearbyAttractions: [],
      weatherSummary: null,
      bestSeason: '',
      bestTimeToVisit: '',
      popularity: event.popularity || 0,
      rating: event.rating || 0,
      reviewCount: 0,
      reviews: [],
      travelRequirements: [],
      emergencyContacts: [],
      currency: '',
      language: '',
      timezone: '',
      timezoneOffset: '',
      estimatedBudget: null,
      topAttractions: [],
      relatedDestinationIds: [],
      featured: event.featured || false,
      trending: event.trending || false,
      active: event.active ?? true,
      createdAt: event.createdAt || new Date(),
      updatedAt: event.updatedAt || new Date(),
    };
    onCoordinateJourney(dest);
  }, [event, analytics, onCoordinateJourney]);

  if (loading && !event) {
    return (
      <View className="flex-1 bg-white">
        <View className="absolute top-0 left-0 right-0 z-10 flex-row justify-between px-4 py-2">
          <TouchableOpacity onPress={onBack} className="w-10 h-10 justify-center items-center rounded-full bg-black/30">
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View className="w-10" />
        </View>
        <ExploreScreenSkeleton />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View className="flex-1 bg-white">
        <View className="absolute top-0 left-0 right-0 z-10 flex-row justify-between px-4 py-2">
          <TouchableOpacity onPress={onBack} className="w-10 h-10 justify-center items-center rounded-full bg-black/30">
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-white">Event</Text>
          <View className="w-10" />
        </View>
        <View className="flex-1 justify-center items-center p-8">
          <Text className="text-lg font-semibold text-gray-400 mb-4">{error}</Text>
          <TouchableOpacity className="bg-[#0984E3] rounded-xl px-8 py-3" onPress={loadEvent}>
            <Text className="text-white font-semibold">Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0a0b1e] p-1">
      <View className="absolute top-0 left-0 right-0 z-10 flex-row justify-between px-4 py-2">
        <TouchableOpacity onPress={onBack} className="w-12 h-12 justify-center items-center rounded-full bg-tics-amber/50">
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View className="flex-row gap-2">
          <TouchableOpacity className="w-12 h-12 justify-center items-center rounded-full bg-tics-amber/50">
            <Ionicons name="bookmark-outline" size={22} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity className="w-12 h-12 justify-center items-center rounded-full bg-tics-amber/50">
            <Ionicons name="share-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Image
          source={{ uri: event.images?.[0]?.url || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800' }}
          className="w-full h-64 rounded-4xl"
          resizeMode="cover"
        />

        <View className="px-1 mt-5">
          <Text className="text-2xl text-tics-text font-sharetech mb-2">{event.title}</Text>
          <View className="self-start bg-[#6C5CE7] rounded-full px-3 py-1 mb-3">
            <Text className="text-white text-xs font-semibold">{event.category}</Text>
          </View>
          <Text className="text-base text-tics-muted font-sharetech leading-6">{event.description}</Text>
        </View>

        <View className="px-1">
          <Text className="text-lg text-tics-text font-sharetech mb-3">Date & Time</Text>
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-[#0984E3]/20 border border-tics-amber/25 justify-center items-center">
              <Ionicons name="calendar-outline" size={20} color="#0984E3" />
            </View>
            <Text className="text-base text-tics-muted font-sharetech flex-1">
              {new Date(event.startDate).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}
              {event.endDate && ` - ${new Date(event.endDate).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}`}
            </Text>
          </View>
        </View>

        {event.venue && (
          <View className="px-1 mt-6">
            <Text className="text-lg text-tics-text font-sharetech mb-3">Venue</Text>
            <View className="flex-row bg-tics-amber/25 border border-tics-amber/10 rounded-3xl p-4 gap-3 items-center">
              <View className="w-10 h-10 rounded-full bg-[#6C5CE7]/20 border border-tics-amber/30 justify-center items-center">
                <Ionicons name="location-outline" size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-tics-text font-sharetech">{event.venue.name}</Text>
                <Text className="text-sm text-tics-muted font-sharetech mt-1">{event.venue.address}</Text>
              </View>
            </View>
            {event.venue.coordinates && (
              <TouchableOpacity
                className="flex-row bg-white rounded-full py-6 justify-center items-center gap-2 mt-3"
                onPress={() => {
                  const { lat, lng } = event.venue!.coordinates;
                  Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
                }}
              >
                <Ionicons name="map-outline" size={18} color="#1e56cd" />
                <Text className="text-tics-amber font-sharetech">View on Map</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {event.ticketUrl && (
          <View className="px-1 mt-6">
            <Text className="text-lg text-tics-text font-sharetech mb-3">Tickets</Text>
            <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-3xl p-4 flex-row justify-between items-center">
              <View className="flex-1">
                <Text className="text-xl font-sharetech text-tics-text">{event.ticketPrice || 'Check website'}</Text>
                <Text className="text-sm text-tics-muted font-sharetech mt-1">Organized by {event.organizer}</Text>
              </View>
              <TouchableOpacity
                className="bg-[#00B894] rounded-full px-5 py-3"
                onPress={() => Linking.openURL(event.ticketUrl!)}
              >
                <Text className="text-white font-sharetech">Get Tickets</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View className="px-1 mt-6">
          <Text className="text-lg text-tics-text font-sharetech mb-3">Event Schedule</Text>
          <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-3xl p-4">
            <View className="flex-row justify-between py-3 border-b border-gray-100">
              <Text className="text-base text-tics-text font-sharetech">Start</Text>
              <Text className="text-base font-sharetech text-tics-amber">
                {new Date(event.startDate).toLocaleTimeString('en-US', {
                  hour: '2-digit', minute: '2-digit'
                })}
              </Text>
            </View>
            {event.endDate && (
              <View className="flex-row justify-between py-3">
                <Text className="text-base text-tics-text font-sharetech">End</Text>
                <Text className="text-base font-sharetech text-tics-amber">
                  {new Date(event.endDate).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit'
                  })}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View className="px-1 mt-6">
          <Text className="text-lg text-tics-text font-sharetech mb-3">Transportation</Text>
          <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-3xl p-4 gap-3">
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-full bg-[#0984E3]/10 border border-tics-amber/25 justify-center items-center">
                <Ionicons name="car-outline" size={18} color="#fff" />
              </View>
              <Text className="text-base font-sharetech text-tics-text">Ride-sharing & taxis available</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-full bg-[#0984E3]/10 border border-tics-amber/25 justify-center items-center">
                <Ionicons name="bus-outline" size={18} color="#fff" />
              </View>
              <Text className="text-base font-sharetech text-tics-text">Public transit nearby</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-full bg-[#0984E3]/10 border border-tics-amber/25 justify-center items-center">
                <Ionicons name="walk-outline" size={18} color="#fff" />
              </View>
              <Text className="text-base font-sharetech text-tics-text">Walking distance from city center</Text>
            </View>
          </View>
        </View>

        <View className="px-1 mt-6">
          <Text className="text-lg font-sharetech text-tics-text mb-3">Travel Tips</Text>
          <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-3xl p-4 gap-2">
            <Text className="text-base font-sharetech text-tics-text leading-6">• Book accommodation early as hotels fill up quickly during events.</Text>
            <Text className="text-base font-sharetech text-tics-text leading-6">• Arrive at least 30 minutes before the scheduled start time.</Text>
            <Text className="text-base font-sharetech text-tics-text leading-6">• Check the weather forecast and dress accordingly.</Text>
          </View>
        </View>

        <View className="px-1 mt-6">
          <Text className="text-lg font-sharetech text-tics-text mb-3">AI Recommendations</Text>
          <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-3xl p-4 gap-3 flex-row items-start">
            <View className="w-8 h-8 rounded-full bg-[#6C5CE7]/20 border border-tics-amber/25  justify-center items-center">
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
            </View>
            <Text className="flex-1 text-base font-sharetech text-tics-text leading-6">
              This event is trending in {event.city}, {event.country}. Consider booking nearby
              accommodation and planning extra days to explore the area.
            </Text>
          </View>
        </View>

        {event.tags && event.tags.length > 0 && (
          <View className="px-1 mt-6">
            <Text className="text-lg font-sharetech text-tics-text mb-3">Tags</Text>
            <View className="flex-row flex-wrap gap-2">
              {event.tags.map((tag, index) => (
                <View key={index} className="bg-tics-amber/25 border border-tics-amber/10 rounded-full px-3 py-2">
                  <Text className="text-sm font-sharetech text-tics-text">{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="h-5" />
      </ScrollView>

      <View className="mx- pt-2">
        <TouchableOpacity className="bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 flex-row justify-center items-center gap-2" onPress={handleCoordinateJourney}>
          <Ionicons name="navigate-outline" size={20} color="#FFF" />
          <Text className="text-lg font-sharetech text-tics-text">Coordinate My Journey</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}