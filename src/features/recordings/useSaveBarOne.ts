import {
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
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
 * What the server is known to hold for each link's video, per query client:
 * the value a failed save goes back to. Not the value from before that save:
 * with two saves in flight that is the other's optimistic value, which may
 * fail too. Kept per video, not per link: a line-up belongs to the address it
 * was made on, and a link pointed at another video has none of the old one's.
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

/** One video of one link: what a save is for. A newline can't be in an id or an address. */
type SaveTarget = Pick<BarOneSave, 'linkId' | 'url'>;
const targetKey = ({ linkId, url }: SaveTarget) => `${linkId}\n${url}`;

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
 *   when no other save of that link is waiting and the cache still shows the
 *   value it sent: a later save's value stays, also when it is the same
 *   number (Later, Later, Earlier, the first one failing).
 * - Every one of these acts on the link only while the cache still has it at
 *   the address the save was made for. An answer that lands after the link
 *   was pointed at another video changes nothing: that video has no line-up.
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
  /** Whether a save for this video of the link, other than the one asking, is still on its way. */
  const othersPendingFor = (target: SaveTarget) =>
    queryClient
      .getMutationCache()
      .findAll({ mutationKey, status: 'pending' })
      .filter((mutation) => {
        const save = mutation.state.variables as BarOneSave | undefined;
        return save !== undefined && targetKey(save) === targetKey(target);
      }).length > 1;
  /**
   * The line-up as the cache shows it for this video of the link; undefined
   * when the list or the link isn't cached, or the link is at another address.
   */
  const shown = ({ linkId, url }: SaveTarget) => {
    const link = cachedLineUp(queryClient.getQueryData<SongLinkRow[]>(queryKey), linkId);
    return link?.url === url ? link.barOneSeconds : undefined;
  };
  /** Sets the line-up, only while the link is still at the address the save was for. */
  const setBarOne = (target: SaveTarget, barOneSeconds: number | null) => {
    if (shown(target) === undefined) return;
    queryClient.setQueryData<SongLinkRow[]>(queryKey, (rows) =>
      withBarOne(rows, target.linkId, barOneSeconds),
    );
  };

  return useMutation({
    mutationKey,
    networkMode: 'always',
    scope: { id: `line-up:${user.id}:${songId}` },
    mutationFn: (save: BarOneSave) => saveBarOne(user.id, save),
    onMutate: (save) => {
      // A read already on its way is from before this save: it must not land over it.
      void queryClient.cancelQueries({ queryKey });
      const before = shown(save);
      // Nothing else for this video in flight: what the cache shows is what the server holds.
      if (!othersPendingFor(save) && before !== undefined) {
        confirmedOf(queryClient).set(targetKey(save), before);
      }
      setBarOne(save, save.barOneSeconds);
    },
    onSuccess: (saved, save) => {
      confirmedOf(queryClient).set(targetKey(save), saved);
      // Saves answer in the order sent, so with none of this link waiting this is the newest word.
      if (!othersPendingFor(save)) setBarOne(save, saved);
    },
    onError: (_error, save) => {
      // One still waiting was pressed after this: its value is what is on its way, also
      // when it is the number this one sent.
      if (othersPendingFor(save)) return;
      const confirmed = confirmedOf(queryClient);
      const key = targetKey(save);
      if (shown(save) === save.barOneSeconds && confirmed.has(key)) {
        setBarOne(save, confirmed.get(key) ?? null);
      }
    },
    onSettled: () => {
      // Not awaited: the controls don't wait on a read that may hang.
      if (!othersPending()) void queryClient.invalidateQueries({ queryKey });
    },
  });
}

/**
 * The failure of the latest line-up save of a link, null when it went
 * through, is still on its way, or none was made. Read from the mutation
 * cache, not from the hook that sent it: the line-up leaves the page with its
 * video (another source, the tab), and a save that fails after that is said
 * by the line-up that is there when the link is next on show. It goes with
 * the link's next save, or when the mutation is collected five minutes on.
 */
export function useLineUpFailure(songId: string, linkId: string): unknown {
  const user = useSignedInUser();
  // In the order they were sent.
  const saves = useMutationState({
    filters: { mutationKey: songLinkKeys.lineUpsOf(user.id, songId) },
    select: (mutation) => ({
      status: mutation.state.status,
      error: mutation.state.error as unknown,
      linkId: (mutation.state.variables as BarOneSave | undefined)?.linkId,
    }),
  });
  const latest = saves.filter((save) => save.linkId === linkId).at(-1);
  return latest?.status === 'error' ? latest.error : null;
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
