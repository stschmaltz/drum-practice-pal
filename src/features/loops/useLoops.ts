import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { Song } from '@/features/library/songForm';
import { songKeys } from '@/features/library/useSongs';
import { sessionKeys } from '@/features/practice/sessionKeys';
import type { LoopStatus } from '@/lib/schema';
import { useSignedInUser } from '@/lib/auth';
import { loopKeys } from './loopKeys';
import { createLoop, deleteLoop, fetchLoops, fetchPracticeLoops, updateLoop } from './loopsApi';
import {
  applySavedLoopEdit,
  revertLoopEdit,
  type Loop,
  type LoopEdit,
  type NewLoop,
} from './loopForm';
import type { PracticeLoop } from './practiceList';

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

/**
 * Changes the cached loops wherever they are held: the song's own list and
 * the home page's list of every loop. A list that isn't cached stays that way.
 * Both hold rows that carry a Loop's fields, so one change fits both.
 */
function setCachedLoops(
  queryClient: QueryClient,
  userId: string,
  songId: string,
  change: <T extends Loop>(loops: T[]) => T[],
) {
  queryClient.setQueryData<Loop[]>(loopKeys.forSong(userId, songId), (loops) =>
    loops ? change(loops) : loops,
  );
  queryClient.setQueryData<PracticeLoop[]>(loopKeys.practice(userId), (loops) =>
    loops ? change(loops) : loops,
  );
}

/** Changes one cached loop, in every list that holds it. */
function setCachedLoop(
  queryClient: QueryClient,
  userId: string,
  songId: string,
  loopId: string,
  change: <T extends Loop>(loop: T) => T,
) {
  setCachedLoops(queryClient, userId, songId, (loops) =>
    loops.map((loop) => (loop.id === loopId ? change(loop) : loop)),
  );
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
 * Every loop of every song with its song's name, for the home page; pick a
 * tab's loops and their order with practiceLoopsFor.
 */
export function usePracticeLoops() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: loopKeys.practice(user.id),
    queryFn: () => fetchPracticeLoops(user.id),
  });
}

/**
 * Not optimistic: the form stays up as "Saving…" until the row exists, so a
 * loop the server refused is never on show (or playing). The caller chooses
 * the id (randomUuid()), so the same variables sent again can't insert twice.
 * The new loop joins the home page's list too when that is cached, with its
 * song's name from the song's own cache entry (the song page is where loops
 * are made, so it is there); without the name the refetch brings the loop.
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
      const song = queryClient.getQueryData<Song | null>(songKeys.detail(user.id, songId));
      if (!song) return;
      const listed: PracticeLoop = { ...saved, song: { title: song.title, artist: song.artist } };
      queryClient.setQueryData<PracticeLoop[]>(loopKeys.practice(user.id), (loops) =>
        loops ? [...loops.filter((loop) => loop.id !== saved.id), listed] : loops,
      );
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}

export interface LoopUpdate {
  loopId: string;
  changes: Partial<LoopEdit>;
}

/** The loop as it is cached now, from whichever list holds it. */
function cachedLoop(
  queryClient: QueryClient,
  userId: string,
  songId: string,
  loopId: string,
): Loop | undefined {
  const lists = [
    queryClient.getQueryData<Loop[]>(loopKeys.forSong(userId, songId)),
    queryClient.getQueryData<PracticeLoop[]>(loopKeys.practice(userId)),
  ];
  for (const loops of lists) {
    const loop = loops?.find((cached) => cached.id === loopId);
    if (loop) return loop;
  }
  return undefined;
}

/**
 * Optimistic: shows the edit at once and rolls back only that loop's sent
 * fields on error. Finishing and reopening a loop are edits of its status, so
 * they go through here too, from the song page and from the home page.
 */
