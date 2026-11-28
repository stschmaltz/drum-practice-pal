import { GAP_UNDER_BAR_PX, windowScrollToShow } from './followScroll';

/** A phone: the sticky video ends at 340 px, the tab bar starts at 787 px. */
const VIEW = { top: 340, bottom: 787 };

describe('windowScrollToShow', () => {
  it.each([
    ['in the middle of the view', { top: 400, bottom: 520 }],
    ['right under the sticky bar', { top: 340, bottom: 460 }],
    ['ending on the view’s last pixel', { top: 667, bottom: 787 }],
    ['a fraction of a pixel past an edge', { top: 339.4, bottom: 459.4 }],
  ])('leaves the page alone for a bar on show: %s', (_name, bar) => {
    expect(windowScrollToShow(bar, VIEW)).toBeNull();
  });

  it.each([
    ['cut off by the tab bar', { top: 700, bottom: 820 }, 700 - 340 - GAP_UNDER_BAR_PX],
    ['below the window', { top: 1400, bottom: 1520 }, 1400 - 340 - GAP_UNDER_BAR_PX],
    ['under the sticky video', { top: 250, bottom: 370 }, 250 - 340 - GAP_UNDER_BAR_PX],
    ['above the window (a seek back)', { top: -900, bottom: -780 }, -900 - 340 - GAP_UNDER_BAR_PX],
  ])('brings a bar that is %s to the top of the view', (_name, bar, distance) => {
    expect(windowScrollToShow(bar, VIEW)).toBe(distance);
  });

  it('puts a line taller than the view at its top, where reading starts', () => {
    expect(windowScrollToShow({ top: 500, bottom: 1100 }, VIEW)).toBe(500 - 340 - GAP_UNDER_BAR_PX);
  });

  it('scrolls by whole pixels, and not at all for a line already at the top', () => {
    expect(windowScrollToShow({ top: 352.2, bottom: 900 }, VIEW)).toBeNull();
    expect(windowScrollToShow({ top: 700.6, bottom: 820 }, VIEW)).toBe(349);
  });
});
