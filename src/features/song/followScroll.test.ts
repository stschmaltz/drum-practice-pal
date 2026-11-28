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

describe('windowScrollToShow before the sticky video has stuck (19 QA issues 1 and 8)', () => {
  // A phone on its side, a fresh load: the bar with the video ends at 429 px in a 390 px
  // window; stuck, it would end at 210 px. Nothing of the score is on show.
  const SIDEWAYS = { top: 429, bottom: 390, stuckTop: 210 };

  it('brings the first marked bar under where the video will stick, not under where it is', () => {
    expect(windowScrollToShow({ top: 445, bottom: 582 }, SIDEWAYS)).toBe(
      445 - 210 - GAP_UNDER_BAR_PX,
    );
  });

  it('a 320 px phone: bar 1 half behind the tab bar is brought up, the video not yet stuck', () => {
    const view = { top: 565, bottom: 643, stuckTop: 351 };
    expect(windowScrollToShow({ top: 577, bottom: 714 }, view)).toBe(577 - 351 - GAP_UNDER_BAR_PX);
  });

  it('leaves a bar alone that is on show under a video that hasn’t stuck', () => {
    const view = { top: 400, bottom: 787, stuckTop: 340 };
    expect(windowScrollToShow({ top: 420, bottom: 540 }, view)).toBeNull();
  });
});

describe('windowScrollToShow turning the page a line early (19 QA, question 1)', () => {
  it.each([
    ['the next bar is on the same line', { top: 400, bottom: 520 }, { top: 400, bottom: 520 }],
    ['the next line is all on show', { top: 400, bottom: 520 }, { top: 530, bottom: 650 }],
    [
      'the next line ends on the view’s last pixel',
      { top: 537, bottom: 657 },
      { top: 667, bottom: 787 },
    ],
    ['the tab ends with this bar', { top: 667, bottom: 787 }, null],
    // A repeat going back: the bar played next is above, and turning the page would hide it.
    ['the next bar is above (a repeat)', { top: 667, bottom: 787 }, { top: 537, bottom: 657 }],
    [
      'the next bar is above the view (a repeat)',
      { top: 400, bottom: 520 },
      { top: 100, bottom: 220 },
    ],
  ])('leaves a bar that is comfortably on show: %s', (_name, bar, next) => {
    expect(windowScrollToShow(bar, VIEW, next)).toBeNull();
  });

  it.each([
    ['cut off by the tab bar', { top: 600, bottom: 720 }, { top: 730, bottom: 850 }],
    ['below the window', { top: 660, bottom: 780 }, { top: 790, bottom: 910 }],
    [
      'a pixel and a half short of fitting',
      { top: 538.5, bottom: 658.5 },
      { top: 668.5, bottom: 788.5 },
    ],
  ])(
    'turns when the line after the marked bar is %s: the marked line goes to the top',
    (_name, bar, next) => {
      expect(windowScrollToShow(bar, VIEW, next)).toBe(
        Math.round(bar.top - 340 - GAP_UNDER_BAR_PX),
      );
    },
  );

  it('moves nothing when the marked line is at the top already and the view holds one line', () => {
    const oneLine = { top: 210, bottom: 390 };
    const bar = { top: 210 + GAP_UNDER_BAR_PX, bottom: 359 };
    expect(windowScrollToShow(bar, oneLine, { top: 369, bottom: 506 })).toBeNull();
  });

  it('a bar that has left is brought back whatever follows it', () => {
    expect(windowScrollToShow({ top: 900, bottom: 1020 }, VIEW, null)).toBe(
      900 - 340 - GAP_UNDER_BAR_PX,
    );
  });
});
