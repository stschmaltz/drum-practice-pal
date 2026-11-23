import { FakePlayerEngine, TEMPO_CHANGE_BAR_TEMPOS, TICKS_PER_BAR } from '@/test/fakePlayerEngine';
import { COMMON_TIME, type Meter } from './countIn';
import { DEFAULT_PLAYER_OPTIONS, type PlayerOptions } from './playerOptions';
import { PlayerService, type PlayerServiceConfig } from './PlayerService';
import type { WakeLockControl } from './wakeLock';

const bytes = new Uint8Array([1, 2, 3]);

function setup(
  config: Partial<Omit<PlayerServiceConfig, 'options'>> & { options?: Partial<PlayerOptions> } = {},
) {
  const engine = new FakePlayerEngine();
  const wakeLock = { setActive: vi.fn(), dispose: vi.fn() } satisfies WakeLockControl;
  const unlockAudio = vi.fn();
  const service = new PlayerService(engine, {
    drumTrackIndex: 2,
    wakeLock,
    unlockAudio,
    ...config,
    options: { ...DEFAULT_PLAYER_OPTIONS, ...config.options },
  });
  const listener = vi.fn();
  service.subscribe(listener);
  return { engine, service, wakeLock, unlockAudio, listener };
}

/** A service with a loaded song, playing. */
function playing(config: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(config);
  ctx.service.load(bytes);
  ctx.engine.finishLoading();
  ctx.service.play();
  ctx.engine.fire('stateChanged', { playing: true });
  ctx.engine.play.mockClear();
  ctx.engine.loadScore.mockClear();
  return ctx;
}

describe('PlayerService loading', () => {
  it('starts loading, renders the drum track and fetches the soundfont once', () => {
    const { engine, service } = setup();
    service.load(bytes);
    service.load(bytes);

    expect(service.getSnapshot().status).toBe('loading');
    expect(engine.loadScore).toHaveBeenCalledWith(bytes, [2]);
    expect(engine.loadSoundFont).toHaveBeenCalledTimes(1);
    expect(engine.loadSoundFont).toHaveBeenCalledWith('/soundfont/sonivox.sf2');
  });

  it('renders the first track when the song has no drum track', () => {
    const { engine, service } = setup({ drumTrackIndex: null });
    service.load(bytes);
    expect(engine.loadScore).toHaveBeenCalledWith(bytes, [0]);
    expect(service.getSnapshot().hasDrumTrack).toBe(false);
  });

  it('becomes ready once the engine is ready for playback, with the bar count', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.fire('scoreLoaded', {
      barCount: 16,
      trackCount: 3,
      barTempos: Array<number>(16).fill(120),
      barMeters: Array<Meter>(16).fill(COMMON_TIME),
    });
    expect(service.getSnapshot()).toMatchObject({ status: 'loading', barCount: 16, barNumber: 1 });

    engine.finishLoading();
    expect(service.getSnapshot().status).toBe('ready');
  });

  it('ignores the repeated ready events alphaTab sends', () => {
    const { engine, service } = playing();
    engine.fire('readyForPlayback', undefined);
    expect(service.getSnapshot().status).toBe('playing');
  });

  it('applies the starting options to the engine once it has the song', () => {
    const { engine, service } = setup({
      options: { metronomeOn: true, metronomeVolume: 0.4, drumsMuted: true },
    });
    service.load(bytes);
    engine.finishLoading();

    expect(engine.setSpeed).toHaveBeenLastCalledWith(1);
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0.4);
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(2, true);
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(null);
    expect(service.getSnapshot().drumsMuted).toBe(true);
  });

  it('starts silent when the metronome default is off', () => {
    const { engine, service } = setup({ options: { metronomeOn: false, metronomeVolume: 0.9 } });
    service.load(bytes);
    engine.finishLoading();
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0);
    expect(service.getSnapshot().metronomeVolume).toBe(0.9);
  });

  it('ignores a drums-muted default for a song without drums', () => {
    const { service } = setup({ drumTrackIndex: null, options: { drumsMuted: true } });
    expect(service.getSnapshot().drumsMuted).toBe(false);
  });

  it('reports a refused score', () => {
    const { engine, service } = setup();
    engine.loadScoreResult = false;
    service.load(bytes);
    expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'score' });
  });

  it('reports an engine error while loading', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.fire('error', { error: new Error('Unexpected end of data') });
    expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'score' });
  });

  it('reports a soundfont that cannot be fetched, and stays in error', async () => {
    const { engine, service } = setup();
    engine.soundFont = Promise.reject(new Error('Failed to fetch'));
    service.load(bytes);
    await vi.waitFor(() => expect(service.getSnapshot().error).toBe('soundFont'));

    engine.finishLoading();
    expect(service.getSnapshot().status).toBe('error');
    service.play();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('fetches the soundfont again on the next load after a failure', async () => {
    const { engine, service } = setup();
    engine.soundFont = Promise.reject(new Error('Failed to fetch'));
    service.load(bytes);
    await vi.waitFor(() => expect(service.getSnapshot().error).toBe('soundFont'));

    engine.soundFont = Promise.resolve();
    service.load(bytes);
    engine.finishLoading();

    expect(engine.loadSoundFont).toHaveBeenCalledTimes(2);
    expect(service.getSnapshot().status).toBe('ready');
  });
});

