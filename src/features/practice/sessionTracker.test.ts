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
  it('is the speed at the stop, after changes along the way', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(20, { speedRatio: 0.75 });
    t.at(40, { speedRatio: 0.708333 });

    expect(t.at(50, { phase: 'stopped' })?.speedRatio).toBe(0.708333);
    expect(t.ended).toHaveLength(1);
  });

  it('a change of speed neither ends the session nor starts its stretch again', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.wrap();
    expect(t.at(35, { speedRatio: 0.75 })).toBeNull();

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

  it('follows a change made while paused in a session still too short', () => {
    const t = tracking();
    t.at(0, { loopId: 'loop-a', phase: 'sounding', speedRatio: 0.7 });
    t.at(10, { phase: 'stopped' });
    t.at(11, { speedRatio: 0.9 });
    t.at(12, { phase: 'sounding' });

    expect(t.at(40, { phase: 'stopped' })).toMatchObject({ durationSeconds: 38, speedRatio: 0.9 });
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
