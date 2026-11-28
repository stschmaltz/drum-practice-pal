import { SESSION_MAX_DURATION_SECONDS } from '@/lib/schema';
import {
  countRepeat,
  observe,
  playedMsAt,
  SESSION_MIN_PLAY_SECONDS,
  trackerPhase,
  type SessionRecord,
  type TrackerInput,
  type TrackerPhase,
  type TrackerState,
} from './sessionTracker';

const T0 = Date.parse('2026-11-23T18:00:00.000Z');
const SECOND = 1000;

/**
 * Drives the tracker the way the page does: one call per change, at a time
 * given in seconds from T0. Collects every session that ended.
 */
function tracking({ minPlaySeconds }: { minPlaySeconds?: number } = {}) {
  let state: TrackerState = null;
  let nextId = 1;
  const ended: SessionRecord[] = [];
  const input: Omit<TrackerInput, 'now'> = { loopId: null, phase: 'stopped', speedRatio: 1 };

  const at = (seconds: number, change: Partial<Omit<TrackerInput, 'now'>>) => {
    Object.assign(input, change);
    const step = observe(
      state,
      { ...input, now: T0 + seconds * SECOND },
      { newId: () => `session-${nextId++}`, minPlaySeconds },
    );
    state = step.state;
    if (step.ended) ended.push(step.ended);
    return step.ended;
  };
  return {
    at,
    wrap: () => {
      state = countRepeat(state);
    },
    ended,
    state: () => state,
  };
}

describe('SESSION_MIN_PLAY_SECONDS', () => {
  it('is the 30 seconds of the plan', () => {
    expect(SESSION_MIN_PLAY_SECONDS).toBe(30);
  });
});

describe('a minute of practice', () => {
  it('is one session with the start, the play time, the speed and the passes', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.85 });
    for (let pass = 0; pass < 7; pass++) t.wrap();

    const session = t.at(60, { phase: 'stopped' });

    expect(session).toEqual({
      id: 'session-1',
      loopId: 'loop-a',
      startedAt: '2026-11-23T18:00:00.000Z',
      durationSeconds: 60,
      speedRatio: 0.85,
      repeats: 7,
    });
    expect(t.ended).toHaveLength(1);
    expect(t.state()).toBeNull();
  });

  it('logs nothing more when the stop is reported again', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    t.at(60, { phase: 'stopped' });

    t.at(61, { phase: 'stopped' });
    t.at(62, { speedRatio: 0.5 });

    expect(t.ended).toHaveLength(1);
  });
});

describe('the 30-second minimum', () => {
  it.each([
    [29.999, false],
    [30, true],
    [30.001, true],
  ])('a stop after %s s of play logs: %s', (seconds, logs) => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });

    t.at(seconds, { phase: 'stopped' });

    expect(t.ended).toHaveLength(logs ? 1 : 0);
  });

  it('keeps a short stretch and adds the next to it, pauses left out', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    t.at(20, { phase: 'stopped' });
    expect(t.ended).toHaveLength(0);

    // A five-minute break, then 15 more seconds.
    t.at(320, { phase: 'sounding' });
    const session = t.at(335, { phase: 'stopped' });

    expect(session).toMatchObject({
      id: 'session-1',
      startedAt: '2026-11-23T18:00:00.000Z',
      durationSeconds: 35,
    });
  });

  it('starts a new session, with a new id, after one was logged', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    t.at(40, { phase: 'stopped' });

    t.at(100, { phase: 'sounding' });
    t.wrap();
    const second = t.at(145, { phase: 'stopped' });

    expect(t.ended.map((session) => session.id)).toEqual(['session-1', 'session-2']);
    expect(second).toMatchObject({
      startedAt: '2026-11-23T18:01:40.000Z',
      durationSeconds: 45,
      repeats: 1,
    });
  });

  it('adds up many short goes, and logs at the stop that takes it past the minimum', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    // Ten goes of 3 s, a 7 s rest after each, one pass in every go.
    for (let go = 0; go < 10; go++) {
      const start = go * 10;
      t.at(start, { phase: 'sounding' });
      t.wrap();
      t.at(start + 3, { phase: 'stopped' });
      expect(t.ended).toHaveLength(go < 9 ? 0 : 1);
    }

    expect(t.ended[0]).toEqual({
      id: 'session-1',
      loopId: 'loop-a',
      startedAt: '2026-11-23T18:00:00.000Z',
      durationSeconds: 30,
      speedRatio: 1,
      repeats: 10,
    });
  });

  it.each([
    [29.999, false],
    [30, true],
  ])('leaving the loop after %s s of play logs: %s', (seconds, logs) => {
    const toAnotherLoop = tracking();
    toAnotherLoop.at(0, { loopId: 'loop-a', phase: 'sounding' });
    toAnotherLoop.at(seconds, { loopId: 'loop-b' });
    expect(toAnotherLoop.ended).toHaveLength(logs ? 1 : 0);

    const toTheWholeSong = tracking();
    toTheWholeSong.at(0, { loopId: 'loop-a', phase: 'sounding' });
    toTheWholeSong.at(seconds, { loopId: null });
    expect(toTheWholeSong.ended).toHaveLength(logs ? 1 : 0);
  });

  it('a session dropped for being short takes its passes with it', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    t.wrap();
    t.wrap();
    t.at(20, { loopId: null });

    t.at(30, { loopId: 'loop-a' });
    t.wrap();

    expect(t.at(70, { phase: 'stopped' })).toMatchObject({ durationSeconds: 40, repeats: 1 });
  });

  it('can be tuned', () => {
    const t = tracking({ minPlaySeconds: 3 });
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });

    expect(t.at(3, { phase: 'stopped' })).toMatchObject({ durationSeconds: 3 });
  });
});

