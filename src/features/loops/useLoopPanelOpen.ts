import { useId, useState } from 'react';
import type { PlayerStatus } from '@/features/player/PlayerService';
import { LOOP_COLUMN_QUERY, loopPanelKindForWidth } from './loopPanelLayout';

/**
 * Whether the panel is the bottom sheet, which lies over the lower part of
 * the window, rather than a column beside the score: below 1024 px, so a
 * phone and a tablet in portrait (`loopPanelLayout.ts`, the CSS's `lg`).
 * Asked at the moment it matters, so a rotation since the page opened counts.
 */
export function loopPanelIsSheet(): boolean {
  // jsdom has no matchMedia; the window's width answers the same question.
  if (typeof window.matchMedia !== 'function') {
    return loopPanelKindForWidth(window.innerWidth) === 'sheet';
  }
  return !window.matchMedia(LOOP_COLUMN_QUERY).matches;
}

/**
 * The column starts open: the score beside it still fits a few bars to a
 * line. The sheet starts closed, so the score opens with nothing over it,
 * and the user opens it when working on loops.
 */
export function loopPanelStartsOpen(): boolean {
  return !loopPanelIsSheet();
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
 * of whatever toggles it (the sheet's own header below 1024 px, a button
 * beside the song page's status line from there up).
 */
export function useLoopPanelOpen() {
  const bodyId = useId();
  const [open, setOpen] = useState(loopPanelStartsOpen);
  return { bodyId, open, setOpen };
}
