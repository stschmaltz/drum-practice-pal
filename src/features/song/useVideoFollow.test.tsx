import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { barsInPlayOrder } from '@/test/fakePlayerEngine';
import { FakeRecordingPlayer } from '@/test/fakeRecordingPlayer';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import type { RecordingSession } from './useRecordingSession';
import { toggleRecording, useTapSeeksVideo, useVideoFollow } from './useVideoFollow';

/**
 * The follow hooks over a real PlayerService on a fake engine (16 bars: 120
 * BPM for bars 1 to 8, two seconds each; 90 BPM from bar 9) and a fake
 * recording player. The page's own tests (SongPage.test.tsx, "the tab
 * follows the video") cover what is drawn; these cover the hooks' lifetime.
 */
function renderFollow({
  barOneSeconds = 4 as number | null,
  follow = true,
  strict = false,
  loaded = true,
  tapSeeks = true,
} = {}) {
  const { engine, player, finishLoading } = loopPlayer({ loaded });
  const video = new FakeRecordingPlayer();
  const onNeedsFirstTap = vi.fn();
  const barRef = createRef<HTMLElement>();
  const session = (props: {
    barOneSeconds: number | null;
    follow: boolean;
    video: FakeRecordingPlayer | null;
  }): RecordingSession | null =>
    props.video && {
      player: props.video,
      barOneSeconds: props.barOneSeconds,
      follow: props.follow,
      barRef,
      onNeedsFirstTap,
    };
  const view = renderHook(
    (props: {
      barOneSeconds: number | null;
      follow: boolean;
      video: FakeRecordingPlayer | null;
    }) => {
      const snapshot = usePlayerSnapshot(player);
      // The session object is new at each render here; the hooks depend on its fields, not on it.
      const recording = session(props);
      const followed = useVideoFollow(player, snapshot, recording);
      useTapSeeksVideo(player, recording, followed.barTimes, tapSeeks);
      return followed.bar;
    },
    {
      initialProps: { barOneSeconds, follow, video: video as FakeRecordingPlayer | null },
      reactStrictMode: strict,
    },
  );
  return {
    engine,
    player,
    video,
    barRef,
    finishLoading,
    onNeedsFirstTap,
    bar: () => view.result.current,
    /** The bars the score box was asked to show, 1-based. */
    shown: () => engine.scrollToBar.mock.calls.map(([barIndex]) => barIndex + 1),
    rerender: (
      props: Partial<{
        barOneSeconds: number | null;
        follow: boolean;
        video: FakeRecordingPlayer | null;
      }>,
    ) => view.rerender({ barOneSeconds, follow, video, ...props }),
    unmount: view.unmount,
  };
}

