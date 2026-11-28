/**
 * "A recording of this song was opened" (Unit 14): moves the song's
 * `last_played_at`, which the Songs list's "recently practised" order reads
 * beside the loops' practice. Nothing is logged and nothing asks what was
 * played.
 *
 * A queued write (AGENTS.md, PWA and offline): offline it waits, a dropped
 * request is tried again, a refused token is refreshed, and until the server
 * has answered it is kept in the outbox for the next start. Safe to send
 * twice, late or out of order: the database keeps the later time
 * (`songs_keep_last_played`), so it needs no queue of its own.
 */
import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { putOutboxEntry, type OutboxHold } from '@/features/offline/outbox';
import { useSignedInUser } from '@/lib/auth';
import { queuedWriteRetry } from '@/lib/network';
import { randomUuid } from '@/lib/randomUuid';
import { sendRefreshingToken } from '@/lib/tokenRefresh';
import { markSongPlayed } from './songsApi';
import { latest, type LibrarySong } from './songForm';
import { songKeys } from './useSongs';

export interface SongPlayed {
  songId: string;
  /** ISO time, by this device's clock. */
  playedAt: string;
  /** The write's outbox entry, when it is one an earlier page left unsent (useOutboxReplay). */
  queueId?: string;
  queuedAt?: number;
}

/** The song's row in the cached Songs list, if that list is cached, takes `change`. */
function setCachedPlayedAt(
  queryClient: QueryClient,
  userId: string,
  songId: string,
  change: (current: string | null) => string | null,
) {
  queryClient.setQueryData<LibrarySong[]>(songKeys.forUser(userId), (songs) =>
    songs?.map((song) =>
      song.id === songId ? { ...song, last_played_at: change(song.last_played_at ?? null) } : song,
    ),
  );
}

/**
 * The time the cached list shows once a write's answer is in. `sent` is the
 * time that write asked for, `kept` what the database holds after it.
 *
 * While the list still shows this write's own time, it takes what the
 * database kept: the same time, or the database's clock if this device's ran
 * ahead. Showing anything else (a newer opening's time, whose own answer may
 * already be in), the answer is only an older fact about the row and never
 * moves the time back: answers can land in either order (14 Test, bug 4).
 */
export function playedAtAfterAnswer(
  current: string | null,
  sent: string,
  kept: string,
): string | null {
  return current === sent ? kept : latest([current, kept]);
}

/** One definition of the write, for a press on this page and for the replay of one an earlier page left. */
function songPlayedOptions(queryClient: QueryClient, userId: string) {
  const mutationKey = songKeys.plays(userId);
  return {
    mutationKey,
    mutationFn: ({ songId, playedAt }: SongPlayed) =>
      sendRefreshingToken(() => markSongPlayed(userId, songId, playedAt)),
    ...queuedWriteRetry,
    onMutate: async ({
      songId,
      playedAt,
      queueId = randomUuid(),
      queuedAt = Date.now(),
    }: SongPlayed) => {
      // Started first, awaited last, as a loop edit does: the list moves at once, and the
      // request goes only once the entry is stored.
      const queued = putOutboxEntry({
        kind: 'songPlayed',
        id: queueId,
        userId,
        queuedAt,
        songId,
        playedAt,
      });
      // A read of the list already on its way is from before this write: landing after it,
      // it would put the old time back, and the old order would be persisted for offline
      // (Copilot review on #34). Not awaited, as the loop edits don't: the list moves at once.
      void queryClient.cancelQueries({ queryKey: songKeys.forUser(userId), exact: true });
      // Never back: a replayed, older time must not undo a newer one already shown.
      setCachedPlayedAt(queryClient, userId, songId, (current) => latest([current, playedAt]));
      await queued.stored;
      return { queued };
    },
    // What the database kept, unless a newer opening's time is showing (`playedAtAfterAnswer`).
    onSuccess: (kept: string | null, { songId, playedAt }: SongPlayed) => {
      if (kept === null) return;
      setCachedPlayedAt(queryClient, userId, songId, (current) =>
        playedAtAfterAnswer(current, playedAt, kept),
      );
    },
    // Answered either way: kept, the song gone, or refused (it would be refused again). A
    // refusal leaves the list's order a moment ahead of the server until its next read.
    onSettled: (
      _kept: string | null | undefined,
      _error: Error | null,
      _variables: SongPlayed,
      context: { queued: OutboxHold } | undefined,
    ) => {
      if (context) void context.queued.release();
      // The list held its own refetches while this was pending (`useSongs`); once the last
      // such write has settled it is read again, so what the server kept is what shows.
      // 1 is this mutation, still counted as pending inside its own onSettled.
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: songKeys.forUser(userId), exact: true });
      }
    },
  };
}

/**
 * Sends the write from the mutation cache, with no component behind it: the
 * link out that calls it stays on the page, but the play screen that calls it
 * may be left before the answer comes. Nobody is told how it went.
 */
export function markSongPlayedUnobserved(
  queryClient: QueryClient,
  userId: string,
  played: SongPlayed,
): void {
  void sendSongPlayedUnobserved(queryClient, userId, played);
}

/**
 * The same, for a caller with something to do once the write has settled (the
 * replay lets go of the outbox entry it took). Resolves either way.
 */
export function sendSongPlayedUnobserved(
  queryClient: QueryClient,
  userId: string,
  played: SongPlayed,
): Promise<void> {
  return queryClient
    .getMutationCache()
    .build(queryClient, songPlayedOptions(queryClient, userId))
    .execute(played)
    .then(
      () => {},
      () => {},
    );
}

/** `markPlayed(songId)`: a recording of the song was opened just now. */
export function useMarkSongPlayed(): (songId: string) => void {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const userId = user.id;
  return useCallback(
    (songId: string) =>
      markSongPlayedUnobserved(queryClient, userId, {
        songId,
        playedAt: new Date().toISOString(),
      }),
    [queryClient, userId],
  );
}
