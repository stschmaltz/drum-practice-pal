import { QueryClient } from '@tanstack/react-query';
// Sets up onlineManager before the client first asks it anything.
import './network';

/**
 * How long cached rows are kept, in memory and in the cache persisted for
 * offline (queryPersister.ts). The two must match: a query collected from
 * memory is gone from the next save of the cache too, and a song's loops must
 * still be there offline weeks after the song was opened. Rows are small; the
 * one large query (a song's file) sets its own.
 */
// Three weeks: gcTime is a setTimeout, which can't wait longer than 24.8 days.
export const QUERY_CACHE_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: QUERY_CACHE_MAX_AGE_MS,
      retry: 2,
    },
  },
});
