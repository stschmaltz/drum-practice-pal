import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    mutationKey: songLinkKeys.writes(user.id),
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
