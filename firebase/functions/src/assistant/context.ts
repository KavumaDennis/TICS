/**
 * TICS AI Assistant Context Builder
 * ────────────────────────────────────
 * Handles building rich context for the AI assistant from
 * user memory, trip states, and conversation history.
 * 
 * Architecture:
 *   users/{uid}/conversations/{conversationId}
 *     /messages/{messageId}   — individual chat messages
 *   users/{uid}/memory        — long-term user memory document
 *   trips/{tripId}            — trip documents with status
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = admin.firestore();

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface UserMemory {
  preferences?: {
    preferredTransport?: string;
    commonRoutes?: string[];
    savedPlaces?: string[];
  };
  importantFacts?: string[];
  updatedAt?: FirebaseFirestore.Timestamp;
}

export interface TripContext {
  id: string;
  origin: string;
  destination: string;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  title?: string | null;
  flightNumber?: string | null;
  airline?: string | null;
}

export interface ConversationSummary {
  summary: string;
  lastMessage: string;
  status: 'active' | 'archived';
  messageCount: number;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface AssistantContext {
  userProfile: {
    name: string | null;
    email: string | null;
  };
  memory: UserMemory | null;
  currentTrip: TripContext | null;
  recentTrips: TripContext[];
  tripHistory: TripContext[];
  recentConversationSummary: string | null;
}

/* ─── User Profile ────────────────────────────────────────────────────────── */

async function getUserProfile(uid: string): Promise<{ name: string | null; email: string | null }> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return { name: null, email: null };
    const data = snap.data();
    return {
      name: data?.name ?? null,
      email: data?.email ?? null,
    };
  } catch (e) {
    logger.warn(`[assistant/context] getUserProfile error for ${uid}:`, e);
    return { name: null, email: null };
  }
}

/* ─── User Memory ─────────────────────────────────────────────────────────── */

/**
 * Fetch the user's long-term memory document.
 * Returns the memory document or null if it doesn't exist.
 */
export async function getUserMemory(uid: string): Promise<UserMemory | null> {
  try {
    const snap = await db.collection('users').doc(uid).collection('memory').doc('assistant').get();
    if (!snap.exists) return null;
    return snap.data() as UserMemory;
  } catch (e) {
    logger.warn(`[assistant/context] getUserMemory error for ${uid}:`, e);
    return null;
  }
}

/**
 * Save or update the user's memory document with new information.
 * Only stores useful, non-transient information.
 */
export async function saveUserMemory(
  uid: string,
  updates: Partial<UserMemory>,
): Promise<void> {
  try {
    await db
      .collection('users')
      .doc(uid)
      .collection('memory')
      .doc('assistant')
      .set(
        { ...updates, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    logger.info(`[assistant/context] saveUserMemory: updated for ${uid}`);
  } catch (e) {
    logger.error(`[assistant/context] saveUserMemory error for ${uid}:`, e);
  }
}

/* ─── Trip Context ────────────────────────────────────────────────────────── */

/**
 * Fetch the user's current active trip (status = 'active').
 */
async function getCurrentActiveTrip(uid: string): Promise<TripContext | null> {
  try {
    const snap = await db
      .collection('trips')
      .where('userId', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      origin: data.from ?? '',
      destination: data.to ?? '',
      status: data.status ?? 'active',
      startedAt: data.departureTime ?? null,
      endedAt: data.arrivalTime ?? null,
      title: data.title ?? null,
      flightNumber: data.flightNumber ?? null,
      airline: data.airline ?? null,
    };
  } catch (e) {
    logger.warn(`[assistant/context] getCurrentActiveTrip error for ${uid}:`, e);
    return null;
  }
}

/**
 * Fetch the user's recent completed trips (last 3).
 */
async function getRecentCompletedTrips(uid: string): Promise<TripContext[]> {
  try {
    const snap = await db
      .collection('trips')
      .where('userId', '==', uid)
      .where('status', '==', 'completed')
      .orderBy('arrivalTime', 'desc')
      .limit(3)
      .get();

    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        origin: data.from ?? '',
        destination: data.to ?? '',
        status: 'completed',
        startedAt: data.departureTime ?? null,
        endedAt: data.completedAt?.toDate?.()?.toISOString?.() ?? data.arrivalTime ?? null,
        title: data.title ?? null,
        flightNumber: data.flightNumber ?? null,
        airline: data.airline ?? null,
      };
    });
  } catch (e) {
    logger.warn(`[assistant/context] getRecentCompletedTrips error for ${uid}:`, e);
    return [];
  }
}

/**
 * Fetch the user's recent cancelled trips (last 2).
 */
