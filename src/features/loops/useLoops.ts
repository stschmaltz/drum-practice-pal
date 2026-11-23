import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSignedInUser } from '@/lib/auth';
import { loopKeys } from './loopKeys';
import { createLoop, deleteLoop, fetchLoops, updateLoop } from './loopsApi';
import {
  applySavedLoopEdit,
  revertLoopEdit,
  type Loop,
  type LoopEdit,
  type NewLoop,
} from './loopForm';

/**
 * Whether a loop write other than the one settling is in flight. For onSuccess
 * and onSettled, where the settling mutation still counts as pending.
 */
function anotherWriteIsPending(queryClient: QueryClient, userId: string): boolean {
  return queryClient.isMutating({ mutationKey: loopKeys.writes(userId) }) > 1;
}

/**
 * Refetches the user's loops once the last loop write settles. A refetch while
 * another write is still pending would replace that write's optimistic value
 * with the old server row. Called from onSettled.
 */
function invalidateWhenIdle(queryClient: QueryClient, userId: string) {
  if (anotherWriteIsPending(queryClient, userId)) return;
  return queryClient.invalidateQueries({ queryKey: loopKeys.forUser(userId) });
}

/** One song's loops, oldest first; sort for display with sortLoops. */
export function useLoops(songId: string) {
  const user = useSignedInUser();
  return useQuery({
    queryKey: loopKeys.forSong(user.id, songId),
    queryFn: () => fetchLoops(user.id, songId),
  });
}

/**
 * Not optimistic: the form stays up as "Saving…" until the row exists, so a
 * loop the server refused is never on show (or playing). The caller chooses
 * the id (randomUuid()), so the same variables sent again can't insert twice.
 */
export function useCreateLoop(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = loopKeys.forSong(user.id, songId);

  return useMutation({
    mutationKey: loopKeys.writes(user.id),
    mutationFn: (loop: Omit<NewLoop, 'song_id'>) =>
      createLoop(user.id, { ...loop, song_id: songId }),
    onSuccess: (saved) => {
      queryClient.setQueryData<Loop[]>(queryKey, (loops) =>
        loops ? [...loops.filter((loop) => loop.id !== saved.id), saved] : loops,
      );
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}

export interface LoopUpdate {
  loopId: string;
  changes: Partial<LoopEdit>;
}

/** Optimistic: shows the edit at once and rolls back only that loop's sent fields on error. */
export function useUpdateLoop(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = loopKeys.forSong(user.id, songId);

  return useMutation({
    mutationKey: loopKeys.writes(user.id),
    mutationFn: ({ loopId, changes }: LoopUpdate) => updateLoop(user.id, loopId, changes),
    onMutate: async ({ loopId, changes }) => {
      // A refetch landing after this would overwrite the optimistic value.
      await queryClient.cancelQueries({ queryKey });
      const before = queryClient.getQueryData<Loop[]>(queryKey)?.find((l) => l.id === loopId);
      queryClient.setQueryData<Loop[]>(queryKey, (loops) =>
        loops?.map((loop) => (loop.id === loopId ? { ...loop, ...changes } : loop)),
      );
      return { before };
    },
    // Only this loop's sent fields, not a snapshot of the whole list: other
    // loops may have been edited, deleted or added since onMutate.
    onError: (_error, { loopId, changes }, context) => {
      const before = context?.before;
      if (!before) return;
      queryClient.setQueryData<Loop[]>(queryKey, (loops) =>
        loops?.map((loop) => (loop.id === loopId ? revertLoopEdit(loop, before, changes) : loop)),
      );
    },
    // Two controls write one loop ("Save speed" and the edit form), so another
    // edit of it may be pending. The server's row can be from before that edit:
    // taken whole, its old bars would move the playing loop back until the edit
    // lands. Then only the sent fields are taken; the refetch once every write
    // has settled brings the rest.
    onSuccess: (saved, { changes }) => {
      const othersPending = anotherWriteIsPending(queryClient, user.id);
      queryClient.setQueryData<Loop[]>(queryKey, (loops) =>
        loops?.map((loop) => {
          if (loop.id !== saved.id) return loop;
          return othersPending ? applySavedLoopEdit(loop, saved, changes) : { ...loop, ...saved };
        }),
      );
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}

/**
 * Not optimistic: deleting can't be undone (the practice history goes too),
 * so the loop stays listed until the server confirms, and a failure leaves it there.
 */
export function useDeleteLoop(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = loopKeys.forSong(user.id, songId);

  return useMutation({
    mutationKey: loopKeys.writes(user.id),
    mutationFn: (loopId: string) => deleteLoop(user.id, loopId),
    onSuccess: (_result, loopId) => {
      queryClient.setQueryData<Loop[]>(queryKey, (loops) =>
        loops?.filter((loop) => loop.id !== loopId),
      );
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}
