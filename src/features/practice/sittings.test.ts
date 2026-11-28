import { describe, expect, it } from 'vitest';
import type { OpenSession, SessionRecord } from './sessionTracker';
import {
  keepsSitting,
  sittingLineText,
  sittingLines,
  sittingProgress,
  tallySitting,
  withSitting,
  type Sitting,
  type SittingTally,
} from './sittings';

const T0 = new Date(2026, 10, 27, 18, 0).getTime();

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    loopId: 'loop-a',
    startedAt: new Date(T0).toISOString(),
    durationSeconds: 40,
    speedRatio: 0.8,
    repeats: 3,
    ...overrides,
  };
}

function openSession(overrides: Partial<OpenSession> = {}): OpenSession {
  return {
    id: 'session-2',
    loopId: 'loop-a',
    startedAt: T0,
    playedMs: 0,
    speedTimes: [],
    playingSince: null,
    repeats: 0,
    speedRatio: 0.8,
    ...overrides,
  };
}

function sitting(overrides: Partial<Sitting> = {}): Sitting {
  return {
    songId: 'song-1',
    loopId: 'loop-a',
    loopName: 'Verse fill',
    beganAt: T0,
    playedSeconds: 720,
    repeats: 20,
    startSpeedRatio: 0.8,
    endSpeedRatio: 0.9,
    ...overrides,
  };
}

const opened = (loopId: string | null, speedRatio = 0.8, now = T0) => ({ now, loopId, speedRatio });

describe('tallySitting', () => {
  it('begins when a loop is opened, at the speed it was opened at', () => {
    expect(tallySitting(null, opened('loop-a', 0.8), null)).toEqual<SittingTally>({
      loopId: 'loop-a',
      beganAt: T0,
      startSpeedRatio: 0.8,
      speedRatio: 0.8,
      loggedSeconds: 0,
      loggedRepeats: 0,
    });
  });

  it('is nothing with no loop', () => {
    expect(tallySitting(null, opened(null), null)).toBeNull();
    expect(tallySitting(tallySitting(null, opened('loop-a'), null), opened(null), null)).toBeNull();
  });

  it('follows the speed, keeping the speed it began at', () => {
    const begun = tallySitting(null, opened('loop-a', 0.8), null);
    const faster = tallySitting(begun, opened('loop-a', 0.9, T0 + 5000), null);
    expect(faster).toMatchObject({ beganAt: T0, startSpeedRatio: 0.8, speedRatio: 0.9 });
  });

  it('adds each session of the loop that ends, across pauses', () => {
    let tally = tallySitting(null, opened('loop-a'), null);
    tally = tallySitting(tally, opened('loop-a'), record({ durationSeconds: 40, repeats: 3 }));
    tally = tallySitting(
      tally,
      opened('loop-a'),
      record({ id: 'session-2', durationSeconds: 35, repeats: 2 }),
    );
    expect(tally).toMatchObject({ loggedSeconds: 75, loggedRepeats: 5 });
  });

  it('starts again on another loop, without the session that ended on the one left', () => {
    const onA = tallySitting(null, opened('loop-a', 0.8), null);
    const onB = tallySitting(onA, opened('loop-b', 0.6, T0 + 60_000), record({ loopId: 'loop-a' }));
    expect(onB).toEqual<SittingTally>({
      loopId: 'loop-b',
      beganAt: T0 + 60_000,
      startSpeedRatio: 0.6,
      speedRatio: 0.6,
      loggedSeconds: 0,
      loggedRepeats: 0,
    });
  });
});

