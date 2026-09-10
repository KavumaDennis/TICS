import { create } from 'zustand';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
  Timestamp,
} from 'firebase/firestore';

import {
  assistantChat,
  type AssistantHistoryItem,
} from '@/src/firebase/callables';

import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

/* =========================
   TYPES
========================= */

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt?: any;
};

type AssistantState = {
  conversationId: string | null;
  tripId: string | null;
  messages: AssistantMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  /** Pre-set initial message to auto-send on next conversation start */
  pendingInitialMessage: string | null;
  /** Pre-set trip ID to use when navigating to assistant */
  pendingTripId: string | null;
  /** Whether we're in a "thinking" state */
  thinking: boolean;
  /** Timestamp when conversation was last cleared — used to filter old messages */
  clearedAt: number | null;

  startConversation: (uid: string, tripId: string | null) => void;
  stopConversation: () => void;
  resetConversation: (uid: string) => Promise<void>;
  sendMessage: (input: {
    uid: string;
    tripId: string | null;
    text: string;
  }) => Promise<void>;
  /** Set a message that will be auto-sent when the assistant screen opens */
  setPendingMessage: (message: string, tripId?: string | null) => void;
  /** Clear pending message */
  clearPendingMessage: () => void;
};

/* =========================
   INTERNAL STATE
========================= */

let unsubMessages: Unsubscribe | null = null;
let activeConversationId: string | null = null;

/* =========================
   HELPERS
========================= */

/**
 * Build conversation ID compatible with the currently deployed backend.
 * The backend uses: `${uid}_${tripId}` or `${uid}_general`
 */
function buildConversationId(uid: string, tripId: string | null): string {
  return tripId ? `${uid}_${tripId}` : `${uid}_general`;
}

/**
 * Convert common API error messages to user-friendly text.
 */
function friendlyError(raw: string): string {
  if (!raw) return 'Something went wrong. Please try again.';

  const lower = raw.toLowerCase();

  if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('resource exhausted') || lower.includes('429')) {
    return 'The AI assistant is temporarily unavailable due to high demand. Please wait a moment and try again.';
  }

  if (lower.includes('deadline exceeded') || lower.includes('timeout') || lower.includes('timed out')) {
    return 'The AI is taking too long to respond. Please check your connection and try again.';
  }

  if (lower.includes('permission') || lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('401') || lower.includes('403')) {
    return 'You don\'t have permission to use the assistant. Please sign out and sign in again.';
  }

  if (lower.includes('not found') || lower.includes('404') || lower.includes('does not exist')) {
    return 'The conversation could not be found. Please start a new chat.';
  }

  if (lower.includes('internal') || lower.includes('server error') || lower.includes('500')) {
    return 'The AI assistant encountered a server error. Please try again later.';
  }

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('offline') || lower.includes('connection') || lower.includes('dns')) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }

  // For long technical messages, truncate to a friendly summary
  if (raw.length > 120) {
    return 'The assistant is having trouble right now. Please try again in a moment.';
  }

  return raw;
}

/* =========================
   STORE
========================= */

