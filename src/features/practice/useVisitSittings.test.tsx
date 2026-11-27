import { act, renderHook } from '@testing-library/react';
import type { Sitting, SittingProgress } from './sittings';
import { useSittingRecorder, useVisitSittings } from './useVisitSittings';
import {
  clearVisitSittings,
  clearVisitSittingsOf,
  keepVisitSittingsOf,
  readVisitSittings,
  recordVisitSitting,
  subscribeVisitSittings,
} from './visitSittings';

const T0 = new Date(2026, 10, 27, 18).getTime();

function sitting(overrides: Partial<Sitting> = {}): Sitting {
  return {
    songId: 'song-1',
    loopId: 'loop-a',
    loopName: 'Verse fill',
    beganAt: T0,
    playedSeconds: 720,
    repeats: 20,
    startSpeedRatio: 0.8,
    endSpeedRatio: 0.9,
    ...overrides,
  };
}

/** The microtask a leaving overview empties the store in. */
const afterLeaving = () => act(async () => Promise.resolve());

afterEach(() => {
  delete window.__drumPalMinSessionSeconds;
});

describe('the store of the visit’s sittings', () => {
  it('keeps a sitting with the play time a session needs, and no shorter one', () => {
    recordVisitSitting(sitting({ playedSeconds: 29 }), 30);
    expect(readVisitSittings()).toEqual([]);
    recordVisitSitting(sitting({ playedSeconds: 30 }), 30);
    expect(readVisitSittings()).toHaveLength(1);
  });

  it('keeps a sitting told twice once', () => {
    recordVisitSitting(sitting({ playedSeconds: 40 }), 30);
    recordVisitSitting(sitting({ playedSeconds: 45 }), 30);
    expect(readVisitSittings()).toEqual([sitting({ playedSeconds: 45 })]);
  });

  it('tells its listeners of a change, and not of a call that changed nothing', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeVisitSittings(listener);
    recordVisitSitting(sitting(), 30);
    expect(listener).toHaveBeenCalledTimes(1);
    const before = readVisitSittings();

    recordVisitSitting(sitting({ playedSeconds: 1 }), 30);
    keepVisitSittingsOf('song-1');
    clearVisitSittingsOf('song-2');
    expect(listener).toHaveBeenCalledTimes(1);
    // The same snapshot, or useSyncExternalStore would render for ever.
    expect(readVisitSittings()).toBe(before);

    unsubscribe();
    clearVisitSittings();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('empties one song, or all but one', () => {
    recordVisitSitting(sitting(), 30);
    recordVisitSitting(sitting({ songId: 'song-2', loopId: 'loop-x' }), 30);
    keepVisitSittingsOf('song-2');
    expect(readVisitSittings().map((kept) => kept.songId)).toEqual(['song-2']);
    clearVisitSittingsOf('song-2');
    expect(readVisitSittings()).toEqual([]);
  });
});

describe('useVisitSittings', () => {
  it('has the song’s sittings from its first render', () => {
    recordVisitSitting(sitting(), 30);
    const renders: number[] = [];
    renderHook(() => {
      const visit = useVisitSittings('song-1');
      renders.push(visit.sittings.length);
      return visit;
    });
    expect(renders[0]).toBe(1);
  });

  it('drops another song’s sittings once this song shows', () => {
    recordVisitSitting(sitting({ songId: 'song-2' }), 30);
    const { result } = renderHook(() => useVisitSittings('song-1'));
    expect(result.current.sittings).toEqual([]);
    expect(readVisitSittings()).toEqual([]);
  });

  it('dismiss empties them', () => {
    recordVisitSitting(sitting(), 30);
    const { result } = renderHook(() => useVisitSittings('song-1'));
    act(() => result.current.dismiss());
    expect(result.current.sittings).toEqual([]);
    expect(readVisitSittings()).toEqual([]);
  });

  it('they go when the overview is left', async () => {
    recordVisitSitting(sitting(), 30);
    const { unmount } = renderHook(() => useVisitSittings('song-1'));
    unmount();
    await afterLeaving();
    expect(readVisitSittings()).toEqual([]);
  });

  it('survive effects run twice: a rehearsed unmount is not leaving', async () => {
    recordVisitSitting(sitting(), 30);
    const { result } = renderHook(() => useVisitSittings('song-1'), { reactStrictMode: true });
    await afterLeaving();
    expect(result.current.sittings).toHaveLength(1);
  });

  it('a sitting kept after the overview was left is there for the next one', async () => {
    const first = renderHook(() => useVisitSittings('song-1'));
    first.unmount();
    await afterLeaving();
    recordVisitSitting(sitting(), 30);
    const { result } = renderHook(() => useVisitSittings('song-1'));
    await afterLeaving();
    expect(result.current.sittings).toHaveLength(1);
  });
});

describe('useSittingRecorder', () => {
  const progress = (loopId: string, playedSeconds = 60): SittingProgress => ({
    loopId,
    beganAt: T0,
    playedSeconds,
    repeats: 4,
    startSpeedRatio: 0.8,
    endSpeedRatio: 0.9,
  });
  type Props = { loop: { id: string; name: string } | null };

  function renderRecorder(loop: Props['loop'], strict = false) {
    // What the tracker would say: it still holds the loop being left when it is read.
    const current = { sitting: null as SittingProgress | null };
    const read = () => current.sitting;
    const view = renderHook(({ loop }: Props) => useSittingRecorder('song-1', loop, read), {
      initialProps: { loop },
      reactStrictMode: strict,
    });
    return { ...view, current };
  }

  it('keeps nothing while the loop stays open', () => {
    const view = renderRecorder({ id: 'loop-a', name: 'Verse fill' });
    view.current.sitting = progress('loop-a');
    view.rerender({ loop: { id: 'loop-a', name: 'Verse fill' } });
    expect(readVisitSittings()).toEqual([]);
  });

  it('keeps the sitting of the loop left when another becomes the one open, under its own name', () => {
    const view = renderRecorder({ id: 'loop-a', name: 'Verse fill' });
    view.current.sitting = progress('loop-a');
    view.rerender({ loop: { id: 'loop-b', name: 'Chorus' } });
    expect(readVisitSittings()).toEqual([
      { ...progress('loop-a'), songId: 'song-1', loopName: 'Verse fill' },
    ]);
  });

  it('keeps it when the screen goes', () => {
    const view = renderRecorder({ id: 'loop-a', name: 'Verse fill' });
    view.current.sitting = progress('loop-a');
    view.unmount();
    expect(readVisitSittings()).toHaveLength(1);
  });

  it('keeps it when the loop is left for no loop (Exit loop)', () => {
    const view = renderRecorder({ id: 'loop-a', name: 'Verse fill' });
    view.current.sitting = progress('loop-a');
    view.rerender({ loop: null });
    expect(readVisitSittings()).toHaveLength(1);
  });

  it('a rename of the open loop ends nothing, and is the name kept', () => {
    const view = renderRecorder({ id: 'loop-a', name: 'Verse fill' });
    view.current.sitting = progress('loop-a');
    view.rerender({ loop: { id: 'loop-a', name: 'Verse fill (hard)' } });
    expect(readVisitSittings()).toEqual([]);
    view.unmount();
    expect(readVisitSittings()[0]).toMatchObject({ loopName: 'Verse fill (hard)' });
  });

  it('keeps no sitting the tracker has for another loop', () => {
    const view = renderRecorder({ id: 'loop-b', name: 'Chorus' });
    view.current.sitting = progress('loop-a');
    view.unmount();
    expect(readVisitSittings()).toEqual([]);
  });

  it('goes by the debug minimum, like the sessions', () => {
    window.__drumPalMinSessionSeconds = 2;
    const view = renderRecorder({ id: 'loop-a', name: 'Verse fill' });
    view.current.sitting = progress('loop-a', 3);
    view.unmount();
    expect(readVisitSittings()).toHaveLength(1);
  });

  it('with effects run twice, one sitting is kept once', () => {
    const view = renderRecorder({ id: 'loop-a', name: 'Verse fill' }, true);
    view.current.sitting = progress('loop-a');
    view.unmount();
    expect(readVisitSittings()).toHaveLength(1);
  });
});
