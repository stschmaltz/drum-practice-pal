/**
 * Where the score box has to scroll to so a bar can be read, for the times
 * alphaTab doesn't scroll itself: it only follows the cursor while playing,
 * and a loop picked while paused, or about to be counted in, starts on a bar
 * that may be anywhere. Pure, typed against the bounds fields it reads (see
 * barHitTest.ts).
 */
import type { Rect, SystemBoundsLike } from './barHitTest';

/** The part of a scroll box's content on show: its scroll offsets and inner size. */
export interface ScrollView {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScrollTarget {
  left: number;
  top: number;
}

/** Layout and scroll positions come in fractions of a pixel; a bar that close to the edge is in view. */
const EDGE_TOLERANCE_PX = 1;

/** A bar's rendered bounds by 0-based index, or null while it has none (not laid out yet, or no such bar). */
export function barBounds(systems: readonly SystemBoundsLike[], barIndex: number): Rect | null {
  for (const system of systems) {
    const bar = system.bars.find((candidate) => candidate.index === barIndex);
    if (bar) return bar.realBounds;
  }
  return null;
}

/**
 * The scroll position that shows `rect` (in the scroll content's coordinates),
 * or null when all of it is on show already, so a bar the user can see never
 * moves under their finger. An axis that has to move puts the rect's start at
 * the box's start, which is where alphaTab puts the playing bar (the bar at the
 * left edge in horizontal layout, its line at the top in page layout): the
 * score then doesn't move again when playback starts.
 */
export function scrollToShow(rect: Rect, view: ScrollView): ScrollTarget | null {
  const left = axisScroll(rect.x, rect.w, view.left, view.width);
  const top = axisScroll(rect.y, rect.h, view.top, view.height);
  if (left === view.left && top === view.top) return null;
  return { left, top };
}

function axisScroll(start: number, length: number, scroll: number, size: number): number {
  const inView =
    start >= scroll - EDGE_TOLERANCE_PX && start + length <= scroll + size + EDGE_TOLERANCE_PX;
  // A rect longer than the box can't all show: its start is what gets read first.
  const startsInView = length > size && Math.abs(start - scroll) <= EDGE_TOLERANCE_PX;
  if (inView || startsInView) return scroll;
  return Math.max(0, start);
}
