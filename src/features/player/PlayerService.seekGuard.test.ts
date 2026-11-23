/**
 * The stale-position guard after a seek (Unit 08): positions alphaTab posted
 * before the seek are dropped until one arrives in the bar asked for. Worked
 * examples first, then its edges: exactly how long it waits, what it leaves
 * alone, and how it behaves inside a loop and a count-in.
 */
import { BAR_MS, loopingBars5To8, setupCountIn, START_DELAY_MS } from '@/test/countInPlayer';
import { startOfBar, TEMPO_CHANGE_BAR_TEMPOS, TICKS_PER_BAR } from '@/test/fakePlayerEngine';
import { SEEK_SETTLE_MS } from './PlayerService';

/** A loaded 16-bar song with no count-in, at bar 1. */
const loadedSong = (barTempos?: readonly number[]) =>
  setupCountIn({ options: { countInBars: 0 }, barTempos });

function playing(barTempos?: readonly number[]) {
  const ctx = loadedSong(barTempos);
  ctx.service.play();
  ctx.engine.fire('stateChanged', { playing: true });
  const barChanges: (number | null)[] = [];
  ctx.service.on('barChanged', ({ barNumber }) => barChanges.push(barNumber));
  return { ...ctx, barChanges };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('positions around a seek', () => {
  /** A song playing in bar 12. */
  function playingAtBar12() {
    const ctx = loadedSong();
    ctx.service.play();
    ctx.engine.fire('stateChanged', { playing: true });
    ctx.engine.fire('position', { tick: startOfBar(12) + 100 });
    const barChanges: (number | null)[] = [];
    ctx.service.on('barChanged', ({ barNumber }) => barChanges.push(barNumber));
    const positions: number[] = [];
    ctx.service.on('position', ({ tick }) => positions.push(tick));
    return { ...ctx, barChanges, positions };
  }

  it('drops a position alphaTab posted before the seek, so the bar never flicks back', () => {
    const { engine, service, barChanges, positions } = playingAtBar12();

    service.seekToBar(3);
    // Still on its way from the worker when the seek was made.
    engine.fire('position', { tick: startOfBar(12) + 400 });
    expect(service.getSnapshot().barNumber).toBe(3);

    engine.fire('position', { tick: startOfBar(3) + 50 });
    engine.fire('position', { tick: startOfBar(4) + 10 });

    expect(barChanges).toEqual([3, 4]);
    expect(positions).toEqual([startOfBar(3) + 50, startOfBar(4) + 10]);
  });

  it('believes any position again once one has arrived in the bar asked for', () => {
    const { engine, service, barChanges } = playingAtBar12();
    service.seekToBar(3);
    engine.fire('position', { tick: startOfBar(3) });
    // A loop wrap or the end of the song can take playback anywhere next.
    engine.fire('position', { tick: startOfBar(12) });
    expect(barChanges).toEqual([3, 12]);
  });

  it('a newer seek replaces the bar being waited for', () => {
    const { engine, service, barChanges } = playingAtBar12();
    service.seekToBar(3);
    service.seekToBar(7);
    // The echo of the first seek is now the stale one.
    engine.fire('position', { tick: startOfBar(3) });
    engine.fire('position', { tick: startOfBar(7) });
    expect(barChanges).toEqual([3, 7]);
  });

  it('Back to start is believed at once, even right after a seek', () => {
    const { engine, service } = playingAtBar12();
    service.seekToBar(9);
    service.stop();
    engine.fire('stateChanged', { playing: false });
    engine.fire('position', { tick: 0 });
    expect(service.getSnapshot().barNumber).toBe(1);
  });

  it('a new range is believed at once: alphaTab moves to its start itself', () => {
    const { engine, service } = playingAtBar12();
    service.seekToBar(9);
    service.setRange({ startBar: 5, endBar: 8 });
    engine.fire('position', { tick: startOfBar(5) });
    expect(service.getSnapshot().barNumber).toBe(5);
  });

  it('a seek to the bar already playing changes nothing either way', () => {
    const { engine, service, barChanges } = playingAtBar12();
    service.seekToBar(12);
    engine.fire('position', { tick: startOfBar(12) + 400 });
    engine.fire('position', { tick: startOfBar(12) });
    expect(barChanges).toEqual([]);
    expect(service.getSnapshot().barNumber).toBe(12);
  });
});

describe('how long a seek waits for the engine to arrive', () => {
  it('is half a second', () => {
    expect(SEEK_SETTLE_MS).toBe(500);
  });

  it('still drops a stray position 1 ms before the wait is over', () => {
    const { engine, service } = playing();
    engine.fire('position', { tick: startOfBar(12) });
    service.seekToBar(3);

    vi.advanceTimersByTime(SEEK_SETTLE_MS - 1);
    engine.fire('position', { tick: startOfBar(12) + 300 });

    expect(service.getSnapshot().barNumber).toBe(3);
  });

  it('believes the very next position once the wait is over, wherever it is', () => {
    const { engine, service, barChanges } = playing();
    engine.fire('position', { tick: startOfBar(12) });
    service.seekToBar(3);

    vi.advanceTimersByTime(SEEK_SETTLE_MS);
    engine.fire('position', { tick: startOfBar(12) + 300 });

    expect(service.getSnapshot().barNumber).toBe(12);
    expect(barChanges).toEqual([12, 3, 12]);
  });

  it('needs no timer of its own: with no positions at all, the bar asked for stays on show', () => {
    const { service } = playing();
    service.seekToBar(7);
    vi.advanceTimersByTime(10 * SEEK_SETTLE_MS);
    expect(service.getSnapshot().barNumber).toBe(7);
  });

  it('counts the wait from the latest seek, not the first', () => {
    const { engine, service } = playing();
    service.seekToBar(3);
    vi.advanceTimersByTime(SEEK_SETTLE_MS - 100);
    service.seekToBar(7);
    vi.advanceTimersByTime(200);
    // 600 ms after the first seek, but only 200 ms after the second.
    engine.fire('position', { tick: startOfBar(3) + 10 });
    expect(service.getSnapshot().barNumber).toBe(7);
  });
});

describe('what counts as arriving', () => {
  it.each([
    ['the first tick of the bar', startOfBar(3)],
    ['the middle of the bar', startOfBar(3) + TICKS_PER_BAR / 2],
    ['the last tick of the bar', startOfBar(4) - 1],
  ])('%s is in the bar', (_what, tick) => {
    const { engine, service } = playing();
    engine.fire('position', { tick: startOfBar(12) });
    service.seekToBar(3);
    engine.fire('position', { tick });
    // Arrived: the next position is believed, even one far away.
    engine.fire('position', { tick: startOfBar(9) });
    expect(service.getSnapshot().barNumber).toBe(9);
  });

  it.each([
    ['the last tick of the bar before', startOfBar(3) - 1],
    ['the first tick of the bar after', startOfBar(4)],
  ])('%s is not', (_what, tick) => {
    const { engine, service } = playing();
    engine.fire('position', { tick: startOfBar(12) });
    service.seekToBar(3);
    engine.fire('position', { tick });
    expect(service.getSnapshot().barNumber).toBe(3);
  });
});

describe('what a dropped position leaves alone', () => {
  it('the BPM’s tempo stays the sought bar’s, across the tempo change', () => {
    const { engine, service } = playing(TEMPO_CHANGE_BAR_TEMPOS);
    engine.fire('position', { tick: startOfBar(12) });
    expect(service.getSnapshot().barTempo).toBe(90);

    service.seekToBar(3);
    expect(service.getSnapshot().barTempo).toBe(120);
    engine.fire('position', { tick: startOfBar(12) + 500 });

    expect(service.getSnapshot()).toMatchObject({ barNumber: 3, barTempo: 120 });
  });

  it('listeners are not told, and the snapshot object does not change', () => {
    const { engine, service } = playing();
    engine.fire('position', { tick: startOfBar(12) });
    service.seekToBar(3);
    const before = service.getSnapshot();
    const listener = vi.fn();
    service.subscribe(listener);
    const positions = vi.fn();
    service.on('position', positions);

    engine.fire('position', { tick: startOfBar(12) + 500 });

    expect(listener).not.toHaveBeenCalled();
    expect(positions).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toBe(before);
  });

  it('pressing Play after a seek while paused counts in from the sought bar, not the stale one', () => {
    const { engine, service, clicks } = setupCountIn({ barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    engine.fire('position', { tick: startOfBar(12) + 700 });
    service.seekToBar(3);
    // The worker's last word from before the seek.
    engine.fire('position', { tick: startOfBar(12) + 900 });

    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);

    // Four clicks at bar 3's 120 BPM, half a second apart; bar 12's 90 would be 0.667 s.
    const times = clicks.scheduled.map(({ click }) => click.time);
    expect(times).toHaveLength(4);
    expect(times[1]! - times[0]!).toBeCloseTo(0.5, 3);
    expect(service.getSnapshot().barNumber).toBe(3);
  });
});

describe('seeks that set no guard', () => {
  it('a bar the song lacks is refused and positions keep being believed', () => {
    const { engine, service } = playing();
    expect(service.seekToBar(17)).toBe(false);
    expect(service.seekToBar(0)).toBe(false);
    engine.fire('position', { tick: startOfBar(9) });
    expect(service.getSnapshot().barNumber).toBe(9);
  });

  it('a seek before the song has loaded is refused, and the first position after loading is believed', () => {
    const { engine, service } = setupCountIn({ options: { countInBars: 0 }, loaded: false });
    expect(service.seekToBar(3)).toBe(false);
    engine.finishLoading();
    engine.fire('position', { tick: startOfBar(9) });
    expect(service.getSnapshot().barNumber).toBe(9);
  });

  it('loading again forgets a seek that was still waiting', () => {
    const { engine, service } = playing();
    service.seekToBar(9);
    service.load(new Uint8Array([2]));
    engine.finishLoading();
    engine.fire('position', { tick: startOfBar(2) });
    expect(service.getSnapshot().barNumber).toBe(2);
  });

  it('after dispose a late position changes nothing', () => {
    const { engine, service } = playing();
    service.seekToBar(9);
    service.dispose();
    engine.fire('position', { tick: startOfBar(9) });
    engine.fire('position', { tick: startOfBar(2) });
    expect(service.getSnapshot().barNumber).toBe(9);
  });
});

describe('seeking while paused', () => {
  it('shows the bar at once and ignores the echo of where playback was', () => {
    const { engine, service } = loadedSong();
    engine.fire('position', { tick: startOfBar(6) + 40 });

    service.seekToBar(2);
    engine.fire('position', { tick: startOfBar(6) + 40 });
    expect(service.getSnapshot().barNumber).toBe(2);

    engine.fire('position', { tick: startOfBar(2) });
    expect(service.getSnapshot().barNumber).toBe(2);
    expect(engine.play).not.toHaveBeenCalled();
  });
});

describe('seeking inside a loop', () => {
  it('a wrap back to the loop’s start right after a seek to its last bar is believed', () => {
    const { engine, service } = loopingBars5To8({ options: { countInBars: 0 } });
    engine.fire('position', { tick: startOfBar(6) });

    service.seekToBar(8);
    engine.fire('position', { tick: startOfBar(8) + 20 });
    // The loop wraps well inside the half second.
    engine.fire('position', { tick: startOfBar(5) });

    expect(service.getSnapshot().barNumber).toBe(5);
  });

  it('"Play loop" on a loop already playing: range, then seek to its start, drops the old bar’s echo', () => {
    const { engine, service } = loopingBars5To8({ options: { countInBars: 0 } });
    engine.fire('position', { tick: startOfBar(7) + 100 });
    const restarts = engine.restartCalls();

    // What useLoopPractice does for another loop while this one plays.
    service.setRange({ startBar: 9, endBar: 12 });
    service.setLooping(true);
    service.seekToBar(9);
    engine.fire('position', { tick: startOfBar(7) + 200 });
    expect(service.getSnapshot().barNumber).toBe(9);

    engine.fire('position', { tick: startOfBar(9) });
    engine.fire('position', { tick: startOfBar(10) });
    expect(service.getSnapshot()).toMatchObject({ barNumber: 10, status: 'playing' });
    expect(engine.restartCalls()).toBe(restarts);
  });

  it('with a count-in before every repeat, the rewind at the end of a pass is believed after a seek', () => {
    const { engine, service } = loopingBars5To8({
      options: { countInBars: 1, countInMode: 'every_repeat' },
    });
    engine.fire('position', { tick: startOfBar(5) });
    service.seekToBar(8);
    engine.fire('position', { tick: startOfBar(8) + 10 });

    // alphaTab ends the pass: finished, stopped, and back at the range start.
    engine.fire('finished', undefined);
    engine.fire('stateChanged', { playing: false });
    engine.fire('position', { tick: startOfBar(5) });

    expect(service.getSnapshot()).toMatchObject({ barNumber: 5, status: 'countingIn' });
  });
});
