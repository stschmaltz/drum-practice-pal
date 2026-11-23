/**
 * What Unit 08's loops need from the service on top of range and looping
 * (PlayerService.test.ts): the highlight, drags, and a song whose repeats
 * play some bars twice. Positions around a seek are in
 * PlayerService.seekGuard.test.ts, scrolling in PlayerService.showBar.test.ts.
 */
import {
  barsInPlayOrder,
  FakePlayerEngine,
  startOfBar,
  TICKS_PER_BAR,
} from '@/test/fakePlayerEngine';
import { DEFAULT_PLAYER_OPTIONS } from './playerOptions';
import { isSameBarRange, PlayerService } from './PlayerService';
import type { WakeLockControl } from './wakeLock';

interface SetupOptions {
  /** False leaves the song loading. */
  loaded?: boolean;
  finishLoading?: Parameters<FakePlayerEngine['finishLoading']>[0];
}

function setup({ loaded = true, finishLoading }: SetupOptions = {}) {
  const engine = new FakePlayerEngine();
  const wakeLock = { setActive: vi.fn(), dispose: vi.fn() } satisfies WakeLockControl;
  const service = new PlayerService(engine, {
    drumTrackIndex: 0,
    wakeLock,
    unlockAudio: vi.fn(),
    options: DEFAULT_PLAYER_OPTIONS,
  });
  service.load(new Uint8Array([1]));
  if (loaded) engine.finishLoading(finishLoading);
  engine.loadScore.mockClear();
  return { engine, service };
}

describe('isSameBarRange', () => {
  it.each([
    [null, null, true],
    [{ startBar: 5, endBar: 8 }, { startBar: 5, endBar: 8 }, true],
    [{ startBar: 5, endBar: 8 }, { startBar: 5, endBar: 9 }, false],
    [{ startBar: 4, endBar: 8 }, { startBar: 5, endBar: 8 }, false],
    [{ startBar: 5, endBar: 8 }, null, false],
    [null, { startBar: 5, endBar: 8 }, false],
  ])('%j and %j: %s', (a, b, same) => {
    expect(isSameBarRange(a, b)).toBe(same);
  });
});

describe('highlight', () => {
  it('marks 1-based bars on the engine as 0-based indexes, and shows them in the snapshot', () => {
    const { engine, service } = setup();
    service.setHighlight({ startBar: 5, endBar: 8 });
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 4, endBarIndex: 7 });
    expect(service.getSnapshot().highlight).toEqual({ startBar: 5, endBar: 8 });
  });

  it('clears the mark for null', () => {
    const { engine, service } = setup();
    service.setHighlight({ startBar: 5, endBar: 8 });
    service.setHighlight(null);
    expect(engine.setHighlight).toHaveBeenLastCalledWith(null);
    expect(service.getSnapshot().highlight).toBeNull();
  });

  it('is only a drawing: it never touches the range, the position or playback', () => {
    const { engine, service } = setup();
    service.play();
    engine.fire('stateChanged', { playing: true });
    engine.setPlaybackRange.mockClear();
    const restartsBefore = engine.restartCalls();

    service.setHighlight({ startBar: 2, endBar: 3 });
    service.setHighlight(null);

    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    expect(engine.seek).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toMatchObject({ status: 'playing', range: null });
  });

  it('can differ from the range that is playing', () => {
    const { engine, service } = setup();
    service.setRange({ startBar: 1, endBar: 4 });
    service.setHighlight({ startBar: 9, endBar: 12 });
    expect(service.getSnapshot()).toMatchObject({
      range: { startBar: 1, endBar: 4 },
      highlight: { startBar: 9, endBar: 12 },
    });
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: startOfBar(1),
      endTick: startOfBar(5),
    });
  });

  it('does not redraw or notify for the same bars again', () => {
    const { engine, service } = setup();
    service.setHighlight({ startBar: 5, endBar: 8 });
    engine.setHighlight.mockClear();
    const listener = vi.fn();
    service.subscribe(listener);

    service.setHighlight({ startBar: 5, endBar: 8 });

    expect(engine.setHighlight).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('set while the song loads, is drawn once the score is in', () => {
    const { engine, service } = setup({ loaded: false });
    service.setHighlight({ startBar: 3, endBar: 4 });
    engine.setHighlight.mockClear();

    engine.finishLoading();

    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 2, endBarIndex: 3 });
  });

  it('does nothing after dispose', () => {
    const { engine, service } = setup();
    service.dispose();
    service.setHighlight({ startBar: 1, endBar: 2 });
    expect(engine.setHighlight).not.toHaveBeenCalledWith({ startBarIndex: 0, endBarIndex: 1 });
  });
});

