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
 *
 * `next` is the bar played after it, for a caller that keeps a bar on show
 * while something else plays (a recording, Unit 19): when that bar is on a
 * line below and not all on show, the box turns now, a line early, putting
 * `rect`'s line at the top, so there is always something ahead to read. A
 * next bar beside it, or above it (a repeat going back), turns nothing, and
 * neither does a line that is at the top already in a box that holds one.
 */
export function scrollToShow(
  rect: Rect,
  view: ScrollView,
  next: Rect | null = null,
): ScrollTarget | null {
  const left = axisScroll(rect.x, rect.w, view.left, view.width);
  let top = axisScroll(rect.y, rect.h, view.top, view.height);
  const nextCutOff =
    next !== null &&
    next.y > rect.y + EDGE_TOLERANCE_PX &&
    !isInView(next.y, next.h, view.top, view.height);
  if (top === view.top && nextCutOff) top = Math.max(0, rect.y);
  if (left === view.left && Math.abs(top - view.top) <= EDGE_TOLERANCE_PX) top = view.top;
  if (left === view.left && top === view.top) return null;
  return { left, top };
}

const isInView = (start: number, length: number, scroll: number, size: number) =>
  start >= scroll - EDGE_TOLERANCE_PX && start + length <= scroll + size + EDGE_TOLERANCE_PX;

function axisScroll(start: number, length: number, scroll: number, size: number): number {
  const inView = isInView(start, length, scroll, size);
  // A rect longer than the box can't all show: its start is what gets read first.
  const startsInView = length > size && Math.abs(start - scroll) <= EDGE_TOLERANCE_PX;
  if (inView || startsInView) return scroll;
  return Math.max(0, start);
}
