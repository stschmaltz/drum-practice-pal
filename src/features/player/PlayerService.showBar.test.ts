/**
 * The bar about to be played is brought on screen when alphaTab won't do it
 * (it only follows the cursor while playing): when a screen asks with
 * showBar, and at the start of every count-in (08 QA issues 1 and 2).
 * Scrolling is never anything more than scrolling, it is left to alphaTab
 * while playing, and the scroll at each count-in leaves the Unit 07 count-in
 * as it was.
 */
import {
  BAR_MS,
  clickOffsets,
  engineFinishesPass,
  enginePlays,
  EVERY_REPEAT,
  LOOP_START_TICK,
  loopingBars5To8,
  setupCountIn,
  START_DELAY_MS,
  START_ONLY,
  type CountInContext,
} from '@/test/countInPlayer';
import { barsInPlayOrder, TICKS_PER_BAR } from '@/test/fakePlayerEngine';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const COUNT_IN_OFF = { options: { countInBars: 0 } } as const;

/** Where playback is, the range, the speed: what a scroll must leave alone. */
function playbackOf({ service }: CountInContext) {
  const { status, barNumber, range, looping, speedRatio, countIn, highlight } =
    service.getSnapshot();
  return { status, barNumber, range, looping, speedRatio, countIn, highlight };
}

/** Plays, then pauses, as alphaTab reports both. */
function playThenPause({ engine, service }: CountInContext): void {
  service.play();
  enginePlays(engine);
  service.pause();
  engine.fire('stateChanged', { playing: false });
}

const STATES: Record<string, () => CountInContext> = {
  ready: () => setupCountIn(COUNT_IN_OFF),
  'counting in': () => {
    const ctx = setupCountIn();
    ctx.service.play();
    return ctx;
  },
  'paused after playing': () => {
    const ctx = setupCountIn(COUNT_IN_OFF);
    playThenPause(ctx);
    return ctx;
  },
  'paused in a loop': () => {
    const ctx = setupCountIn(COUNT_IN_OFF);
    ctx.service.setRange({ startBar: 5, endBar: 8 });
    ctx.service.setLooping(true);
    playThenPause(ctx);
    return ctx;
  },
};

describe('showBar while not playing', () => {
  it.each(Object.keys(STATES))(
    '%s: scrolls, and never plays, pauses, stops, seeks or reloads',
    (state) => {
      const ctx = STATES[state]!();
      const { engine, service } = ctx;
      engine.scrollToBar.mockClear();
      engine.seek.mockClear();
      engine.setPlaybackRange.mockClear();
      const restarts = engine.restartCalls();
      const before = playbackOf(ctx);
      const events = vi.fn();
      service.on('barChanged', events);
      service.on('loopWrapped', events);
      service.on('finished', events);
      service.on('position', events);

      service.showBar(13);

      expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
      expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
      expect(engine.restartCalls()).toBe(restarts);
      expect(engine.seek).not.toHaveBeenCalled();
      expect(engine.setPlaybackRange).not.toHaveBeenCalled();
      expect(playbackOf(ctx)).toEqual(before);
      expect(events).not.toHaveBeenCalled();
    },
  );

  it.each([1, 16])('the song’s first and last bars exist: bar %i scrolls', (barNumber) => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.showBar(barNumber);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(barNumber - 1);
  });

  it('a bar that plays twice in a repeat is scrolled to once, by its number', () => {
    const { engine, service } = setupCountIn({ ...COUNT_IN_OFF, loaded: false });
    engine.finishLoading({ barCount: 8, bars: barsInPlayOrder([1, 2, 3, 4, 3, 4, 5, 6, 7, 8]) });
    service.showBar(4);
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(3);
    // Ten bars are played, but the song has eight.
    service.showBar(9);
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
  });

  describe('asked while the song is still loading (a loop opened by ?loop=, bug hunt P2)', () => {
    it('scrolls to the bar once the song is ready, once', () => {
      const { engine, service } = setupCountIn({ ...COUNT_IN_OFF, loaded: false });
      service.setRange({ startBar: 13, endBar: 14 });
      service.showBar(13);
      expect(engine.scrollToBar).not.toHaveBeenCalled();

      engine.finishLoading();

      expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
      expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
      engine.fire('readyForPlayback', undefined);
      expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    });

    it('the last bar asked for wins', () => {
      const { engine, service } = setupCountIn({ ...COUNT_IN_OFF, loaded: false });
      service.showBar(3);
      service.showBar(9);
      engine.finishLoading();
      expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
      expect(engine.scrollToBar).toHaveBeenLastCalledWith(8);
    });

    it('a range set afterwards (the loop left) drops it', () => {
      const { engine, service } = setupCountIn({ ...COUNT_IN_OFF, loaded: false });
      service.showBar(13);
      service.setRange(null);
      engine.finishLoading();
      expect(engine.scrollToBar).not.toHaveBeenCalled();
    });

    it('a bar the song lacks scrolls nowhere when it is ready', () => {
      const { engine, service } = setupCountIn({ ...COUNT_IN_OFF, loaded: false });
      service.showBar(40);
      engine.finishLoading();
      expect(engine.scrollToBar).not.toHaveBeenCalled();
    });
  });
});

