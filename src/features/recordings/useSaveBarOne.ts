import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSignedInUser } from '@/lib/auth';
import type { SongLinkRow } from './songLinkForm';
import { songLinkKeys } from './songLinkKeys';
import { saveBarOne } from './songLinksApi';

export interface BarOneSave {
  linkId: string;
  /** The second of the video at which the tab's bar 1 starts; null takes the line-up away. */
  barOneSeconds: number | null;
}

/**
 * What the server is known to hold for each link, per query client: the value
 * a failed save goes back to. Not the value from before that save: with two
 * saves in flight that is the other's optimistic value, which may fail too.
 */
const confirmedByClient = new WeakMap<QueryClient, Map<string, number | null>>();

function confirmedOf(queryClient: QueryClient): Map<string, number | null> {
  let confirmed = confirmedByClient.get(queryClient);
  if (!confirmed) {
    confirmed = new Map();
    confirmedByClient.set(queryClient, confirmed);
  }
  return confirmed;
}

/** A cached link's line-up, or undefined when the list or the link isn't cached. */
export function cachedBarOne(
  rows: readonly SongLinkRow[] | undefined,
  linkId: string,
): number | null | undefined {
  const row = rows?.find((link) => link.id === linkId);
  // A row cached by a build from before Unit 19 has no such field.
  return row && (row.bar_one_seconds ?? null);
}

function withBarOne(
  rows: readonly SongLinkRow[] | undefined,
  linkId: string,
  barOneSeconds: number | null,
): SongLinkRow[] | undefined {
  return rows?.map((row) => (row.id === linkId ? { ...row, bar_one_seconds: barOneSeconds } : row));
}

/**
 * Saves where bar 1 falls in a link's video: "Bar 1 starts now" and each
 * nudge (Unit 19). Optimistic, so the tab follows the new line-up at once,
 * and online only like every edit of a link (a video needs a connection
 * anyway): the controls are off offline and their handlers ask `isOnline()`.
 *
 * Two can be in flight (two nudges, a nudge after a line-up):
 * - They are sent one at a time, in the order pressed (`scope`), so the
 *   server ends on the later one.
 * - An answer is taken into the cache only when no later save is waiting;
 *   until then the cache holds the later save's value, which is what is on
 *   its way.
 * - A save that failed puts back what the server is known to hold, and only
 *   while the cache still shows the value it sent: a later save's value stays.
 * The list is read again once the last one settles, whatever happened.
 */
export function useSaveBarOne(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = songLinkKeys.forSong(user.id, songId);
  const mutationKey = songLinkKeys.lineUpsOf(user.id, songId);
  /** Whether a save other than the one asking is still on its way. */
  const othersPending = () => queryClient.isMutating({ mutationKey }) > 1;
  const setBarOne = (linkId: string, barOneSeconds: number | null) =>
    queryClient.setQueryData<SongLinkRow[]>(queryKey, (rows) =>
      withBarOne(rows, linkId, barOneSeconds),
    );
  const shown = (linkId: string) =>
    cachedBarOne(queryClient.getQueryData<SongLinkRow[]>(queryKey), linkId);

  return useMutation({
    mutationKey,
    networkMode: 'always',
    scope: { id: `line-up:${user.id}:${songId}` },
    mutationFn: ({ linkId, barOneSeconds }: BarOneSave) =>
      saveBarOne(user.id, linkId, barOneSeconds),
    onMutate: ({ linkId, barOneSeconds }) => {
      // A read already on its way is from before this save: it must not land over it.
      void queryClient.cancelQueries({ queryKey });
      const before = shown(linkId);
      // Nothing else in flight: what the cache shows is what the server holds.
      if (!othersPending() && before !== undefined) confirmedOf(queryClient).set(linkId, before);
      setBarOne(linkId, barOneSeconds);
    },
    onSuccess: (saved, { linkId }) => {
      confirmedOf(queryClient).set(linkId, saved);
      // Saves answer in the order sent, so with none waiting this is the newest word.
      if (!othersPending()) setBarOne(linkId, saved);
    },
    onError: (_error, { linkId, barOneSeconds }) => {
      const confirmed = confirmedOf(queryClient);
      if (shown(linkId) === barOneSeconds && confirmed.has(linkId)) {
        setBarOne(linkId, confirmed.get(linkId) ?? null);
      }
    },
    onSettled: () => {
      // Not awaited: the controls don't wait on a read that may hang.
      if (!othersPending()) void queryClient.invalidateQueries({ queryKey });
    },
  });
}

/**
 * A link's line-up as the cache shows it at the moment of asking, for a
 * press: a nudge moves what is there now, an earlier nudge's optimistic value
 * included, not what the last render drew.
 */
export function useBarOneAtPress(songId: string): (linkId: string) => number | null | undefined {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return (linkId) =>
    cachedBarOne(
      queryClient.getQueryData<SongLinkRow[]>(songLinkKeys.forSong(user.id, songId)),
      linkId,
    );
}
