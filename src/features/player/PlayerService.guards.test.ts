/**
 * Engine events and transport calls that arrive at the wrong moment. alphaTab
 * reports state and position on its own schedule (docs/units/01-spike.md,
 * Repeated events), so the service ignores the ones that don't apply to where
 * it is.
 */
import { FakePlayerEngine, TICKS_PER_BAR } from '@/test/fakePlayerEngine';
import { DEFAULT_PLAYER_OPTIONS } from './playerOptions';
import { PlayerService } from './PlayerService';
import type { WakeLockControl } from './wakeLock';

const bytes = new Uint8Array([1, 2, 3]);

function setup() {
  const engine = new FakePlayerEngine();
  const wakeLock = { setActive: vi.fn(), dispose: vi.fn() } satisfies WakeLockControl;
  const service = new PlayerService(engine, {
    drumTrackIndex: 0,
    wakeLock,
    unlockAudio: vi.fn(),
    options: DEFAULT_PLAYER_OPTIONS,
  });
  return { engine, service, wakeLock };
}

describe('PlayerService out-of-turn engine events', () => {
  it('stays loading when the engine reports "stopped" before the song is ready', () => {
    const { engine, service, wakeLock } = setup();
    service.load(bytes);
    engine.fire('scoreLoaded', { barCount: 16, trackCount: 3, barTempos: Array(16).fill(120) });
    wakeLock.setActive.mockClear();

    // alphaTab reports its idle state while the soundfont is still on its way.
    engine.fire('stateChanged', { playing: false });

    expect(service.getSnapshot().status).toBe('loading');
    expect(wakeLock.setActive).not.toHaveBeenCalled();
    service.play();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('stays in error whatever the engine reports afterwards', () => {
    const { engine, service, wakeLock } = setup();
    engine.loadScoreResult = false;
    service.load(bytes);
    expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'score' });
    wakeLock.setActive.mockClear();

    engine.fire('readyForPlayback', undefined);
    engine.fire('stateChanged', { playing: true });
    engine.fire('stateChanged', { playing: false });

    expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'score' });
    expect(wakeLock.setActive).not.toHaveBeenCalled();
  });

  it('keeps the first error when a second failure follows', async () => {
    const { engine, service } = setup();
    engine.soundFont = Promise.reject(new Error('offline'));
    engine.loadScoreResult = false;
    service.load(bytes);
    await engine.soundFont.catch(() => {});

    // The refused score was reported first; the soundfont failure doesn't replace it.
    expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'score' });
  });

  it('keeps the current bar for a position past the last bar', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading({ barCount: 4 });
    const barChanged = vi.fn();
    service.on('barChanged', barChanged);

    engine.fire('position', { tick: 3 * TICKS_PER_BAR });
    // The end of the song is the last bar's end tick, which belongs to no bar.
    engine.fire('position', { tick: 4 * TICKS_PER_BAR });

    expect(service.getSnapshot().barNumber).toBe(4);
    expect(barChanged).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerService transport calls that do not apply', () => {
  it('does not pause a song that is not playing', () => {
    const { engine, service } = setup();
    service.load(bytes);
    engine.finishLoading();
    service.pause();
    expect(engine.pause).not.toHaveBeenCalled();
  });

  it('does not stop before a song has loaded', () => {
    const { engine, service } = setup();
    service.stop();
    service.load(bytes);
    service.stop();
    expect(engine.stop).not.toHaveBeenCalled();
  });
});
