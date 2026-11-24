import { renderHook } from '@testing-library/react';
import type { PlayerStatus } from '@/features/player/PlayerService';
import { LOOP_COLUMN_QUERY } from './loopPanelLayout';
import {
  loopPanelIsSheet,
  loopPanelStartsOpen,
  playLoopClosesPanel,
  useLoopPanelOpen,
} from './useLoopPanelOpen';

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
    'never the side column (%s)',
    (status) => {
      expect(playLoopClosesPanel(false, status)).toBe(false);
    },
  );
});

describe('loopPanelIsSheet and loopPanelStartsOpen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [true, false],
    [false, true],
  ])('column query matches %s: sheet %s', (matches, sheet) => {
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(loopPanelIsSheet()).toBe(sheet);
    expect(loopPanelStartsOpen()).toBe(!sheet);
    expect(matchMedia).toHaveBeenCalledWith(LOOP_COLUMN_QUERY);
  });

  it.each([
    [390, true],
    [768, true],
    // A tablet in portrait: the sheet, like a phone.
    [820, true],
    [1023, true],
    [1024, false],
    [1180, false],
    [1440, false],
  ])('without matchMedia, by window width %i: sheet %s', (width, sheet) => {
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('innerWidth', width);
    expect(loopPanelIsSheet()).toBe(sheet);
    expect(loopPanelStartsOpen()).toBe(!sheet);
  });
});

describe('useLoopPanelOpen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [390, false],
    // A tablet in portrait opens with the sheet closed and the score at full width.
    [820, false],
    [1180, true],
    [1440, true],
  ])('at %i px starts open: %s', (width, open) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === LOOP_COLUMN_QUERY && width >= 1024,
    }));
    const { result } = renderHook(useLoopPanelOpen);
    expect(result.current.open).toBe(open);
  });
});
