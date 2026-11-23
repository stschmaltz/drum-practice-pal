import { movedBeyondTap, orderedBars, TAP_SLOP_PX } from './tapGesture';

describe('movedBeyondTap', () => {
  const down = { x: 100, y: 200 };

  it.each([
    ['no movement', { x: 100, y: 200 }],
    ['a jitter', { x: 103, y: 198 }],
    ['exactly the slop', { x: 100 + TAP_SLOP_PX, y: 200 }],
  ])('%s is still a tap', (_what, now) => {
    expect(movedBeyondTap(down, now)).toBe(false);
  });

  it.each([
    ['sideways', { x: 100 + TAP_SLOP_PX + 1, y: 200 }],
    ['upwards', { x: 100, y: 200 - TAP_SLOP_PX - 1 }],
    ['diagonally, each axis within the slop', { x: 106, y: 206 }],
  ])('a move %s is a drag', (_what, now) => {
    expect(movedBeyondTap(down, now)).toBe(true);
  });

  it('takes its own slop', () => {
    expect(movedBeyondTap(down, { x: 103, y: 200 }, 2)).toBe(true);
  });
});

describe('orderedBars', () => {
  it.each([
    [3, 7, [3, 7]],
    [7, 3, [3, 7]],
    [5, 5, [5, 5]],
  ])('%i and %i', (a, b, expected) => {
    expect(orderedBars(a, b)).toEqual(expected);
  });
});
