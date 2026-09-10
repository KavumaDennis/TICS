/**
 * ExploreService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core service for the Explore module. Handles all Firestore interactions
 * for categories, destinations, trending, recommendations, and user actions.
 * Queries are designed to use single-field indexes where possible, with
 * client-side filtering as fallback while composite indexes build.
 * Never called directly from UI - always through hooks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  setDoc,
  deleteDoc,
  Timestamp,
  DocumentSnapshot,
  addDoc,
  increment,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import {
  FIRESTORE_COLLECTIONS,
  PAGINATION,
  TIMEOUTS,
} from '@/src/modules/explore/constants';
import { EventsProvider } from '@/src/modules/explore/services/discovery/EventsProvider';
import { getDestinationPrimaryImage, resolveDestinationImage } from '@/src/modules/explore/utils';
import type {
  ExploreCategory,
  Destination,
  Event,
  ExploreRecommendation,
  JourneyFeedItem,
  NearbyItem,
  NearbySortOption,
  SearchResult,
  SearchSuggestion,
  PaginatedResponse,
  ServiceResponse,
  ExploreAnalyticsEvent,
} from '@/src/modules/explore/types';

/* ── Firestore Helpers ──────────────────────────────────────────────────────── */

function db() {
  return getFirebaseFirestore();
}

function firestoreCollection(name: string) {
  return collection(db(), name);
}

function docRef(collectionName: string, docId: string) {
  return doc(db(), collectionName, docId);
}

/* ── Category Methods ───────────────────────────────────────────────────────── */

/**
 * Load all active explore categories from Firestore.
 * Uses simple query without composite index requirement.
 */
async function loadCategories(): Promise<ServiceResponse<ExploreCategory[]>> {
  try {
    // Use a simple getAll query, filter & sort client-side
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.EXPLORE_CATEGORIES),
      limit(100)
    );
    const snap = await getDocs(q);
    const categories = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
        } as ExploreCategory;
      })
      .filter((c) => c.active !== false) // client-side active filter
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)); // client-side sort
    return { data: categories, loading: false, error: null };
  } catch (err) {
    console.error('[ExploreService] loadCategories error:', err);
    return { data: null, loading: false, error: 'Failed to load categories' };
  }
}

/**
 * Get a single category by ID.
 */
async function getCategoryById(
  categoryId: string
): Promise<ServiceResponse<ExploreCategory>> {
  try {
    const d = await getDoc(docRef(FIRESTORE_COLLECTIONS.EXPLORE_CATEGORIES, categoryId));
    if (!d.exists()) {
      return { data: null, loading: false, error: 'Category not found' };
    }
    const data = d.data();
    return {
      data: {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      } as ExploreCategory,
      loading: false,
      error: null,
    };
  } catch (err) {
    console.error('[ExploreService] getCategoryById error:', err);
    return { data: null, loading: false, error: 'Failed to load category' };
  }
}

/* ── Destination Methods ────────────────────────────────────────────────────── */

/**
 * Normalize a raw Firestore destination document into the Destination model.
 * Firestore docs store images under several field shapes (images[], imageUrl,
 * image, photoUrl, photo, photos, coverImage, heroImage). The centralized
 * resolver picks the best usable URL (including gs:// → HTTPS conversion) and
 * guarantees `images[0].url` is populated so every downstream consumer
 * (cards, saved places, AI discovery) sees a consistent image field.
 */
function normalizeDestinationDoc(id: string, data: Record<string, any>): Destination {
  const dest = {
    id,
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    weatherSummary: data.weatherSummary ?? null,
    reviews: data.reviews ?? [],
    travelRequirements: data.travelRequirements ?? [],
    emergencyContacts: data.emergencyContacts ?? [],
  } as Destination;

  const resolved = resolveDestinationImage(data);
  if (resolved) {
    if (!Array.isArray(dest.images) || dest.images.length === 0) {
      dest.images = [{ url: resolved, caption: '', credit: '' }];
    } else if (!dest.images[0]?.url) {
      dest.images[0] = { ...(dest.images[0] || {}), url: resolved };
    }
  }
  return dest;
}

/**
 * Load paginated destinations with optional category filter.
 * Uses simple queries where possible + client-side sorting/filtering.
 */