describe('showBar as a no-op', () => {
  it('while playing: no scroll, and playback is not interrupted', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.play();
    enginePlays(engine);
    const restarts = engine.restartCalls();

    for (const bar of [1, 5, 13, 16]) service.showBar(bar);

    expect(engine.scrollToBar).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(restarts);
    expect(engine.seek).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toMatchObject({ status: 'playing', barNumber: 1 });
  });

  it('while playing in a loop, for the loop’s own first bar: still left to alphaTab', () => {
    const { engine, service } = loopingBars5To8(START_ONLY);
    engine.scrollToBar.mockClear();
    const restarts = engine.restartCalls();
    service.showBar(5);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(restarts);
  });

  it('before load: nothing reaches the engine at all', () => {
    const { engine, service } = setupCountIn({ ...COUNT_IN_OFF, loaded: false });
    const restarts = engine.restartCalls();
    for (const bar of [1, 3, 16]) service.showBar(bar);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(restarts);
    expect(engine.seek).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('loading');
  });

  it('while a second file loads: no scroll over the old score', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.load(new Uint8Array([2]));
    service.showBar(3);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('after dispose: no scroll', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.dispose();
    service.showBar(3);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('after the player has failed: no scroll', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    engine.fire('error', { error: new Error('boom') });
    expect(service.getSnapshot().status).toBe('error');
    service.showBar(3);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it.each([0, -1, 17, 100, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'a bar the song lacks (%s): no scroll and no restart, in a 16-bar song',
    (barNumber) => {
      const { engine, service } = setupCountIn(COUNT_IN_OFF);
      const restarts = engine.restartCalls();
      service.showBar(barNumber);
      expect(engine.scrollToBar).not.toHaveBeenCalled();
      expect(engine.restartCalls()).toBe(restarts);
      expect(engine.seek).not.toHaveBeenCalled();
      expect(service.getSnapshot()).toMatchObject({ status: 'ready', barNumber: 1 });
    },
  );
});

describe('what does not scroll', () => {
  it('seekToBar, paused or playing, however far the bar', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    for (const bar of [2, 16, 1]) service.seekToBar(bar);
    service.play();
    enginePlays(engine);
    for (const bar of [9, 3]) service.seekToBar(bar);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('setRange, setLooping, setHighlight and setSpeed by themselves', () => {
    const { engine, service } = setupCountIn(COUNT_IN_OFF);
    service.setRange({ startBar: 13, endBar: 14 });
    service.setLooping(true);
    service.setHighlight({ startBar: 13, endBar: 14 });
    service.setSpeed(0.5);
    service.setRange(null);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('Play with the count-in off, Pause, and Back to start', () => {
    const ctx = setupCountIn(COUNT_IN_OFF);
    ctx.service.seekToBar(9);
    playThenPause(ctx);
    ctx.service.stop();
    expect(ctx.engine.scrollToBar).not.toHaveBeenCalled();
  });
});

describe('a count-in scrolls to the bar it counts into', () => {
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
});

describe('the scroll at each count-in leaves the count-in as it was', () => {
  it('at the start: the same clicks, and the engine plays on the downbeat, once', () => {
    const { engine, service, clicks } = setupCountIn();
    service.setRange({ startBar: 13, endBar: 14 });
    service.setLooping(true);
    service.seekToBar(13);
    service.showBar(13);

    service.play();

    expect(clickOffsets(clicks)).toEqual([0, 0.5, 1, 1.5]);
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS - 100);
    expect(engine.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
    enginePlays(engine);
    expect(service.getSnapshot()).toMatchObject({ status: 'playing', barNumber: 13 });
  });

  it('the scroll comes when the count-in starts, not on the downbeat', () => {
    const { engine, service } = setupCountIn({ options: { countInBars: 2 } });
    service.seekToBar(13);
    service.play();
    // Before the first click has sounded.
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);

    vi.advanceTimersByTime(START_DELAY_MS + 2 * BAR_MS);
    enginePlays(engine);
    // And only then: nothing more on the beats or the downbeat, where alphaTab takes over.
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
  });

  it('before every repeat: each pass scrolls once to the loop’s first bar, counts a full bar, then plays', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    engine.scrollToBar.mockClear();
    engine.seek.mockClear();
    const wrapped = vi.fn();
    service.on('loopWrapped', wrapped);

    for (let pass = 1; pass <= 3; pass++) {
      // The pass ends on bar 8, lines below (or bars to the right of) bar 5.
      engine.fire('position', { tick: 7 * TICKS_PER_BAR + 3000 });
      clicks.scheduled = [];
      engineFinishesPass(engine, LOOP_START_TICK);

      expect(service.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 5 });
      expect(engine.scrollToBar).toHaveBeenCalledTimes(pass);
      expect(engine.scrollToBar).toHaveBeenLastCalledWith(4);
      expect(clickOffsets(clicks)).toEqual([0, 0.5, 1, 1.5]);

      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS - 100);
      expect(engine.play).toHaveBeenCalledTimes(pass - 1);
      vi.advanceTimersByTime(100);
      expect(engine.play).toHaveBeenCalledTimes(pass);
      enginePlays(engine);
      expect(service.getSnapshot().status).toBe('playing');
    }

    expect(wrapped).toHaveBeenCalledTimes(3);
    // The service never stops, pauses or seeks the engine for a repeat: alphaTab rewinds itself.
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(engine.seek).not.toHaveBeenCalled();
  });

  it('before every repeat of the whole song: scrolls back to bar 1', () => {
    const ctx = setupCountIn(EVERY_REPEAT);
    ctx.service.setLooping(true);
    ctx.service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    enginePlays(ctx.engine);
    ctx.engine.scrollToBar.mockClear();

    engineFinishesPass(ctx.engine);

    expect(ctx.engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(ctx.engine.scrollToBar).toHaveBeenLastCalledWith(0);
  });

  it('count-in at the start only: a wrap scrolls nothing, alphaTab loops by itself', () => {
    const { engine, service } = loopingBars5To8(START_ONLY);
    engine.scrollToBar.mockClear();
    engine.fire('finished', undefined);
    engine.fire('position', { tick: LOOP_START_TICK });
    expect(service.getSnapshot().status).toBe('playing');
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('Pause during a repeat’s count-in: that count-in scrolled, and nothing scrolls or plays after', () => {
    const { engine, service } = loopingBars5To8(EVERY_REPEAT);
    engine.scrollToBar.mockClear();
    engineFinishesPass(engine, LOOP_START_TICK);
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);

    service.pause();
    vi.advanceTimersByTime(5000);

    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(engine.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('ready');
  });

  it('a pass that ends after Pause was pressed counts nothing in and scrolls nowhere', () => {
    const { engine, service } = loopingBars5To8(EVERY_REPEAT);
    engine.scrollToBar.mockClear();
    service.pause();
    // The worker's "finished" was already on its way.
    engineFinishesPass(engine, LOOP_START_TICK);
    vi.advanceTimersByTime(5000);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('a repeat with the count-in switched off mid-loop scrolls nothing', () => {
    const { engine, service } = loopingBars5To8(EVERY_REPEAT);
    service.setCountInBars(0);
    engine.scrollToBar.mockClear();
    engine.fire('finished', undefined);
    engine.fire('position', { tick: LOOP_START_TICK });
    expect(engine.scrollToBar).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('playing');
  });
});
