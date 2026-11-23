/**
 * Which bar a tap landed on, from alphaTab's rendered bounds. Typed against
 * the bounds fields it reads, not alphaTab's classes, so it's tested with
 * plain objects. Coordinates are relative to alphaTab's surface element.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rendered line of music (alphaTab's StaffSystemBounds), with its bars. */
export interface SystemBoundsLike {
  realBounds: Rect;
  bars: readonly {
    /** 0-based master bar index */
    index: number;
    realBounds: Rect;
  }[];
}

/**
 * 0-based index of the bar at (x, y), or null for a tap outside every bar
 * (the title, the margins). A bar's real bounds include its whitespace, so a
 * tap between notes, or above or below the staff, still counts. The system
 * picks the row and the bar's x span picks the bar, so a tap in the gap
 * between two systems' staves is taken by the system it falls in.
 */
export function barIndexAtPoint(
  systems: readonly SystemBoundsLike[],
  x: number,
  y: number,
): number | null {
  const system = systems.find((s) => within(y, s.realBounds.y, s.realBounds.h));
  const bar = system?.bars.find((b) => within(x, b.realBounds.x, b.realBounds.w));
  return bar ? bar.index : null;
}

/** Start-inclusive and end-exclusive, so a point on a shared edge belongs to one bar. */
function within(point: number, start: number, length: number): boolean {
  return point >= start && point < start + length;
}