async function loadDestinations(options?: {
  category?: string;
  cursor?: string;
  pageSize?: number;
  featured?: boolean;
  trending?: boolean;
}): Promise<PaginatedResponse<Destination>> {
  const pageSize = options?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE;
  try {
    // Use simple query without composite index requirement
    // Fetch extra for client-side filtering
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.DESTINATIONS),
      orderBy('__name__'),
      limit(pageSize + 30)
    );

    const snap = await getDocs(q);
    let destinations = snap.docs.map((d) => normalizeDestinationDoc(d.id, d.data()));

    // Client-side filtering for active, featured, trending, category
    destinations = destinations.filter((d) => d.active !== false);
    if (options?.featured) {
      destinations = destinations.filter((d) => d.featured === true);
    }
    if (options?.trending) {
      destinations = destinations.filter((d) => d.trending === true);
    }
    if (options?.category) {
      const categoryLower = options.category.toLowerCase();
      destinations = destinations.filter((d) => {
        const cats = (d.categories || []).map((c: string) => c.toLowerCase());
        return cats.some((c: string) => c.includes(categoryLower) || categoryLower.includes(c));
      });
    }

    // Client-side sorting by popularity
    destinations.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

    // Apply pagination
    const hasMore = destinations.length > pageSize;
    const sliced = destinations.slice(0, pageSize);

    return {
      data: sliced,
      total: sliced.length,
      hasMore,
      lastCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
    };
  } catch (err) {
    console.error('[ExploreService] loadDestinations error:', err);
    return { data: [], total: 0, hasMore: false, lastCursor: null };
  }
}

/**
 * Get full destination details by ID.
 */
async function getDestinationById(
  destinationId: string
): Promise<ServiceResponse<Destination>> {
  try {
    const d = await getDoc(docRef(FIRESTORE_COLLECTIONS.DESTINATIONS, destinationId));
    if (!d.exists()) {
      return { data: null, loading: false, error: 'Destination not found' };
    }
    return {
      data: normalizeDestinationDoc(d.id, d.data()),
      loading: false,
      error: null,
    };
  } catch (err) {
    console.error('[ExploreService] getDestinationById error:', err);
    return { data: null, loading: false, error: 'Failed to load destination' };
  }
}

/**
 * Load trending destinations.
 */
async function loadTrendingDestinations(): Promise<ServiceResponse<Destination[]>> {
  const result = await loadDestinations({ trending: true, pageSize: PAGINATION.TRENDING_LIMIT });
  return { data: result.data, loading: false, error: result.data.length ? null : 'No trending destinations' };
}

/**
 * Load popular destinations.
 */
async function loadPopularDestinations(): Promise<ServiceResponse<Destination[]>> {
  const result = await loadDestinations({ pageSize: PAGINATION.POPULAR_LIMIT });
  return { data: result.data, loading: false, error: result.data.length ? null : 'No popular destinations' };
}

/**
 * Load featured destinations.
 */
async function loadFeaturedDestinations(): Promise<ServiceResponse<Destination[]>> {
  const result = await loadDestinations({ featured: true, pageSize: PAGINATION.FEATURED_LIMIT });
  return { data: result.data, loading: false, error: result.data.length ? null : 'No featured destinations' };
}

/**
 * Load destinations by category.
 */
async function loadDestinationsByCategory(
  categorySlug: string,
  cursor?: string
): Promise<PaginatedResponse<Destination>> {
  return loadDestinations({ category: categorySlug, cursor });
}

/* ── Event Methods ──────────────────────────────────────────────────────────── */

/**
 * Load events with optional filters.
 * Uses simple queries with client-side filtering.
 * If global flag is set, fetches from Ticketmaster API for worldwide events.
 */
