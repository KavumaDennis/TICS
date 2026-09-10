/**
 * queryClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared TanStack Query client for the Explore module.
 * Configured with sensible defaults for stale-while-revalidate behavior.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient instance — created once, never re-created per render.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes default
      gcTime: 30 * 60 * 1000,          // 30 minutes garbage collection
      retry: 1,                        // Single retry for transient failures
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,     // Don't refetch on window focus (mobile)
      refetchOnReconnect: true,        // Refetch when network reconnects
      refetchOnMount: true,            // Refetch on mount if stale
    },
    mutations: {
      retry: 0,
    },
  },
});