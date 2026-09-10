/**
 * JourneyFeedGenerator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic Journey Feed Generator.
 *
 * Replaces the static Firestore feed with a dynamically generated feed from:
 *   - Destinations (trending, popular, seasonal)
 *   - Events (upcoming, trending)
 *   - Weather (forecast-based recommendations)
 *   - Trending scores
 *   - Recommendations
 *   - User Activity (recently coordinated journeys)
 *   - Price changes (simulated)
 *   - Seasonal events
 *
 * Examples:
 *   "Sunny weekend expected in Zanzibar ☀️"
 *   "Flights to Nairobi dropped 18% ✈️"
 *   "Nyege Nyege starts this Friday 🎵"
 *   "Cape Town is trending this week 📈"
 *   "Perfect hiking weather in Sipi Falls 🏔️"
 *   "Lake Bunyonyi is the most saved destination today 💾"
 *
 * Gemini may rewrite headlines for engagement.
 * Never requires manual feed documents.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { JourneyFeedItem, Destination, Event, DestinationCoordinates } from '@/src/modules/explore/types';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';
import { TrendingEngine } from './TrendingEngine';
import { PopularityEngine } from './PopularityEngine';
import { EventsProvider } from './EventsProvider';
import { WeekendEscapeIntelligence } from './WeekendEscapeIntelligence';

/* ── Constants ───────────────────────────────────────────────────────────────── */

const FEED_MAX_ITEMS = 20;
const SIMULATED_PRICE_CHANGES: Array<{ destination: string; drop: number }> = [
  { destination: 'nairobi', drop: 18 },
  { destination: 'paris', drop: 12 },
  { destination: 'london', drop: 15 },
  { destination: 'dubai', drop: 10 },
  { destination: 'bangkok', drop: 22 },
  { destination: 'kigali', drop: 14 },
  { destination: 'cape-town', drop: 20 },
  { destination: 'zanzibar', drop: 16 },
];

/* ── Weather-based feed items ────────────────────────────────────────────────── */