describe('what counts as play time', () => {
  it('nothing in jam mode, however long it plays', () => {
    const t = tracking();
    t.at(0, { loopId: null, phase: 'sounding' });
    t.at(600, { phase: 'stopped' });

    expect(t.ended).toHaveLength(0);
    expect(t.state()).toBeNull();
  });

  it('not the count-in before the start', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'countingIn' });
    expect(t.state()).toBeNull();

    t.at(4, { phase: 'sounding' });
    const session = t.at(44, { phase: 'stopped' });

    expect(session).toMatchObject({ startedAt: '2026-11-23T18:00:04.000Z', durationSeconds: 40 });
  });

  it('not the count-in before every repeat, which does not end the session either', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    // Four passes of 10 s, each followed by a 2 s count-in.
    for (let pass = 0; pass < 4; pass++) {
      const passEnd = pass * 12 + 10;
      t.wrap();
      t.at(passEnd, { phase: 'countingIn' });
      t.at(passEnd + 2, { phase: 'sounding' });
    }
    expect(t.ended).toHaveLength(0);

    const session = t.at(50, { phase: 'stopped' });

    expect(session).toMatchObject({ durationSeconds: 42, repeats: 4 });
    expect(t.ended).toHaveLength(1);
  });

  it('a count-in called off after enough play logs at the stop, not at the count-in', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    expect(t.at(35, { phase: 'countingIn' })).toBeNull();

    expect(t.at(36, { phase: 'stopped' })).toMatchObject({ durationSeconds: 35 });
  });

  it('not time before the clock was set back mid-stretch', () => {
    const t = tracking();
    t.at(100, { loopId: 'loop-a', phase: 'sounding' });

    t.at(40, { phase: 'stopped' });

    expect(t.ended).toHaveLength(0);
    expect(t.state()).toMatchObject({ playedMs: 0, playingSince: null });
  });

  it('never more than the database takes, when the clock jumps ahead', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });

    const session = t.at(3 * SESSION_MAX_DURATION_SECONDS, { phase: 'stopped' });

    expect(session?.durationSeconds).toBe(SESSION_MAX_DURATION_SECONDS);
  });

  it('rounds to whole seconds', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });

    expect(t.at(45.6, { phase: 'stopped' })?.durationSeconds).toBe(46);
  });
});