describe('sittingProgress', () => {
  const tally: SittingTally = {
    loopId: 'loop-a',
    beganAt: T0,
    startSpeedRatio: 0.8,
    speedRatio: 0.9,
    loggedSeconds: 40,
    loggedRepeats: 3,
  };

  it('is nothing before a loop is open', () => {
    expect(sittingProgress(null, null, T0)).toBeNull();
  });

  it('is the logged sessions alone while nothing is open', () => {
    expect(sittingProgress(tally, null, T0 + 90_000)).toEqual({
      loopId: 'loop-a',
      beganAt: T0,
      startSpeedRatio: 0.8,
      endSpeedRatio: 0.9,
      playedSeconds: 40,
      repeats: 3,
    });
  });

  it('adds the open session, the stretch still sounding included', () => {
    const open = openSession({ playedMs: 10_000, playingSince: T0 + 100_000, repeats: 2 });
    expect(sittingProgress(tally, open, T0 + 105_500)).toMatchObject({
      playedSeconds: 55,
      repeats: 5,
    });
  });

  it("leaves out another loop's open session", () => {
    const open = openSession({ loopId: 'loop-b', playedMs: 10_000 });
    expect(sittingProgress(tally, open, T0)).toMatchObject({ playedSeconds: 40, repeats: 3 });
  });
});

describe('keepsSitting', () => {
  it('keeps a sitting with the play time a session needs', () => {
    expect(keepsSitting(sitting({ playedSeconds: 30 }), 30)).toBe(true);
    expect(keepsSitting(sitting({ playedSeconds: 29 }), 30)).toBe(false);
  });

  it('goes by the minimum it is given', () => {
    expect(keepsSitting(sitting({ playedSeconds: 2 }), 2)).toBe(true);
  });
});

describe('withSitting', () => {
  it('adds a sitting after the others', () => {
    const first = sitting();
    const second = sitting({ loopId: 'loop-b', beganAt: T0 + 1 });
    expect(withSitting([first], second)).toEqual([first, second]);
  });

  it('replaces the same sitting told twice', () => {
    const early = sitting({ playedSeconds: 30 });
    const late = sitting({ playedSeconds: 45 });
    expect(withSitting([early], late)).toEqual([late]);
  });
});

describe('sittingLines', () => {
  it('is one line per loop, in the order first practised', () => {
    const lines = sittingLines([
      sitting({ loopId: 'loop-a', loopName: 'Verse fill' }),
      sitting({ loopId: 'loop-b', loopName: 'Chorus', beganAt: T0 + 1 }),
    ]);
    expect(lines.map((line) => line.loopName)).toEqual(['Verse fill', 'Chorus']);
  });

  it('adds up a loop gone back to, from its first speed to its last', () => {
    const lines = sittingLines([
      sitting({ playedSeconds: 60, repeats: 4, startSpeedRatio: 0.7, endSpeedRatio: 0.8 }),
      sitting({ loopId: 'loop-b', loopName: 'Chorus', beganAt: T0 + 1 }),
      sitting({
        beganAt: T0 + 2,
        playedSeconds: 90,
        repeats: 5,
        startSpeedRatio: 0.8,
        endSpeedRatio: 0.9,
      }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      loopId: 'loop-a',
      playedSeconds: 150,
      repeats: 9,
      startSpeedRatio: 0.7,
      endSpeedRatio: 0.9,
    });
  });
});

describe('sittingLineText', () => {
  const line = (overrides: Partial<Sitting>) => sittingLines([sitting(overrides)])[0]!;

  it('says the time and the speed it went from and to', () => {
    expect(sittingLineText(line({}))).toBe('Verse fill: 12 min, 80% → 90%');
  });

  it('says one speed when it did not change', () => {
    expect(sittingLineText(line({ endSpeedRatio: 0.8 }))).toBe('Verse fill: 12 min, 80%');
  });

  it('goes by the percents shown, not the stored ratios', () => {
    expect(sittingLineText(line({ startSpeedRatio: 0.8, endSpeedRatio: 0.801 }))).toBe(
      'Verse fill: 12 min, 80%',
    );
  });

  it('says a short sitting in seconds', () => {
    expect(sittingLineText(line({ playedSeconds: 45, endSpeedRatio: 0.8 }))).toBe(
      'Verse fill: 45 s, 80%',
    );
  });
});
