import { QueryClient, type Query } from '@tanstack/react-query';
import { songFileKeys, songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import type { SessionRecord } from '@/features/practice/sessionTracker';
import { offlineDb, type OutboxEntry } from './offlineDb';
import { clearOfflineData } from './offlineData';
import { outboxEntries, putOutboxEntry, takeLeftoverOutboxEntries } from './outbox';
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

/** Queues an entry as a send on this page does, the row written; gives back the send's hold. */
async function queued(entry: OutboxEntry) {
  const hold = putOutboxEntry(entry);
  await hold.stored;
  return hold;
}

const idsOf = (leftover: { entry: OutboxEntry }[]) => leftover.map(({ entry }) => entry.id);

describe('outbox', () => {
  it('keeps an entry until its send lets go of it', async () => {
    const hold = await queued(session('a'));
    expect(await outboxEntries('u1')).toHaveLength(1);
    await hold.release();
    expect(await outboxEntries('u1')).toEqual([]);
  });

  it("gives the replay an earlier page's entries, the user's own only, oldest first", async () => {
    await leftBehind(session('late', 'u1', 30), session('early', 'u1', 10), session('x', 'u2', 5));
    const taken = await takeLeftoverOutboxEntries('u1');
    expect(idsOf(taken)).toEqual(['early', 'late']);
  });

  it('never gives the replay what this page is sending itself', async () => {
    await queued(session('mine'));
    await leftBehind(session('theirs'));
    expect(idsOf(await takeLeftoverOutboxEntries('u1'))).toEqual(['theirs']);
  });

  it('gives each entry to one replay, when two start together', async () => {
    await leftBehind(session('a'), session('b'));
    const [first, second] = await Promise.all([
      takeLeftoverOutboxEntries('u1'),
      takeLeftoverOutboxEntries('u1'),
    ]);
    expect(idsOf([...first, ...second]).sort()).toEqual(['a', 'b']);
  });

  it("holds what the replay took until the replay lets go, whatever the entry's own send does", async () => {
    await leftBehind(session('left'));
    const [taken] = await takeLeftoverOutboxEntries('u1');
    // The replay's mutation queues it again for itself, and has its answer.
    const send = await queued(session('left'));
    await send.release();
    expect(idsOf(await takeLeftoverOutboxEntries('u1'))).toEqual([]);
    expect(await outboxEntries('u1')).toHaveLength(1);

    await taken!.release();
    expect(await outboxEntries('u1')).toEqual([]);
  });

  it('never gives the replay an entry whose removal is still on its way (14.6)', async () => {
    const hold = await queued(session('answered'));
    // The replay's read is in flight when the answer arrives: it finds the row still there.
    const taking = takeLeftoverOutboxEntries('u1');
    const removing = hold.release();
    expect(await taking).toEqual([]);
    await removing;
    expect(await outboxEntries('u1')).toEqual([]);
  });

  it('gives the replay nothing when it starts just after a removal does', async () => {
    const hold = await queued(session('answered'));
    const removing = hold.release();
    const taking = takeLeftoverOutboxEntries('u1');
    expect(await taking).toEqual([]);
    await removing;
  });

  it('keeps an entry claimed when it is queued again while its last removal is on its way', async () => {
    const first = await queued(session('again'));
    const removing = first.release();
    const again = putOutboxEntry(session('again'));
    await Promise.all([removing, again.stored]);
    expect((await outboxEntries('u1')).map((entry) => entry.id)).toEqual(['again']);
    // This page is sending it again, so a replay started now must leave it alone.
    expect(await takeLeftoverOutboxEntries('u1')).toEqual([]);

    // And the second send's answer takes the row out and gives the id up.
    await again.release();
    expect(await outboxEntries('u1')).toEqual([]);
    await leftBehind(session('again'));
    expect(idsOf(await takeLeftoverOutboxEntries('u1'))).toEqual(['again']);
  });

  it('keeps an answered entry from the replay when its row could not be deleted', async () => {
    const hold = await queued(session('stuck'));
    const refuse = vi.spyOn(offlineDb.outbox, 'delete').mockRejectedValueOnce(new Error('quota'));
    await hold.release();
    refuse.mockRestore();
    expect(await outboxEntries('u1')).toHaveLength(1);
    expect(await takeLeftoverOutboxEntries('u1')).toEqual([]);
  });

  // Copilot review on #37: two sends of one id at once (a session's "Try again" pressed
  // twice). The row is every such send's copy, so it goes with the last of them.
  describe('queued by two sends at once', () => {
    // Holds outlive a test (the module's state is this page's), so each test has its own id.
    it.each([
      { answeredFirst: 'the earlier send', order: [0, 1] },
      { answeredFirst: 'the later send', order: [1, 0] },
    ] as const)(
      "stays, and stays this page's, when $answeredFirst is answered first; the other takes it out",
      async ({ order }) => {
        const holds = [await queued(session('twice')), await queued(session('twice'))] as const;

        await holds[order[0]].release();
        expect((await outboxEntries('u1')).map((entry) => entry.id)).toEqual(['twice']);
        expect(await takeLeftoverOutboxEntries('u1')).toEqual([]);

        await holds[order[1]].release();
        expect(await outboxEntries('u1')).toEqual([]);
      },
    );

    it('is there for the next page when this one closes with one send unanswered', async () => {
      const [first] = [await queued(session('closed')), await queued(session('closed'))] as const;
      await first.release();

      // A new page: the same database, none of this page's holds.
      vi.resetModules();
      const nextPage = await import('./outbox');
      expect(idsOf(await nextPage.takeLeftoverOutboxEntries('u1'))).toEqual(['closed']);
    });

    it("lets one send go once: a second release of the same hold is not the other send's", async () => {
      const [first] = [await queued(session('once')), await queued(session('once'))] as const;
      await first.release();
      await first.release();
      expect(await outboxEntries('u1')).toHaveLength(1);
      expect(await takeLeftoverOutboxEntries('u1')).toEqual([]);
    });

    it('is taken out by the later send when its answer comes while the row is being deleted for the earlier', async () => {
      const first = await queued(session('during'));
      const realDelete = offlineDb.outbox.delete.bind(offlineDb.outbox);
      let finish!: () => void;
      const heldDelete = new Promise<void>((resolve) => (finish = resolve));
      const deleting = vi.spyOn(offlineDb.outbox, 'delete').mockImplementationOnce(((key: string) =>
        (async () => {
          await realDelete(key);
          await heldDelete;
        })()) as never);
      const removing = first.release();
      // Queued again and answered at once, all inside the first removal.
      const second = await queued(session('during'));
      await second.release();
      expect(await outboxEntries('u1')).toEqual([]);
      // The first removal is still on its way, so the id is still this page's.
      await leftBehind(session('during'));
      expect(await takeLeftoverOutboxEntries('u1')).toEqual([]);

      finish();
      await removing;
      deleting.mockRestore();
      expect(idsOf(await takeLeftoverOutboxEntries('u1'))).toEqual(['during']);
    });
  });

  it('is emptied by a sign-out, with a write begun before it kept out', async () => {
    await queued(session('a'));
    const late = putOutboxEntry(session('b'));
    await clearOfflineData();
    await late.stored;
    expect(await outboxEntries('u1')).toEqual([]);
  });
});

describe('shouldPersistQuery', () => {
  const query = (
    queryKey: readonly unknown[],
    status: 'success' | 'pending' | 'error',
    data: unknown = status === 'success' ? [] : undefined,
  ) => ({ queryKey, state: { status, data } }) as unknown as Pick<Query, 'queryKey' | 'state'>;

  it('keeps loaded rows', () => {
    expect(shouldPersistQuery(query(songKeys.forUser('u1'), 'success'))).toBe(true);
    expect(shouldPersistQuery(query(loopKeys.practice('u1'), 'success'))).toBe(true);
  });

  it('keeps loaded rows whose background refetch failed', () => {
    expect(shouldPersistQuery(query(songKeys.forUser('u1'), 'error', []))).toBe(true);
  });

  it('leaves out song files (stored on their own) and anything never loaded', () => {
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

  it('keeps rows whose background refetch failed, restored as loaded rows', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(songKeys.forUser('u1'), [{ title: 'Opened before' }]);
    await queryClient
      .fetchQuery({
        queryKey: songKeys.forUser('u1'),
        queryFn: () => Promise.reject(new Error('Failed to fetch')),
      })
      .catch(() => {});
    expect(queryClient.getQueryState(songKeys.forUser('u1'))?.status).toBe('error');

    const stop = saveCacheWhenHidden(queryClient);
    try {
      window.dispatchEvent(new Event('pagehide'));
      await vi.waitFor(
        async () => expect(await restoredSongs()).toEqual([{ title: 'Opened before' }]),
        { timeout: 500 },
      );
      const restored = await queryPersister.restoreClient();
      expect(restored?.clientState.queries[0]?.state).toMatchObject({
        status: 'success',
        error: null,
      });
    } finally {
      stop();
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
    await queued(session('a'));
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