async function getRecentCancelledTrips(uid: string): Promise<TripContext[]> {
  try {
    const snap = await db
      .collection('trips')
      .where('userId', '==', uid)
      .where('status', 'in', ['canceled', 'cancelled'])
      .orderBy('departureTime', 'desc')
      .limit(2)
      .get();

    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        origin: data.from ?? '',
        destination: data.to ?? '',
        status: 'cancelled',
        startedAt: data.departureTime ?? null,
        endedAt: null,
        title: data.title ?? null,
        flightNumber: data.flightNumber ?? null,
        airline: data.airline ?? null,
      };
    });
  } catch (e) {
    logger.warn(`[assistant/context] getRecentCancelledTrips error for ${uid}:`, e);
    return [];
  }
}

/**
 * Fetch the user's upcoming trips (limit 2).
 */
async function getUpcomingTrips(uid: string): Promise<TripContext[]> {
  try {
    const snap = await db
      .collection('trips')
      .where('userId', '==', uid)
      .where('status', '==', 'upcoming')
      .orderBy('departureTime', 'asc')
      .limit(2)
      .get();

    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        origin: data.from ?? '',
        destination: data.to ?? '',
        status: 'upcoming',
        startedAt: data.departureTime ?? null,
        endedAt: data.arrivalTime ?? null,
        title: data.title ?? null,
        flightNumber: data.flightNumber ?? null,
        airline: data.airline ?? null,
      };
    });
  } catch (e) {
    logger.warn(`[assistant/context] getUpcomingTrips error for ${uid}:`, e);
    return [];
  }
}

/**
 * Fetch all trip context data for the user.
 */
export async function getTripContext(uid: string): Promise<{
  currentTrip: TripContext | null;
  recentTrips: TripContext[];
  tripHistory: TripContext[];
}> {
  const [currentTrip, recentCompleted, recentCancelled, upcoming] = await Promise.all([
    getCurrentActiveTrip(uid),
    getRecentCompletedTrips(uid),
    getRecentCancelledTrips(uid),
    getUpcomingTrips(uid),
  ]);

  return {
    currentTrip,
    recentTrips: [...recentCompleted, ...recentCancelled],
    tripHistory: [...recentCompleted, ...recentCancelled, ...upcoming],
  };
}

/* ─── Conversation History ─────────────────────────────────────────────────── */

/**
 * Fetch the last N messages from a conversation for AI context.
 * Uses the new path: users/{uid}/conversations/{conversationId}/messages
 */
export async function getConversationHistory(
  uid: string,
  conversationId: string,
  limitCount: number = 10,
): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
  try {
    const msgCol = db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .collection('messages');

    const snap = await msgCol
      .orderBy('timestamp', 'asc')
      .limit(limitCount)
      .get();

    return snap.docs.map((d) => {
      const data = d.data();
      return {
        role: data.role === 'assistant' ? 'assistant' : 'user',
        text: String(data.content ?? ''),
      };
    });
  } catch (e) {
    logger.warn(`[assistant/context] getConversationHistory error for ${uid}/${conversationId}:`, e);
    return [];
  }
}

/**
 * Get the summary of the most recent conversation for a user.
 */
export async function getRecentConversationSummary(uid: string): Promise<string | null> {
  try {
    const convCol = db
      .collection('users')
      .doc(uid)
      .collection('conversations');

    const snap = await convCol
      .where('status', '==', 'archived')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return null;
    const conv = snap.docs[0].data() as ConversationSummary;
    return conv.summary ?? null;
  } catch (e) {
    logger.warn(`[assistant/context] getRecentConversationSummary error for ${uid}:`, e);
    return null;
  }
}

/**
 * Update the conversation summary in Firestore.
 * Called periodically after a few messages.
 */
