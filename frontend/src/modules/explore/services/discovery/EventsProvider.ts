/**
 * EventsProvider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Events provider for the Discovery Orchestrator.
 * Supports both location-based and global event discovery.
 *
 * Architecture:
 *   DiscoveryOrchestrator → EventsProvider (Ticketmaster)
 *     → Normalized Event[] → ExploreEngine
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DestinationCoordinates, Event, EventVenue, DestinationImage } from '@/src/modules/explore/types';
import { EventCache } from './EventCache';
import { PROVIDER_TIMEOUTS } from '@/src/modules/explore/utils/withTimeout';

/* ── Constants ───────────────────────────────────────────────────────────────── */

const TICKETMASTER_API_BASE = 'https://app.ticketmaster.com/discovery/v2/events';

const EVENT_CATEGORIES = [
  'Music',
  'Festivals',
  'Food Festivals',
  'Sports',
  'Comedy',
  'Theatre',
  'Family',
  'Business',
  'Community',
  'Art',
  'Culture',
  'Networking',
] as const;

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface EventsProviderResult {
  events: Event[];
  provider: 'ticketmaster' | 'eventbrite' | 'merged';
  fetchedAt: number;
}

interface TicketmasterEvent {
  id: string;
  name: string;
  description?: string;
  url: string;
  dates: {
    start: { dateTime: string; localDate: string; localTime: string };
    end?: { dateTime: string; localDate: string; localTime: string };
    status: { code: string };
  };
  classifications?: Array<{
    segment?: { name: string };
    genre?: { name: string };
    subGenre?: { name: string };
  }>;
  _embedded?: {
    venues?: Array<{
      name: string;
      address?: { line1: string };
      city?: { name: string };
      country?: { name: string };
      location?: { latitude: string; longitude: string };
    }>;
    attractions?: Array<{
      name: string;
      images?: Array<{ url: string; width: number; height: number }>;
    }>;
  };
  sales?: {
    public?: {
      startDateTime: string;
      endDateTime: string;
    };
  };
  priceRanges?: Array<{
    min: number;
    max: number;
    currency: string;
  }>;
}

interface TicketmasterResponse {
  _embedded?: {
    events: TicketmasterEvent[];
  };
  page?: {
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function getTicketmasterKey(): string {
  return process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY || '';
}

/**
 * Calculate Haversine distance in km.
 */
function haversineDistance(from: DestinationCoordinates, to: DestinationCoordinates): number {
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Map external category to our event category.
 */
function mapCategory(name: string): string {
  const lower = (name || '').toLowerCase();
  if (lower.includes('music') || lower.includes('concert')) return 'Music';
  if (lower.includes('festival') || lower.includes('food')) return 'Festivals';
  if (lower.includes('sport')) return 'Sports';
  if (lower.includes('comedy')) return 'Comedy';
  if (lower.includes('theatre') || lower.includes('theater') || lower.includes('drama')) return 'Theatre';
  if (lower.includes('family') || lower.includes('kids')) return 'Family';
  if (lower.includes('business') || lower.includes('conference') || lower.includes('networking')) return 'Business';
  if (lower.includes('community')) return 'Community';
  if (lower.includes('art') || lower.includes('exhibition')) return 'Art';
  if (lower.includes('culture') || lower.includes('heritage')) return 'Culture';
  return 'Entertainment';
}

/* ── Ticketmaster Provider (Location-Based) ─────────────────────────────────── */

async function fetchFromTicketmaster(
  lat: number,
  lng: number,
  radius: number,
  startDate?: string,
  endDate?: string
): Promise<TicketmasterEvent[]> {
  const key = getTicketmasterKey();
  if (!key) return [];

  // Use latlong+radius for broader regional coverage.
  // Radius starts at 500km to include events in neighboring countries.
  const effectiveRadius = Math.max(radius, 500);

  const attemptFetch = async (signal: AbortSignal): Promise<TicketmasterEvent[]> => {
    const params = new URLSearchParams({
      apikey: key,
      latlong: `${lat},${lng}`,
      radius: String(effectiveRadius),
      unit: 'km',
      size: '50',
      sort: 'date,asc',
    });

    if (startDate) params.set('startDateTime', startDate);
    if (endDate) params.set('endDateTime', endDate);

    const response = await fetch(`${TICKETMASTER_API_BASE}.json?${params}`, {
      headers: { 'Accept': 'application/json' },
      signal,
    });

    if (!response.ok) {
      console.warn(`[EventsProvider] Ticketmaster HTTP ${response.status}`);
      return [];
    }

    const data: TicketmasterResponse = await response.json();
    return data._embedded?.events || [];
  };

  // Attempt with 5s timeout + single retry on AbortError
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUTS.TICKETMASTER);

      const events = await attemptFetch(controller.signal);
      clearTimeout(timeoutId);

      if (attempt > 1) {
        console.log(`[EventsProvider] Ticketmaster succeeded on retry attempt ${attempt}`);
      }

      console.log(`[EventsProvider] Ticketmaster query: latlong=${lat},${lng} radius=${effectiveRadius}km`);
      console.log(`[EventsProvider] Ticketmaster returned ${events.length} raw events`);

      return events;
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || err?.code === 20;
      if (isAbort && attempt === 1) {
        console.warn(`[EventsProvider] Ticketmaster timeout on attempt ${attempt}, retrying...`);
        continue;
      }
      if (isAbort) {
        console.error(`[EventsProvider] Ticketmaster timeout after ${attempt} attempts — giving up.`);
      } else {
        console.error('[EventsProvider] Ticketmaster error:', err);
      }
      return [];
    }
  }
  return [];
}

