import { create } from 'zustand';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
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

  startConversation: (uid: string, tripId: string | null) => void;
  stopConversation: () => void;
  sendMessage: (input: {
    uid: string;
    tripId: string | null;
    text: string;
  }) => Promise<void>;
};

/* =========================
   INTERNAL STATE
========================= */

let unsubMessages: Unsubscribe | null = null;
let activeConversationId: string | null = null;

/* =========================
   HELPERS
========================= */

function buildConversationId(uid: string, tripId: string | null) {
  return tripId ? `${uid}_${tripId}` : `${uid}_general`;
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

  /* =========================
     START CONVERSATION
  ========================= */

  startConversation: (uid, tripId) => {
    const db = getFirebaseFirestore();
    const conversationId = buildConversationId(uid, tripId);

    // prevent duplicate listeners
    if (activeConversationId === conversationId) return;

    // cleanup old listener
    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }

    activeConversationId = conversationId;

    set({
      conversationId,
      tripId,
      messages: [],
      loading: true,
      error: null,
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
        const msgs: AssistantMessage[] = snap.docs.map((d) => {
          const data: any = d.data();

          return {
            id: d.id,
            role: data.role === 'assistant' ? 'assistant' : 'user',
            text: String(data.text ?? ''),
            createdAt: data.createdAt,
          };
        });

        set({
          messages: msgs,
          loading: false,
        });
      },
      (err) => {
        set({
          loading: false,
          error: err?.message ?? 'Failed to load messages',
        });
      }
    );
  },

  /* =========================
     STOP CONVERSATION
  ========================= */

  stopConversation: () => {
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
    });
  },

  /* =========================
     SEND MESSAGE
  ========================= */

  sendMessage: async ({ uid, tripId, text }) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (get().sending) return;

    set({ sending: true, error: null });

    try {
      const history: AssistantHistoryItem[] = get()
        .messages.slice(-10)
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      await assistantChat({
        message: trimmed,
        tripId,
        history,
      });

      // Firestore listener automatically updates UI — no manual push needed
    } catch (e: any) {
      // Surface the error so the UI can show it
      const msg = e?.message ?? 'Assistant is unavailable right now. Please try again.';
      // Also add a synthetic error message to the chat so user sees feedback inline
      set((state) => ({
        error: msg,
        messages: [
          ...state.messages,
          {
            id: `error_${Date.now()}`,
            role: 'assistant' as const,
            text: `⚠️ ${msg}`,
          },
        ],
      }));
    } finally {
      set({ sending: false });
    }
  },
}));