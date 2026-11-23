import { useId, useState } from 'react';
import { layoutForWidth, PAGE_LAYOUT_QUERY } from '@/features/player/layout';
import type { PlayerStatus } from '@/features/player/PlayerService';

/**
 * From this width the side panel starts open: the score beside it still fits
 * a few bars to a line. Narrower (a tablet in portrait), it starts closed so
 * the score opens at full width, and the user opens it when working on loops.
 */
export const LOOP_PANEL_OPEN_MIN_WIDTH = 1024;

export function loopPanelStartsOpen(): boolean {
  // jsdom has no matchMedia.
  if (typeof window.matchMedia !== 'function') {
    return window.innerWidth >= LOOP_PANEL_OPEN_MIN_WIDTH;
  }
  return window.matchMedia(`(min-width: ${LOOP_PANEL_OPEN_MIN_WIDTH}px)`).matches;
}

/**
 * Whether the panel is the phone's bottom sheet, which lies over the lower
 * part of the window, rather than a column beside the score. The breakpoint
 * is the player's layout one, as in LoopPanel's `md:` classes.
 */
export function loopPanelIsSheet(): boolean {
  // jsdom has no matchMedia.
  if (typeof window.matchMedia !== 'function') return layoutForWidth(window.innerWidth) !== 'page';
  return !window.matchMedia(PAGE_LAYOUT_QUERY).matches;
}

/**
 * Whether pressing "Play loop" should close the panel. Only the sheet, which
 * covers the score and the count-in number over it, and only when the press
 * starts playback: while a loop already plays there is no count-in to see,
 * and the sheet is open for its speed control.
 */
export function playLoopClosesPanel(isSheet: boolean, status: PlayerStatus): boolean {
  return isSheet && status !== 'playing';
}

/**
 * The loop panel's open state, and the id of its body for the `aria-controls`
 * of whatever toggles it (the sheet's own header on a phone, a button in the
 * song page's sticky bar from 768 px).
 */
export function useLoopPanelOpen() {
  const bodyId = useId();
  const [open, setOpen] = useState(loopPanelStartsOpen);
  return { bodyId, open, setOpen };
}