export async function updateConversationSummary(
  uid: string,
  conversationId: string,
  summary: string,
  lastMessage: string,
): Promise<void> {
  try {
    await db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .set(
        {
          summary,
          lastMessage,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (e) {
    logger.warn(`[assistant/context] updateConversationSummary error:`, e);
  }
}

/**
 * Archive the current conversation and create a new one.
 */
export async function archiveConversation(
  uid: string,
  conversationId: string,
): Promise<void> {
  try {
    await db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .update({
        status: 'archived',
        updatedAt: FieldValue.serverTimestamp(),
      });
    logger.info(`[assistant/context] archiveConversation: ${uid}/${conversationId}`);
  } catch (e) {
    logger.warn(`[assistant/context] archiveConversation error:`, e);
  }
}

/**
 * Create a new conversation document.
 */
export async function createConversation(
  uid: string,
  conversationId: string,
  tripId: string | null,
): Promise<void> {
  try {
    const data: Record<string, any> = {
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      summary: '',
      lastMessage: '',
      status: 'active',
      messageCount: 0,
    };
    if (tripId) {
      data.tripId = tripId;
    }
    await db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .set(data);
    logger.info(`[assistant/context] createConversation: ${uid}/${conversationId}`);
  } catch (e) {
    logger.warn(`[assistant/context] createConversation error:`, e);
  }
}

/**
 * Increment the message count on a conversation.
 */
export async function incrementMessageCount(
  uid: string,
  conversationId: string,
): Promise<void> {
  try {
    await db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .update({
        messageCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
  } catch (e) {
    logger.warn(`[assistant/context] incrementMessageCount error:`, e);
  }
}

/* ─── Context Builder ─────────────────────────────────────────────────────── */

/**
 * Build the full AI assistant context for a user.
 * 
 * Returns:
 * {
 *   userProfile,
 *   memory,
 *   recentConversation,
 *   currentTrip,
 *   tripHistory
 * }
 */
export async function buildAssistantContext(
  uid: string,
  conversationId: string | null = null,
): Promise<AssistantContext> {
  const [userProfile, memory, tripCtx, recentSummary] = await Promise.all([
    getUserProfile(uid),
    getUserMemory(uid),
    getTripContext(uid),
    conversationId ? null : getRecentConversationSummary(uid),
  ]);

  return {
    userProfile,
    memory,
    currentTrip: tripCtx.currentTrip,
    recentTrips: tripCtx.recentTrips,
    tripHistory: tripCtx.tripHistory,
    recentConversationSummary: recentSummary,
  };
}

/**
 * Build a system prompt string from the assistant context.
 */
export function buildSystemPromptFromContext(
  context: AssistantContext,
  conversationSummary?: string | null,
): string {
  const parts: string[] = [];
  parts.push('You are TICS, a smart real-time travel intelligence assistant. Be concise, actionable, and specific.');

  // User identity
  if (context.userProfile.name) {
    parts.push(`The user's name is ${context.userProfile.name}.`);
  }

  // Current trip
  if (context.currentTrip) {
    const t = context.currentTrip;
    const tripLine = `Current trip: Trip from ${t.origin} to ${t.destination}. Status: ${t.status}.`;
    parts.push(tripLine);
    if (t.flightNumber) {
      parts.push(`Flight: ${t.flightNumber}${t.airline ? ` (${t.airline})` : ''}.`);
    }
    if (t.startedAt) {
      try {
        const depDate = new Date(t.startedAt).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
        parts.push(`Departure: ${depDate}.`);
      } catch (_) { /* ignore date parse errors */ }
    }
  } else {
    // No active trip – check recent trips
    if (context.recentTrips.length > 0) {
      const recent = context.recentTrips.slice(0, 2);
      parts.push('Recent trips:');
      for (const t of recent) {
        parts.push(`- ${t.origin} → ${t.destination} (${t.status})`);
      }
    }
    parts.push('The user has no active trip currently.');
  }

  // Trip history awareness
  if (context.tripHistory.length > 0) {
    parts.push('Trip history available for reference if asked.');
  }

  // User memory / preferences
  if (context.memory) {
    const mem = context.memory;
    if (mem.preferences?.preferredTransport) {
      parts.push(`Preferred transport: ${mem.preferences.preferredTransport}.`);
    }
    if (mem.preferences?.commonRoutes && mem.preferences.commonRoutes.length > 0) {
      parts.push(`Common routes: ${mem.preferences.commonRoutes.join(', ')}.`);
    }
    if (mem.preferences?.savedPlaces && mem.preferences.savedPlaces.length > 0) {
      parts.push(`Saved places: ${mem.preferences.savedPlaces.join(', ')}.`);
    }
    if (mem.importantFacts && mem.importantFacts.length > 0) {
      parts.push('Important facts about the user:');
      for (const fact of mem.importantFacts) {
        parts.push(`- ${fact}`);
      }
    }
  }

  // Previous conversation summary
  const summary = conversationSummary ?? context.recentConversationSummary;
  if (summary) {
    parts.push(`Previous conversation summary: ${summary}`);
  }

  // Important rules
  parts.push('');
  parts.push('IMPORTANT RULES:');
  parts.push('- Only mention information relevant to the user\'s question.');
  parts.push('- Never guess trip status — always reference it from provided context.');
  parts.push('- If a trip is completed, do not suggest continuing that trip.');
  parts.push('- If the user asks about an active trip, provide real-time relevant details.');
  parts.push('- For cancelled trips, acknowledge the cancellation and offer to help rebook.');
  parts.push('- Answer naturally and conversationally.');
  parts.push('- If unsure, say so and suggest checking the airline app or contacting support.');

  return parts.join('\n');
}