describe('useVideoFollow', () => {
  it('gives the bar the video is on, through a tempo change in the tab', () => {
    const view = renderFollow();
    act(() => view.video.playAt(4));
    expect(view.bar()).toBe(1);
    // Eight bars of two seconds: bar 9 starts 16 s into the tab, 20 s into the video.
    act(() => view.video.tick(19.9));
    expect(view.bar()).toBe(8);
    act(() => view.video.tick(20));
    expect(view.bar()).toBe(9);
    // From there a bar lasts 2.667 s at 90 BPM.
    act(() => view.video.tick(22.6));
    expect(view.bar()).toBe(9);
    act(() => view.video.tick(22.7));
    expect(view.bar()).toBe(10);
    expect(view.shown()).toEqual([1, 8, 9, 10]);
  });

  it('gives no bar for a link that isn’t lined up, and starts when it is', () => {
    const view = renderFollow({ barOneSeconds: null });
    act(() => view.video.playAt(6.5));
    expect(view.bar()).toBeNull();
    expect(view.video.listenerCount()).toBe(0);
    expect(view.shown()).toEqual([]);

    view.rerender({ barOneSeconds: 4 });
    expect(view.bar()).toBe(2);
    expect(view.shown()).toEqual([2]);
  });

  it('places the same moment anew when a nudge moves bar 1', () => {
    const view = renderFollow();
    act(() => view.video.playAt(5.9));
    act(() => view.video.pauseAt(5.9));
    expect(view.bar()).toBe(1);
    view.rerender({ barOneSeconds: 3.75 });
    expect(view.bar()).toBe(2);
    view.rerender({ barOneSeconds: 4.25 });
    expect(view.bar()).toBe(1);
  });

  it('waits for the tab’s bars, then places a video already playing', () => {
    const view = renderFollow({ loaded: false });
    act(() => view.video.playAt(6.5));
    expect(view.bar()).toBeNull();
    act(() => view.finishLoading());
    expect(view.bar()).toBe(2);
    expect(view.shown()).toEqual([2]);
  });

  it('a bar asked for before the notation has rendered is shown once it has', () => {
    const view = renderFollow();
    view.engine.laidOut = false;
    act(() => view.video.playAt(6.5));
    expect(view.bar()).toBe(2);
    view.engine.laidOut = true;
    act(() => view.engine.fire('rendered', undefined));
    // Asked before the bounds were there, and done when they were: by the player's own
    // kept request, and by the follow, which places the bar in the window then too.
    expect(view.shown()).toEqual([2, 2, 2]);
  });

  it('with Follow off gives the bar and scrolls nothing', () => {
    const view = renderFollow({ follow: false });
    act(() => view.video.playAt(4.5));
    act(() => view.video.tick(12.5));
    expect(view.bar()).toBe(5);
    expect(view.shown()).toEqual([]);
    view.rerender({ follow: true });
    expect(view.shown()).toEqual([5]);
  });

  it('lets go of a player that is taken away, and hears nothing from it afterwards', () => {
    const view = renderFollow();
    act(() => view.video.playAt(6.5));
    expect(view.bar()).toBe(2);
    view.rerender({ video: null });
    expect(view.bar()).toBeNull();
    expect(view.video.listenerCount()).toBe(0);
    const scrolls = view.shown().length;
    act(() => view.video.tick(12.5));
    expect(view.bar()).toBeNull();
    expect(view.shown()).toHaveLength(scrolls);
  });

  it('on unmount takes its listeners off: a late clock reading reaches nothing', () => {
    const view = renderFollow();
    act(() => view.video.playAt(6.5));
    view.unmount();
    expect(view.video.listenerCount()).toBe(0);
    expect(() => view.video.tick(12.5)).not.toThrow();
    // And the tab's own listeners for taps are gone too.
    act(() => view.engine.fire('barTapped', { barIndex: 3 }));
    expect(view.video.seekTo).not.toHaveBeenCalled();
  });

  it('under StrictMode listens once: each bar is shown once, and a tap seeks once', () => {
    const view = renderFollow({ strict: true });
    act(() => view.video.playAt(4.5));
    act(() => view.video.tick(6.5));
    expect(view.bar()).toBe(2);
    // The mount's second run asks for the first bar again; after that, once a bar.
    expect(view.shown().slice(-1)).toEqual([2]);
    expect(view.shown().filter((bar) => bar === 2)).toHaveLength(1);
    expect(view.video.listenerCount()).toBe(1);

    act(() => view.engine.fire('barTapped', { barIndex: 4 }));
    expect(view.video.seekTo).toHaveBeenCalledTimes(1);
    expect(view.video.seekTo).toHaveBeenCalledWith(12);
  });
});

describe('useTapSeeksVideo', () => {
  it('moves the video to the tapped bar, across the tab’s tempo change', () => {
    const view = renderFollow();
    act(() => view.video.playAt(4.5));
    act(() => view.engine.fire('barTapped', { barIndex: 9 }));
    // Bar 10: eight bars of 2 s and one of 2.667 s into the tab, plus bar 1's 4 s.
    expect(view.video.seekTo.mock.lastCall?.[0]).toBeCloseTo(4 + 16 + 8 / 3, 6);
    expect(view.bar()).toBe(10);
    expect(view.engine.seek).not.toHaveBeenCalled();
  });

  it('does nothing for a link that isn’t lined up', () => {
    const view = renderFollow({ barOneSeconds: null });
    act(() => view.video.playAt(4.5));
    act(() => view.engine.fire('barTapped', { barIndex: 9 }));
    expect(view.video.seekTo).not.toHaveBeenCalled();
    expect(view.onNeedsFirstTap).not.toHaveBeenCalled();
  });

  it('does nothing while taps mean something else on the screen', () => {
    const view = renderFollow({ tapSeeks: false });
    act(() => view.video.playAt(4.5));
    act(() => view.engine.fire('barTapped', { barIndex: 9 }));
    expect(view.video.seekTo).not.toHaveBeenCalled();
  });

  it('before the video has been started asks for the first tap, and before its player answers nothing', () => {
    const view = renderFollow();
    act(() => view.engine.fire('barTapped', { barIndex: 9 }));
    expect(view.onNeedsFirstTap).not.toHaveBeenCalled();
    act(() => view.video.becomeReady());
    act(() => view.engine.fire('barTapped', { barIndex: 9 }));
    expect(view.onNeedsFirstTap).toHaveBeenCalledTimes(1);
    expect(view.video.seekTo).not.toHaveBeenCalled();
  });
});

