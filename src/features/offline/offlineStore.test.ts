import { QueryClient, type Query } from '@tanstack/react-query';
import { songFileKeys, songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import type { SessionRecord } from '@/features/practice/sessionTracker';
import { offlineDb, type OutboxEntry } from './offlineDb';
import { clearOfflineData } from './offlineData';
import {
  outboxEntries,
  putOutboxEntry,
  removeOutboxEntry,
  takeLeftoverOutboxEntries,
} from './outbox';
import {
  PERSISTED_CACHE_BUSTER,
  queryPersister,
  restoredCacheIsStale,
  saveCacheWhenHidden,
  shouldPersistQuery,
} from './queryPersister';
import { loadSongFile, readStoredSongFile, removeStoredSongFile } from './songFileStore';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const bytes = (...values: number[]) => new Uint8Array(values);
/** fake-indexeddb clones in Node's realm, so compare the values, not the Uint8Array class. */
const values = (array: Uint8Array | null) => (array ? Array.from(array) : null);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('song files on the device', () => {
  it('downloads a song once and reads the stored copy after that', async () => {
    const download = vi.fn(async () => bytes(1, 2, 3));
    expect(values(await loadSongFile('u1', 's1', download))).toEqual([1, 2, 3]);
    expect(values(await loadSongFile('u1', 's1', download))).toEqual([1, 2, 3]);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("keeps each user's files apart", async () => {
    await loadSongFile('u1', 's1', async () => bytes(1));
    expect(await readStoredSongFile('u2', 's1')).toBeNull();
  });

  it('forgets a deleted song', async () => {
    await loadSongFile('u1', 's1', async () => bytes(1));
    await removeStoredSongFile('u1', 's1');
    expect(await readStoredSongFile('u1', 's1')).toBeNull();
  });

  it('does not keep a file whose download finished after a sign-out', async () => {
    const download = deferred<Uint8Array>();
    const loading = loadSongFile('u1', 's1', () => download.promise);
    // Let it get past the read of the store and into the download.
    await vi.waitFor(async () => expect(await readStoredSongFile('u1', 's1')).toBeNull());
    await clearOfflineData();
    download.resolve(bytes(9));
    expect(await loading).toEqual(bytes(9));
    expect(await readStoredSongFile('u1', 's1')).toBeNull();
  });

  it('plays from the network when the store fails', async () => {
    const get = vi.spyOn(offlineDb.songFiles, 'get').mockRejectedValue(new Error('blocked'));
    const put = vi.spyOn(offlineDb.songFiles, 'put').mockRejectedValue(new Error('quota'));
    try {
      expect(await loadSongFile('u1', 's1', async () => bytes(4))).toEqual(bytes(4));
    } finally {
      get.mockRestore();
      put.mockRestore();
    }
  });

  it('fails as the download does when there is no stored copy', async () => {
    await expect(
      loadSongFile('u1', 's1', () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow('offline');
  });
});

const record = (id: string): SessionRecord => ({
  id,
  loopId: 'loop-1',
  startedAt: '2026-11-23T18:00:00.000Z',
  durationSeconds: 45,
  speedRatio: 0.8,
  repeats: 3,
});

const session = (id: string, userId = 'u1', queuedAt = 1): OutboxEntry => ({
  kind: 'session',
  id,
  userId,
  queuedAt,
  record: record(id),
});

/** An entry another page left: written straight to the database, not through this page's outbox. */
async function leftBehind(...entries: OutboxEntry[]) {
  await offlineDb.outbox.bulkPut(entries);
}

describe('outbox', () => {
  it('keeps an entry until it is removed, once however often it is queued', async () => {
    await putOutboxEntry(session('a'));
    await putOutboxEntry(session('a'));
    expect(await outboxEntries('u1')).toHaveLength(1);
    await removeOutboxEntry('a');
    expect(await outboxEntries('u1')).toEqual([]);
  });

  it("gives the replay an earlier page's entries, the user's own only, oldest first", async () => {
    await leftBehind(session('late', 'u1', 30), session('early', 'u1', 10), session('x', 'u2', 5));
    const taken = await takeLeftoverOutboxEntries('u1');
    expect(taken.map((entry) => entry.id)).toEqual(['early', 'late']);
  });

  it('never gives the replay what this page is sending itself', async () => {
    await putOutboxEntry(session('mine'));
    await leftBehind(session('theirs'));
    expect((await takeLeftoverOutboxEntries('u1')).map((entry) => entry.id)).toEqual(['theirs']);
  });

  it('gives each entry to one replay, when two start together', async () => {
    await leftBehind(session('a'), session('b'));
    const [first, second] = await Promise.all([
      takeLeftoverOutboxEntries('u1'),
      takeLeftoverOutboxEntries('u1'),
    ]);
    expect([...first, ...second].map((entry) => entry.id).sort()).toEqual(['a', 'b']);
  });

  it('is emptied by a sign-out, with a write begun before it kept out', async () => {
    await putOutboxEntry(session('a'));
    const late = putOutboxEntry(session('b'));
    await clearOfflineData();
    await late;
    expect(await outboxEntries('u1')).toEqual([]);
  });
});

describe('shouldPersistQuery', () => {
  const query = (queryKey: readonly unknown[], status: 'success' | 'pending' | 'error') =>
    ({ queryKey, state: { status } }) as unknown as Pick<Query, 'queryKey' | 'state'>;

  it('keeps loaded rows', () => {
    expect(shouldPersistQuery(query(songKeys.forUser('u1'), 'success'))).toBe(true);
    expect(shouldPersistQuery(query(loopKeys.practice('u1'), 'success'))).toBe(true);
  });

  it('leaves out song files (stored on their own) and anything not loaded', () => {
    expect(shouldPersistQuery(query(songFileKeys.forSong('u1', 's1'), 'success'))).toBe(false);
    expect(shouldPersistQuery(query(songKeys.forUser('u1'), 'pending'))).toBe(false);
    expect(shouldPersistQuery(query(songKeys.forUser('u1'), 'error'))).toBe(false);
  });
});

describe('restoredCacheIsStale', () => {
  it('marks every restored query stale without fetching anything', () => {
    const queryClient = new QueryClient();
    const queryFn = vi.fn(async () => []);
    queryClient.setQueryData(songKeys.forUser('u1'), []);
    queryClient
      .getQueryCache()
      .find({ queryKey: songKeys.forUser('u1') })!
      .setOptions({
        queryKey: songKeys.forUser('u1'),
        queryFn,
      });
    restoredCacheIsStale(queryClient);
    expect(queryClient.getQueryState(songKeys.forUser('u1'))?.isInvalidated).toBe(true);
    expect(queryFn).not.toHaveBeenCalled();
  });
});

describe('saveCacheWhenHidden', () => {
  /** The songs the persisted cache holds for u1, as the next page would restore them. */
  async function restoredSongs() {
    const restored = await queryPersister.restoreClient();
    const songs = restored?.clientState.queries.find(
      (query) => JSON.stringify(query.queryKey) === JSON.stringify(songKeys.forUser('u1')),
    );
    return songs?.state.data;
  }

  it.each([
    [
      'the page is hidden',
      () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      },
    ],
    ['the page is left', () => window.dispatchEvent(new Event('pagehide'))],
  ])('writes the cache at once when %s, not a second later', async (_case, hide) => {
    const queryClient = new QueryClient();
    const stop = saveCacheWhenHidden(queryClient);
    try {
      queryClient.setQueryData(songKeys.forUser('u1'), [{ title: 'Just saved' }]);
      hide();
      await vi.waitFor(
        async () => expect(await restoredSongs()).toEqual([{ title: 'Just saved' }]),
        {
          timeout: 500,
        },
      );
    } finally {
      stop();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    }
  });

  it('writes nothing while the page stays on show', async () => {
    const queryClient = new QueryClient();
    const stop = saveCacheWhenHidden(queryClient);
    queryClient.setQueryData(songKeys.forUser('u1'), [{ title: 'Just saved' }]);
    document.dispatchEvent(new Event('visibilitychange'));
    stop();
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await offlineDb.queryCache.count()).toBe(0);
  });
});

describe('clearOfflineData (sign-out)', () => {
  it("leaves nothing of anyone's on the device: song files, queued writes and the persisted cache", async () => {
    await loadSongFile('u1', 's1', async () => bytes(1));
    await putOutboxEntry(session('a'));
    await queryPersister.persistClient({
      timestamp: Date.now(),
      buster: PERSISTED_CACHE_BUSTER,
      clientState: { queries: [], mutations: [] },
    });
    await vi.waitFor(async () => expect(await offlineDb.queryCache.count()).toBe(1));

    await clearOfflineData();

    expect(await readStoredSongFile('u1', 's1')).toBeNull();
    expect(await outboxEntries('u1')).toEqual([]);
    expect(await offlineDb.queryCache.count()).toBe(0);
    expect(await queryPersister.restoreClient()).toBeUndefined();
  });

  it('resolves even when the database is unusable', async () => {
    const transaction = vi
      .spyOn(offlineDb, 'transaction')
      .mockRejectedValue(new Error('blocked') as never);
    try {
      await expect(clearOfflineData()).resolves.toBeUndefined();
    } finally {
      transaction.mockRestore();
    }
  });
});
