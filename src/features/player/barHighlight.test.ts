import type { SystemBoundsLike } from './barHitTest';
import { highlightRects } from './barHighlight';

const BAR_W = 100;
const ROW_H = 80;

/** `rows` lines of `perRow` bars, each 100 x 80, laid out like page layout. */
function page(rows: number, perRow: number): SystemBoundsLike[] {
  return Array.from({ length: rows }, (_, row) => ({
    realBounds: { x: 0, y: row * ROW_H, w: perRow * BAR_W, h: ROW_H },
    bars: Array.from({ length: perRow }, (_, column) => ({
      index: row * perRow + column,
      realBounds: { x: column * BAR_W, y: row * ROW_H, w: BAR_W, h: ROW_H },
    })),
  }));
}

describe('highlightRects', () => {
  const systems = page(4, 4);

  it('covers a single bar', () => {
    expect(highlightRects(systems, { startBarIndex: 5, endBarIndex: 5 })).toEqual([
      { x: 100, y: 80, w: 100, h: 80 },
    ]);
  });

  it('covers bars on one line with one rectangle', () => {
    expect(highlightRects(systems, { startBarIndex: 4, endBarIndex: 6 })).toEqual([
      { x: 0, y: 80, w: 300, h: 80 },
    ]);
  });

  it('gives one rectangle per line when the range wraps', () => {
    expect(highlightRects(systems, { startBarIndex: 2, endBarIndex: 9 })).toEqual([
      { x: 200, y: 0, w: 200, h: 80 },
      { x: 0, y: 80, w: 400, h: 80 },
      { x: 0, y: 160, w: 200, h: 80 },
    ]);
  });

  it('covers a whole single-line score (horizontal layout)', () => {
    expect(highlightRects(page(1, 16), { startBarIndex: 0, endBarIndex: 15 })).toEqual([
      { x: 0, y: 0, w: 1600, h: 80 },
    ]);
  });

  it('draws what is laid out and skips the rest', () => {
    // Only the first two lines have rendered so far.
    expect(highlightRects(systems.slice(0, 2), { startBarIndex: 6, endBarIndex: 12 })).toEqual([
      { x: 200, y: 80, w: 200, h: 80 },
    ]);
  });

  it('gives nothing for bars the score lacks, or before anything is laid out', () => {
    expect(highlightRects(systems, { startBarIndex: 20, endBarIndex: 24 })).toEqual([]);
    expect(highlightRects([], { startBarIndex: 0, endBarIndex: 3 })).toEqual([]);
  });
});
