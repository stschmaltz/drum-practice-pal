import { renderHook } from '@testing-library/react';
import type { PlayerStatus } from '@/features/player/PlayerService';
import { stubWindow } from '@/test/mediaQueries';
import { countInClosesPanel, playLoopClosesPanel, useLoopPanelOpen } from './useLoopPanelOpen';

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

describe('countInClosesPanel', () => {
  it.each<[PlayerStatus, PlayerStatus, boolean]>([
    // Play, Space or a pedal with a count-in on: the number is about to show under the sheet.
    ['ready', 'countingIn', true],
    // No count-in: there is no number to hide, and the press wasn't on the sheet.
    ['ready', 'playing', false],
    // The count-in's own downbeat.
    ['countingIn', 'playing', false],
    // Still counting (a seek restarts the count): a sheet opened meanwhile was opened to be used.
    ['countingIn', 'countingIn', false],
    // A repeat's count-in: the sheet was opened while the loop played, for its speed.
    ['playing', 'countingIn', false],
    ['playing', 'ready', false],
    ['countingIn', 'ready', false],
    ['loading', 'ready', false],
  ])('from %s to %s: %s', (before, now, closes) => {
    expect(countInClosesPanel(before, now, { formOpen: false })).toBe(closes);
  });

  // 20 batch 4 QA issue 3: closed over the form, the sheet hid a mode. Taps on the score
  // went on picking the form's bars, with nothing on show to say so.
  it.each<[PlayerStatus, PlayerStatus]>([
    ['ready', 'countingIn'],
    ['playing', 'countingIn'],
    ['countingIn', 'playing'],
  ])('never while the loop form is open (from %s to %s)', (before, now) => {
    expect(countInClosesPanel(before, now, { formOpen: true })).toBe(false);
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
