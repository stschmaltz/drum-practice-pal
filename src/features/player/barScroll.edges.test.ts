/**
 * The edges the count-in and loop flows land on (08 QA fix round 1, Test
 * stage): a bar cut off by either edge on either axis, a bar bigger than the
 * box, the one-pixel tolerance, and that one scroll settles it.
 * barScroll.test.ts has the worked examples.
 */
import type { SystemBoundsLike } from './barHitTest';
import { barBounds, scrollToShow, type ScrollView } from './barScroll';

/** Horizontal layout on a phone: one line, scrolled sideways. */
const phone = (left: number): ScrollView => ({ left, top: 0, width: 358, height: 300 });
/** Page layout: lines down the box, scrolled vertically. */
const page = (top: number): ScrollView => ({ left: 0, top, width: 900, height: 500 });
const line = (y: number, h = 100) => ({ x: 0, y, w: 880, h });

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
