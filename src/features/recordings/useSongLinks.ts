import { useCallback, useMemo } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSignedInUser } from '@/lib/auth';
import { applyLinkSave, type LinkSavePlan, type SongLinkRow } from './songLinkForm';
import { songLinkKeys } from './songLinkKeys';
import { fetchSongLinks, saveSongLinks } from './songLinksApi';
import { usableLinks, type SongLink } from './songLinks';

/** One song's links as saved, oldest first: what the form edits. */
export function useSongLinks(songId: string) {
  const user = useSignedInUser();
  return useQuery({
    queryKey: songLinkKeys.forSong(user.id, songId),
    queryFn: () => fetchSongLinks(user.id, songId),
  });
}

/**
 * The saved links the app can open or play (`usableLinks`: each one's URL
 * parsed again), for the Play along block and the play screen's sources.
 * Undefined until the links have been read.
 */
export function useUsableLinks(links: { data: SongLinkRow[] | undefined }): SongLink[] | undefined {
  const { data } = links;
  return useMemo(() => (data ? usableLinks(data) : undefined), [data]);
}

/**
 * One press of the form's Save. Online only (the form is off offline), so a
 * dropped connection fails it rather than pausing it. Not optimistic: the
 * form stays up as "Saving…" until every step has gone through, and the list
 * is read again whether it did or not, since a save that failed part-way has
 * still changed what is saved.
 */
export function useSaveSongLinks(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = songLinkKeys.forSong(user.id, songId);

  return useMutation({
    mutationKey: songLinkKeys.savesOf(user.id, songId),
    networkMode: 'always',
    mutationFn: (plan: LinkSavePlan) => saveSongLinks(user.id, songId, plan),
    onSuccess: async (_result, plan) => {
      // A read already on its way is from before the save: it must not land over this.
      await queryClient.cancelQueries({ queryKey });
      // The new buttons show at once, and stay right if the read below fails.
      queryClient.setQueryData<SongLinkRow[]>(queryKey, (rows) =>
        rows ? applyLinkSave(rows, songId, plan, new Date().toISOString()) : rows,
      );
    },
    // Not awaited: the form closes on the save's answer, not on a read that may hang.
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });
}

/**
 * How the song's saves of its links are going, read from the mutation cache,
 * not from the form's own mutation: the overview's links (Back, a loop, the
 * nav, the browser's own Back) can take the form away while its save is on
 * its way, and the save's answer must still be said to whoever is on the
 * overview when it lands, or comes back to it (checklist 1, "an exit left
 * open"; 14 Test bug 2). They can't all be locked: the nav and the browser's
 * Back aren't the page's to lock.
 *
 * - `saving`: a save is on its way, whoever sent it. The form locks on it, so
 *   one opened again meanwhile can't send a second over the first.
 * - `isSaving()`: the same, asked of the cache at a press.
 * - `error`: the latest save's failure, until the next save or `forgetFailure`.
 *   A mutation nobody watches is collected after five minutes, and it goes then.
 */
export function useSongLinkSaves(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const mutationKey = songLinkKeys.savesOf(user.id, songId);
  // In the order they were sent.
  const saves = useMutationState({
    filters: { mutationKey },
    select: (mutation) => ({ status: mutation.state.status, error: mutation.state.error }),
  });
  const latest = saves.at(-1);

  const isSaving = () => queryClient.isMutating({ mutationKey }) > 0;
  /** The failure has been read: said once more nowhere. */
  const forgetFailure = useCallback(() => {
    const cache = queryClient.getMutationCache();
    const failed = cache.findAll({
      mutationKey: songLinkKeys.savesOf(user.id, songId),
      status: 'error',
    });
    for (const mutation of failed) cache.remove(mutation);
  }, [queryClient, user.id, songId]);

  return {
    saving: saves.some((save) => save.status === 'pending'),
    isSaving,
    error: latest?.status === 'error' ? latest.error : null,
    forgetFailure,
  };
}
