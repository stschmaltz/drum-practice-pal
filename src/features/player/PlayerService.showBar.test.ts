/**
 * The bar about to be played is brought on screen when alphaTab won't do it
 * (it only follows the cursor while playing): when a screen asks with
 * showBar, and at the start of every count-in. 08 QA issues 1 and 2.
 */
import {
  engineFinishesPass,
  enginePlays,
  EVERY_REPEAT,
  LOOP_START_TICK,
  loopingBars5To8,
  setupCountIn,
} from '@/test/countInPlayer';
import { TICKS_PER_BAR } from '@/test/fakePlayerEngine';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const COUNT_IN_OFF = { options: { countInBars: 0 } } as const;

describe('showBar', () => {
  it('scrolls to the bar, as a 0-based index', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.showBar(13);
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
  });

  it.each([0, 17, -3])('does nothing for bar %i, which the song lacks', (barNumber) => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.showBar(barNumber);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('does nothing before the score has loaded, or after dispose', () => {
    const loading = setupCountIn({ ...COUNT_IN_OFF, loaded: false });
    loading.service.showBar(3);
    expect(loading.engine.scrollToBar).not.toHaveBeenCalled();

    const disposed = setupCountIn(COUNT_IN_OFF);
    disposed.service.dispose();
    disposed.service.showBar(3);
    expect(disposed.engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('only scrolls: nothing seeks, starts, stops or reloads, and the current bar stays', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    const restartsBefore = engine.restartCalls();
    service.showBar(13);
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(engine.seek).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toMatchObject({ status: 'ready', barNumber: 1 });
  });

  it('leaves the scrolling to alphaTab while playing, which follows its cursor', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.play();
    enginePlays(engine);
    service.showBar(13);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('scrolls during a count-in, when the engine is not playing yet', () => {
    const { engine, service } = setupCountIn();
    service.play();
    engine.scrollToBar.mockClear();
    service.showBar(13);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
  });
});

describe('seekToBar', () => {
  it('does not scroll: a bar tapped on the score must not move under the finger', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.seekToBar(13);
    expect(engine.seek).toHaveBeenLastCalledWith(12 * TICKS_PER_BAR);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });
});

describe('a count-in', () => {
  it('has the loop’s first bar on screen from its start, before engine.play()', () => {
    const { engine, service } = setupCountIn();
    service.setRange({ startBar: 13, endBar: 14 });
    service.setLooping(true);
    service.seekToBar(13);

    service.play();

    expect(service.getSnapshot().status).toBe('countingIn');
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('scrolls back to the bar under the cursor when Play is pressed from the start', () => {
    const { engine, service } = setupCountIn();
    service.play();
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(0);
  });

  it('scrolls to the bar a mid-bar position is moved back to', () => {
    const { engine, service } = setupCountIn();
    engine.fire('position', { tick: 6 * TICKS_PER_BAR + 100 });
    service.play();
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(6);
  });

  it('restarted by a seek scrolls to the new bar', () => {
    const { engine, service } = setupCountIn();
    service.play();
    service.seekToBar(9);
    expect(service.getSnapshot().status).toBe('countingIn');
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(8);
  });

  it('does not scroll when there is nothing to count', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.play();
    expect(engine.scrollToBar).not.toHaveBeenCalled();
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('before a repeat scrolls back to the loop’s first bar', () => {
    const { engine } = loopingBars5To8(EVERY_REPEAT);
    engine.scrollToBar.mockClear();

    engineFinishesPass(engine, LOOP_START_TICK);

    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(4);
  });
});
