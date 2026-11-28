import { useEffect, useRef, useState } from 'react';
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { Song } from '@/features/library/songForm';
import { songKeys } from '@/features/library/useSongs';
import { putOutboxEntry, type OutboxHold } from '@/features/offline/outbox';
import { sessionKeys } from '@/features/practice/sessionKeys';
import type { PracticeSession } from '@/features/practice/sessions';
import { useSignedInUser } from '@/lib/auth';
import { queuedWriteRetry } from '@/lib/network';
import { sendRefreshingToken } from '@/lib/tokenRefresh';
import { randomUuid } from '@/lib/randomUuid';
import type { LoopStatus } from '@/lib/schema';
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
 * The refetches TanStack Query starts by itself (window focus, reconnect, a
 * new screen mounting the list), held off while any loop write is pending: a
 * write waiting between retries is pending but not paused, and a list read
 * then would put the old server row back over its optimistic value (a bars
 * edit of the playing loop would move playback back). invalidateWhenIdle
 * reads the list once the last write has settled.
 */
function refetchUnlessWritesPending(queryClient: QueryClient, userId: string) {
  const whenIdle = () => queryClient.isMutating({ mutationKey: loopKeys.writes(userId) }) === 0;
  return { refetchOnWindowFocus: whenIdle, refetchOnReconnect: whenIdle, refetchOnMount: whenIdle };
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: loopKeys.forSong(user.id, songId),
    queryFn: () => fetchLoops(user.id, songId),
    ...refetchUnlessWritesPending(queryClient, user.id),
  });
}

/**
 * Every loop of every song with its song's name, for the home page; pick a
 * tab's loops and their order with practiceLoopsFor.
 */
export function usePracticeLoops() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: loopKeys.practice(user.id),
    queryFn: () => fetchPracticeLoops(user.id),
    ...refetchUnlessWritesPending(queryClient, user.id),
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
    // Online only (the form refuses offline), so a dropped connection fails it rather than pausing it.
    networkMode: 'always',
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
  /** The edit's outbox entry, when it is one an earlier page left unsent (useOutboxReplay). */
  queueId?: string;
  /**
   * When that entry was first queued. Kept as it was, so a replay that is
   * left unsent again still sorts before edits made after it.
   */
  queuedAt?: number;
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

/** What a loop edit's onMutate hands its other callbacks. */
interface LoopEditContext {
  /** The loop as cached before the edit, for the rollback. */
  before: Loop | undefined;
  /** This send's hold on its outbox entry, let go once the server has answered. */
  queued: OutboxHold;
}

/**
 * One definition of a loop edit, for useUpdateLoop and for the replay of
 * edits an earlier page left unsent.
 *
 * Optimistic: shows the edit at once and rolls back only that loop's sent
 * fields when the server refuses it. A connection that is missing or drops
 * is not a refusal: offline the edit waits (TanStack Query pauses it) and a
 * dropped request is tried again, so a speed change or "Mark finished" made at
 * the kit with no Wi-Fi stays on screen and goes when the connection is
 * back. Until the server has answered, the edit is kept in the outbox, so a
 * reload or a closed tab doesn't lose it.
 *
 * Every loop edit of the user's runs in one queue (`scope`): two waiting
 * offline would otherwise be sent at once when the connection came back, and
 * the server could get the newer speed first and keep the older one.
 */
export function loopEditOptions(queryClient: QueryClient, userId: string, songId: string) {
  return {
    mutationKey: loopKeys.writes(userId),
    scope: { id: loopKeys.writes(userId).join('/') },
    mutationFn: ({ loopId, changes }: LoopUpdate) =>
      sendRefreshingToken(() => updateLoop(userId, loopId, changes)),
    ...queuedWriteRetry,
    onMutate: async ({
      loopId,
      changes,
      queueId = randomUuid(),
      queuedAt = Date.now(),
    }: LoopUpdate): Promise<LoopEditContext> => {
      // Started first, awaited last: the screen shows the edit without waiting for the
      // database, and the request goes only once the entry is stored (its removal, when
      // the answer comes, is queued behind it).
      const queued = putOutboxEntry({
        kind: 'loopEdit',
        id: queueId,
        userId,
        queuedAt,
        songId,
        loopId,
        changes,
      });
      // A refetch landing after this would overwrite the optimistic value. Every
      // loops query, since the home page's list holds the loop too.
      await queryClient.cancelQueries({ queryKey: loopKeys.forUser(userId) });
      const before = cachedLoop(queryClient, userId, songId, loopId);
      setCachedLoop(queryClient, userId, songId, loopId, (loop) => ({ ...loop, ...changes }));
      await queued.stored;
      return { before, queued };
    },
    // Only this loop's sent fields, not a snapshot of the whole list: other
    // loops may have been edited, deleted or added since onMutate.
    onError: (
      _error: Error,
      { loopId, changes }: LoopUpdate,
      context: LoopEditContext | undefined,
    ) => {
      const before = context?.before;
      if (!before) return;
      setCachedLoop(queryClient, userId, songId, loopId, (loop) =>
        revertLoopEdit(loop, before, changes),
      );
    },
    // Two controls write one loop (the speed as it changes, and the edit form), so another
    // edit of it may be pending. The server's row can be from before that edit:
    // taken whole, its old bars would move the playing loop back until the edit
    // lands. Then only the sent fields are taken; the refetch once every write
    // has settled brings the rest.
    onSuccess: (saved: Loop, { changes }: LoopUpdate) => {
      const othersPending = anotherWriteIsPending(queryClient, userId);
      setCachedLoop(queryClient, userId, songId, saved.id, (loop) =>
        othersPending ? applySavedLoopEdit(loop, saved, changes) : { ...loop, ...saved },
      );
    },
    onSettled: (
      _saved: Loop | undefined,
      _error: Error | null,
      _variables: LoopUpdate,
      context: LoopEditContext | undefined,
    ) => {
      if (context) void context.queued.release();
      return invalidateWhenIdle(queryClient, userId);
    },
  };
}

