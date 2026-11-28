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

/** Room left between the sticky bar and the line brought under it. */
export const GAP_UNDER_BAR_PX = 12;

/** Layout comes in fractions of a pixel: a bar that close to an edge is on show. */
const EDGE_TOLERANCE_PX = 1;

/**
 * The distance to scroll the window by (down is positive) so `bar` is on
 * show in `view`, the part of the window nothing covers (under the sticky
 * video, above a phone's tab bar). Null when the whole bar is on show
 * already: a bar the drummer can read never moves the page. A bar that has
 * left goes to the top of the view, so the lines after it are on show too
 * and the page turns as seldom as it can.
 */
export function windowScrollToShow(bar: VerticalSpan, view: VerticalSpan): number | null {
  const onShow =
    bar.top >= view.top - EDGE_TOLERANCE_PX && bar.bottom <= view.bottom + EDGE_TOLERANCE_PX;
  if (onShow) return null;
  const distance = Math.round(bar.top - (view.top + GAP_UNDER_BAR_PX));
  return distance === 0 ? null : distance;
}
