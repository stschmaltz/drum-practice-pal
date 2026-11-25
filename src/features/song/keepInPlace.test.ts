import { keepInPlace, roomAfterResize } from './keepInPlace';

describe('keepInPlace', () => {
  it('does nothing when nothing moved and no room is held', () => {
    for (const folded of [true, false]) {
      expect(keepInPlace({ shift: 0, scrollY: 50, reserve: 0, folded })).toEqual({
        scrollBy: 0,
        reserve: 0,
      });
    }
  });

  it('folded, nothing moved at the top: the room held stays', () => {
    expect(keepInPlace({ shift: 0, scrollY: 0, reserve: 20, folded: true })).toEqual({
      scrollBy: 0,
      reserve: 20,
    });
  });

  it('folded, room the window can stand in for is given back, with a scroll up that cancels it', () => {
    // Scroll anchoring kept the element still by scrolling down over the room.
    expect(keepInPlace({ shift: 0, scrollY: 163, reserve: 163, folded: true })).toEqual({
      scrollBy: -163,
      reserve: 0,
    });
    expect(keepInPlace({ shift: 0, scrollY: 50, reserve: 80, folded: true })).toEqual({
      scrollBy: -50,
      reserve: 30,
    });
  });

  it('a fold with room above: the window scrolls back by the whole move', () => {
    expect(keepInPlace({ shift: -300, scrollY: 400, reserve: 0, folded: true })).toEqual({
      scrollBy: -300,
      reserve: 0,
    });
  });

  it('a fold at the top of the page: all of it is held as room, nothing scrolls', () => {
    expect(keepInPlace({ shift: -163, scrollY: 0, reserve: 0, folded: true })).toEqual({
      scrollBy: 0,
      reserve: 163,
    });
  });

  it('a fold with some room above: scrolls what it can and holds the rest', () => {
    expect(keepInPlace({ shift: -131, scrollY: 99, reserve: 0, folded: true })).toEqual({
      scrollBy: -99,
      reserve: 32,
    });
  });

  it('an unfold gives back all the room, then scrolls the rest', () => {
    expect(keepInPlace({ shift: 131, scrollY: 0, reserve: 32, folded: false })).toEqual({
      scrollBy: 99,
      reserve: 0,
    });
    expect(keepInPlace({ shift: 163, scrollY: 0, reserve: 163, folded: false })).toEqual({
      scrollBy: 0,
      reserve: 0,
    });
  });

  it('an unfold shorter than the room at the top keeps no room: the element moves up by the difference', () => {
    // Show controls then Hide controls while playing: the room is the taller bar's, the paused
    // bar 56 px shorter.
    expect(keepInPlace({ shift: 163, scrollY: 0, reserve: 219, folded: false })).toEqual({
      scrollBy: 0,
      reserve: 0,
    });
    // With the window part way down, it scrolls up for the difference instead.
    expect(keepInPlace({ shift: 163, scrollY: 100, reserve: 219, folded: false })).toEqual({
      scrollBy: -56,
      reserve: 0,
    });
  });

  it('a fold and an unfold from any place end with no room and the window where it was', () => {
    for (const scrollY of [0, 30, 131, 500]) {
      const fold = keepInPlace({ shift: -131, scrollY, reserve: 0, folded: true });
      const unfold = keepInPlace({
        shift: 131,
        scrollY: scrollY + fold.scrollBy,
        reserve: fold.reserve,
        folded: false,
      });
      expect(unfold.reserve).toBe(0);
      expect(scrollY + fold.scrollBy + unfold.scrollBy).toBe(scrollY);
    }
  });
});

describe('roomAfterResize', () => {
  it('a new width (a rotation, the 768 px layout change) drops the room', () => {
    expect(roomAfterResize({ reserve: 163, widthBefore: 390, widthAfter: 844 })).toBe(0);
    expect(roomAfterResize({ reserve: 163, widthBefore: 844, widthAfter: 390 })).toBe(0);
  });

  it('a change of height alone (a toolbar showing or hiding) keeps it', () => {
    expect(roomAfterResize({ reserve: 163, widthBefore: 390, widthAfter: 390 })).toBe(163);
    expect(roomAfterResize({ reserve: 0, widthBefore: 390, widthAfter: 844 })).toBe(0);
  });
});

/**
 * The rules as a whole, over a grid of every kind of input: no move, up and
 * down by less than, as much as and more than the window or the room can
 * take, at the top, part way and far down, with no room, a little and a lot,
 * fractional pixels (a zoomed page) and an overscrolled window (iOS's rubber
 * band reports a negative `scrollY`), folded and not. The element's move on
 * screen is `shift`, less the window's scroll, plus any change in the room
 * above it.
 */
