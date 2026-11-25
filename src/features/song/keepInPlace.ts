/**
 * How to put an element back where it was on screen after something above it
 * changed height (the controls folding at Play, unfolding at Pause): scroll
 * the window, and where the window can't scroll far enough (at the top of the
 * page there is nothing above to scroll back to), hold room in the place of
 * what went (`reserve`, in px). Room is only ever held for what scrolling
 * can't do, so any room the window could now stand in for is given back with
 * a scroll that leaves the element where it is (a browser's own scroll
 * anchoring may already have kept it still, and room kept then would pile up
 * at every fold). Pure: `useStaysOnScreen` measures and applies.
 *
 * `shift` is how far the element moved down on screen (negative: up).
 * `scrollY` is the window's scroll now. `reserve` is the room held so far.
 */
export function keepInPlace({
  shift,
  scrollY,
  reserve,
}: {
  shift: number;
  scrollY: number;
  reserve: number;
}): { scrollBy: number; reserve: number } {
  let scrollBy: number;
  let held: number;
  if (shift < 0) {
    // Moved up: scroll the window up as far as it goes, and hold the rest as room above it.
    scrollBy = 0 - Math.min(-shift, Math.max(0, scrollY));
    held = reserve + (-shift + scrollBy);
  } else {
    // Moved down: give back the room first, then scroll the rest. The page has that much
    // below it: the room held is what it lacked before.
    const given = Math.min(reserve, shift);
    scrollBy = shift - given;
    held = reserve - given;
  }
  // Room the window can stand in for: drop it and scroll up by as much, which cancels out.
  const standIn = Math.min(held, Math.max(0, scrollY + scrollBy));
  return { scrollBy: scrollBy - standIn, reserve: held - standIn };
}