export function useUpdateLoop(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loopKeys.writes(user.id),
    mutationFn: ({ loopId, changes }: LoopUpdate) => updateLoop(user.id, loopId, changes),
    onMutate: async ({ loopId, changes }) => {
      // A refetch landing after this would overwrite the optimistic value. Every
      // loops query, since the home page's list holds the loop too.
      await queryClient.cancelQueries({ queryKey: loopKeys.forUser(user.id) });
      const before = cachedLoop(queryClient, user.id, songId, loopId);
      setCachedLoop(queryClient, user.id, songId, loopId, (loop) => ({ ...loop, ...changes }));
      return { before };
    },
    // Only this loop's sent fields, not a snapshot of the whole list: other
    // loops may have been edited, deleted or added since onMutate.
    onError: (_error, { loopId, changes }, context) => {
      const before = context?.before;
      if (!before) return;
      setCachedLoop(queryClient, user.id, songId, loopId, (loop) =>
        revertLoopEdit(loop, before, changes),
      );
    },
    // Two controls write one loop ("Save speed" and the edit form), so another
    // edit of it may be pending. The server's row can be from before that edit:
    // taken whole, its old bars would move the playing loop back until the edit
    // lands. Then only the sent fields are taken; the refetch once every write
    // has settled brings the rest.
    onSuccess: (saved, { changes }) => {
      const othersPending = anotherWriteIsPending(queryClient, user.id);
      setCachedLoop(queryClient, user.id, songId, saved.id, (loop) =>
        othersPending ? applySavedLoopEdit(loop, saved, changes) : { ...loop, ...saved },
      );
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}

/** Whether a mutation's variables are a write of this loop's status. */
export function isStatusWriteOf(variables: unknown, loopId: string): boolean {
  if (typeof variables !== 'object' || variables === null) return false;
  const { loopId: writtenId, changes } = variables as Partial<LoopUpdate>;
  return writtenId === loopId && changes?.status !== undefined;
}

/**
 * Finishes and reopens one loop. What it reports is read from the mutation
 * cache, not from this hook's own mutation, for two reasons:
 *
 * - The same loop has a status control in the list, in the "Mark finished?"
 *   prompt and on the home page. `isPending` is true while any of them is
 *   writing, and a press meanwhile is ignored: it would race the first write
 *   to the server.
 * - The optimistic change moves the loop to another list (or off the tab), so
 *   the control that was pressed unmounts. A failure then puts the loop back
 *   under a new control, which must still be able to say what went wrong:
 *   `error` is that of the loop's latest status write, whoever sent it.
 */
export function useSetLoopStatus(songId: string, loopId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const { mutate } = useUpdateLoop(songId);
  const filters = {
    mutationKey: loopKeys.writes(user.id),
    predicate: (mutation: { state: { variables?: unknown } }) =>
      isStatusWriteOf(mutation.state.variables, loopId),
  };
  // In the order they were sent.
  const writes = useMutationState({
    filters,
    select: (mutation) => ({ status: mutation.state.status, error: mutation.state.error }),
  });
  const latest = writes.at(-1);

  const setStatus = (status: LoopStatus) => {
    // Asked of the cache at the press, not taken from the last render.
    if (queryClient.isMutating(filters) > 0) return;
    mutate({ loopId, changes: { status } });
  };
  return {
    setStatus,
    isPending: writes.some((write) => write.status === 'pending'),
    error: latest?.status === 'error' ? (latest.error as { message: string }) : null,
  };
}

/**
 * Not optimistic: deleting can't be undone (the practice history goes too),
 * so the loop stays listed until the server confirms, and a failure leaves it there.
 */
export function useDeleteLoop(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: loopKeys.writes(user.id),
    mutationFn: (loopId: string) => deleteLoop(user.id, loopId),
    onSuccess: (_result, loopId) => {
      setCachedLoops(queryClient, user.id, songId, (loops) =>
        loops.filter((loop) => loop.id !== loopId),
      );
      // Its practice history went with it (cascade).
      queryClient.removeQueries({ queryKey: sessionKeys.forLoop(user.id, loopId) });
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}
