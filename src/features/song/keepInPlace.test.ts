import { keepInPlace } from './keepInPlace';

describe('keepInPlace', () => {
  it('does nothing when nothing moved and no room is held', () => {
    expect(keepInPlace({ shift: 0, scrollY: 50, reserve: 0 })).toEqual({
      scrollBy: 0,
      reserve: 0,
    });
  });

  it('nothing moved at the top: the room held stays', () => {
    expect(keepInPlace({ shift: 0, scrollY: 0, reserve: 20 })).toEqual({
      scrollBy: 0,
      reserve: 20,
    });
  });

  it('room the window can stand in for is given back, with a scroll up that cancels it', () => {
    // Scroll anchoring kept the element still at an unfold by scrolling down over the room.
    expect(keepInPlace({ shift: 0, scrollY: 163, reserve: 163 })).toEqual({
      scrollBy: -163,
      reserve: 0,
    });
    expect(keepInPlace({ shift: 0, scrollY: 50, reserve: 80 })).toEqual({
      scrollBy: -50,
      reserve: 30,
    });
  });

  it('moved up with room above: the window scrolls back by the whole move', () => {
    expect(keepInPlace({ shift: -300, scrollY: 400, reserve: 0 })).toEqual({
      scrollBy: -300,
      reserve: 0,
    });
  });

  it('moved up at the top of the page: all of it is reserved, nothing scrolls', () => {
    expect(keepInPlace({ shift: -163, scrollY: 0, reserve: 0 })).toEqual({
      scrollBy: 0,
      reserve: 163,
    });
  });

  it('moved up with some room: scrolls what it can and reserves the rest', () => {
    expect(keepInPlace({ shift: -131, scrollY: 99, reserve: 0 })).toEqual({
      scrollBy: -99,
      reserve: 32,
    });
  });

  it('moved down: the reserve goes first, then the window scrolls the rest', () => {
    expect(keepInPlace({ shift: 131, scrollY: 0, reserve: 32 })).toEqual({
      scrollBy: 99,
      reserve: 0,
    });
    expect(keepInPlace({ shift: 163, scrollY: 0, reserve: 163 })).toEqual({
      scrollBy: 0,
      reserve: 0,
    });
  });

  it('moved down by less than the reserve: only the reserve shrinks', () => {
    expect(keepInPlace({ shift: 40, scrollY: 0, reserve: 100 })).toEqual({
      scrollBy: 0,
      reserve: 60,
    });
  });

  it('a fold and an unfold from any place end with no reserve and the window where it was', () => {
    for (const scrollY of [0, 30, 131, 500]) {
      const fold = keepInPlace({ shift: -131, scrollY, reserve: 0 });
      const unfold = keepInPlace({
        shift: 131,
        scrollY: scrollY + fold.scrollBy,
        reserve: fold.reserve,
      });
      expect(unfold.reserve).toBe(0);
      expect(scrollY + fold.scrollBy + unfold.scrollBy).toBe(scrollY);
    }
  });
});

/**
 * The rules as a whole, over a grid of every kind of input: no move, up and
 * down by less than, as much as and more than the window or the room can
 * take, at the top, part way and far down, with no room, a little and a lot,
 * fractional pixels (a zoomed page) and an overscrolled window (iOS's rubber
 * band reports a negative `scrollY`). The element's move on screen is
 * `shift`, less the window's scroll, plus any change in the room above it.
 */