async function loadEvents(options?: {
  category?: string;
  country?: string;
  city?: string;
  trending?: boolean;
  featured?: boolean;
  startDate?: Date;
  endDate?: Date;
  destinationId?: string;
  cursor?: string;
  pageSize?: number;
  global?: boolean;
}): Promise<PaginatedResponse<Event>> {
  const pageSize = options?.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE;
  
  // If global mode, fetch from Ticketmaster API
  if (options?.global) {
    try {
      console.log('[ExploreService] Fetching global events from Ticketmaster');
      const result = await EventsProvider.getEvents(undefined, undefined, 20000, undefined, true);
      return {
        data: result.events.slice(0, pageSize),
        total: result.events.length,
        hasMore: result.events.length > pageSize,
        lastCursor: null,
      };
    } catch (err) {
      console.error('[ExploreService] loadEvents (global) error:', err);
      return { data: [], total: 0, hasMore: false, lastCursor: null };
    }
  }
  
  // Otherwise, load from Firestore
  try {
    // Use simple query without composite index requirement
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.EVENTS),
      orderBy('__name__'),
      limit(pageSize + 30)
    );

    const snap = await getDocs(q);
    let events = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        startDate: data.startDate?.toDate?.() ?? new Date(),
        endDate: data.endDate?.toDate?.() ?? new Date(),
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      } as Event;
    });

    // Client-side filtering
    events = events.filter((e) => e.active !== false);
    if (options?.trending) events = events.filter((e) => e.trending === true);
    if (options?.featured) events = events.filter((e) => e.featured === true);
    if (options?.category) {
      const categoryLower = options.category.toLowerCase();
      events = events.filter((e) => {
        const cat = (e.category || '').toLowerCase();
        return cat.includes(categoryLower) || categoryLower.includes(cat);
      });
    }
    if (options?.country) {
      const countryLower = options.country.toLowerCase();
      events = events.filter((e) => (e.country || '').toLowerCase().includes(countryLower));
    }
    if (options?.city) {
      const cityLower = options.city.toLowerCase();
      events = events.filter((e) => (e.city || '').toLowerCase().includes(cityLower));
    }
    if (options?.destinationId) {
      events = events.filter((e) => e.destinationId === options.destinationId);
    }

    // Sort by start date
    events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    const hasMore = events.length > pageSize;
    const sliced = events.slice(0, pageSize);

    return {
      data: sliced,
      total: sliced.length,
      hasMore,
      lastCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
    };
  } catch (err) {
    console.error('[ExploreService] loadEvents error:', err);
    return { data: [], total: 0, hasMore: false, lastCursor: null };
  }
}

/**
 * Get event details by ID.
 */
async function getEventById(eventId: string): Promise<ServiceResponse<Event>> {
  try {
    const d = await getDoc(docRef(FIRESTORE_COLLECTIONS.EVENTS, eventId));
    if (!d.exists()) {
      return { data: null, loading: false, error: 'Event not found' };
    }
    const data = d.data();
    return {
      data: {
        id: d.id,
        ...data,
        startDate: data.startDate?.toDate?.() ?? new Date(),
        endDate: data.endDate?.toDate?.() ?? new Date(),
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      } as Event,
      loading: false,
      error: null,
    };
  } catch (err) {
    console.error('[ExploreService] getEventById error:', err);
    return { data: null, loading: false, error: 'Failed to load event' };
  }
}

/* ── Journey Feed Methods ───────────────────────────────────────────────────── */

/**
 * Load journey feed items with pagination.
 */
async function loadJourneyFeed(options?: {
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResponse<JourneyFeedItem>> {
  const pageSize = options?.pageSize ?? PAGINATION.FEED_LIMIT;
  try {
    // Use simple query, sort client-side
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.JOURNEY_FEED),
      orderBy('__name__'),
      limit(pageSize + 10)
    );
    const snap = await getDocs(q);

    let items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        expiryDate: data.expiryDate?.toDate?.() ?? null,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
      } as JourneyFeedItem;
    });

    // Client-side sort by priority then createdAt
    items.sort((a, b) => {
      const p = (b.priority ?? 0) - (a.priority ?? 0);
      if (p !== 0) return p;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const hasMore = items.length > pageSize;
    const sliced = items.slice(0, pageSize);

    return {
      data: sliced,
      total: sliced.length,
      hasMore,
      lastCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
    };
  } catch (err) {
    console.error('[ExploreService] loadJourneyFeed error:', err);
    return { data: [], total: 0, hasMore: false, lastCursor: null };
  }
}

/* ── Recommendation Methods ─────────────────────────────────────────────────── */

/**
 * Load personalized recommendations.
 */
async function loadRecommendations(
  userId: string
): Promise<ServiceResponse<ExploreRecommendation[]>> {
  try {
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.RECOMMENDATIONS),
      orderBy('__name__'),
      limit(PAGINATION.DEFAULT_PAGE_SIZE)
    );
    const snap = await getDocs(q);
    const recommendations = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          expiresAt: data.expiresAt?.toDate?.() ?? null,
        } as ExploreRecommendation;
      })
      .filter((r) => (r as any).active !== false)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return { data: recommendations, loading: false, error: null };
  } catch (err) {
    console.error('[ExploreService] loadRecommendations error:', err);
    return { data: null, loading: false, error: 'Failed to load recommendations' };
  }
}

