/**
 * useAIDiscovery.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for AI-powered travel discovery.
 * Provides debounced, cancellable AI discovery with loading states.
 * UI never calls Gemini directly - everything flows through AIDiscoveryService.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { AIDiscoveryService } from '@/src/modules/explore/services/ai';
import type { AIDiscoveryResponse, AIUserContext, AIDiscoveryError } from '@/src/modules/explore/services/ai';

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface AIDiscoveryState {
  response: AIDiscoveryResponse | null;
  loading: boolean;
  error: AIDiscoveryError | null;
  conversationId: string | null;
  isFollowUp: boolean;
}

export interface UseAIDiscoveryReturn extends AIDiscoveryState {
  discover: (prompt: string) => Promise<void>;
  clear: () => void;
  retry: () => Promise<void>;
  suggestedPrompts: Array<{ id: string; text: string; icon: string; category: string }>;
}

/* ── Initial State ──────────────────────────────────────────────────────────── */

const INITIAL_STATE: AIDiscoveryState = {
  response: null,
  loading: false,
  error: null,
  conversationId: null,
  isFollowUp: false,
};

/* ── Debounce Timer ─────────────────────────────────────────────────────────── */

const DEBOUNCE_MS = 500;

/* ── Hook ────────────────────────────────────────────────────────────────────── */

export function useAIDiscovery(): UseAIDiscoveryReturn {
  const [state, setState] = useState<AIDiscoveryState>(INITIAL_STATE);
  const lastPromptRef = useRef<string>('');
  const debounceTimerRef = useRef<any>(null);
  const user = useAuthStore((s: any) => s.user);

  /**
   * Build user context from auth store for personalization.
   */
  const buildUserContext = useCallback((): AIUserContext | undefined => {
    if (!user) return undefined;

    return {
      uid: user.uid,
      name: user.name || undefined,
      // Additional context can be loaded from Firestore user profile
    };
  }, [user]);

  /**
   * Submit a prompt to the AI Discovery service.
   * Automatically debounces rapid submissions.
   */
  const discover = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    // Clear any existing debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Check if this is a follow-up (conversation exists)
    const isFollowUp = state.conversationId !== null;

    // Debounce rapid submissions
    if (trimmed === lastPromptRef.current && !isFollowUp) {
      return;
    }

    lastPromptRef.current = trimmed;

    // Use debounce for new conversations, immediate for follow-ups
    if (!isFollowUp) {
      return new Promise<void>((resolve) => {
        debounceTimerRef.current = setTimeout(async () => {
          await executeDiscovery(trimmed, isFollowUp);
          resolve();
        }, DEBOUNCE_MS);
      });
    }

    await executeDiscovery(trimmed, isFollowUp);
  }, [state.conversationId]);

  /**
   * Execute the actual discovery request.
   */
  const executeDiscovery = useCallback(async (prompt: string, isFollowUp: boolean) => {
    setState((prev) => ({ ...prev, loading: true, error: null, isFollowUp }));

    try {
      const userContext = buildUserContext();
      const response = await AIDiscoveryService.discover(prompt, userContext, {
        userId: user?.uid,
      });

      setState({
        response,
        loading: false,
        error: null,
        conversationId: response.conversationId,
        isFollowUp: false,
      });
    } catch (err) {
      const error = err as AIDiscoveryError;
      setState((prev) => ({
        ...prev,
        loading: false,
        error,
        isFollowUp: false,
      }));
    }
  }, [buildUserContext, user?.uid]);

  /**
   * Retry the last prompt.
   */
  const retry = useCallback(async () => {
    if (!lastPromptRef.current) return;
    await executeDiscovery(lastPromptRef.current, false);
  }, [executeDiscovery]);

  /**
   * Clear the current state and conversation.
   */
  const clear = useCallback(() => {
    if (state.conversationId) {
      AIDiscoveryService.clearConversation(state.conversationId);
    }
    setState(INITIAL_STATE);
    lastPromptRef.current = '';
  }, [state.conversationId]);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    ...state,
    discover,
    clear,
    retry,
    suggestedPrompts: AIDiscoveryService.getSuggestedPrompts(),
  };
}