/**
 * Fetch global events from Ticketmaster (no location filter).
 * Uses keyword search and country codes to get diverse events worldwide.
 */
async function fetchFromTicketmasterGlobal(
  startDate?: string,
  endDate?: string
): Promise<TicketmasterEvent[]> {
  const key = getTicketmasterKey();
  if (!key) return [];

  const attemptFetch = async (signal: AbortSignal, keyword?: string): Promise<TicketmasterEvent[]> => {
    const params = new URLSearchParams({
      apikey: key,
      size: '50',
      sort: 'date,asc',
    });

    if (keyword) params.set('keyword', keyword);
    if (startDate) params.set('startDateTime', startDate);
    if (endDate) params.set('endDateTime', endDate);

    const response = await fetch(`${TICKETMASTER_API_BASE}.json?${params}`, {
      headers: { 'Accept': 'application/json' },
      signal,
    });

    if (!response.ok) {
      console.warn(`[EventsProvider] Ticketmaster global HTTP ${response.status}`);
      return [];
    }

    const data: TicketmasterResponse = await response.json();
    return data._embedded?.events || [];
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUTS.TICKETMASTER);

  try {
    // First try with keyword "festival" to get diverse events worldwide
    const events = await attemptFetch(controller.signal, 'festival');
    clearTimeout(timeoutId);
    
    console.log(`[EventsProvider] Ticketmaster global query (keyword=festival) returned ${events.length} raw events`);
    
    // If we got events, return them
    if (events.length >= 5) {
      return events;
    }
    
    // Otherwise try without keyword to get all events
    console.log(`[EventsProvider] Too few global festival events (${events.length}), trying broader query...`);
    const allEvents = await attemptFetch(controller.signal, undefined);
    console.log(`[EventsProvider] Ticketmaster global query (no keyword) returned ${allEvents.length} raw events`);
    return allEvents.length > events.length ? allEvents : events;
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err?.name === 'AbortError' || err?.code === 20;
    if (isAbort) {
      console.warn('[EventsProvider] Ticketmaster global timeout');
    } else {
      console.error('[EventsProvider] Ticketmaster global error:', err);
    }
    return [];
  }
}

/**
 * Transform a raw Ticketmaster event into the app's Event model.
 */