describe('the speed of a session', () => {
  it('is the speed most of it was played at, not the one it ended on (Unit 17)', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.8 });
    // Ten minutes at 80%, then a minute's try at full speed.
    t.at(600, { speedRatio: 1 });

    expect(t.at(660, { phase: 'stopped' })).toMatchObject({
      durationSeconds: 660,
      speedRatio: 0.8,
    });
    expect(t.ended).toHaveLength(1);
  });

  it('adds up a speed gone back to, across pauses and count-ins', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(10, { speedRatio: 0.9 });
    t.at(25, { phase: 'stopped' });
    t.at(30, { speedRatio: 0.7 });
    t.at(31, { phase: 'countingIn' });
    t.at(33, { phase: 'sounding' });

    // 70% for 10 + 10 seconds, 90% for 15, though 90% had the longest single stretch.
    expect(t.at(43, { phase: 'stopped' })).toMatchObject({ durationSeconds: 35, speedRatio: 0.7 });
  });

  it('on a tie is the speed played later', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(20, { speedRatio: 0.75 });

    expect(t.at(40, { phase: 'stopped' })?.speedRatio).toBe(0.75);
  });

  it('on a tie with a speed gone back to is that speed, the one played last', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(10, { speedRatio: 0.75 });
    t.at(30, { speedRatio: 0.7 });

    expect(t.at(40, { phase: 'stopped' })?.speedRatio).toBe(0.7);
  });

  it('counts two ratios that show as one percent as one speed, logged as the later ratio', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.708333 });
    t.at(20, { speedRatio: 0.9 });
    t.at(50, { speedRatio: 0.71 });

    // "71%" for 20 + 20 seconds against 30 at 90%.
    expect(t.at(70, { phase: 'stopped' })?.speedRatio).toBe(0.71);
  });

  it('a change of speed neither ends the session nor starts its stretch again', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.wrap();
    expect(t.at(35, { speedRatio: 0.75 })).toBeNull();
    expect(playedMsAt(t.state()!, T0 + 40 * SECOND)).toBe(40 * SECOND);

    expect(t.at(50, { phase: 'stopped' })).toMatchObject({
      startedAt: '2026-11-23T18:00:00.000Z',
      durationSeconds: 50,
      repeats: 1,
    });
  });

  it('is the exact ratio, never the whole percent it shows as', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.855556 });

    expect(t.at(31, { loopId: 'loop-b', speedRatio: 0.5 })?.speedRatio).toBe(0.855556);
  });

  it('a speed set while paused counts from the next stretch, for the time played at it', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(10, { phase: 'stopped' });
    t.at(11, { speedRatio: 0.9 });
    t.at(12, { phase: 'sounding' });

    expect(t.at(40, { phase: 'stopped' })).toMatchObject({ durationSeconds: 38, speedRatio: 0.9 });
  });

  it('a speed set in the same step as the stop was never played, so it is not the speed', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });

    expect(t.at(40, { phase: 'stopped', speedRatio: 1 })?.speedRatio).toBe(0.7);
  });

  it('a speed only passed through while paused or counting in is never the speed', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(20, { phase: 'stopped' });
    t.at(21, { speedRatio: 1.5 });
    t.at(22, { speedRatio: 0.8 });
    t.at(23, { phase: 'countingIn' });
    t.at(24, { speedRatio: 0.7 });
    t.at(25, { phase: 'sounding' });

    expect(t.at(40, { phase: 'stopped' })).toMatchObject({ durationSeconds: 35, speedRatio: 0.7 });
  });

  it('leaving the loop mid-stretch counts the stretch at the speed it was played at', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    t.at(10, { speedRatio: 0.8 });

    expect(t.at(50, { loopId: null })).toMatchObject({ durationSeconds: 50, speedRatio: 0.8 });
  });

  it('a clock set back mid-stretch takes no time from the speed played before it', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(40, { speedRatio: 0.9 });
    t.at(20, { speedRatio: 1 });

    expect(t.at(30, { phase: 'stopped' })).toMatchObject({ durationSeconds: 50, speedRatio: 0.7 });
  });
});