describe('keepInPlace, every case', () => {
  const SHIFTS = [-500, -300, -163.5, -131, -100, -40, -1, 0, 1, 40, 100, 131, 163.5, 300, 500];
  const SCROLLS = [-20, 0, 0.5, 30, 99, 131, 163.5, 300, 500, 2000];
  const RESERVES = [0, 0.5, 20, 32, 131, 163.5, 300, 600];
  const cases = SHIFTS.flatMap((shift) =>
    SCROLLS.flatMap((scrollY) => RESERVES.map((reserve) => ({ shift, scrollY, reserve }))),
  );
  const moved = (
    { shift, reserve }: { shift: number; reserve: number },
    out: { scrollBy: number; reserve: number },
  ) => shift + (out.reserve - reserve) - out.scrollBy;

  it(`folded: keeps the element still, holds room only at the top, and settles (${cases.length} cases)`, () => {
    for (const input of cases) {
      const at = JSON.stringify(input);
      const out = keepInPlace({ ...input, folded: true });
      const scrolledTo = input.scrollY + out.scrollBy;

      expect(moved(input, out), `${at}: moved`).toBeCloseTo(0, 9);
      // Room is never negative, and is held only where the window is at its top.
      expect(out.reserve, `${at}: room`).toBeGreaterThanOrEqual(0);
      if (out.reserve > 0) expect(scrolledTo, `${at}: room off the top`).toBeLessThanOrEqual(0);
      // Never above the top of the page (from an overscroll, never further up than it is).
      expect(scrolledTo, `${at}: above the top`).toBeGreaterThanOrEqual(
        Math.min(0, input.scrollY) - 1e-9,
      );
      // Scrolling down is only ever into what the page has below: the move, less the room.
      if (out.scrollBy > 0) {
        expect(out.scrollBy, `${at}: down`).toBeLessThanOrEqual(Math.max(0, input.shift) + 1e-9);
      }
      // Settled: asked again with nothing moved, there is nothing left to do.
      const again = keepInPlace({
        shift: 0,
        scrollY: scrolledTo,
        reserve: out.reserve,
        folded: true,
      });
      expect(again.scrollBy, `${at}: again`).toBeCloseTo(0, 9);
      expect(again.reserve, `${at}: again`).toBeCloseTo(out.reserve, 9);
    }
  });

  it(`unfolded: holds no room, and moves the element only up, only at the top (${cases.length} cases)`, () => {
    for (const input of cases) {
      const at = JSON.stringify(input);
      const out = keepInPlace({ ...input, folded: false });
      const scrolledTo = input.scrollY + out.scrollBy;
      expect(out.reserve, `${at}: room`).toBe(0);
      expect(scrolledTo, `${at}: above the top`).toBeGreaterThanOrEqual(
        Math.min(0, input.scrollY) - 1e-9,
      );
      const by = moved(input, out);
      if (Math.abs(by) > 1e-9) {
        // Only what the window couldn't scroll up for: the room, less what the bar took back.
        expect(by, `${at}: moved down`).toBeLessThan(0);
        expect(scrolledTo, `${at}: moved, not at the top`).toBeLessThanOrEqual(0);
        expect(-by, `${at}: moved by more than it had to`).toBeCloseTo(
          Math.max(0, input.reserve - input.shift - Math.max(0, input.scrollY)),
          9,
        );
      }
    }
  });

  it('never holds more room than the window lacked', () => {
    for (const { shift, scrollY, reserve } of cases) {
      const out = keepInPlace({ shift, scrollY, reserve, folded: true });
      const lacked = Math.max(0, reserve - shift - Math.max(0, scrollY));
      expect(out.reserve).toBeLessThanOrEqual(lacked + 1e-9);
    }
  });

  /**
   * Many runs of Play and Pause in a row, the window scrolled by the user in
   * between, and the bar's height changing between a fold and its unfold
   * (Show controls while playing, a rotation): the room is gone at every
   * unfold, and the element moves only when the bar came back shorter than
   * the room, by the difference.
   */
  it('repeated folds, user scrolls and height changes never leave room behind', () => {
    const fullHeights = [300, 300, 250, 300, 163, 400, 300];
    const strip = 60;
    let scrollY = 0;
    let reserve = 0;
    let controls = fullHeights[0] ?? 300;
    const top = () => 100 + controls + reserve - scrollY;
    for (const [run, full] of fullHeights.entries()) {
      for (const userScroll of [0, 40, -40]) {
        scrollY = Math.max(0, scrollY + userScroll);
        const before = top();
        const foldedFrom = controls;
        let out = keepInPlace({ shift: strip - controls, scrollY, reserve, folded: true });
        controls = strip;
        reserve = out.reserve;
        scrollY += out.scrollBy;
        expect(top(), `run ${run}: fold`).toBeCloseTo(before, 9);
        out = keepInPlace({ shift: full - strip, scrollY, reserve, folded: false });
        controls = full;
        reserve = out.reserve;
        scrollY += out.scrollBy;
        expect(reserve, `run ${run}: room after the unfold`).toBe(0);
        // Still, unless the bar came back shorter: then up, by no more than the difference.
        const by = top() - before;
        if (full >= foldedFrom) expect(by, `run ${run}: unfold`).toBeCloseTo(0, 9);
        else {
          expect(by, `run ${run}: unfold`).toBeLessThanOrEqual(1e-9);
          expect(-by, `run ${run}: unfold`).toBeLessThanOrEqual(foldedFrom - full + 1e-9);
        }
      }
    }
  });
});
