/**
 * How to put an element back where it was on screen after something above it
 * changed height (the controls folding at Play, unfolding at Pause): scroll
 * the window, and while `folded`, where the window can't scroll far enough (at
 * the top of the page there is nothing above to scroll back to), hold room in
 * the place of what went (`reserve`, in px).
 *
 * The room is worked out afresh each time from where the element is, not
 * added to: the move to make up for is where the element would be with no
 * room at all (`shift - reserve`), the window scrolls as much of it as it can,
 * and the room is what is left. So room is held only for what scrolling can't
 * do, room the window could stand in for is given back with a scroll that
 * leaves the element where it is, and nothing piles up. Unfolded, no room is
 * held at all: what the window can't scroll then (the bar came back shorter
 * than the room at the top of the page: Show controls and Hide controls while
 * playing, a rotation) moves the element instead, once, back towards where it
 * sits with no room. Pure: `useStaysOnScreen` measures and applies.
 *
 * `shift` is how far the element moved down on screen, room as it is
 * (negative: up). `scrollY` is the window's scroll now. `reserve` is the room
 * held so far. `folded`: whether room may be held now.
 */
export function keepInPlace({
  shift,
  scrollY,
  reserve,
  folded,
}: {
  shift: number;
  scrollY: number;
  reserve: number;
  folded: boolean;
}): { scrollBy: number; reserve: number } {
  // Where the element would be with no room held, against where it was.
  const move = shift - reserve;
  // Scroll by the move, but never above the top of the page (an overscrolled, negative
  // scrollY is as good as the top).
  const scrollBy = Math.max(move, 0 - Math.max(0, scrollY));
  // What the window couldn't scroll: only ever an upward move at the top.
  return { scrollBy, reserve: folded ? scrollBy - move : 0 };
}

/**
 * The room after the window was resized while folded. The room is the height
 * the full controls had above the element, and that height follows the width
 * (their rows wrap, and at 768 px the layout changes): after a rotation it is
 * not the height they will come back at, and keeping it can push the element
 * off a now shorter window (a phone turned to landscape while playing). So a
 * new width drops it, and the element goes where the new layout puts it. A
 * change of height alone (a phone's toolbar showing or hiding) keeps it.
 */
export function roomAfterResize({
  reserve,
  widthBefore,
  widthAfter,
}: {
  reserve: number;
  widthBefore: number;
  widthAfter: number;
}): number {
  return widthAfter === widthBefore ? reserve : 0;
}
