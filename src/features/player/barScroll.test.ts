import type { SystemBoundsLike } from './barHitTest';
import { barBounds, scrollToShow, type ScrollView } from './barScroll';

/** Six bars on two lines of three, each 100 wide and 80 tall, from (10, 20). */
const TWO_LINES: SystemBoundsLike[] = [0, 1].map((line) => ({
  realBounds: { x: 10, y: 20 + line * 80, w: 300, h: 80 },
  bars: [0, 1, 2].map((column) => ({
    index: line * 3 + column,
    realBounds: { x: 10 + column * 100, y: 20 + line * 80, w: 100, h: 80 },
  })),
}));

describe('barBounds', () => {
  it.each([
    [0, { x: 10, y: 20, w: 100, h: 80 }],
    [2, { x: 210, y: 20, w: 100, h: 80 }],
    [3, { x: 10, y: 100, w: 100, h: 80 }],
    [5, { x: 210, y: 100, w: 100, h: 80 }],
  ])('finds bar index %i on its line', (barIndex, rect) => {
    expect(barBounds(TWO_LINES, barIndex)).toEqual(rect);
  });

  it.each([-1, 6, 100])('has nothing for bar index %i, which the score lacks', (barIndex) => {
    expect(barBounds(TWO_LINES, barIndex)).toBeNull();
  });

  it('has nothing before anything is laid out', () => {
    expect(barBounds([], 0)).toBeNull();
  });
});

describe('scrollToShow', () => {
  /** A phone's score box in horizontal layout: 358 wide, scrolled sideways only. */
  const phone = (left: number): ScrollView => ({ left, top: 0, width: 358, height: 500 });
  /** A page layout box: scrolled down only. */
  const page = (top: number): ScrollView => ({ left: 0, top, width: 900, height: 500 });

  it('leaves the box alone when the whole bar is on show', () => {
    expect(scrollToShow({ x: 100, y: 20, w: 200, h: 150 }, phone(0))).toBeNull();
    expect(scrollToShow({ x: 100, y: 20, w: 200, h: 150 }, phone(100))).toBeNull();
    expect(scrollToShow({ x: 0, y: 600, w: 300, h: 100 }, page(200))).toBeNull();
  });

  it('counts a bar that touches either edge as on show', () => {
    expect(scrollToShow({ x: 158, y: 0, w: 200, h: 100 }, phone(0))).toBeNull();
    expect(scrollToShow({ x: 0, y: 400, w: 300, h: 100 }, page(0))).toBeNull();
  });

  it('forgives a fraction of a pixel at the edges', () => {
    expect(scrollToShow({ x: 99.4, y: 0, w: 200, h: 100 }, phone(100))).toBeNull();
    expect(scrollToShow({ x: 158.6, y: 0, w: 200, h: 100 }, phone(0))).toBeNull();
  });

  it('brings a bar off to the right to the left edge', () => {
    expect(scrollToShow({ x: 1396, y: 20, w: 220, h: 150 }, phone(0))).toEqual({
      left: 1396,
      top: 0,
    });
  });

  it('brings a bar off to the left to the left edge', () => {
    expect(scrollToShow({ x: 40, y: 20, w: 220, h: 150 }, phone(1400))).toEqual({
      left: 40,
      top: 0,
    });
  });

  it('moves a bar that is only partly on show', () => {
    expect(scrollToShow({ x: 300, y: 20, w: 220, h: 150 }, phone(0))).toEqual({
      left: 300,
      top: 0,
    });
    expect(scrollToShow({ x: 80, y: 20, w: 220, h: 150 }, phone(100))).toEqual({
      left: 80,
      top: 0,
    });
  });

  it('brings a line below the box, or above it, to the top', () => {
    expect(scrollToShow({ x: 0, y: 900, w: 300, h: 100 }, page(0))).toEqual({ left: 0, top: 900 });
    expect(scrollToShow({ x: 0, y: 100, w: 300, h: 100 }, page(700))).toEqual({
      left: 0,
      top: 100,
    });
  });

  it('moves only the axis that needs it', () => {
    const view = { left: 50, top: 300, width: 400, height: 300 };
    expect(scrollToShow({ x: 100, y: 0, w: 100, h: 100 }, view)).toEqual({ left: 50, top: 0 });
    expect(scrollToShow({ x: 600, y: 350, w: 100, h: 100 }, view)).toEqual({ left: 600, top: 300 });
  });

  it('puts the start of a bar wider than the box at the edge, and then leaves it there', () => {
    const wide = { x: 500, y: 0, w: 800, h: 100 };
    expect(scrollToShow(wide, phone(0))).toEqual({ left: 500, top: 0 });
    expect(scrollToShow(wide, phone(500))).toBeNull();
    // Scrolled into its middle: back to its start.
    expect(scrollToShow(wide, phone(700))).toEqual({ left: 500, top: 0 });
  });

  it('never scrolls before the start of the content', () => {
    expect(scrollToShow({ x: -5, y: -10, w: 100, h: 100 }, { ...phone(300), top: 200 })).toEqual({
      left: 0,
      top: 0,
    });
  });
});
