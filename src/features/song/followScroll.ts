/**
 * How far the window has to scroll so the bar a recording is on can be read
 * (Unit 19). `player.showBar` moves the score box; under a recording on a
 * phone the box is as tall as its lines and scrolls with the page, and on a
 * tablet the box itself may be part-way below the window, so the window has
 * to follow too. Pure: the hook measures, this decides.
 */

/** A vertical span in the window's coordinates. */
export interface VerticalSpan {
  top: number;
  bottom: number;
}

/**
 * The part of the window nothing covers now: under the sticky video, above a
 * phone's tab bar. `stuckTop` is where its top will be once the video's bar
 * has stuck to the top of the window (left out when it already has): on a
 * fresh load the bar is still where the page put it, lower down, and a
 * scroll aimed under it there would land the bar behind it once it sticks.
 */
export interface ReadableView extends VerticalSpan {
  stuckTop?: number;
}

/** Room left between the sticky bar and the line brought under it. */
export const GAP_UNDER_BAR_PX = 12;

/** Layout comes in fractions of a pixel: a bar that close to an edge is on show. */
const EDGE_TOLERANCE_PX = 1;

/**
 * The distance to scroll the window by (down is positive) so `bar` can be
 * read in `view`, with what comes after it. Null when nothing should move:
 *
 * - A bar that is all on show, with the bar played after it (`next`, null at
 *   the tab's end) on show too or not below it, never moves the page.
 * - A bar that has left goes to the top of the view, so the lines after it
 *   are on show too and the page turns as seldom as it can.
 * - A bar that is the last one on show (the line after it is cut off or
 *   below the window) turns the page now, a line early, to the same place:
 *   a drummer reads ahead, and in the last bar before a turn there would be
 *   nothing ahead to read. A view that holds one line can't show the next,
 *   and with the marked line at its top already nothing moves.
 * - A bar played next that is above (a repeat going back) turns nothing:
 *   it is brought on show when it is reached.
 */
export function windowScrollToShow(
  bar: VerticalSpan,
  view: ReadableView,
  next: VerticalSpan | null = null,
): number | null {
  const endsInView = (span: VerticalSpan) => span.bottom <= view.bottom + EDGE_TOLERANCE_PX;
  const onShow = bar.top >= view.top - EDGE_TOLERANCE_PX && endsInView(bar);
  const nextCutOff = next !== null && next.top > bar.top + EDGE_TOLERANCE_PX && !endsInView(next);
  if (onShow && !nextCutOff) return null;
  const top = Math.min(view.top, view.stuckTop ?? view.top);
  const distance = Math.round(bar.top - (top + GAP_UNDER_BAR_PX));
  return distance === 0 ? null : distance;
}
