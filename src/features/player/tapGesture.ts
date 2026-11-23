/**
 * Telling a tap from a drag. Browsers fire `click` whenever the press and the
 * release land on the same element, so a mouse drag across the score would
 * otherwise count as a tap on the bar where it ended. Pure, so it's tested
 * without a DOM.
 */

export interface PointerPoint {
  x: number;
  y: number;
}

/** How far a pointer may wander between press and release and still be a tap. */
export const TAP_SLOP_PX = 8;

/** Whether the pointer has moved too far from where it went down to be a tap. */
export function movedBeyondTap(
  down: PointerPoint,
  now: PointerPoint,
  slop: number = TAP_SLOP_PX,
): boolean {
  return Math.hypot(now.x - down.x, now.y - down.y) > slop;
}

/** Two bars in either order as an ascending pair: a drag may run right to left. */
export function orderedBars(a: number, b: number): [first: number, last: number] {
  return a <= b ? [a, b] : [b, a];
}