/* ── Nearby Methods ─────────────────────────────────────────────────────────── */

/**
 * Load nearby places based on coordinates.
 */
async function loadNearbyPlaces(options: {
  lat: number;
  lng: number;
  radiusKm?: number;
  types?: string[];
  sortBy?: NearbySortOption;
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResponse<NearbyItem>> {
  const pageSize = options?.pageSize ?? PAGINATION.NEARBY_LIMIT;
  try {
    // Use simple query without composite index requirement
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.NEARBY_PLACES),
      orderBy('__name__'),
      limit(pageSize + 30)
    );

    const snap = await getDocs(q);
    let items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
      } as NearbyItem;
    });

    // Client-side filtering and sorting
    items = items.filter((i) => (i as any).active !== false);
    if (options?.types?.length) {
      const typeSet = new Set(options.types);
      items = items.filter((i) => typeSet.has(i.type));
    }

    if (options.sortBy === 'rating') {
      items.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (options.sortBy === 'popularity') {
      items.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    } else {
      items.sort((a, b) => a.distance - b.distance);
    }

    const hasMore = items.length > pageSize;
    const sliced = items.slice(0, pageSize);

    return {
      data: sliced,
      total: sliced.length,
      hasMore,
      lastCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
    };
  } catch (err) {
    console.error('[ExploreService] loadNearbyPlaces error:', err);
    return { data: [], total: 0, hasMore: false, lastCursor: null };
  }
}

/* ── User Action Methods ────────────────────────────────────────────────────── */

/**
 * Save a destination to the user's saved places.
 * Stores destination metadata (name, country, image) so the Saved Places
 * screen can render rich cards without a separate Firestore lookup.
 */
async function saveDestination(
  userId: string,
  destinationId: string,
  destination?: Partial<Destination> | null
): Promise<boolean> {
  try {
    // Check if this destination is already saved by this user to avoid duplicates.
    // Use a simple `where userId` query + client-side filter to avoid needing
    // a compound index on (userId + destinationId).
    let alreadySaved = false;
    try {
      const existingQ = query(
        firestoreCollection(FIRESTORE_COLLECTIONS.SAVED_PLACES),
        where('userId', '==', userId),
        limit(50)
      );
      const existingSnap = await getDocs(existingQ);
      alreadySaved = existingSnap.docs.some(
        (d) => d.data().destinationId === destinationId
      );
    } catch (checkErr) {
      console.warn('[ExploreService] Duplicate check failed, proceeding:', checkErr);
    }
    if (alreadySaved) {
      // Already saved — treat as success without creating a duplicate.
      return true;
    }

    const savedRef = firestoreCollection(
      `${FIRESTORE_COLLECTIONS.SAVED_PLACES}`
    );
    await addDoc(savedRef, {
      userId,
      destinationId,
      name: destination?.name || '',
      country: destination?.country || '',
      countryCode: destination?.countryCode || '',
      imageUrl: destination ? getDestinationPrimaryImage(destination as Destination) : '',
      description: destination?.description || '',
      rating: destination?.rating || 0,
      coordinates: destination?.coordinates || { lat: 0, lng: 0 },
      city: destination?.city || '',
      savedAt: Timestamp.now(),
      type: 'destination',
    });
    // Increment popularity (non-fatal — the save itself already succeeded).
    // This can fail for API-derived destinations (e.g. Google Places) that
    // don't exist in Firestore, since `create` on destinations requires
    // operator privileges. We don't want that to block the save.
    try {
      const destRef = docRef(FIRESTORE_COLLECTIONS.DESTINATIONS, destinationId);
      await setDoc(destRef, { popularity: increment(1) }, { merge: true });
    } catch (popErr) {
      console.warn('[ExploreService] Popularity increment skipped (destination may not exist in Firestore):', popErr);
    }
    return true;
  } catch (err) {
    console.error('[ExploreService] saveDestination error:', err);
    return false;
  }
}

/**
 * Remove a saved destination.
 */
async function unsaveDestination(
  userId: string,
  destinationId: string
): Promise<boolean> {
  try {
    // Use simple query without composite index requirement
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.SAVED_PLACES),
      where('userId', '==', userId),
      limit(50)
    );
    const snap = await getDocs(q);
    const deletePromises = snap.docs
      .filter((d) => d.data().destinationId === destinationId)
      .map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    return true;
  } catch (err) {
    console.error('[ExploreService] unsaveDestination error:', err);
    return false;
  }
}