describe('keepInPlace, every case', () => {
  const SHIFTS = [-500, -300, -163.5, -131, -100, -40, -1, 0, 1, 40, 100, 131, 163.5, 300, 500];
  const SCROLLS = [-20, 0, 0.5, 30, 99, 131, 163.5, 300, 500, 2000];
  const RESERVES = [0, 0.5, 20, 32, 131, 163.5, 300, 600];
  const cases = SHIFTS.flatMap((shift) =>
    SCROLLS.flatMap((scrollY) => RESERVES.map((reserve) => ({ shift, scrollY, reserve }))),
  );

  it(`keeps the element still, holds room only at the top, and settles (${cases.length} cases)`, () => {
    for (const input of cases) {
      const { shift, scrollY, reserve } = input;
      const at = JSON.stringify(input);
      const out = keepInPlace(input);
      const scrolledTo = scrollY + out.scrollBy;

      // The element is back where it was on screen.
      expect(shift + (out.reserve - reserve) - out.scrollBy, `${at}: moved`).toBeCloseTo(0, 9);
      // Room is never negative, and is held only where the window is at its top: whatever the
      // window could stand in for is scrolled instead.
      expect(out.reserve, `${at}: room`).toBeGreaterThanOrEqual(0);
      if (out.reserve > 0) expect(scrolledTo, `${at}: room off the top`).toBeLessThanOrEqual(0);
      // The window is never asked to scroll above the top of the page (from an overscroll,
      // never further up than it is).
      expect(scrolledTo, `${at}: above the top`).toBeGreaterThanOrEqual(
        Math.min(0, scrollY) - 1e-9,
      );
      // Scrolling down is only ever into what the page has below: the room it held, or the move.
      if (out.scrollBy > 0) {
        expect(out.scrollBy, `${at}: down`).toBeLessThanOrEqual(Math.max(0, shift) + 1e-9);
      }
      // Settled: asked again with nothing moved, there is nothing left to do.
      const again = keepInPlace({ shift: 0, scrollY: scrolledTo, reserve: out.reserve });
      expect(again.scrollBy, `${at}: again`).toBeCloseTo(0, 9);
      expect(again.reserve, `${at}: again`).toBeCloseTo(out.reserve, 9);
    }
  });

  it('never holds more room than the window lacked', () => {
    for (const { shift, scrollY, reserve } of cases) {
      const out = keepInPlace({ shift, scrollY, reserve });
      // What was held before, plus the part of an upward move the window couldn't scroll.
      const lacked = shift < 0 ? Math.max(0, -shift - Math.max(0, scrollY)) : 0;
      expect(out.reserve).toBeLessThanOrEqual(reserve + lacked + 1e-9);
    }
  });

  /**
   * Many runs of Play and Pause in a row, the window scrolled by the user in
   * between, and the bar's height changing between a fold and its unfold (a
   * rotation or a resize while playing): the room never piles up, and once
   * the heights agree again the room is gone wherever the window can stand in.
   */
  it('repeated folds, user scrolls and resizes never pile up room', () => {
    const fullHeights = [300, 300, 250, 300, 163, 400, 300];
    const strip = 60;
    let scrollY = 0;
    let reserve = 0;
    // The element's top on screen, in a page whose controls are full or folded, plus the room.
    let controls = fullHeights[0] ?? 300;
    const top = () => 100 + controls + reserve - scrollY;
    for (const [run, full] of fullHeights.entries()) {
      for (const userScroll of [0, 40, -40]) {
        scrollY = Math.max(0, scrollY + userScroll);
        const before = top();
        // Fold: the controls become the strip.
        let out = keepInPlace({ shift: strip - controls, scrollY, reserve });
        controls = strip;
        reserve = out.reserve;
        scrollY += out.scrollBy;
        expect(top(), `run ${run}: fold`).toBeCloseTo(before, 9);
        // Unfold, the full height now `full` (a resize while folded).
        out = keepInPlace({ shift: full - strip, scrollY, reserve });
        controls = full;
        reserve = out.reserve;
        scrollY += out.scrollBy;
        expect(top(), `run ${run}: unfold`).toBeCloseTo(before, 9);
        expect(reserve).toBeGreaterThanOrEqual(0);
        // Never more than the largest height the bar has had less the strip.
        expect(reserve).toBeLessThanOrEqual(Math.max(...fullHeights) - strip);
        if (reserve > 0) expect(scrollY).toBe(0);
      }
    }
  });
});
