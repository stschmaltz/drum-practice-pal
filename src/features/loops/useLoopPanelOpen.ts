import { useId, useState } from 'react';

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
 * The loop panel's open state, and the id of its body for the `aria-controls`
 * of whatever toggles it (the sheet's own header on a phone, a button in the
 * song page's sticky bar from 768 px).
 */
export function useLoopPanelOpen() {
  const bodyId = useId();
  const [open, setOpen] = useState(loopPanelStartsOpen);
  return { bodyId, open, setOpen };
}
