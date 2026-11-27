import { useId, useState } from 'react';
import type { PlayerStatus } from '@/features/player/PlayerService';

/**
 * Whether pressing "Play loop" should close the loop sheet. The sheet lies
 * over the score and the count-in number at every size, so it closes when the
 * press starts playback. While a loop already plays there is no count-in to
 * see, and the sheet is open for its speed control.
 */
export function playLoopClosesPanel(status: PlayerStatus): boolean {
  return status !== 'playing';
}

/**
 * The loop sheet's open state, and the id of its body for the `aria-controls`
 * of its header. It starts closed, so the score opens with nothing over it,
 * and the user opens it when working on loops.
 */
export function useLoopPanelOpen() {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  return { bodyId, open, setOpen };
}