async function generateWeatherFeed(
  lat: number,
  lng: number
): Promise<JourneyFeedItem[]> {
  const key = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${key}&units=metric&cnt=3`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const forecasts = data.list || [];

    // Find best forecast
    const sunnyDays = forecasts.filter((f: any) => {
      const desc = (f.weather?.[0]?.description || '').toLowerCase();
      return desc.includes('clear') || desc.includes('sunny');
    });

    if (sunnyDays.length === 0) return [];

    const items: JourneyFeedItem[] = [];
    const temp = Math.round(sunnyDays[0].main?.temp || 25);

    items.push({
      id: `weather_${Date.now()}`,
      type: 'weather_alert',
      title: `☀️ Great weather expected nearby`,
      description: `Clear skies with ${temp}°C — perfect for outdoor adventures this weekend!`,
      imageUrl: 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=400',
      destinationId: '',
      eventId: null,
      source: 'weather',
      priority: 8,
      expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      cta: {
        label: 'Explore Outdoor Activities',
        action: 'view_destination',
      },
      metadata: { temperature: temp, condition: sunnyDays[0].weather?.[0]?.description },
      createdAt: new Date(),
    });

    return items;
  } catch {
    return [];
  }
}

/* ── Trending feed items ─────────────────────────────────────────────────────── */

async function generateTrendingFeed(
  lat: number,
  lng: number
): Promise<JourneyFeedItem[]> {
  try {
    const trending = await TrendingEngine.getTrendingDestinations();
    const popular = await PopularityEngine.getPopularDestinations(lat, lng);

    const items: JourneyFeedItem[] = [];

    // Top trending item
    if (trending.destinations.length > 0) {
      const top = trending.destinations[0];
      items.push({
        id: `trend_${Date.now()}_1`,
        type: 'trending_destination',
        title: `${top.name} is trending this week 📈`,
        description: `One of the hottest destinations right now with a trending score of ${top.trendingScore}.`,
        imageUrl: top.images?.[0]?.url || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400',
        destinationId: top.id,
        eventId: null,
        source: 'destination',
        priority: 10,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cta: {
          label: 'View Destination',
          action: 'view_destination',
        },
        metadata: { trendingScore: top.trendingScore },
        badge: { label: 'Trending', icon: 'trending', color: '#EF4444' },
        createdAt: new Date(),
      });
    }

    // Most saved destination
    if (popular.destinations.length > 1) {
      const mostSaved = popular.destinations[0];
      items.push({
        id: `popular_${Date.now()}_2`,
        type: 'for_you',
        title: `${mostSaved.name} is the most saved destination today 💾`,
        description: `${mostSaved.name} has been saved by more travelers than any other destination today.`,
        imageUrl: mostSaved.images?.[0]?.url || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400',
        destinationId: mostSaved.id,
        eventId: null,
        source: 'recommendation',
        priority: 9,
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        cta: {
          label: 'See Why',
          action: 'view_destination',
        },
        badge: { label: 'Popular', icon: 'trending', color: '#3B82F6' },
        metadata: { popularityScore: mostSaved.popularityScore },
        createdAt: new Date(),
      });
    }

    return items;
  } catch {
    return [];
  }
}

/* ── Event feed items ────────────────────────────────────────────────────────── */

async function generateEventFeed(
  lat: number,
  lng: number
): Promise<JourneyFeedItem[]> {
  try {
    const events = await EventsProvider.getEvents(lat, lng, 200);

    const items: JourneyFeedItem[] = [];
    const now = new Date();

    for (const event of events.events.slice(0, 3)) {
      const daysUntil = Math.round((event.startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 0) continue;

      let title = '';
      if (daysUntil === 0) title = `${event.title} starts today! 🎉`;
      else if (daysUntil === 1) title = `${event.title} starts tomorrow! 🎉`;
      else if (daysUntil <= 7) title = `${event.title} starts this ${getDayName(event.startDate)} 🎵`;
      else title = `${event.title} is coming up in ${daysUntil} days 📅`;

      items.push({
        id: `event_${event.id}_${Date.now()}`,
        type: 'popular_event',
        title,
        description: event.shortDescription || `${event.title} at ${event.venue?.name || event.city}`,
        imageUrl: event.images?.[0]?.url || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400',
        destinationId: event.destinationId || event.id,
        eventId: event.id,
        source: 'event',
        priority: Math.max(1, 10 - daysUntil),
        expiryDate: event.startDate,
        cta: {
          label: 'Get Tickets',
          action: 'view_event',
        },
        badge: { label: 'Event', icon: 'calendar', color: '#8B5CF6' },
        metadata: { daysUntil, category: event.category },
        createdAt: new Date(),
      });
    }

    return items;
  } catch {
    return [];
  }
}

/* ── Price drop feed items ──────────────────────────────────────────────────── */

async function generatePriceFeed(
  lat: number,
  lng: number
): Promise<JourneyFeedItem[]> {
  const items: JourneyFeedItem[] = [];

  // Simulate price drops for nearby destinations
  const destResult = await ExploreService.loadDestinations({ pageSize: 20 });
  const destinations = destResult.data;

  for (const priceDrop of SIMULATED_PRICE_CHANGES) {
    const matching = destinations.find(
      (d) => d.slug?.includes(priceDrop.destination) || d.name?.toLowerCase().includes(priceDrop.destination)
    );

    if (matching) {
      items.push({
        id: `price_${priceDrop.destination}_${Date.now()}`,
        type: 'travel_advisory',
        title: `✈️ Flights to ${matching.name} dropped ${priceDrop.drop}%`,
        description: `Great time to book your trip to ${matching.name}. Prices have dropped significantly!`,
        imageUrl: matching.images?.[0]?.url || 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400',
        destinationId: matching.id,
        eventId: null,
        source: 'recommendation',
        priority: 7,
        expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        cta: {
          label: 'Book Now',
          action: 'coordinate_journey',
        },
        badge: { label: 'Deal', icon: 'pricetag', color: '#10B981' },
        metadata: { dropPercent: priceDrop.drop, originalPrice: 100, newPrice: 100 - priceDrop.drop },
        createdAt: new Date(),
      });
    }
  }

  return items;
}

/* ── Weekend escape feed items ───────────────────────────────────────────────── */

async function generateWeekendEscapeFeed(
  lat: number,
  lng: number
): Promise<JourneyFeedItem[]> {
  try {
    // Use the strict WeekendEscapeIntelligence (with classifier) instead of old WeekendEscapeEngine
    const escapes = await WeekendEscapeIntelligence.discoverEscapes(lat, lng, 250);

    const items: JourneyFeedItem[] = [];

    for (const escape of escapes.escapes.slice(0, 2)) {
      const isPerfectWeather = escape.reason.toLowerCase().includes('weather');
      items.push({
        id: `escape_feed_${escape.id}_${Date.now()}`,
        type: 'weekend_escape',
        title: isPerfectWeather
          ? `☀️ Sunny weekend expected in ${escape.destination.name}`
          : `🏔️ Perfect weekend escape to ${escape.destination.name}`,
        description: escape.reason + ` Only ${Math.round(escape.distance)}km away!`,
        imageUrl: escape.destination.images?.[0]?.url || 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400',
        destinationId: escape.destinationId,
        eventId: null,
        source: 'recommendation',
        priority: 7,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cta: {
          label: 'Plan Your Escape',
          action: 'coordinate_journey',
        },
        badge: { label: 'Weekend', icon: 'sunny', color: '#F59E0B' },
        metadata: { distance: escape.distance, type: escape.type },
        createdAt: new Date(),
      });
    }

    return items;
  } catch {
    return [];
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/* ── Public API ──────────────────────────────────────────────────────────────── */

export const JourneyFeedGenerator = {
  /**
   * Generate a dynamic journey feed from multiple sources.
   * All sources are fetched concurrently using Promise.allSettled.
   *
   * @param lat - User's latitude
   * @param lng - User's longitude
   * @returns Array of JourneyFeedItem sorted by priority
   */
  async generateFeed(
    lat: number,
    lng: number
  ): Promise<JourneyFeedItem[]> {
    const allItems = await Promise.allSettled([
      generateWeatherFeed(lat, lng),
      generateTrendingFeed(lat, lng),
      generateEventFeed(lat, lng),
      generatePriceFeed(lat, lng),
      generateWeekendEscapeFeed(lat, lng),
    ]);

    // Merge all results
    const feed: JourneyFeedItem[] = [];
    for (const result of allItems) {
      if (result.status === 'fulfilled') {
        feed.push(...result.value);
      }
    }

    // Sort by priority descending
    feed.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    console.log(`[JourneyFeedGenerator] Generated ${feed.length} feed items`);

    return feed.slice(0, FEED_MAX_ITEMS);
  },
};