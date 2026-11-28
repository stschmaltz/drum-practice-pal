import { useId, useState } from 'react';
import { isRunning, type PlayerSnapshot, type PlayerStatus } from '@/features/player/PlayerService';

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
 * Whether a change of the player's status should close the open loop sheet:
 * playback has just been started with a count-in, by something other than the
 * sheet's own "Play loop" (Play in the page's bar, Space, a pedal), and the
 * number is about to show under the sheet.
 *
 * Only the count-in that starts a run. A sheet open when a repeat's count-in
 * comes was opened while the loop played, for its speed, and closing it at
 * every pass would take that control from under the finger; one opened during
 * a count-in stays for the same reason. Which of the two a count-in is comes
 * from the player (`countInCause`), never from the status before it: at the
 * end of a pass alphaTab may say "stopped" before "finished", and a render
 * between them makes a repeat's count-in follow `ready`, as a start's does.
 *
 * Never while the loop form is open: taps on the score then pick the form's
 * bars instead of seeking, and a sheet closed over the form leaves that mode
 * with nothing on show to say so (20 batch 4 QA, issue 3). A covered number
 * is the lesser fault.
 */
export function countInClosesPanel(
  before: PlayerStatus,
  now: Pick<PlayerSnapshot, 'status' | 'countInCause'>,
  { formOpen }: { formOpen: boolean },
): boolean {
  const starts = now.status === 'countingIn' && now.countInCause === 'start';
  return !formOpen && starts && !isRunning(before);
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