export const useAssistantStore = create<AssistantState>((set, get) => ({
  conversationId: null,
  tripId: null,
  messages: [],
  loading: false,
  sending: false,
  error: null,
  pendingInitialMessage: null,
  pendingTripId: null,
  thinking: false,
  clearedAt: null,

  setPendingMessage: (message, tripId) => {
    console.log('[assistantStore] setPendingMessage called', {
      messagePreview: message?.substring(0, 80) + '...',
      tripId: tripId ?? null,
    });
    set({ pendingInitialMessage: message, pendingTripId: tripId ?? null });
  },

  clearPendingMessage: () => {
    console.log('[assistantStore] clearPendingMessage called');
    set({ pendingInitialMessage: null, pendingTripId: null });
  },

  /* =========================
     START CONVERSATION
  ========================= */

  startConversation: (uid, tripId) => {
    const db = getFirebaseFirestore();
    const effectiveTripId = get().pendingTripId ?? tripId;
    const conversationId = buildConversationId(uid, effectiveTripId);

    console.log('[assistantStore] startConversation', {
      uid,
      providedTripId: tripId,
      pendingTripId: get().pendingTripId,
      effectiveTripId,
      conversationId,
      activeConversationId,
    });

    // prevent duplicate listeners
    if (activeConversationId === conversationId) {
      console.log('[assistantStore] conversation already active, skipping');
      return;
    }

    // cleanup old listener
    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }

    activeConversationId = conversationId;

    // Don't clear messages here — start with whatever is in state.
    // Only set loading if messages are empty.
    const currentMessages = get().messages;
    set({
      conversationId,
      tripId: effectiveTripId,
      loading: currentMessages.length === 0,
      error: null,
      thinking: false,
    });

    const msgCol = collection(
      db,
      'assistant_conversations',
      conversationId,
      'assistant_messages'
    );

    const q = query(msgCol, orderBy('createdAt', 'asc'));

    unsubMessages = onSnapshot(
      q,
      (snap) => {
        const clearedAt = get().clearedAt;
        let msgs: AssistantMessage[] = snap.docs.map((d) => {
          const data: any = d.data();
          return {
            id: d.id,
            role: data.role === 'assistant' ? 'assistant' : 'user',
            text: String(data.text ?? data.content ?? ''),
            createdAt: data.createdAt ?? data.timestamp,
          };
        });

        // If user cleared the chat, filter out messages created before the clear time
        if (clearedAt) {
          msgs = msgs.filter((m) => {
            if (!m.createdAt) return false;
            const msgTime = m.createdAt?.toMillis?.() ?? (m.createdAt?.seconds ? m.createdAt.seconds * 1000 : new Date(m.createdAt).getTime());
            return msgTime > clearedAt;
          });
        }

        console.log('[assistantStore] messages snapshot received', {
          totalInDb: snap.docs.length,
          filtered: msgs.length,
          clearedAt,
          conversationId: get().conversationId,
        });

        set({
          messages: msgs,
          loading: false,
          thinking: false,
        });
      },
      (err) => {
        console.error('[assistantStore] snapshot error', err);
        set({
          loading: false,
          error: friendlyError(err?.message ?? ''),
          thinking: false,
        });
      }
    );
  },

  /* =========================
     STOP CONVERSATION
  ========================= */

  stopConversation: () => {
    console.log('[assistantStore] stopConversation called');
    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }

    activeConversationId = null;

    set({
      conversationId: null,
      tripId: null,
      messages: [],
      loading: false,
      sending: false,
      error: null,
      thinking: false,
    });
  },

  /* =========================
     RESET CONVERSATION
     Hides all previous messages from the UI permanently.
     Messages remain in Firestore but are filtered by clearedAt timestamp.
  ========================= */

  resetConversation: async (uid) => {
    console.log('[assistantStore] resetConversation called');

    // Stop current listener
    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }

    activeConversationId = null;
    const currentTripId = get().tripId;

    // Set the cleared timestamp to NOW — all messages before this point
    // will be filtered out by the snapshot listener
    const now = Date.now();

    // Clear local state
    set({
      conversationId: null,
      tripId: null,
      messages: [],
      loading: false,
      sending: false,
      error: null,
      thinking: false,
      clearedAt: now,
    });

    console.log('[assistantStore] resetConversation: clearedAt set to', new Date(now).toISOString());
  },

  /* =========================
     SEND MESSAGE
  ========================= */

  sendMessage: async ({ uid, tripId, text }) => {
    const trimmed = text.trim();
    if (!trimmed) {
      console.warn('[assistantStore] sendMessage called with empty text');
      return;
    }

    // If no conversation is active, start one
    if (!get().conversationId) {
      get().startConversation(uid, tripId);
      // Small delay for listener to register
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log('[assistantStore] sendMessage called', {
      textPreview: trimmed.substring(0, 80) + '...',
      uid,
      tripId,
      currentSending: get().sending,
      conversationId: get().conversationId,
    });

    if (get().sending) {
      console.warn('[assistantStore] already sending, skipping');
      return;
    }

    set({ sending: true, error: null, thinking: true });

    try {
      const conversationId = get().conversationId;

      console.log('[assistantStore] calling assistantChat function', {
        conversationId,
        hasConversationId: !!conversationId,
      });

      if (!conversationId) {
        throw new Error('No conversation ID available');
      }

      await assistantChat({
        message: trimmed,
        tripId,
        conversationId,
      });

      console.log('[assistantStore] assistantChat succeeded');

      // Force-fetch messages after send to ensure UI updates even if snapshot
      // doesn't fire in time for brand new conversations
      const convId = conversationId as string;
      try {
        const db = getFirebaseFirestore();
        const msgCol = collection(
          db,
          'assistant_conversations',
          convId,
          'assistant_messages'
        );
        const q = query(msgCol, orderBy('createdAt', 'asc'));
        const snap = await getDocs(q);
        const clearedAt = get().clearedAt;
        let msgs: AssistantMessage[] = snap.docs.map((d) => {
          const data: any = d.data();
          return {
            id: d.id,
            role: data.role === 'assistant' ? 'assistant' : 'user',
            text: String(data.text ?? data.content ?? ''),
            createdAt: data.createdAt ?? data.timestamp,
          };
        });

        // Apply clearedAt filter
        if (clearedAt) {
          msgs = msgs.filter((m) => {
            if (!m.createdAt) return false;
            const msgTime = m.createdAt?.toMillis?.() ?? (m.createdAt?.seconds ? m.createdAt.seconds * 1000 : new Date(m.createdAt).getTime());
            return msgTime > clearedAt;
          });
        }

        if (msgs.length > 0) {
          console.log('[assistantStore] force-fetched messages after send', {
            count: msgs.length,
          });
          set({ messages: msgs });
        }
      } catch (fetchErr) {
        console.warn('[assistantStore] force-fetch failed (non-critical)', fetchErr);
      }
    } catch (e: any) {
      console.error('[assistantStore] assistantChat failed', e?.message ?? e);
      const rawMsg = e?.message ?? '';
      const userFriendly = friendlyError(rawMsg);
      set((state) => ({
        error: userFriendly,
        thinking: false,
        messages: [
          ...state.messages,
          {
            id: `error_${Date.now()}`,
            role: 'assistant' as const,
            text: userFriendly,
          },
        ],
      }));
    } finally {
      set({ sending: false, thinking: false });
    }
  },
}));