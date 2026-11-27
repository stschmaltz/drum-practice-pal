import { useEffect, useRef } from 'react';
import type { Loop } from './loopForm';
import { useUpdateLoop } from './useLoops';

/**
 * Keeps the active loop's saved speed on the speed it is played at: every
 * change the user makes while a loop is active (its speed fields and nudges,
 * the speed keys) is saved as it happens, so a loop opens next time at the
 * speed it was last practised at. There is no "Save speed".
 *
 * Only a change of the speed is saved, never a change of the loop: choosing
 * a loop sets the player to that loop's saved speed in the same render, and a
 * refetch that brings another device's speed must not be written back over
 * with the one playing here. Each change is one queued loop edit (offline it
 * waits, and edits go in order), so the last one sent is the one kept.
 */
export function useSaveLoopSpeed(
  songId: string,
  activeLoop: Pick<Loop, 'id' | 'speed_ratio'> | null,
  speedRatio: number,
): void {
  const { mutate } = useUpdateLoop(songId);
  const loopId = activeLoop?.id ?? null;
  const savedRatio = activeLoop?.speed_ratio ?? null;
  // What the last render saw, so only a speed change on the same loop is saved.
  const seen = useRef({ loopId, speedRatio });

  useEffect(() => {
    const before = seen.current;
    seen.current = { loopId, speedRatio };
    if (loopId === null || loopId !== before.loopId) return;
    if (speedRatio === before.speedRatio || speedRatio === savedRatio) return;
    mutate({ loopId, changes: { speed_ratio: speedRatio } });
    // savedRatio is read, not watched: a refetched speed is no reason to save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopId, speedRatio, mutate]);
}
