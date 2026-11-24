/**
 * TanStack Query's cache, kept in IndexedDB so the library, the loops, the
 * home page, practice history and the settings read offline and on a cold
 * start without a connection. Song files are kept apart (songFileStore.ts):
 * they are large, and JSON would make a Uint8Array an object of numbers.
 *
 * Mutations aren't persisted here: a restored mutation has no function to
 * run. The outbox (outbox.ts) keeps the writes that must survive a reload.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { dehydrate, type Query, type QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { songFileKeys } from '@/features/library/useSongs';
import { QUERY_CACHE_MAX_AGE_MS } from '@/lib/queryClient';
import { offlineDb } from './offlineDb';

/**
 * Changes whenever the shape of a cached row changes (a new column in a
 * select), so a cache from an older build is thrown away, not read as rows it
 * doesn't match.
 */
export const PERSISTED_CACHE_BUSTER = 'unit-11';

const CACHE_KEY = 'query-cache';

/** Only what loaded: a pending or failed query has nothing worth reading offline. */
export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  if (query.state.status !== 'success') return false;
  return query.queryKey[0] !== songFileKeys.all[0];
}

const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return (await offlineDb.queryCache.get(key))?.value ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    // No generation check: the persister writes the cache as it is when it writes, and
    // a sign-out empties the cache, so what it writes after one has nobody's data in it.
    try {
      await offlineDb.queryCache.put({ key, value });
    } catch {
      // Not kept for offline; online nothing changes.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await offlineDb.queryCache.delete(key);
    } catch {
      // As above.
    }
  },
};

export const queryPersister = createAsyncStoragePersister({ storage, key: CACHE_KEY });

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: QUERY_CACHE_MAX_AGE_MS,
  buster: PERSISTED_CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
    shouldDehydrateMutation: () => false,
  },
};

/**
 * Called once the persisted cache is back in memory. Restored rows keep the
 * time they were fetched, so one fetched seconds before a reload would count
 * as fresh (staleTime) and hide what another device saved meanwhile. Marked
 * stale, every screen refetches what it shows as it mounts; offline those
 * fetches wait for the connection and the restored rows stay on screen.
 */
export function restoredCacheIsStale(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ refetchType: 'none' });
}

/**
 * Writes the cache at once whenever the page is hidden or left. The
 * persister writes up to a second after a change, and a phone locked or an
 * app closed within that second would otherwise open offline on the older
 * cache (a loop just saved missing, a speed just saved back at the old one).
 * Both events, as for session logs: iOS often hides a page without
 * `pagehide`. Started once the restore is over, never before: a write while
 * the cache is still being read back would replace it with an empty one.
 */
export function saveCacheWhenHidden(queryClient: QueryClient): () => void {
  const save = () => {
    void storage.setItem(
      CACHE_KEY,
      JSON.stringify({
        buster: PERSISTED_CACHE_BUSTER,
        timestamp: Date.now(),
        clientState: dehydrate(queryClient, persistOptions.dehydrateOptions),
      }),
    );
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') save();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', save);
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', save);
  };
}
