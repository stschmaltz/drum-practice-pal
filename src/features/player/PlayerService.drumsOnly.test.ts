/**
 * Drums only, beyond the basics in PlayerService.test.ts: the order things
 * happen in around loading, count-ins and counted repeats, songs of other
 * shapes, and long runs of toggles. What is checked is which tracks the
 * engine has been left sounding (FakePlayerEngine.soundingTracks), not which
 * calls got it there.
 */
import {
  BAR_MS,
  engineFinishesPass,
  enginePlays,
  EVERY_REPEAT,
  LOOP_START_TICK,
  loopingBars5To8,
  setupCountIn,
  START_DELAY_MS,
} from '@/test/countInPlayer';
import { FakePlayerEngine, straightBars } from '@/test/fakePlayerEngine';
import { COMMON_TIME, type Meter } from './countIn';
import { DEFAULT_PLAYER_OPTIONS, type PlayerOptions } from './playerOptions';
import { PlayerService } from './PlayerService';
import type { WakeLockControl } from './wakeLock';

const bytes = new Uint8Array([1, 2, 3]);

function setup({
  drumTrackIndex = 2 as number | null,
  options = {} as Partial<PlayerOptions>,
} = {}) {
  const engine = new FakePlayerEngine();
  const wakeLock = { setActive: vi.fn(), dispose: vi.fn() } satisfies WakeLockControl;
  const service = new PlayerService(engine, {
    drumTrackIndex,
    wakeLock,
    unlockAudio: vi.fn(),
    options: { ...DEFAULT_PLAYER_OPTIONS, ...options },
  });
  const listener = vi.fn();
  service.subscribe(listener);
  return { engine, service, listener };
}

/** A loaded song of `trackCount` tracks, playing. */
function playing(config: Parameters<typeof setup>[0] = {}, trackCount = 3) {
  const ctx = setup(config);
  ctx.service.load(bytes);
  ctx.engine.finishLoading({ trackCount });
  ctx.service.play();
  ctx.engine.fire('stateChanged', { playing: true });
  ctx.engine.play.mockClear();
  ctx.engine.loadScore.mockClear();
  return ctx;
}

/** The highest track index the engine was ever sent a mute for. */
function highestTrackSent(engine: FakePlayerEngine): number {
  return Math.max(-1, ...(engine.setTrackMuted.mock.calls as [number, boolean][]).map(([i]) => i));
}

describe('Drums only on songs of other shapes', () => {
  it('leaves the drums alone when they are the first track, as in the multi-track fixture', () => {
    const { engine, service } = playing({ drumTrackIndex: 0 });
    service.setDrumsOnly(true);
    expect(engine.soundingTracks()).toEqual([0]);
    service.setDrumsOnly(false);
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
    expect(engine.restartCalls()).toBe(0);
  });

  it('leaves the drums alone when they sit between other tracks', () => {
    const { engine, service } = playing({ drumTrackIndex: 1 }, 4);
    service.setDrumsOnly(true);
    expect(engine.soundingTracks(4)).toEqual([1]);
    service.setDrumsOnly(false);
    expect(engine.soundingTracks(4)).toEqual([0, 1, 2, 3]);
  });

  it('on a song that is only drums, turns on and off with the drums still sounding', () => {
    const { engine, service } = playing({ drumTrackIndex: 0 }, 1);
    service.setDrumsOnly(true);
    expect(service.getSnapshot().drumsOnly).toBe(true);
    expect(engine.soundingTracks(1)).toEqual([0]);

    service.setDrumsOnly(false);
    expect(service.getSnapshot().drumsOnly).toBe(false);
    expect(engine.soundingTracks(1)).toEqual([0]);
    expect(engine.restartCalls()).toBe(0);
    expect(highestTrackSent(engine)).toBeLessThan(1);
  });

  it('on a drums-only song that opens with the drums muted, unmutes them', () => {
    const { engine, service } = playing({ drumTrackIndex: 0, options: { drumsMuted: true } }, 1);
    expect(engine.soundingTracks(1)).toEqual([]);
    service.setDrumsOnly(true);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: true, drumsMuted: false });
    expect(engine.soundingTracks(1)).toEqual([0]);
  });

  it('never sends the engine a track the song does not have', () => {
    const { engine, service } = playing({ drumTrackIndex: 0 }, 2);
    service.setDrumsOnly(true);
    service.setDrumsOnly(false);
    service.setDrumsOnly(true);
    expect(highestTrackSent(engine)).toBe(1);
  });
});