function transformTicketmasterEvent(e: TicketmasterEvent): Event | null {
  const venue = e._embedded?.venues?.[0];
  const attraction = e._embedded?.attractions?.[0];
  const coords: DestinationCoordinates = {
    lat: parseFloat(venue?.location?.latitude || '0'),
    lng: parseFloat(venue?.location?.longitude || '0'),
  };
  const classification = e.classifications?.[0];
  const priceRange = e.priceRanges?.[0];

  if (!coords.lat || !coords.lng) return null;

  return {
    id: `tm_${e.id}`,
    title: e.name,
    slug: e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: e.description || '',
    shortDescription: classification?.genre?.name || '',
    category: mapCategory(classification?.segment?.name || ''),
    subcategory: classification?.genre?.name || '',
    country: venue?.country?.name || '',
    city: venue?.city?.name || '',
    coordinates: coords,
    venue: {
      name: venue?.name || '',
      address: venue?.address?.line1 || '',
      coordinates: coords,
      capacity: 0,
      website: e.url,
      phone: '',
    } as EventVenue,
    images: attraction?.images?.length
      ? [{ url: attraction.images[0].url, caption: '', credit: '' } as DestinationImage]
      : [{ url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400', caption: '', credit: '' }],
    startDate: new Date(e.dates.start.dateTime || e.dates.start.localDate),
    endDate: e.dates.end ? new Date(e.dates.end.dateTime || e.dates.end.localDate) : new Date(e.dates.start.dateTime || e.dates.start.localDate),
    ticketUrl: e.url,
    ticketPrice: priceRange ? `${priceRange.currency} ${priceRange.min} - ${priceRange.max}` : '',
    organizer: classification?.segment?.name || '',
    website: e.url,
    popularity: 50,
    rating: 4.2,
    destinationId: '',
    relatedEventIds: [],
    tags: [classification?.segment?.name || '', classification?.genre?.name || ''].filter(Boolean),
    featured: false,
    trending: false,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/* ── Public API ──────────────────────────────────────────────────────────────── */

export const EventsProvider = {
  /**
   * Fetch events from Ticketmaster Discovery API.
   *
   * @param lat - User's latitude
   * @param lng - User's longitude
   * @param radiusKm - Search radius in km
   * @param dateRange - Optional date range filter
   * @param global - If true, fetch global events (ignores lat/lng)
   * @returns Sorted, scored events
   */
  async getEvents(
    lat?: number,
    lng?: number,
    radiusKm: number = 100,
    dateRange?: { start?: string; end?: string },
    global: boolean = false
  ): Promise<EventsProviderResult> {
    const useLocation = !global && typeof lat === 'number' && typeof lng === 'number';
    const userLocation: DestinationCoordinates | null = useLocation ? { lat: lat!, lng: lng! } : null;

    console.log(`[EventsProvider] getEvents: global=${global}, useLocation=${useLocation}, lat=${lat}, lng=${lng}, radius=${radiusKm}km`);

    // Fetch from Ticketmaster
    const rawEvents = global
      ? await fetchFromTicketmasterGlobal(dateRange?.start, dateRange?.end)
      : await fetchFromTicketmaster(lat!, lng!, radiusKm, dateRange?.start, dateRange?.end);

    // Transform raw Ticketmaster events into our Event model
    const ticketmasterEvents: Event[] = rawEvents
      .map(transformTicketmasterEvent)
      .filter((e): e is Event => e !== null);

    console.log(`[EventsProvider] Transformed ${ticketmasterEvents.length} events`);

    // If no events, return empty result
    if (ticketmasterEvents.length === 0) {
      console.warn(`[EventsProvider] ⚠ No events returned from Ticketmaster! API key: ${getTicketmasterKey() ? 'PRESENT' : 'MISSING'}`);
      return {
        events: [],
        provider: 'ticketmaster',
        fetchedAt: Date.now(),
      };
    }

    // Score each event
    const scored = ticketmasterEvents
      .map((event) => {
        let distanceScore = 50; // default for global events
        if (userLocation) {
          const distance = haversineDistance(userLocation, event.coordinates);
          distanceScore = Math.max(0, 100 - Math.round(distance / 2));
        }
        
        const timeUntilEvent = event.startDate.getTime() - Date.now();
        const urgencyScore = timeUntilEvent > 0
          ? Math.max(0, 100 - Math.round(timeUntilEvent / (1000 * 60 * 60 * 24)))
          : 0;

        const eventScore = Math.round(
          (distanceScore * 0.3) +
          (50 * 0.25) +
          (42 * 0.25) +
          (urgencyScore * 0.2)
        );

        return { ...event, popularity: eventScore };
      })
      .sort((a, b) => b.popularity - a.popularity);

    // Log country spread
    const countryCounts: Record<string, number> = {};
    for (const e of scored) {
      const c = e.country || 'Unknown';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    }
    console.log(`[EventsProvider] Events by country:`, countryCounts);

    console.log(`[EventsProvider] Fetched ${scored.length} events from Ticketmaster`);
    if (scored.length > 0) {
      console.log(`[EventsProvider] Sample events:`, scored.slice(0, 5).map(e => `${e.title} (${e.city}, ${e.country})`));
    }

    // Cache events for detail screen
    EventCache.setMany(scored.slice(0, 20));

    return {
      events: scored.slice(0, 20),
      provider: 'ticketmaster',
      fetchedAt: Date.now(),
    };
  },

  /**
   * Get supported event categories.
   */
  getSupportedCategories(): readonly string[] {
    return EVENT_CATEGORIES;
  },
};