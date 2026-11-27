import { useState } from 'react';
import type { Loop } from './loopForm';

/**
 * Whether the playing loop's saved speed has moved since it was chosen, the
 * second half of `shouldAskToFinish`: one worked up to 100% is asked about,
 * one saved there and never practised isn't. Shared by the loop panel and the
 * practice screen, which both ask "Mark finished?". Set during render, so the
 * render that brings a new loop or a new speed already reads it.
 */
export function useSpeedMovedSinceChosen(
  activeLoop: Pick<Loop, 'id' | 'speed_ratio'> | null,
): boolean {
  const activeId = activeLoop?.id ?? null;
  const activeRatio = activeLoop?.speed_ratio ?? null;
  const [chosen, setChosen] = useState({ loopId: activeId, ratio: activeRatio, moved: false });
  if (chosen.loopId !== activeId) {
    setChosen({ loopId: activeId, ratio: activeRatio, moved: false });
  } else if (!chosen.moved && activeRatio !== chosen.ratio) {
    setChosen({ ...chosen, moved: true });
  }
  return chosen.loopId === activeId && chosen.moved;
}
