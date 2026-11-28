import { useEffect, useRef } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Loop } from '@/features/loops/loopForm';
import { useGaveUpWaiting } from './useGaveUpWaiting';

/** What the hook reads of the song's loops query (`useLoops`). */
export type RequestedLoopList = Pick<
  UseQueryResult<Loop[]>,
  'data' | 'isFetchedAfterMount' | 'fetchStatus' | 'refetch'
>;

/**
 * Opens the loop a link names (the practice screen's `/songs/:id/loops/:loopId`):
 * once per id, when the score and the song's loops are both in. An id that
 * isn't one of this song's loops opens nothing, then or later.
 *
 * The id is settled against a list read since the page opened, not one cached
 * from an earlier visit: that list may be from before another device saved the
 * loop (it would never open) or changed its speed (it would open at the old
 * one). So a read on its way is waited for, and a cached list that lacks the
 * loop is read again once. A read that fails, or can't start (offline), leaves
 * the cached list to go by.
 *
 * The wait has an end (`FRESH_READ_WAIT_MS` from the player opening on this
 * id): Play is off until the loop is open, and a connection that hangs must
 * not keep it off for a loop the device already has. The loop then opens from
 * the cached list, as it does offline. Only a loop the list has: one it lacks
 * is still waited for, since there is nothing to open. The answer that comes
 * later lands in the list like any refetch and opens nothing again (`handled`),
 * so a loop already playing is not restarted and its speed is not moved; if
 * another device had saved a different speed, the one played here is written
 * only when it is changed here (`useSaveLoopSpeed`).
 *
 * `userChoseLoop`: a loop is already open (the user
 * picked one, or a loop key moved on and the URL followed), and a late answer
 * must not open another over it.
 */
export function useRequestedLoop(
  loopId: string | null,
  ready: boolean,
  loops: RequestedLoopList,
  openLoop: (loop: Loop) => void,
  userChoseLoop: boolean,
): void {
  const handled = useRef<string | null>(null);
  const readAgainFor = useRef<string | null>(null);
  const { data, isFetchedAfterMount, fetchStatus, refetch } = loops;
  const gaveUpWaiting = useGaveUpWaiting(loopId);

  useEffect(() => {
    if (loopId === null || handled.current === loopId || !ready || !data) return;
    if (userChoseLoop) {
      handled.current = loopId;
      return;
    }
    const loop = data.find((listed) => listed.id === loopId);
    if (!isFetchedAfterMount) {
      if (fetchStatus === 'fetching' && !(loop && gaveUpWaiting)) return;
      if (!loop && readAgainFor.current !== loopId) {
        readAgainFor.current = loopId;
        void refetch();
        return;
      }
    }
    // Before opening: leaving the loop and getting a refetched list must not open it again.
    handled.current = loopId;
    if (loop) openLoop(loop);
  }, [
    loopId,
    ready,
    data,
    isFetchedAfterMount,
    fetchStatus,
    refetch,
    openLoop,
    userChoseLoop,
    gaveUpWaiting,
  ]);
}