describe('PlayerService transport', () => {
  it('does not play before the song is ready', () => {
    const { engine, service } = setup();
    service.load(bytes);
    service.play();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('unlocks audio and plays synchronously from the tap', () => {
    const { engine, service, unlockAudio } = setup();
    service.load(bytes);
    engine.finishLoading();

    service.play();

    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(unlockAudio.mock.invocationCallOrder[0]).toBeLessThan(
      engine.play.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('follows the engine between playing and ready, holding the wake lock while playing', () => {
    const { engine, service, wakeLock } = playing();
    expect(service.getSnapshot().status).toBe('playing');
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(true);

    service.pause();
    expect(engine.pause).toHaveBeenCalled();
    engine.fire('stateChanged', { playing: false });
    expect(service.getSnapshot().status).toBe('ready');
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
  });

  it('togglePlay plays when ready and pauses when playing', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading();
    service.togglePlay();
    expect(engine.play).toHaveBeenCalledTimes(1);
    engine.fire('stateChanged', { playing: true });
    service.togglePlay();
    expect(engine.pause).toHaveBeenCalledTimes(1);
  });

  it('stops', () => {
    const { engine, service } = playing();
    service.stop();
    expect(engine.stop).toHaveBeenCalledTimes(1);
  });

  it('seeks to the start of a bar', () => {
    const { engine, service } = playing();
    expect(service.seekToBar(5)).toBe(true);
    expect(engine.seek).toHaveBeenCalledWith(4 * TICKS_PER_BAR);
  });

  it('shows the sought bar at once, playing or paused, without restarting', () => {
    const { engine, service } = playing();
    const bars = vi.fn();
    service.on('barChanged', bars);

    service.seekToBar(9);
    expect(service.getSnapshot()).toMatchObject({ status: 'playing', barNumber: 9 });
    expect(bars).toHaveBeenCalledWith({ barNumber: 9 });

    service.pause();
    engine.fire('stateChanged', { playing: false });
    service.seekToBar(3);
    expect(service.getSnapshot()).toMatchObject({ status: 'ready', barNumber: 3 });
    // The position echo for the same bar changes nothing.
    engine.fire('position', { tick: 2 * TICKS_PER_BAR });
    expect(bars).toHaveBeenCalledTimes(2);
    expect(engine.play).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it('refuses to seek to a bar the song does not have', () => {
    const { engine, service } = playing();
    expect(service.seekToBar(17)).toBe(false);
    expect(service.seekToBar(0)).toBe(false);
    expect(engine.seek).not.toHaveBeenCalled();
  });
});

describe('PlayerService live changes', () => {
  it('changes speed, metronome and drum mute while playing without restarting', () => {
    const { engine, service } = playing();

    service.setSpeed(0.5);
    service.setMetronomeOn(false);
    service.setMetronomeOn(true);
    service.setMetronomeVolume(0.3);
    service.setDrumsMuted(true);
    service.setDrumsMuted(false);

    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.5);
    expect(engine.setMetronomeVolume.mock.calls.slice(-3)).toEqual([[0], [0.8], [0.3]]);
    expect(engine.setTrackMuted.mock.calls.slice(-2)).toEqual([
      [2, true],
      [2, false],
    ]);
    expect(engine.restartCalls()).toBe(0);
    expect(service.getSnapshot()).toMatchObject({
      status: 'playing',
      speedRatio: 0.5,
      metronomeOn: true,
      metronomeVolume: 0.3,
      drumsMuted: false,
    });
  });

  it('clamps speed and volume', () => {
    const { engine, service } = playing();
    service.setSpeed(5);
    expect(engine.setSpeed).toHaveBeenLastCalledWith(2);
    service.setSpeed(0);
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.25);
    service.setMetronomeVolume(-1);
    expect(service.getSnapshot().metronomeVolume).toBe(0);
  });

  it('keeps the volume while the metronome is off', () => {
    const { engine, service } = playing();
    service.setMetronomeOn(false);
    service.setMetronomeVolume(0.5);
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0);
    service.setMetronomeOn(true);
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0.5);
  });

  it('mutes any track, and only tracks the song has', () => {
    const { engine, service } = playing();
    service.setTrackMuted(0, true);
    service.setTrackMuted(9, true);
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(0, true);
    expect(engine.setTrackMuted).not.toHaveBeenCalledWith(9, true);
    expect(service.getSnapshot().drumsMuted).toBe(false);
  });

  it('remembers changes made before the song loaded', () => {
    const { engine, service } = setup();
    service.load(bytes);
    service.setSpeed(0.75);
    service.setDrumsMuted(true);
    engine.setTrackMuted.mockClear();

    engine.finishLoading();

    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.75);
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(2, true);
  });

  it('does nothing for drums mute on a song without drums', () => {
    const { engine, service } = playing({ drumTrackIndex: null });
    service.setDrumsMuted(true);
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
    expect(service.getSnapshot().drumsMuted).toBe(false);
  });

  it('switches layout without restarting', () => {
    const { engine, service } = playing();
    service.setLayout('horizontal');
    expect(engine.setLayout).toHaveBeenCalledWith('horizontal');
    expect(engine.restartCalls()).toBe(0);
  });

  it('only notifies subscribers when something changed', () => {
    const { service, listener } = playing();
    listener.mockClear();
    service.setSpeed(1);
    expect(listener).not.toHaveBeenCalled();
    service.setSpeed(1.1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerService range and looping', () => {
  it('sets the tick range for 1-based bars, inclusive', () => {
    const { engine, service } = playing();
    service.setRange({ startBar: 5, endBar: 8 });
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: 4 * TICKS_PER_BAR,
      endTick: 8 * TICKS_PER_BAR,
    });
    expect(service.getSnapshot().range).toEqual({ startBar: 5, endBar: 8 });

    service.setRange(null);
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(null);
    expect(engine.restartCalls()).toBe(0);
  });

  it('throws for a range the song does not have', () => {
    const { service } = playing();
    expect(() => service.setRange({ startBar: 8, endBar: 5 })).toThrow(RangeError);
    expect(() => service.setRange({ startBar: 15, endBar: 17 })).toThrow(RangeError);
    expect(service.getSnapshot().range).toBeNull();
  });

  it('applies a range set before loading once bars are known', () => {
    const { engine, service } = setup();
    service.setRange({ startBar: 2, endBar: 3 });
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    service.load(bytes);
    engine.finishLoading();
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: TICKS_PER_BAR,
      endTick: 3 * TICKS_PER_BAR,
    });
  });

  it('drops a pre-load range the song turns out not to have', () => {
    const { engine, service } = setup();
    service.setRange({ startBar: 10, endBar: 20 });
    service.load(bytes);
    engine.finishLoading({ barCount: 8 });
    expect(service.getSnapshot().range).toBeNull();
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(null);
  });

  it('turns looping on and off', () => {
    const { engine, service } = playing();
    service.setLooping(true);
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    expect(service.getSnapshot().looping).toBe(true);
    service.setLooping(false);
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
  });
});

