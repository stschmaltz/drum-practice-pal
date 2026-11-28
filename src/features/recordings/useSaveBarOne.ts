import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSignedInUser } from '@/lib/auth';
import {
  cachedLineUp,
  withBarOne,
  type BarOneSave,
  type LinkAtPress,
  type SongLinkRow,
} from './songLinkForm';
import { songLinkKeys } from './songLinkKeys';
import { saveBarOne } from './songLinksApi';

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

/**
 * Saves where bar 1 falls in a link's video: "Bar 1 starts now", a typed
 * time and each nudge (Unit 19). Optimistic, so the tab follows the new
 * line-up at once, and online only like every edit of a link (a video needs
 * a connection anyway): the controls are off offline and their handlers ask
 * `isOnline()`.
 *
 * Two can be in flight (two nudges, a nudge after a line-up):
 * - They are sent one at a time, in the order pressed (`scope`), so the
 *   server ends on the later one.
 * - An answer is taken into the cache only when no later save of that link
 *   is waiting; until then the cache holds the later save's value, which is
 *   what is on its way.
 * - A save that failed puts back what the server is known to hold, and only
 *   while the cache still shows the value it sent: a later save's value stays.
 * "In flight" is counted per link: a song's two recordings share the key and
 * the scope, and a save of the other one says nothing about this one (19
 * Review: with the Original's save out, a failed save of the Drumless had no
 * value to go back to and kept its guess on show).
 * The list is read again once the last one of the song settles, whatever
 * happened.
 */
export function useSaveBarOne(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = songLinkKeys.forSong(user.id, songId);
  const mutationKey = songLinkKeys.lineUpsOf(user.id, songId);
  /** Whether any save of this song's links other than the one asking is still on its way. */
  const othersPending = () => queryClient.isMutating({ mutationKey }) > 1;
  /** Whether a save of this link other than the one asking is still on its way. */
  const othersPendingFor = (linkId: string) =>
    queryClient
      .getMutationCache()
      .findAll({ mutationKey, status: 'pending' })
      .filter((mutation) => (mutation.state.variables as BarOneSave | undefined)?.linkId === linkId)
      .length > 1;
  const setBarOne = (linkId: string, barOneSeconds: number | null) =>
    queryClient.setQueryData<SongLinkRow[]>(queryKey, (rows) =>
      withBarOne(rows, linkId, barOneSeconds),
    );
  /** The link's line-up as the cache shows it; undefined when the list or the link isn't cached. */
  const shown = (linkId: string) =>
    cachedLineUp(queryClient.getQueryData<SongLinkRow[]>(queryKey), linkId)?.barOneSeconds;

  return useMutation({
    mutationKey,
    networkMode: 'always',
    scope: { id: `line-up:${user.id}:${songId}` },
    mutationFn: (save: BarOneSave) => saveBarOne(user.id, save),
    onMutate: ({ linkId, barOneSeconds }) => {
      // A read already on its way is from before this save: it must not land over it.
      void queryClient.cancelQueries({ queryKey });
      const before = shown(linkId);
      // Nothing else of this link in flight: what the cache shows is what the server holds.
      if (!othersPendingFor(linkId) && before !== undefined) {
        confirmedOf(queryClient).set(linkId, before);
      }
      setBarOne(linkId, barOneSeconds);
    },
    onSuccess: (saved, { linkId }) => {
      confirmedOf(queryClient).set(linkId, saved);
      // Saves answer in the order sent, so with none of this link waiting this is the newest word.
      if (!othersPendingFor(linkId)) setBarOne(linkId, saved);
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
 * A link as the cache shows it at the moment of asking, for a press: a nudge
 * moves the line-up that is there now, an earlier nudge's optimistic value
 * included, not what the last render drew; and every save carries the
 * address the page knows then, the stored one, which the server matches
 * (never the parser's tidied copy of it). Undefined when the link isn't
 * cached.
 */
export function useLinkAtPress(songId: string): (linkId: string) => LinkAtPress | undefined {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return (linkId) =>
    cachedLineUp(
      queryClient.getQueryData<SongLinkRow[]>(songLinkKeys.forSong(user.id, songId)),
      linkId,
    );
}
