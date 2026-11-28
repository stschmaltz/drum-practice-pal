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
import { putOutboxEntry, removeOutboxEntry } from '@/features/offline/outbox';
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
      // Never back: a replayed, older time must not undo a newer one already shown.
      setCachedPlayedAt(queryClient, userId, songId, (current) => latest([current, playedAt]));
      await queued;
      return { queueId };
    },
    // What the database kept: its own clock's time if this device's ran ahead. While another
    // of these is on its way its newer time may be showing, so then the later of the two stays.
    onSuccess: (kept: string | null, { songId }: SongPlayed) => {
      if (kept === null) return;
      const othersPending = queryClient.isMutating({ mutationKey }) > 1;
      setCachedPlayedAt(queryClient, userId, songId, (current) =>
        othersPending ? latest([current, kept]) : kept,
      );
    },
    // Answered either way: kept, the song gone, or refused (it would be refused again). A
    // refusal leaves the list's order a moment ahead of the server until its next read.
    onSettled: (
      _kept: string | null | undefined,
      _error: Error | null,
      _variables: SongPlayed,
      context: { queueId: string } | undefined,
    ) => {
      if (context) void removeOutboxEntry(context.queueId);
    },
  };
}

/**
 * Sends the write from the mutation cache, with no component behind it: the
 * link out that calls it stays on the page, but the play screen that calls it
 * may be left before the answer comes. Never rejects: nobody is told.
 */
export function markSongPlayedUnobserved(
  queryClient: QueryClient,
  userId: string,
  played: SongPlayed,
): void {
  queryClient
    .getMutationCache()
    .build(queryClient, songPlayedOptions(queryClient, userId))
    .execute(played)
    .catch(() => {});
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