describe('PlayerService events', () => {
  it('reports position, and the bar only when it changes', () => {
    const { engine, service } = playing();
    const positions = vi.fn();
    const bars = vi.fn();
    service.on('position', positions);
    service.on('barChanged', bars);

    engine.fire('position', { tick: 10 });
    engine.fire('position', { tick: TICKS_PER_BAR + 10 });
    engine.fire('position', { tick: TICKS_PER_BAR + 20 });

    expect(positions).toHaveBeenCalledTimes(3);
    expect(positions).toHaveBeenLastCalledWith({ tick: TICKS_PER_BAR + 20, barNumber: 2 });
    expect(bars.mock.calls).toEqual([[{ barNumber: 2 }]]);
    expect(service.getSnapshot().barNumber).toBe(2);
  });

  it('reports a loop wrap while looping and finished otherwise', () => {
    const { engine, service } = playing();
    const wrapped = vi.fn();
    const finished = vi.fn();
    service.on('loopWrapped', wrapped);
    service.on('finished', finished);

    engine.fire('finished', undefined);
    service.setLooping(true);
    engine.fire('finished', undefined);
    engine.fire('finished', undefined);

    expect(finished).toHaveBeenCalledTimes(1);
    expect(wrapped).toHaveBeenCalledTimes(2);
  });

  it('stops delivering to a handler after it unsubscribes', () => {
    const { engine, service } = playing();
    const handler = vi.fn();
    const off = service.on('position', handler);
    off();
    engine.fire('position', { tick: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops playback and the wake lock on an engine error while playing', () => {
    const { engine, service, wakeLock } = playing();
    engine.fire('error', { error: new Error('render failed') });
    expect(service.getSnapshot().status).toBe('error');
    expect(engine.stop).toHaveBeenCalled();
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
  });
});

describe('PlayerService tempo per bar', () => {
  function loaded() {
    const ctx = setup();
    ctx.service.load(bytes);
    ctx.engine.finishLoading({ barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    return ctx;
  }

  it('has no tempo until the score loads', () => {
    const { service } = setup();
    service.load(bytes);
    expect(service.getSnapshot().barTempo).toBeNull();
    expect(service.tempoAtBar(1)).toBeNull();
  });

  it('follows the bar playing through a tempo change', () => {
    const { engine, service } = loaded();
    expect(service.getSnapshot().barTempo).toBe(120);

    engine.fire('position', { tick: 7 * TICKS_PER_BAR + 5 });
    expect(service.getSnapshot()).toMatchObject({ barNumber: 8, barTempo: 120 });
    engine.fire('position', { tick: 8 * TICKS_PER_BAR + 5 });
    expect(service.getSnapshot()).toMatchObject({ barNumber: 9, barTempo: 90 });
  });

  it('follows a seek, and leaves speed out of it', () => {
    const { service } = loaded();
    service.setSpeed(0.5);
    service.seekToBar(12);
    expect(service.getSnapshot()).toMatchObject({ barNumber: 12, barTempo: 90, speedRatio: 0.5 });
    service.seekToBar(2);
    expect(service.getSnapshot().barTempo).toBe(120);
  });

  it('answers the tempo of any bar, null for bars the song lacks', () => {
    const { service } = loaded();
    expect(service.tempoAtBar(8)).toBe(120);
    expect(service.tempoAtBar(9)).toBe(90);
    expect(service.tempoAtBar(17)).toBeNull();
  });

  it("forgets the old song's tempos on a new load", () => {
    const { engine, service } = loaded();
    service.load(bytes);
    expect(service.getSnapshot().barTempo).toBeNull();
    engine.finishLoading({ barCount: 4, barTempos: [60, 60, 60, 60] });
    expect(service.getSnapshot().barTempo).toBe(60);
    expect(service.tempoAtBar(9)).toBeNull();
  });
});

describe('PlayerService bar taps', () => {
  it('reports a tapped bar as a 1-based bar number and does not seek by itself', () => {
    const { engine, service } = playing();
    const tapped = vi.fn();
    service.on('barTapped', tapped);

    engine.fire('barTapped', { barIndex: 4 });

    expect(tapped).toHaveBeenCalledWith({ barNumber: 5 });
    expect(engine.seek).not.toHaveBeenCalled();
    expect(service.getSnapshot().barNumber).toBe(1);
  });

  it('ignores taps before the song is ready, after an error and after dispose', () => {
    const { engine, service } = setup();
    const tapped = vi.fn();
    service.on('barTapped', tapped);
    service.load(bytes);
    engine.fire('barTapped', { barIndex: 0 });

    engine.finishLoading();
    engine.fire('error', { error: new Error('render failed') });
    engine.fire('barTapped', { barIndex: 0 });

    service.dispose();
    engine.fire('barTapped', { barIndex: 0 });
    expect(tapped).not.toHaveBeenCalled();
  });
});

describe('PlayerService dispose', () => {
  it('destroys the engine and releases the wake lock, once', () => {
    const { engine, service, wakeLock } = playing();
    service.dispose();
    service.dispose();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(wakeLock.dispose).toHaveBeenCalledTimes(1);
  });

  it('ignores engine events and calls after dispose', () => {
    const { engine, service, listener } = playing();
    const positions = vi.fn();
    service.on('position', positions);
    service.dispose();
    listener.mockClear();

    engine.fire('position', { tick: 5 * TICKS_PER_BAR });
    engine.fire('stateChanged', { playing: false });
    service.play();
    service.setSpeed(0.5);
    service.load(bytes);

    expect(positions).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(0);
    expect(engine.setSpeed).not.toHaveBeenCalledWith(0.5);
  });
});

describe('PlayerService drums only', () => {
  /** The mute the engine was last sent for each of the song's three tracks (drums are track 2). */
  function engineMutes(engine: FakePlayerEngine): (boolean | undefined)[] {
    const mutes: (boolean | undefined)[] = [undefined, undefined, undefined];
    for (const [trackIndex, muted] of engine.setTrackMuted.mock.calls as [number, boolean][]) {
      mutes[trackIndex] = muted;
    }
    return mutes;
  }

  it('is off when a song opens, whatever the settings say', () => {
    const { engine, service } = setup({ options: { drumsMuted: true } });
    expect(service.getSnapshot().drumsOnly).toBe(false);
    service.load(bytes);
    engine.finishLoading();
    expect(service.getSnapshot().drumsOnly).toBe(false);
    expect(engineMutes(engine)).toEqual([undefined, undefined, true]);
  });

  it('silences every track but the drums while playing, and restores them, without restarting', () => {
    const { engine, service } = playing();

    service.setDrumsOnly(true);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: true, drumsMuted: false });
    expect(engineMutes(engine)).toEqual([true, true, false]);

    service.setDrumsOnly(false);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: false, drumsMuted: false });
    expect(engineMutes(engine)).toEqual([false, false, false]);

    expect(engine.restartCalls()).toBe(0);
    expect(service.getSnapshot().status).toBe('playing');
  });

  it('turning it on turns Mute drums off', () => {
    const { engine, service } = playing({ options: { drumsMuted: true } });
    service.setDrumsOnly(true);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: true, drumsMuted: false });
    expect(engineMutes(engine)).toEqual([true, true, false]);

    // Mute drums was replaced, not parked: off again leaves the whole band sounding.
    service.setDrumsOnly(false);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: false, drumsMuted: false });
    expect(engineMutes(engine)).toEqual([false, false, false]);
  });

  it('turning Mute drums on turns it off and brings the other tracks back', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    service.setDrumsMuted(true);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: false, drumsMuted: true });
    expect(engineMutes(engine)).toEqual([false, false, true]);
    expect(engine.restartCalls()).toBe(0);
  });

  it('turning Mute drums off while it is on changes nothing', () => {
    const { engine, service } = playing();
    service.setDrumsOnly(true);
    service.setDrumsMuted(false);
    expect(service.getSnapshot()).toMatchObject({ drumsOnly: true, drumsMuted: false });
    expect(engineMutes(engine)).toEqual([true, true, false]);
  });

  it('keeps a track muted on its own muted after it goes off again', () => {
    const { engine, service } = playing();
    service.setTrackMuted(0, true);
    service.setDrumsOnly(true);
    expect(engineMutes(engine)).toEqual([true, true, false]);

    service.setDrumsOnly(false);
    expect(engineMutes(engine)).toEqual([true, false, false]);
  });

  it('remembers a track mute changed while it is on, and applies it when it goes off', () => {
    const { engine, service } = playing();
    service.setTrackMuted(0, true);
    service.setDrumsOnly(true);

    service.setTrackMuted(0, false);
    service.setTrackMuted(1, true);
    // Still drums only: neither change is heard yet.
    expect(engineMutes(engine)).toEqual([true, true, false]);

    service.setDrumsOnly(false);
    expect(engineMutes(engine)).toEqual([false, true, false]);
  });

  it('is sent again in full after a reload', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading();
    service.setDrumsOnly(true);
    engine.setTrackMuted.mockClear();

    // alphaTab keeps its channel mutes across a reload; the service sends them anyway.
    service.load(bytes);
    engine.finishLoading();

    expect(service.getSnapshot().drumsOnly).toBe(true);
    expect(engineMutes(engine)).toEqual([true, true, false]);
  });

  it('set before the song has loaded, applies once the tracks exist', () => {
    const { engine, service } = setup();
    service.load(bytes);
    service.setDrumsOnly(true);
    expect(engine.setTrackMuted).not.toHaveBeenCalled();

    engine.finishLoading();
    expect(engineMutes(engine)).toEqual([true, true, false]);
  });

  it('sends nothing and notifies nobody when it is already as asked', () => {
    const { engine, service, listener } = playing();
    engine.setTrackMuted.mockClear();
    listener.mockClear();
    service.setDrumsOnly(false);
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();

    service.setDrumsOnly(true);
    engine.setTrackMuted.mockClear();
    listener.mockClear();
    service.setDrumsOnly(true);
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does nothing for a song without drums', () => {
    const { engine, service } = playing({ drumTrackIndex: null });
    service.setDrumsOnly(true);
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
    expect(service.getSnapshot().drumsOnly).toBe(false);
  });

  it('does nothing after dispose', () => {
    const { engine, service } = playing();
    service.dispose();
    engine.setTrackMuted.mockClear();
    service.setDrumsOnly(true);
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
    expect(service.getSnapshot().drumsOnly).toBe(false);
  });
});