describe('toggleRecording', () => {
  const sessionOf = (video: FakeRecordingPlayer | null) => {
    const onNeedsFirstTap = vi.fn();
    const session: RecordingSession = {
      player: video,
      barOneSeconds: null,
      follow: true,
      barRef: createRef<HTMLElement>(),
      onNeedsFirstTap,
    };
    return { session, onNeedsFirstTap };
  };

  it.each([
    ['there is no frame', null],
    ['its player hasn’t answered', new FakeRecordingPlayer()],
  ])('leaves the key alone while %s', (_name, video) => {
    const { session, onNeedsFirstTap } = sessionOf(video);
    expect(toggleRecording(session)).toBe(false);
    expect(onNeedsFirstTap).not.toHaveBeenCalled();
  });

  it('takes the key and asks for the first tap on a video nobody has started', () => {
    const video = new FakeRecordingPlayer();
    video.becomeReady();
    const { session, onNeedsFirstTap } = sessionOf(video);
    expect(toggleRecording(session)).toBe(true);
    expect(onNeedsFirstTap).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('pauses a playing video and plays a paused one, by its state at the press', () => {
    const video = new FakeRecordingPlayer();
    video.playAt(3);
    const { session } = sessionOf(video);
    expect(toggleRecording(session)).toBe(true);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(toggleRecording(session)).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('takes no key from a player that can’t be reached', () => {
    const video = new FakeRecordingPlayer();
    video.set({ status: 'unavailable' });
    expect(toggleRecording(sessionOf(video).session)).toBe(false);
  });
});

describe('useVideoFollow and the window (19 QA fix round 1)', () => {
  const scrollBy = vi.fn();
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 200 });
  const WINDOW = { width: window.innerWidth, height: window.innerHeight };
  /** A window of another size, as a rotation leaves it. */
  const resizeTo = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
  };
  /** The video's sticky bar, as laid out: jsdom lays nothing out itself. */
  const videoBar = (top: number, height: number) => {
    const bar = document.createElement('div');
    bar.getBoundingClientRect = () => ({ top, bottom: top + height, height }) as DOMRect;
    document.body.append(bar);
    return bar;
  };

  beforeEach(() => {
    scrollBy.mockReset();
    vi.stubGlobal('scrollBy', scrollBy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: WINDOW.width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: WINDOW.height });
    document.body.replaceChildren();
  });

  it('a phone on its side, a fresh load: the first marked bar is brought under where the video sticks', () => {
    const view = renderFollow();
    // 844 x 390: the video's bar hasn't stuck yet, and ends below the window's foot.
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
    view.barRef.current = videoBar(219, 210);
    view.engine.barRects.set(0, rect(445, 582));
    act(() => view.video.playAt(4.5));
    // Under the 210 px the bar takes once stuck, not 16 px up to where it is now.
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 445 - 210 - 12, behavior: 'instant' });
  });

  it('turns the page a line early: the last bar on show goes to the top, a bar with the next on show stays', () => {
    const view = renderFollow();
    view.barRef.current = videoBar(0, 300);
    view.engine.barRects.set(0, rect(320, 440));
    view.engine.barRects.set(1, rect(450, 570));
    view.engine.barRects.set(2, rect(580, 700));
    // Cut off by the window's foot (768 px).
    view.engine.barRects.set(3, rect(710, 830));

    act(() => view.video.playAt(4.5));
    act(() => view.video.tick(6.5));
    expect(scrollBy).not.toHaveBeenCalled();
    // Bar 3 is all on show, and the last that is: the page turns now, not when bar 4 starts.
    act(() => view.video.tick(8.5));
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 580 - 300 - 12, behavior: 'instant' });
  });

  it('goes by the bar played next, not the next by number: a repeat going back turns nothing', () => {
    const view = renderFollow({ loaded: false });
    // Bars 3 and 4 are played twice; two seconds a bar, bar 1 at 4 s.
    act(() =>
      view.engine.finishLoading({ barCount: 6, bars: barsInPlayOrder([1, 2, 3, 4, 3, 4, 5, 6]) }),
    );
    view.engine.barRects.set(2, rect(400, 520));
    view.engine.barRects.set(3, rect(530, 650));
    view.engine.barRects.set(4, rect(700, 820));

    // Bar 4, first time through: bar 3 comes next, and it is on show above.
    act(() => view.video.playAt(10.5));
    expect(view.bar()).toBe(4);
    act(() => view.video.tick(12.5));
    expect(view.bar()).toBe(3);
    expect(scrollBy).not.toHaveBeenCalled();
    // Bar 4 again: now bar 5 follows, and it is cut off.
    act(() => view.video.tick(14.5));
    expect(view.bar()).toBe(4);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 530 - 12, behavior: 'instant' });
  });

  it('a bar marked before the score has drawn is placed in the window when it has', () => {
    const view = renderFollow();
    view.engine.laidOut = false;
    view.engine.barRects.set(1, rect(900, 1020));
    act(() => view.video.playAt(6.5));
    expect(scrollBy).not.toHaveBeenCalled();
    view.engine.laidOut = true;
    act(() => view.engine.fire('rendered', undefined));
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 888, behavior: 'instant' });
    // Placed: a later drawing is not a reason to move the reader's window again.
    act(() => view.engine.fire('rendered', undefined));
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it('after a rotation the marked bar is brought back at once, paused too, and again when the score has been drawn', () => {
    const view = renderFollow();
    view.engine.barRects.set(1, rect(300, 420));
    act(() => view.video.playAt(6.5));
    act(() => view.video.pauseAt(6.5));
    expect(scrollBy).not.toHaveBeenCalled();

    // Turned on its side: the same bar is now below a much shorter window.
    view.engine.barRects.set(1, rect(533, 630));
    resizeTo(844, 390);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 521, behavior: 'instant' });
    // alphaTab draws the score for the new width a moment later, and the bar moves again.
    view.engine.barRects.set(1, rect(700, 800));
    act(() => view.engine.fire('rendered', undefined));
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 688, behavior: 'instant' });
    expect(scrollBy).toHaveBeenCalledTimes(2);
    // Only that drawing: the next one has nothing to do with the rotation.
    act(() => view.engine.fire('rendered', undefined));
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it('a rotation’s drawing that lands after the mark has moved on still brings the new bar on show', () => {
    const view = renderFollow();
    view.engine.barRects.set(1, rect(300, 420));
    view.engine.barRects.set(2, rect(430, 550));
    act(() => view.video.playAt(6.5));
    resizeTo(844, 390);
    act(() => view.video.tick(8.5));
    scrollBy.mockClear();
    view.engine.barRects.set(2, rect(900, 1000));
    act(() => view.engine.fire('rendered', undefined));
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 888, behavior: 'instant' });
  });

  it('a change of height alone (a phone’s address bar) and a drawing with no rotation leave the reader’s scroll alone', () => {
    const view = renderFollow();
    view.engine.barRects.set(1, rect(300, 420));
    act(() => view.video.playAt(6.5));
    // The reader flicks ahead; the bar being played is far above.
    view.engine.barRects.set(1, rect(-900, -780));
    resizeTo(WINDOW.width, 500);
    act(() => view.engine.fire('rendered', undefined));
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('with Follow off a rotation moves nothing, and stops listening when the screen goes', () => {
    const view = renderFollow({ follow: false });
    view.engine.barRects.set(1, rect(900, 1020));
    act(() => view.video.playAt(6.5));
    resizeTo(844, 390);
    expect(scrollBy).not.toHaveBeenCalled();

    view.rerender({ follow: true });
    expect(scrollBy).toHaveBeenCalledTimes(1);
    view.unmount();
    resizeTo(390, 844);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });
});