describe('Drums only around loading', () => {
  const loadedEvent = (trackCount = 3) => ({
    barCount: 16,
    trackCount,
    barTempos: Array<number>(16).fill(120),
    barMeters: Array<Meter>(16).fill(COMMON_TIME),
  });

  it('turned on before load() is called, applies once the song is in', () => {
    const { engine, service } = setup();
    service.setDrumsOnly(true);
    expect(service.getSnapshot().drumsOnly).toBe(true);
    expect(engine.setTrackMuted).not.toHaveBeenCalled();

    service.load(bytes);
    engine.finishLoading();
    expect(service.getSnapshot()).toMatchObject({ status: 'ready', drumsOnly: true });
    expect(engine.soundingTracks()).toEqual([2]);
  });

  it('turned on before load() over a drums-muted default, opens with the drums sounding', () => {
    const { engine, service } = setup({ options: { drumsMuted: true } });
    service.setDrumsOnly(true);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: true, drumsMuted: false });
    service.load(bytes);
    engine.finishLoading();
    expect(engine.soundingTracks()).toEqual([2]);
  });

  it.each([
    ['the score has parsed', 0],
    ['the MIDI is generated', 1],
    ['alphaTab is ready', 2],
  ])('turned on after %s, is what plays once the song is ready', (_, stage) => {
    const { engine, service } = setup();
    service.load(bytes);
    const stages = [
      () => engine.fire('scoreLoaded', loadedEvent()),
      () => engine.fire('ticksReady', { bars: straightBars(16) }),
      () => engine.fire('readyForPlayback', undefined),
    ];
    stages.forEach((fireStage, index) => {
      fireStage();
      if (index === stage) service.setDrumsOnly(true);
    });

    expect(service.getSnapshot()).toMatchObject({ status: 'ready', drumsOnly: true });
    expect(engine.soundingTracks()).toEqual([2]);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('turned on then off again while the song loads, opens with every track sounding', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.fire('scoreLoaded', loadedEvent());
    service.setDrumsOnly(true);
    engine.fire('ticksReady', { bars: straightBars(16) });
    service.setDrumsOnly(false);
    engine.fire('readyForPlayback', undefined);

    expect(service.getSnapshot()).toMatchObject({ status: 'ready', drumsOnly: false });
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
  });

  it('stays on when alphaTab regenerates its MIDI mid-play, without restarting', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    engine.setTrackMuted.mockClear();

    engine.fire('ticksReady', { bars: straightBars(16) });
    engine.fire('readyForPlayback', undefined);

    expect(service.getSnapshot()).toMatchObject({ status: 'playing', drumsOnly: true });
    // Sent again in full, in case the engine dropped them.
    expect(engine.soundingTracks()).toEqual([2]);
    expect(engine.setTrackMuted).toHaveBeenCalledWith(0, true);
    expect(engine.setTrackMuted).toHaveBeenCalledWith(1, true);
    expect(engine.restartCalls()).toBe(0);
  });

  it('turned off while a second load is under way, the other tracks come back', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading();
    service.setDrumsOnly(true);
    expect(engine.soundingTracks()).toEqual([2]);

    service.load(bytes);
    service.setDrumsOnly(false);
    engine.finishLoading();

    expect(service.getSnapshot().drumsOnly).toBe(false);
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
  });

  it('turned on while a second load is under way, applies to the new score', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading();

    service.load(bytes);
    service.setDrumsOnly(true);
    engine.finishLoading();

    expect(engine.soundingTracks()).toEqual([2]);
  });

  it('covers the extra tracks when the next load has more of them', () => {
    const { engine, service } = setup({ drumTrackIndex: 0 });
    service.load(bytes);
    engine.finishLoading({ trackCount: 2 });
    service.setDrumsOnly(true);
    expect(engine.soundingTracks(2)).toEqual([0]);

    service.load(bytes);
    engine.finishLoading({ trackCount: 5 });
    expect(engine.soundingTracks(5)).toEqual([0]);

    service.setDrumsOnly(false);
    expect(engine.soundingTracks(5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('sends nothing past the last track when the next load has fewer of them', () => {
    const { engine, service } = setup({ drumTrackIndex: 0 });
    service.load(bytes);
    engine.finishLoading({ trackCount: 5 });
    service.setDrumsOnly(true);

    service.load(bytes);
    engine.setTrackMuted.mockClear();
    engine.finishLoading({ trackCount: 2 });
    service.setDrumsOnly(false);
    service.setDrumsOnly(true);

    expect(highestTrackSent(engine)).toBe(1);
    expect(engine.soundingTracks(2)).toEqual([0]);
  });

  it('a failed load leaves the toggle as it was and sends the engine nothing', () => {
    const { engine, service } = setup();
    service.setDrumsOnly(true);
    engine.loadScoreResult = false;
    service.load(bytes);
    expect(service.getSnapshot()).toMatchObject({ status: 'error', drumsOnly: true });
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
  });
});

describe('Drums only and the transport', () => {
  it('stays on through pause, play, a seek and back to start, with no mute sent again', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    engine.setTrackMuted.mockClear();

    service.pause();
    engine.fire('stateChanged', { playing: false });
    service.seekToBar(5);
    service.play();
    engine.fire('stateChanged', { playing: true });
    service.stop();
    engine.fire('stateChanged', { playing: false });

    expect(service.getSnapshot()).toMatchObject({ status: 'ready', drumsOnly: true });
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
  });

  it('changes while paused without starting playback', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading();
    engine.loadScore.mockClear();

    service.setDrumsOnly(true);
    expect(engine.soundingTracks()).toEqual([2]);
    service.setDrumsOnly(false);
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
    expect(engine.restartCalls()).toBe(0);
    expect(service.getSnapshot().status).toBe('ready');
  });

  it('leaves speed, metronome, range and looping as they were', () => {
    const { engine, service } = playing();
    service.setRange({ startBar: 5, endBar: 8 });
    service.setLooping(true);
    service.setSpeed(0.5);
    const before = service.getSnapshot();
    for (const call of [
      engine.setSpeed,
      engine.setMetronomeVolume,
      engine.setPlaybackRange,
      engine.setLooping,
      engine.seek,
    ]) {
      call.mockClear();
    }

    service.setDrumsOnly(true);
    service.setDrumsOnly(false);

    expect(service.getSnapshot()).toEqual(before);
    expect(engine.setSpeed).not.toHaveBeenCalled();
    expect(engine.setMetronomeVolume).not.toHaveBeenCalled();
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    expect(engine.setLooping).not.toHaveBeenCalled();
    expect(engine.seek).not.toHaveBeenCalled();
  });

  it('tells subscribers once per change and raises no playback event', () => {
    const { service, listener } = playing();
    const events = vi.fn();
    service.on('barChanged', events);
    service.on('position', events);
    service.on('loopWrapped', events);
    service.on('finished', events);
    listener.mockClear();

    service.setDrumsOnly(true);
    expect(listener).toHaveBeenCalledTimes(1);
    service.setDrumsOnly(false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(events).not.toHaveBeenCalled();
  });

  it('ends where the last of many quick toggles left it, still playing', () => {
    const { engine, service, listener } = playing();
    listener.mockClear();

    for (let press = 1; press <= 51; press++) service.setDrumsOnly(press % 2 === 1);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: true, status: 'playing' });
    expect(engine.soundingTracks()).toEqual([2]);
    expect(listener).toHaveBeenCalledTimes(51);

    service.setDrumsOnly(false);
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
    expect(engine.restartCalls()).toBe(0);
  });

  it('ends consistent when the two drum toggles are pressed in quick alternation', () => {
    const { engine, service } = playing();
    for (let round = 0; round < 10; round++) {
      service.setDrumsOnly(true);
      expect(service.getSnapshot()).toMatchObject({ drumsOnly: true, drumsMuted: false });
      expect(engine.soundingTracks()).toEqual([2]);
      service.setDrumsMuted(true);
      expect(service.getSnapshot()).toMatchObject({ drumsOnly: false, drumsMuted: true });
      expect(engine.soundingTracks()).toEqual([0, 1]);
    }
    expect(engine.restartCalls()).toBe(0);
  });
});