describe('barsDragged', () => {
  it('reports a drag as 1-based bars in ascending order, with whether it has ended', () => {
    const { engine, service } = setup();
    const drags = vi.fn();
    service.on('barsDragged', drags);

    engine.fire('barsDragged', { fromBarIndex: 4, toBarIndex: 5, done: false });
    engine.fire('barsDragged', { fromBarIndex: 4, toBarIndex: 7, done: true });

    expect(drags.mock.calls).toEqual([
      [{ startBar: 5, endBar: 6, done: false }],
      [{ startBar: 5, endBar: 8, done: true }],
    ]);
  });

  it('puts a right-to-left drag the right way round', () => {
    const { engine, service } = setup();
    const drags = vi.fn();
    service.on('barsDragged', drags);
    engine.fire('barsDragged', { fromBarIndex: 7, toBarIndex: 2, done: true });
    expect(drags).toHaveBeenCalledWith({ startBar: 3, endBar: 8, done: true });
  });

  it('does nothing by itself: no seek, no range, no highlight', () => {
    const { engine, service } = setup();
    engine.setHighlight.mockClear();
    engine.setPlaybackRange.mockClear();
    engine.fire('barsDragged', { fromBarIndex: 1, toBarIndex: 3, done: true });
    expect(engine.seek).not.toHaveBeenCalled();
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    expect(engine.setHighlight).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toMatchObject({ range: null, highlight: null, barNumber: 1 });
  });

  it('is not reported while the song is loading, or after dispose', () => {
    const loading = setup({ loaded: false });
    const drags = vi.fn();
    loading.service.on('barsDragged', drags);
    loading.engine.fire('barsDragged', { fromBarIndex: 0, toBarIndex: 1, done: true });

    const disposed = setup();
    disposed.service.on('barsDragged', drags);
    disposed.service.dispose();
    disposed.engine.fire('barsDragged', { fromBarIndex: 0, toBarIndex: 1, done: true });

    expect(drags).not.toHaveBeenCalled();
  });
});

describe('a song with a repeat (bars 3 and 4 play twice)', () => {
  const PLAY_ORDER = [1, 2, 3, 4, 3, 4, 5, 6, 7, 8];
  /** Start tick of the `position`-th bar played, 0-based. */
  const played = (position: number) => position * TICKS_PER_BAR;

  const withRepeat = () =>
    setup({ finishLoading: { barCount: 8, bars: barsInPlayOrder(PLAY_ORDER) } });

  it('shows the bar number on both playthroughs as playback goes through', () => {
    const { engine, service } = withRepeat();
    const numbers = PLAY_ORDER.map((_, position) => {
      engine.fire('position', { tick: played(position) + 10 });
      return service.getSnapshot().barNumber;
    });
    expect(numbers).toEqual(PLAY_ORDER);
  });

  it('seeks a tapped bar to its first playthrough', () => {
    const { engine, service } = withRepeat();
    expect(service.seekToBar(4)).toBe(true);
    expect(engine.seek).toHaveBeenLastCalledWith(played(3));
    expect(service.seekToBar(5)).toBe(true);
    expect(engine.seek).toHaveBeenLastCalledWith(played(6));
  });

  it('after a seek into the repeat, a position in the second playthrough is not mistaken for arrival', () => {
    vi.useFakeTimers();
    try {
      const { engine, service } = withRepeat();
      engine.fire('position', { tick: played(5) + 10 });
      expect(service.getSnapshot().barNumber).toBe(4);

      service.seekToBar(3);
      // Bar 3 again, but the second time round: posted before the seek.
      engine.fire('position', { tick: played(4) + 10 });
      engine.fire('position', { tick: played(5) + 20 });
      expect(service.getSnapshot().barNumber).toBe(3);

      engine.fire('position', { tick: played(2) + 10 });
      engine.fire('position', { tick: played(3) + 10 });
      expect(service.getSnapshot().barNumber).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['inside the repeat', { startBar: 3, endBar: 4 }, played(2), played(4)],
    ['out of the repeat, played as written', { startBar: 3, endBar: 6 }, played(2), played(8)],
    ['across the repeat', { startBar: 2, endBar: 5 }, played(1), played(7)],
    ['after the repeat', { startBar: 6, endBar: 8 }, played(7), played(10)],
  ])('loops a range %s', (_what, range, startTick, endTick) => {
    const { engine, service } = withRepeat();
    service.setRange(range);
    service.setLooping(true);
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({ startTick, endTick });
    expect(service.getSnapshot()).toMatchObject({ range, looping: true });
  });

  it('refuses a range the song lacks', () => {
    const { service } = withRepeat();
    expect(() => service.setRange({ startBar: 7, endBar: 9 })).toThrow(RangeError);
  });

  it('highlights by bar number, whatever the play order', () => {
    const { engine, service } = withRepeat();
    service.setHighlight({ startBar: 3, endBar: 6 });
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 2, endBarIndex: 5 });
  });
});