/**
 * Edits a loop (loopEditOptions has the rules). Finishing and reopening a
 * loop are edits of its status, so they go through here too, from the song
 * page and from the home page.
 */
export function useUpdateLoop(songId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation(loopEditOptions(queryClient, user.id, songId));
}

/** Whether a mutation's variables are a write of this loop's status. */
export function isStatusWriteOf(variables: unknown, loopId: string): boolean {
  if (typeof variables !== 'object' || variables === null) return false;
  const { loopId: writtenId, changes } = variables as Partial<LoopUpdate>;
  return writtenId === loopId && changes?.status !== undefined;
}

/** The loop and the status a status write asked for, or null for any other write. */
function statusWriteIn(variables: unknown): { loopId: string; status: LoopStatus } | null {
  if (typeof variables !== 'object' || variables === null) return null;
  const { loopId, changes } = variables as Partial<LoopUpdate>;
  return loopId !== undefined && changes?.status !== undefined
    ? { loopId, status: changes.status }
    : null;
}

/** The status writes the server refused: of one loop, or of every loop. */
function refusedStatusWrites(userId: string, loopId?: string) {
  return {
    mutationKey: loopKeys.writes(userId),
    status: 'error' as const,
    predicate: (mutation: { state: { variables?: unknown } }) => {
      const write = statusWriteIn(mutation.state.variables);
      return write !== null && (loopId === undefined || write.loopId === loopId);
    },
  };
}

/**
 * Puts away what refused status changes left to say (13.35c). The refusals are
 * failed mutations kept in the mutation cache, which is all the message under
 * the loop is read from: removing them changes nothing saved, here or on the
 * server. Only writes that have failed go; one still on its way is never touched.
 * With `among`, only those of them it holds.
 */
function dismissStatusRefusals(
  queryClient: QueryClient,
  userId: string,
  { loopId, among }: { loopId?: string; among?: WeakSet<object> } = {},
): void {
  const cache = queryClient.getMutationCache();
  for (const mutation of cache.findAll(refusedStatusWrites(userId, loopId))) {
    if (among === undefined || among.has(mutation)) cache.remove(mutation);
  }
}

/** Whether a mutation's variables are a write of this loop's speed. */
export function isSpeedWriteOf(variables: unknown, loopId: string): boolean {
  if (typeof variables !== 'object' || variables === null) return false;
  const { loopId: writtenId, changes } = variables as Partial<LoopUpdate>;
  return writtenId === loopId && changes?.speed_ratio !== undefined;
}

/**
 * How the saves of one loop's speed are going (`useSaveLoopSpeed` sends them
 * from the song page), read from the mutation cache: `waiting` while one is
 * held offline, and the latest one's failure, if it failed.
 */
export function useLoopSpeedSaves(loopId: string) {
  const user = useSignedInUser();
  const writes = useMutationState({
    filters: {
      mutationKey: loopKeys.writes(user.id),
      predicate: (mutation) => isSpeedWriteOf(mutation.state.variables, loopId),
    },
    select: (mutation) => ({
      status: mutation.state.status,
      paused: mutation.state.isPaused,
      error: mutation.state.error,
    }),
  });
  const latest = writes.at(-1);
  return {
    waiting: writes.some((write) => write.status === 'pending' && write.paused),
    error: latest?.status === 'error' ? latest.error : null,
  };
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
    select: (mutation) => ({
      status: mutation.state.status,
      error: mutation.state.error,
      asked: statusWriteIn(mutation.state.variables)?.status ?? null,
    }),
  });
  const latest = writes.at(-1);
  const refused = latest?.status === 'error' ? latest : null;

  /** False, sending nothing, while another status write to the loop is on its way. */
  const setStatus = (status: LoopStatus): boolean => {
    // Asked of the cache at the press, not taken from the last render.
    if (queryClient.isMutating(filters) > 0) return false;
    mutate({ loopId, changes: { status } });
    return true;
  };
  return {
    setStatus,
    isPending: writes.some((write) => write.status === 'pending'),
    error: refused ? (refused.error as { message: string }) : null,
    /** The status the refused change asked for, which is what the message says; null with no `error`. */
    refused: refused?.asked ?? null,
    /** Puts `error` away, for every control of the loop. Sends nothing and changes no loop. */
    dismissError: () => dismissStatusRefusals(queryClient, user.id, { loopId }),
  };
}

