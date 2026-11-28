import { isOnline } from '@/lib/network';

/**
 * The precondition of opening a recording, asked by every control that does
 * (the overview's buttons and links out, the play screen's video box):
 * YouTube and Spotify need a connection, and without one the frame would only
 * show the browser's error page. Controls draw themselves off on
 * `useOnline()` and their handlers ask this at the press.
 */
export function canOpenRecording(): boolean {
  return isOnline();
}

/**
 * The click handler of a link that opens a recording and does nothing else:
 * a press the gate refuses goes nowhere (no navigation, no new tab).
 */
export function refuseUnlessCanOpen(event: { preventDefault: () => void }): void {
  if (!canOpenRecording()) event.preventDefault();
}