// Unit 20, batch 5 Test: the windows a speed can change in, one row each.
describe('the speed of a session, window by window', () => {
  const totalOf = (state: TrackerState) =>
    (state?.speedTimes ?? []).reduce((total, time) => total + time.playedMs, 0);

  it('through many changes it is still the speed with the most time, and no time is lost or counted twice', () => {
    const t = tracking();
    // Seconds played at each speed in turn: 60% has 9 + 9 + 9, 70% has 8 + 8 + 8, the rest a few each.
    const stretches: [number, number][] = [
      [0.6, 9],
      [0.7, 8],
      [0.8, 3],
      [0.6, 9],
      [0.9, 5],
      [0.7, 8],
      [1, 2],
      [0.6, 9],
      [0.7, 8],
      [1.25, 4],
    ];
    let clock = 0;
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    for (const [speedRatio, seconds] of stretches) {
      t.at(clock, { speedRatio });
      // What is banked is always everything played before this stretch.
      expect(totalOf(t.state())).toBe(t.state()!.playedMs);
      expect(playedMsAt(t.state()!, T0 + clock * SECOND)).toBe(clock * SECOND);
      clock += seconds;
    }

    expect(t.at(clock, { phase: 'stopped' })).toMatchObject({
      durationSeconds: 65,
      speedRatio: 0.6,
    });
    expect(t.ended).toHaveLength(1);
  });

  it('keeps one entry per speed shown, however often it is gone back to', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    for (let second = 1; second <= 20; second++) {
      t.at(second, { speedRatio: second % 2 === 0 ? 0.7 : 0.75 });
    }

    // The stretch banked last (19 to 20 s, at 75%) is the last entry.
    expect(t.state()!.speedTimes).toEqual([
      { speedRatio: 0.7, playedMs: 10 * SECOND },
      { speedRatio: 0.75, playedMs: 10 * SECOND },
    ]);
  });

  it('a speed set during a count-in counts from the downbeat, for the time played at it', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'countingIn', speedRatio: 0.7 });
    t.at(1, { speedRatio: 0.9 });
    t.at(2, { phase: 'sounding' });

    expect(t.at(34, { phase: 'stopped' })).toMatchObject({
      startedAt: '2026-11-23T18:00:02.000Z',
      durationSeconds: 32,
      speedRatio: 0.9,
    });
  });

  it('a speed set during the count-in before a repeat takes none of the pass before it', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(20, { phase: 'countingIn' });
    t.at(21, { speedRatio: 1 });
    t.at(22, { phase: 'sounding' });

    // 20 s at 70%, then 15 at 100%: the two seconds of clicks are nobody's.
    expect(t.at(37, { phase: 'stopped' })).toMatchObject({ durationSeconds: 35, speedRatio: 0.7 });
  });

  it('a speed that arrives with the count-in is not what the pass before it was played at', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(20, { phase: 'countingIn', speedRatio: 1 });
    t.at(22, { phase: 'sounding' });

    expect(t.at(37, { phase: 'stopped' })).toMatchObject({ durationSeconds: 35, speedRatio: 0.7 });
  });

  it('a session still under the minimum carries each go at its own speed across the pauses', () => {
    const t = tracking();
    // Three goes of 12 seconds, the speed changed in each pause: 60%, 75%, back to 60%.
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    expect(t.at(12, { phase: 'stopped' })).toBeNull();
    t.at(60, { speedRatio: 0.75 });
    t.at(61, { phase: 'sounding' });
    expect(t.at(73, { phase: 'stopped' })).toBeNull();
    t.at(120, { speedRatio: 0.6 });
    t.at(121, { phase: 'sounding' });

    expect(t.at(133, { phase: 'stopped' })).toEqual({
      id: 'session-1',
      loopId: 'loop-a',
      startedAt: '2026-11-23T18:00:00.000Z',
      durationSeconds: 36,
      speedRatio: 0.6,
      repeats: 0,
    });
  });

  it('a session still under the minimum that ends on a try at full speed is logged at the speed it mostly had', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    t.at(25, { phase: 'stopped' });
    t.at(26, { speedRatio: 1 });
    t.at(27, { phase: 'sounding' });

    expect(t.at(33, { phase: 'stopped' })).toMatchObject({ durationSeconds: 31, speedRatio: 0.6 });
  });

  it("a typed BPM's exact ratio is what is logged when most of the time was at it, whatever came after", () => {
    const t = tracking();
    // 85 BPM typed at 120 is 0.708333; then a round nudge to 75% and a try at 100%.
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.708333 });
    t.at(40, { speedRatio: 0.75 });
    t.at(55, { speedRatio: 1 });

    expect(t.at(60, { phase: 'stopped' })?.speedRatio).toBe(0.708333);
  });

  it('a session logged leaves none of its speeds to the next one', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    t.at(300, { phase: 'stopped' });
    t.at(301, { speedRatio: 0.9 });
    t.at(302, { phase: 'sounding' });

    // Five minutes at 60% were the last session's: this one is 31 seconds at 90%.
    expect(t.at(333, { phase: 'stopped' })).toMatchObject({
      id: 'session-2',
      durationSeconds: 31,
      speedRatio: 0.9,
    });
  });

  it('another loop starts with none of the time of the loop left, at any speed', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    t.at(300, { loopId: 'loop-b', speedRatio: 0.6 });
    expect(t.state()).toMatchObject({ loopId: 'loop-b', playedMs: 0, speedTimes: [] });
    t.at(310, { speedRatio: 0.9 });

    // On loop B: 10 s at 60%, 25 at 90%. Loop A's five minutes at 60% don't count here.
    expect(t.at(335, { phase: 'stopped' })).toMatchObject({
      loopId: 'loop-b',
      durationSeconds: 35,
      speedRatio: 0.9,
    });
  });

  it('a session dropped for being short takes its speeds with it', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    t.at(20, { loopId: null });
    expect(t.ended).toHaveLength(0);
    t.at(30, { loopId: 'loop-a', speedRatio: 0.9 });
    t.at(46, { speedRatio: 0.6 });

    // 16 s at 90%, 15 at 60%: the 20 dropped at 60% would have made it a session at 60%.
    expect(t.at(61, { phase: 'stopped' })).toMatchObject({ durationSeconds: 31, speedRatio: 0.9 });
  });

  it('the hidden page ends the stretch at the speed it was played at, like any stop', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.8 });
    t.at(600, { speedRatio: 1 });

    // trackerPhase gives "stopped" for a hidden page, while the player is still "playing".
    expect(t.at(660, { phase: trackerPhase('playing', true) })).toMatchObject({
      durationSeconds: 660,
      speedRatio: 0.8,
    });
  });

  it('a speed reported again unchanged while sounding moves nothing', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    const before = t.state();
    t.at(10, { speedRatio: 0.7 });

    expect(t.state()).toBe(before);
  });
});

