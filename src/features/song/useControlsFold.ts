import { useState } from 'react';
import type { ControlsFold } from '@/features/player/PlayerControls';

/**
 * The song page's controls bar folds while playback runs, so the score gets
 * the screen (progressive disclosure: while playing, the metronome and the
 * speed are what is reached for; everything else is a tap away behind "Show
 * controls"). Unfolded whenever playback isn't running.
 *
 * "Show controls" holds for the rest of that run; the next start folds again,
 * so a one-off change mid-play doesn't leave the bar out for good. Only Play,
 * Pause and the end of the song change `running`, never a tap on the score (a
 * seek keeps it running), so the score never moves under a tap because of this.
 */
export function useControlsFold(running: boolean): ControlsFold {
  const [shownWhileRunning, setShownWhileRunning] = useState(false);
  const [wasRunning, setWasRunning] = useState(running);
  // State from the previous render: a stop drops "Show controls" before this render draws.
  if (running !== wasRunning) {
    setWasRunning(running);
    if (!running) setShownWhileRunning(false);
  }
  const shown = running && shownWhileRunning;
  return {
    folded: running && !shown,
    canFold: running,
    onFoldedChange: (folded) => setShownWhileRunning(!folded),
  };
}