/**
 * Track recently viewed destination.
 */
async function trackRecentlyViewed(
  userId: string,
  destinationId: string
): Promise<void> {
  try {
    const userRef = doc(db(), 'users', userId);
    await setDoc(
      userRef,
      {
        recentlyViewed: arrayUnion({
          destinationId,
          viewedAt: Timestamp.now(),
        }),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('[ExploreService] trackRecentlyViewed error:', err);
  }
}

/**
 * Get recently viewed destinations for a user.
 */
async function getRecentlyViewed(
  userId: string
): Promise<Destination[]> {
  try {
    const userDoc = await getDoc(doc(db(), 'users', userId));
    if (!userDoc.exists()) return [];
    const data = userDoc.data();
    const recent = data?.recentlyViewed ?? [];
    if (!recent.length) return [];

    const destIds = recent
      .slice(0, PAGINATION.RECENTLY_VIEWED_LIMIT)
      .map((r: any) => r.destinationId);

    const dests: Destination[] = [];
    for (const id of destIds) {
      const destResult = await getDestinationById(id);
      if (destResult.data) {
        dests.push(destResult.data);
      }
    }
    return dests;
  } catch (err) {
    console.error('[ExploreService] getRecentlyViewed error:', err);
    return [];
  }
}

/* ── Analytics Methods ──────────────────────────────────────────────────────── */

/**
 * Track an analytics event in Firestore.
 */
async function trackAnalyticsEvent(
  userId: string,
  event: ExploreAnalyticsEvent,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const analyticsRef = firestoreCollection(FIRESTORE_COLLECTIONS.EXPLORE_ANALYTICS);
    await addDoc(analyticsRef, {
      userId,
      event,
      metadata,
      timestamp: Timestamp.now(),
    });
  } catch (err) {
    console.error('[ExploreService] trackAnalyticsEvent error:', err);
  }
}

/* ── Search History Methods ─────────────────────────────────────────────────── */

/**
 * Save a search query to user's search history.
 */
async function saveSearchQuery(
  userId: string,
  queryText: string
): Promise<void> {
  try {
    const historyRef = firestoreCollection(FIRESTORE_COLLECTIONS.SEARCH_HISTORY);
    await addDoc(historyRef, {
      userId,
      query: queryText,
      searchedAt: Timestamp.now(),
    });
  } catch (err) {
    console.error('[ExploreService] saveSearchQuery error:', err);
  }
}

/**
 * Get search history for a user.
 */
async function getSearchHistory(
  userId: string
): Promise<SearchSuggestion[]> {
  try {
    // Use simple query without composite index requirement
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.SEARCH_HISTORY),
      where('userId', '==', userId),
      limit(PAGINATION.SEARCH_LIMIT * 3)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          text: data.query,
          type: 'destination' as const,
          subtext: 'Recent search',
          icon: 'history',
          searchedAt: data.searchedAt?.toDate?.() ?? new Date(0),
        };
      })
      .sort((a, b) => b.searchedAt.getTime() - a.searchedAt.getTime())
      .slice(0, PAGINATION.SEARCH_LIMIT)
      .map(({ searchedAt, ...rest }) => rest);
  } catch (err) {
    console.error('[ExploreService] getSearchHistory error:', err);
    return [];
  }
}

/**
 * Clear search history for a user.
 */
async function clearSearchHistory(userId: string): Promise<void> {
  try {
    const q = query(
      firestoreCollection(FIRESTORE_COLLECTIONS.SEARCH_HISTORY),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (err) {
    console.error('[ExploreService] clearSearchHistory error:', err);
  }
}

/* ── Export ─────────────────────────────────────────────────────────────────── */

export const ExploreService = {
  // Categories
  loadCategories,
  getCategoryById,

  // Destinations
  loadDestinations,
  getDestinationById,
  loadTrendingDestinations,
  loadPopularDestinations,
  loadFeaturedDestinations,
  loadDestinationsByCategory,

  // Events
  loadEvents,
  getEventById,

  // Journey Feed
  loadJourneyFeed,

  // Recommendations
  loadRecommendations,

  // Nearby
  loadNearbyPlaces,

  // User Actions
  saveDestination,
  unsaveDestination,
  trackRecentlyViewed,
  getRecentlyViewed,

  // Analytics
  trackAnalyticsEvent,

  // Search History
  saveSearchQuery,
  getSearchHistory,
  clearSearchHistory,
};