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
