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

/** Horizontal layout on a phone: one line in a box 358 wide, scrolled sideways. */
const phone = (left: number): ScrollView => ({ left, top: 0, width: 358, height: 300 });
/** Page layout: lines down the box, scrolled vertically. */
const page = (top: number): ScrollView => ({ left: 0, top, width: 900, height: 500 });
/** A line of music in page layout. */
const line = (y: number, h = 100) => ({ x: 0, y, w: 880, h });

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
  it('leaves the box alone when the whole bar is on show', () => {
    expect(scrollToShow({ x: 100, y: 20, w: 200, h: 150 }, phone(0))).toBeNull();
    expect(scrollToShow({ x: 100, y: 20, w: 200, h: 150 }, phone(100))).toBeNull();
    expect(scrollToShow({ x: 0, y: 600, w: 300, h: 100 }, page(200))).toBeNull();
  });

  it('counts a bar that touches either edge as on show', () => {
    expect(scrollToShow({ x: 158, y: 0, w: 200, h: 100 }, phone(0))).toBeNull();
    expect(scrollToShow({ x: 0, y: 400, w: 300, h: 100 }, page(0))).toBeNull();
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

describe('barBounds on real-shaped layouts', () => {
  const bar = (index: number, x: number, y: number) => ({
    index,
    realBounds: { x, y, w: 220, h: 150 },
  });

  it('skips a line that has no bars', () => {
    const systems: SystemBoundsLike[] = [
      { realBounds: { x: 0, y: 0, w: 300, h: 40 }, bars: [] },
      { realBounds: { x: 0, y: 40, w: 440, h: 150 }, bars: [bar(0, 0, 40), bar(1, 220, 40)] },
    ];
    expect(barBounds(systems, 1)).toEqual({ x: 220, y: 40, w: 220, h: 150 });
  });

  it('finds every bar of a horizontal layout, which is one long line', () => {
    const oneLine: SystemBoundsLike[] = [
      {
        realBounds: { x: 0, y: 0, w: 16 * 220, h: 150 },
        bars: Array.from({ length: 16 }, (_, index) => bar(index, index * 220, 0)),
      },
    ];
    expect(barBounds(oneLine, 0)).toEqual({ x: 0, y: 0, w: 220, h: 150 });
    expect(barBounds(oneLine, 12)).toEqual({ x: 2640, y: 0, w: 220, h: 150 });
    expect(barBounds(oneLine, 15)).toEqual({ x: 3300, y: 0, w: 220, h: 150 });
    expect(barBounds(oneLine, 16)).toBeNull();
  });
});

describe('scrollToShow in page layout, the vertical axis', () => {
  it('a line cut off by the bottom edge goes to the top', () => {
    expect(scrollToShow(line(450), page(0))).toEqual({ left: 0, top: 450 });
  });

  it('a line cut off by the top edge goes to the top', () => {
    expect(scrollToShow(line(180), page(200))).toEqual({ left: 0, top: 180 });
  });

  it.each([200, 350, 600])(
    'a line that is all on show stays, wherever in the box it is (y %i)',
    (y) => {
      expect(scrollToShow(line(y), page(200))).toBeNull();
    },
  );

  it.each([0, 120, 700])('never moves sideways for a line inside the width (top %i)', (top) => {
    expect(scrollToShow(line(450), page(top))?.left ?? 0).toBe(0);
  });

  it('a line taller than the box shows its top, and is then left alone', () => {
    const tall = line(300, 700);
    expect(scrollToShow(tall, page(0))).toEqual({ left: 0, top: 300 });
    expect(scrollToShow(tall, page(300))).toBeNull();
    // Scrolled into its middle: back to its top.
    expect(scrollToShow(tall, page(450))).toEqual({ left: 0, top: 300 });
  });
});

describe('scrollToShow in horizontal layout, the sideways axis', () => {
  it('never moves up or down for a bar as tall as the line', () => {
    const bar = { x: 2640, y: 0, w: 220, h: 150 };
    expect(scrollToShow(bar, phone(0))).toEqual({ left: 2640, top: 0 });
    expect(scrollToShow(bar, phone(3000))).toEqual({ left: 2640, top: 0 });
  });

  it('a bar cut off by the right edge, then by the left: its start goes to the left edge both times', () => {
    const bar = { x: 300, y: 0, w: 220, h: 150 };
    // 58 px of it showing on the right.
    expect(scrollToShow(bar, phone(0))).toEqual({ left: 300, top: 0 });
    // 20 px of it showing on the left.
    expect(scrollToShow(bar, phone(500))).toEqual({ left: 300, top: 0 });
  });

  it('a bar exactly as wide as the box is on show only at its start', () => {
    const bar = { x: 500, y: 0, w: 358, h: 150 };
    expect(scrollToShow(bar, phone(500))).toBeNull();
    expect(scrollToShow(bar, phone(490))).toEqual({ left: 500, top: 0 });
    expect(scrollToShow(bar, phone(510))).toEqual({ left: 500, top: 0 });
  });

  it('the first bar, cut off on the left, goes back to the start', () => {
    expect(scrollToShow({ x: 0, y: 0, w: 260, h: 150 }, phone(47))).toEqual({ left: 0, top: 0 });
  });
});

describe('scrollToShow on both axes and at the tolerance', () => {
  it('moves both axes when the bar is off on both', () => {
    const view = { left: 0, top: 0, width: 400, height: 300 };
    expect(scrollToShow({ x: 600, y: 900, w: 100, h: 100 }, view)).toEqual({ left: 600, top: 900 });
  });

  it('a bar bigger than the box both ways goes to its top left', () => {
    const view = { left: 100, top: 100, width: 300, height: 200 };
    const huge = { x: 40, y: 60, w: 900, h: 700 };
    expect(scrollToShow(huge, view)).toEqual({ left: 40, top: 60 });
    expect(scrollToShow(huge, { ...view, left: 40, top: 60 })).toBeNull();
  });

  it.each([
    // The box shows 100 to 458; the bar is 200 wide.
    ['one pixel past the left edge', 99, false],
    ['more than a pixel past the left edge', 98.9, true],
    ['one pixel past the right edge', 259, false],
    ['more than a pixel past the right edge', 259.2, true],
  ])('%s: moves %s', (_what, x, moves) => {
    expect(scrollToShow({ x, y: 0, w: 200, h: 100 }, phone(100)) !== null).toBe(moves);
  });
});

describe('scrollToShow, whatever the bar and the box', () => {
  const views: ScrollView[] = [phone(0), phone(137.5), phone(2000), page(0), page(333), page(900)];
  const rects = [0, 80, 357.5, 358, 900, 1396, 2640].flatMap((start) =>
    [40, 220, 358, 800].flatMap((length) => [
      { x: start, y: 20, w: length, h: 150 },
      { x: 10, y: start, w: 300, h: length },
    ]),
  );
  const cases = views.flatMap((view) => rects.map((rect) => ({ view, rect })));

  it('one call settles it: asked again from where it scrolled to, nothing moves', () => {
    let moved = 0;
    for (const { view, rect } of cases) {
      const target = scrollToShow(rect, view);
      if (!target) continue;
      moved++;
      // Where it lands, the bar's start is at the box's start on each axis that moved.
      if (target.left !== view.left) expect(target.left).toBe(rect.x);
      if (target.top !== view.top) expect(target.top).toBe(rect.y);
      expect(scrollToShow(rect, { ...view, ...target })).toBeNull();
    }
    // The table does exercise the scroll: an empty loop must not pass.
    expect(moved).toBeGreaterThan(100);
  });

  it('a bar left alone really is readable: all of it, or its start at the edge', () => {
    let leftAlone = 0;
    const readable = (start: number, length: number, scroll: number, size: number) =>
      (start >= scroll - 1 && start + length <= scroll + size + 1) ||
      (length > size && Math.abs(start - scroll) <= 1);
    for (const { view, rect } of cases) {
      if (scrollToShow(rect, view) !== null) continue;
      leftAlone++;
      expect(readable(rect.x, rect.w, view.left, view.width)).toBe(true);
      expect(readable(rect.y, rect.h, view.top, view.height)).toBe(true);
    }
    expect(leftAlone).toBeGreaterThan(5);
  });
});

describe('scrollToShow with the bar played next (19 QA fix round 1: the page turns a line early)', () => {
  it.each([
    ['on the same line', line(100), { x: 440, y: 100, w: 440, h: 100 }],
    ['on the next line, all on show', line(100), line(200)],
    ['on a line that ends at the box’s foot', line(300), line(400)],
    ['above it (a repeat going back)', line(400), line(100)],
    ['above the box (a repeat going back)', line(300, 100), { x: 0, y: -400, w: 880, h: 100 }],
  ])('leaves the box alone when the next bar is %s', (_name, bar, next) => {
    expect(scrollToShow(bar, page(0), next)).toBeNull();
  });

  it.each([
    ['cut off by the box’s foot', line(350), line(450)],
    ['below the box', line(400), line(500)],
    ['two pixels short of fitting', line(302), line(402)],
  ])('puts the bar’s line at the top when the next line is %s', (_name, bar, next) => {
    expect(scrollToShow(bar, page(0), next)).toEqual({ left: 0, top: bar.y });
  });

  it('moves nothing more once the line is at the top, though the next still doesn’t fit', () => {
    // A box that holds one line.
    const short: ScrollView = { left: 0, top: 350, width: 900, height: 150 };
    expect(scrollToShow(line(350), short, line(450))).toBeNull();
  });

  it('a bar that has left is shown as before, whatever follows it', () => {
    expect(scrollToShow(line(900), page(0), line(1000))).toEqual({ left: 0, top: 900 });
    expect(scrollToShow(line(900), page(0), null)).toEqual({ left: 0, top: 900 });
  });

  it('never turns sideways: in one long line the next bar is beside this one', () => {
    const bar = { x: 100, y: 20, w: 200, h: 150 };
    const beside = { x: 300, y: 20, w: 200, h: 150 };
    expect(scrollToShow(bar, phone(0), beside)).toBeNull();
  });
});
