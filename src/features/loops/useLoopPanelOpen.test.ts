import { renderHook } from '@testing-library/react';
import type { PlayerStatus } from '@/features/player/PlayerService';
import { stubWindow } from '@/test/mediaQueries';
import { playLoopClosesPanel, useLoopPanelOpen } from './useLoopPanelOpen';

describe('playLoopClosesPanel', () => {
  it.each<[PlayerStatus, boolean]>([
    // Play starts here, with or without a count-in: the score and the counter are wanted.
    ['ready', true],
    // The count starts again for the loop pressed.
    ['countingIn', true],
    // Already playing: no count-in follows, and the sheet is open for its speed control.
    ['playing', false],
  ])('while %s: %s', (status, closes) => {
    expect(playLoopClosesPanel(status)).toBe(closes);
  });
});

describe('useLoopPanelOpen', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The score is the page: the sheet starts closed at every size, a laptop's too.
  it.each([390, 820, 1180, 1440])('at %i px starts closed', (width) => {
    stubWindow({ width, fontSize: 16 });
    const { result } = renderHook(useLoopPanelOpen);
    expect(result.current.open).toBe(false);
  });
});