describe('Drums only and per-track mutes', () => {
  it('a track muted before the song loaded is silent, then still muted when Drums only goes off', () => {
    const { engine, service } = setup();
    service.setTrackMuted(1, true);
    service.load(bytes);
    engine.finishLoading();
    expect(engine.soundingTracks()).toEqual([0, 2]);

    service.setDrumsOnly(true);
    expect(engine.soundingTracks()).toEqual([2]);
    service.setDrumsOnly(false);
    expect(engine.soundingTracks()).toEqual([0, 2]);
  });

  it('a track muted after Drums only went off is muted alone', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    service.setDrumsOnly(false);
    service.setTrackMuted(0, true);
    expect(engine.soundingTracks()).toEqual([1, 2]);
    service.setTrackMuted(0, false);
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
  });

  it('muting the drum track by its index turns Drums only off, like Mute drums', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    service.setTrackMuted(2, true);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: false, drumsMuted: true });
    expect(engine.soundingTracks()).toEqual([0, 1]);
  });

  it('unmuting another track while Drums only is on does not let it through', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    service.setTrackMuted(0, false);
    service.setTrackMuted(1, false);
    expect(engine.soundingTracks()).toEqual([2]);
  });

  it('per-track mutes made while Drums only is on survive a reload and show when it goes off', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading();
    service.setDrumsOnly(true);
    service.setTrackMuted(1, true);

    service.load(bytes);
    engine.finishLoading();
    expect(engine.soundingTracks()).toEqual([2]);

    service.setDrumsOnly(false);
    expect(engine.soundingTracks()).toEqual([0, 2]);
  });

  it('Mute drums off, after it replaced Drums only, leaves the whole band sounding', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    service.setDrumsMuted(true);
    service.setDrumsMuted(false);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: false, drumsMuted: false });
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
  });
});