describe('leaving the loop', () => {
  it('for another loop logs the first at its own speed and opens the second', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.6 });
    t.wrap();

    // "Play loop" on B: the loop and B's saved speed change in the same step.
    const first = t.at(45, { loopId: 'loop-b', speedRatio: 1.1 });

    expect(first).toEqual({
      id: 'session-1',
      loopId: 'loop-a',
      startedAt: '2026-11-23T18:00:00.000Z',
      durationSeconds: 45,
      speedRatio: 0.6,
      repeats: 1,
    });
    expect(t.state()).toMatchObject({
      id: 'session-2',
      loopId: 'loop-b',
      startedAt: T0 + 45 * SECOND,
      repeats: 0,
      speedRatio: 1.1,
    });

    expect(t.at(80, { phase: 'stopped' })).toMatchObject({
      loopId: 'loop-b',
      durationSeconds: 35,
      speedRatio: 1.1,
    });
  });

  it('back to the whole song logs it while playback carries on', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });

    expect(t.at(31, { loopId: null })).toMatchObject({ loopId: 'loop-a', durationSeconds: 31 });
    expect(t.state()).toBeNull();
  });

  it('drops a session that is still too short', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });

    expect(t.at(20, { loopId: null })).toBeNull();
    expect(t.state()).toBeNull();
    // Coming back starts from nothing.
    t.at(30, { loopId: 'loop-a' });
    expect(t.at(45, { phase: 'stopped' })).toBeNull();
  });

  it('while paused or counting in logs the time already banked, if that is enough', () => {
    const short = tracking();
    short.at(0, { loopId: 'loop-a', phase: 'sounding' });
    short.at(25, { phase: 'stopped' });
    short.at(30, { phase: 'sounding' });
    short.at(32, { phase: 'countingIn' });
    // 27 seconds banked, however long the pause before leaving.
    expect(short.at(500, { loopId: null })).toBeNull();

    const enough = tracking();
    enough.at(0, { loopId: 'loop-a', phase: 'sounding' });
    enough.at(35, { phase: 'countingIn' });
    expect(enough.at(500, { loopId: 'loop-b' })).toMatchObject({
      loopId: 'loop-a',
      durationSeconds: 35,
    });
  });

  it('opens nothing for a loop that is not sounding', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'stopped' });
    t.at(5, { loopId: 'loop-b', phase: 'countingIn' });

    expect(t.state()).toBeNull();
  });
});

describe('countRepeat', () => {
  it('counts nothing outside a session', () => {
    expect(countRepeat(null)).toBeNull();
  });

  it('counts a pass that ends as its count-in begins', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    t.at(10, { phase: 'countingIn' });
    t.wrap();

    expect(t.state()).toMatchObject({ repeats: 1 });
  });
});

describe('playedMsAt', () => {
  it('adds the stretch still sounding to what is banked', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding' });
    t.at(10, { phase: 'stopped' });
    t.at(20, { phase: 'sounding' });
    const state = t.state();
    if (!state) throw new Error('expected an open session');

    expect(playedMsAt(state, T0 + 25 * SECOND)).toBe(15 * SECOND);
  });
});

describe('trackerPhase', () => {
  it.each<[Parameters<typeof trackerPhase>[0], boolean, TrackerPhase]>([
    ['playing', false, 'sounding'],
    ['countingIn', false, 'countingIn'],
    ['ready', false, 'stopped'],
    ['loading', false, 'stopped'],
    ['error', false, 'stopped'],
    ['playing', true, 'stopped'],
    ['countingIn', true, 'stopped'],
    ['ready', true, 'stopped'],
  ])('%s with the page hidden=%s is %s', (status, hidden, phase) => {
    expect(trackerPhase(status, hidden)).toBe(phase);
  });
});