/** What a screen tells `useLoopStatusRefusals` about itself. */
interface LoopStatusRefusalsScreen {
  /** Hears each status change the server refuses while the screen is up. */
  onRefused?: (loopId: string, refused: LoopStatus) => void;
  /** The one loop whose refusals the screen says (the practice screen); every loop's without it. */
  loopId?: string;
  /**
   * Whether those refusals' messages are on show now: false while what draws
   * them is closed or replaced (the loop sheet closed, the loop form over the
   * list, no "Mark finished?" prompt).
   */
  showing?: boolean;
}

/**
 * For a screen that shows loops' status controls, called once by the part of
 * it that outlives its loops' items (the list, the page):
 *
 * - `onRefused` hears each status change the server refuses while the screen
 *   is up, as it is refused, and the caller re-renders. The refusal moves the
 *   loop back to the list it came from, so the item focus followed it to is
 *   taken away: the list hands focus on (`findStatusButtonAfterRefusal`). A
 *   refusal from before the screen opened is not heard, so nothing takes focus
 *   as a page opens.
 * - Leaving the screen puts away the message of every refusal it had on show
 *   (`loopId`, `showing`), so it isn't there again on coming back (until then
 *   it stays, up to the five minutes the mutation cache keeps a failed write).
 *   A refusal the screen never showed is kept: until a screen that says it has
 *   been opened, the message is the only sign that the change did not hold.
 */
export function useLoopStatusRefusals({
  onRefused,
  loopId,
  showing = true,
}: LoopStatusRefusalsScreen = {}): void {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const latestOnRefused = useRef(onRefused);
  useEffect(() => {
    latestOnRefused.current = onRefused;
  });
  // The hand-over waits for a render of the caller (`useFocusWhenReady`), and the loop may
  // have been drawn back in its place before the refusal is heard: this makes one.
  const [heard, setHeard] = useState(0);
  // The refusals this screen has had on show, for as long as it is up.
  const [shown] = useState(() => new WeakSet<object>());
  const leaving = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Mounted again straight after a clean-up (StrictMode): the screen never left.
    clearTimeout(leaving.current);
    const cache = queryClient.getMutationCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      if (!cache.findAll(refusedStatusWrites(user.id)).includes(event.mutation)) return;
      const write = statusWriteIn(event.mutation.state.variables);
      if (!write) return;
      latestOnRefused.current?.(write.loopId, write.status);
      setHeard((count) => count + 1);
    });
    return () => {
      unsubscribe();
      // After this commit, not in it: a clean-up that a mount follows at once is no leaving.
      leaving.current = setTimeout(() =>
        dismissStatusRefusals(queryClient, user.id, { among: shown }),
      );
    };
  }, [queryClient, user.id, shown]);

  // After the one above, so it has heard: as the screen opens, as a refusal lands, and as
  // the messages come on show.
  useEffect(() => {
    if (!showing) return;
    const refusals = queryClient.getMutationCache().findAll(refusedStatusWrites(user.id, loopId));
    for (const refusal of refusals) shown.add(refusal);
  }, [queryClient, user.id, loopId, showing, heard, shown]);
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
    networkMode: 'always',
    mutationFn: (loopId: string) => deleteLoop(user.id, loopId),
    onSuccess: (_result, loopId) => {
      setCachedLoops(queryClient, user.id, songId, (loops) =>
        loops.filter((loop) => loop.id !== loopId),
      );
      // Its practice history went with it (cascade).
      queryClient.removeQueries({ queryKey: sessionKeys.forLoop(user.id, loopId) });
      // Its sessions went with it: the streak and the Stats page count them no more. Taken
      // out of the cache here, not left to the refetch: if that read fails or the connection
      // drops, the deleted history would still be counted, and persisted for offline. A read
      // already on its way is from before the delete, so it is cancelled first.
      const everyKey = sessionKeys.every(user.id);
      void queryClient.cancelQueries({ queryKey: everyKey });
      queryClient.setQueryData<PracticeSession[]>(everyKey, (sessions) =>
        sessions?.filter((session) => session.loop_id !== loopId),
      );
      void queryClient.invalidateQueries({ queryKey: everyKey });
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}