describe('Drums only during a count-in', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('toggled while the count-in clicks, neither cancels it nor starts playback early', () => {
    const { engine, service, clicks } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS / 2);
    const scheduled = clicks.scheduled.length;

    service.setDrumsOnly(true);
    expect(service.getSnapshot()).toMatchObject({ status: 'countingIn', drumsOnly: true });
    expect(service.getSnapshot().countIn).not.toBeNull();
    expect(engine.soundingTracks()).toEqual([0]);
    expect(engine.restartCalls()).toBe(0);
    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(clicks.scheduled).toHaveLength(scheduled);

    service.setDrumsOnly(false);
    service.setDrumsOnly(true);
    vi.advanceTimersByTime(BAR_MS / 2);
    expect(engine.play).toHaveBeenCalledTimes(1);
    enginePlays(engine);
    expect(service.getSnapshot()).toMatchObject({ status: 'playing', drumsOnly: true });
    expect(engine.soundingTracks()).toEqual([0]);
  });

  it('toggled between the downbeat and alphaTab reporting play, playback still starts once', () => {
    const { engine, service } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);

    service.setDrumsOnly(true);
    expect(service.getSnapshot().status).toBe('countingIn');
    enginePlays(engine);

    expect(service.getSnapshot()).toMatchObject({ status: 'playing', drumsOnly: true });
    expect(engine.soundingTracks()).toEqual([0]);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it('Mute drums during the count-in turns Drums only off without cancelling it', () => {
    const { engine, service, clicks } = setupCountIn();
    service.setDrumsOnly(true);
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS);

    service.setDrumsMuted(true);
    expect(service.getSnapshot()).toMatchObject({
      status: 'countingIn',
      drumsOnly: false,
      drumsMuted: true,
    });
    expect(engine.soundingTracks()).toEqual([1, 2]);
    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(0);
  });

  it('does not change how loud the count-in clicks are', () => {
    const { service, clicks } = setupCountIn({ options: { metronomeVolume: 0.6 } });
    service.setDrumsOnly(true);
    service.play();
    expect(clicks.scheduled.length).toBeGreaterThan(0);
    expect(clicks.scheduled.every(({ volume }) => volume === 0.6)).toBe(true);
  });
});

