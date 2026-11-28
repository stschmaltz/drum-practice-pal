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
  const START = { status: 'countingIn', countInCause: 'start' } as const;
  const REPEAT = { status: 'countingIn', countInCause: 'repeat' } as const;
  const PLAYING = { status: 'playing', countInCause: null } as const;
  const READY = { status: 'ready', countInCause: null } as const;

  it.each<[PlayerStatus, Parameters<typeof countInClosesPanel>[1], boolean]>([
    // Play, Space or a pedal with a count-in on: the number is about to show under the sheet.
    ['ready', START, true],
    // No count-in: there is no number to hide, and the press wasn't on the sheet.
    ['ready', PLAYING, false],
    // The count-in's own downbeat.
    ['countingIn', PLAYING, false],
    // Still counting (a seek restarts the count): a sheet opened meanwhile was opened to be used.
    ['countingIn', START, false],
    // A repeat's count-in: the sheet was opened while the loop played, for its speed.
    ['playing', REPEAT, false],
    // The same, when alphaTab said "stopped" before "finished" and the page drew the
    // `ready` between them (Copilot review): the statuses alone read as a new start.
    ['ready', REPEAT, false],
    ['countingIn', REPEAT, false],
    ['playing', READY, false],
    ['countingIn', READY, false],
    ['loading', READY, false],
  ])('from %s to %o: %s', (before, now, closes) => {
    expect(countInClosesPanel(before, now, { formOpen: false })).toBe(closes);
  });

  // 20 batch 4 QA issue 3: closed over the form, the sheet hid a mode. Taps on the score
  // went on picking the form's bars, with nothing on show to say so.
  it.each<[PlayerStatus, Parameters<typeof countInClosesPanel>[1]]>([
    ['ready', START],
    ['playing', REPEAT],
    ['countingIn', PLAYING],
  ])('never while the loop form is open (from %s to %o)', (before, now) => {
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
