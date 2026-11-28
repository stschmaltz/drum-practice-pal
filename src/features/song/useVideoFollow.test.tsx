import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { FakeRecordingPlayer } from '@/test/fakeRecordingPlayer';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import {
  toggleRecording,
  useTapSeeksVideo,
  useVideoFollow,
  type RecordingSession,
} from './useVideoFollow';

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
    // Asked once before the bounds were there, and done when they were.
    expect(view.shown()).toEqual([2, 2]);
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