describe('Drums only in a loop with a count-in before every repeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays on across repeats, each of which starts the engine once', () => {
    const { engine, service } = loopingBars5To8(EVERY_REPEAT);
    service.setDrumsOnly(true);

    for (let pass = 1; pass <= 3; pass++) {
      engineFinishesPass(engine, LOOP_START_TICK);
      expect(service.getSnapshot()).toMatchObject({ status: 'countingIn', drumsOnly: true });
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      enginePlays(engine);
      expect(engine.play).toHaveBeenCalledTimes(pass);
      expect(engine.soundingTracks()).toEqual([0]);
    }
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it('toggled during a repeat’s count-in, the loop carries on and the count-in is not restarted', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    engineFinishesPass(engine, LOOP_START_TICK);
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS / 2);
    const scheduled = clicks.scheduled.length;

    service.setDrumsOnly(true);
    expect(service.getSnapshot()).toMatchObject({ status: 'countingIn', drumsOnly: true });
    expect(clicks.scheduled).toHaveLength(scheduled);
    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();

    vi.advanceTimersByTime(BAR_MS / 2);
    expect(engine.play).toHaveBeenCalledTimes(1);
    enginePlays(engine);
    expect(engine.soundingTracks()).toEqual([0]);

    service.setDrumsOnly(false);
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      looping: true,
      range: { startBar: 5, endBar: 8 },
    });
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('toggling mid-pass does not hand looping back to alphaTab', () => {
    const { engine, service } = loopingBars5To8(EVERY_REPEAT);
    engine.setLooping.mockClear();
    service.setDrumsOnly(true);
    service.setDrumsOnly(false);
    expect(engine.setLooping).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(0);
  });
});

describe('Drums only against any order of presses', () => {
  const DRUMS = 1;
  const TRACKS = 4;

  /** A small repeatable generator, so a failure names a seed that fails again. */
  function randomInts(seed: number) {
    let state = seed;
    return (below: number) => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return Math.floor((state / 4294967296) * below);
    };
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'the engine is left with what the toggles say (seed %i)',
    (seed) => {
      const next = randomInts(seed);
      const { engine, service } = setup({ drumTrackIndex: DRUMS });
      // What was asked for: the rules from the handoff note, restated.
      const asked = new Map<number, boolean>();
      let drumsOnly = false;
      let loaded = false;
      const steps: string[] = [];

      for (let step = 0; step < 200; step++) {
        const on = next(2) === 1;
        const choice = next(10);
        if (choice < 3) {
          steps.push(`drumsOnly(${on})`);
          service.setDrumsOnly(on);
          drumsOnly = on;
          if (on) asked.set(DRUMS, false);
        } else if (choice < 5) {
          steps.push(`drumsMuted(${on})`);
          service.setDrumsMuted(on);
          asked.set(DRUMS, on);
          if (on) drumsOnly = false;
        } else if (choice < 8) {
          const trackIndex = next(TRACKS);
          steps.push(`track(${trackIndex}, ${on})`);
          service.setTrackMuted(trackIndex, on);
          asked.set(trackIndex, on);
          if (trackIndex === DRUMS && on) drumsOnly = false;
        } else if (choice < 9) {
          steps.push('load');
          service.load(bytes);
          loaded = false;
        } else {
          steps.push('loaded');
          if (!loaded) engine.finishLoading({ trackCount: TRACKS });
          loaded = true;
        }

        const snapshot = service.getSnapshot();
        const trail = steps.slice(-12).join(', ');
        expect(snapshot.drumsOnly, trail).toBe(drumsOnly);
        expect(snapshot.drumsMuted, trail).toBe(asked.get(DRUMS) ?? false);
        expect(snapshot.drumsOnly && snapshot.drumsMuted, trail).toBe(false);
        if (!loaded) continue;
        const expected = Array.from({ length: TRACKS }, (_, i) => i).filter((i) =>
          drumsOnly ? i === DRUMS : !asked.get(i),
        );
        expect(engine.soundingTracks(TRACKS), trail).toEqual(expected);
      }
      expect(engine.play).not.toHaveBeenCalled();
      expect(engine.pause).not.toHaveBeenCalled();
    },
  );
});
