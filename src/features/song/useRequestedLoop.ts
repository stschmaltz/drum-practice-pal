import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { Loop } from '@/features/loops/loopForm';
import { isUuid } from '@/lib/randomUuid';
import { LOOP_PARAM } from '@/lib/routes';

/** The loop id in `?loop=`, or null when there is none or it isn't an id at all. */
export function requestedLoopId(params: URLSearchParams): string | null {
  const value = params.get(LOOP_PARAM);
  return value !== null && isUuid(value) ? value : null;
}

/**
 * Opens the song page on the loop named in `?loop=<id>` (the home page's
 * lists link here with it): once per id, when the score and the song's loops
 * are both in. An id that isn't one of this song's loops opens nothing, then
 * or later. The parameter stays in the URL, so a reload opens the loop again.
 */
export function useRequestedLoop(
  ready: boolean,
  loops: readonly Loop[] | undefined,
  openLoop: (loop: Loop) => void,
): void {
  const [params] = useSearchParams();
  const loopId = requestedLoopId(params);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (loopId === null || handled.current === loopId || !ready || !loops) return;
    // Before looking: leaving the loop and getting a refetched list must not open it again.
    handled.current = loopId;
    const loop = loops.find((listed) => listed.id === loopId);
    if (loop) openLoop(loop);
  }, [loopId, ready, loops, openLoop]);
}
