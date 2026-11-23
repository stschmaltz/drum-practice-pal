/**
 * Where to draw the highlight for a range of bars, from alphaTab's rendered
 * bounds: one rectangle per line of music the range touches. Typed against
 * the bounds fields it reads (see barHitTest.ts), so it's tested with plain
 * objects. Coordinates are relative to alphaTab's surface element.
 */
import type { Rect, SystemBoundsLike } from './barHitTest';

/** 0-based, inclusive: the engine's side of a BarRange. */
export interface BarIndexRange {
  startBarIndex: number;
  endBarIndex: number;
}

/**
 * A system whose bars aren't laid out yet (alphaTab renders lazily) simply
 * gives no rectangle; the caller draws again when more has rendered.
 */
export function highlightRects(
  systems: readonly SystemBoundsLike[],
  { startBarIndex, endBarIndex }: BarIndexRange,
): Rect[] {
  const rects: Rect[] = [];
  for (const system of systems) {
    const bars = system.bars.filter(
      (bar) => bar.index >= startBarIndex && bar.index <= endBarIndex,
    );
    if (bars.length === 0) continue;
    const left = Math.min(...bars.map((bar) => bar.realBounds.x));
    const right = Math.max(...bars.map((bar) => bar.realBounds.x + bar.realBounds.w));
    const top = Math.min(...bars.map((bar) => bar.realBounds.y));
    const bottom = Math.max(...bars.map((bar) => bar.realBounds.y + bar.realBounds.h));
    rects.push({ x: left, y: top, w: right - left, h: bottom - top });
  }
  return rects;
}
