import { PAGE_LAYOUT_QUERY } from '@/features/player/layout';
import type { PlayerStatus } from '@/features/player/PlayerService';
import { loopPanelIsSheet, playLoopClosesPanel } from './useLoopPanelOpen';

describe('playLoopClosesPanel', () => {
  it.each<[PlayerStatus, boolean]>([
    // Play starts here, with or without a count-in: the score and the counter are wanted.
    ['ready', true],
    // The count starts again for the loop pressed.
    ['countingIn', true],
    // Already playing: no count-in follows, and the sheet is open for its speed control.
    ['playing', false],
  ])('the sheet, while %s: %s', (status, closes) => {
    expect(playLoopClosesPanel(true, status)).toBe(closes);
  });

  it.each<PlayerStatus>(['loading', 'ready', 'countingIn', 'playing', 'error'])(
    'never the side panel (%s)',
    (status) => {
      expect(playLoopClosesPanel(false, status)).toBe(false);
    },
  );
});

describe('loopPanelIsSheet', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [true, false],
    [false, true],
  ])('page layout query matches %s: sheet %s', (matches, sheet) => {
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(loopPanelIsSheet()).toBe(sheet);
    expect(matchMedia).toHaveBeenCalledWith(PAGE_LAYOUT_QUERY);
  });

  it.each([
    [390, true],
    [767, true],
    [768, false],
    [1440, false],
  ])('without matchMedia, by window width %i: sheet %s', (width, sheet) => {
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('innerWidth', width);
    expect(loopPanelIsSheet()).toBe(sheet);
  });
});
