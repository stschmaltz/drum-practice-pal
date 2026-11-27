import { useEffect, useRef } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Loop } from '@/features/loops/loopForm';

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
 * the cached list to go by. `userChoseLoop`: a loop is already open (the user
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

  useEffect(() => {
    if (loopId === null || handled.current === loopId || !ready || !data) return;
    if (userChoseLoop) {
      handled.current = loopId;
      return;
    }
    const loop = data.find((listed) => listed.id === loopId);
    if (!isFetchedAfterMount) {
      if (fetchStatus === 'fetching') return;
      if (!loop && readAgainFor.current !== loopId) {
        readAgainFor.current = loopId;
        void refetch();
        return;
      }
    }
    // Before opening: leaving the loop and getting a refetched list must not open it again.
    handled.current = loopId;
    if (loop) openLoop(loop);
  }, [loopId, ready, data, isFetchedAfterMount, fetchStatus, refetch, openLoop, userChoseLoop]);
}
