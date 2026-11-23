import { act, renderHook, waitFor } from '@testing-library/react';
import { loopKeys } from '@/features/loops/loopKeys';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import { sessionKeys } from './sessionKeys';
import type { PracticeSession } from './sessions';
import { usePracticeTracker } from './usePracticeTracker';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const T0 = Date.parse('2026-11-23T18:00:00.000Z');
const USER = 'user-1';

const ok: FakeResult = { data: null, error: null };
const fetchMock = vi.fn<typeof fetch>();

/** Every practice_sessions row sent through supabase-js so far. */
const logged = () =>
  queryResult.mock.calls
    .map(([call]) => call)
    .filter((call) => call.table === 'practice_sessions' && opArgs(call, 'upsert'))
    .map((call) => opArgs(call, 'upsert')?.[0] as Record<string, unknown>);

/** Every row sent with keepalive so far. */
const keptAlive = () =>
  fetchMock.mock.calls.map(([, init]) => {
    expect(init).toMatchObject({ keepalive: true });
    return JSON.parse(init?.body as string) as Record<string, unknown>;
  });

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** The tracker over a real player, as the song page wires it; the loop is a prop. */
function renderTracker(initialLoopId: string | null = 'loop-a') {
  const { engine, player } = loopPlayer();
  const queryClient = testQueryClient();
  const hook = renderHook(
    ({ loopId }: { loopId: string | null }) =>
      usePracticeTracker(player, usePlayerSnapshot(player), loopId),
    { wrapper: wrapperFor(queryClient, signedInAs(USER)), initialProps: { loopId: initialLoopId } },
  );
  /** Moves the clock; nothing else is on a timer. */
  const seconds = (count: number) => vi.setSystemTime(Date.now() + count * 1000);
  const play = () =>
    act(() => {
      player.play();
      engine.fire('stateChanged', { playing: true });
    });
  const pause = () =>
    act(() => {
      player.pause();
      engine.fire('stateChanged', { playing: false });
    });
  const playFor = (count: number) => {
    play();
    seconds(count);
    pause();
  };
  return { engine, player, queryClient, hook, seconds, play, pause, playFor };
}

beforeEach(() => {
  resetFakeSupabase();
  queryResult.mockResolvedValue(ok);
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  // Only the clock: TanStack Query and Testing Library keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('logging on stop', () => {
  it('a minute of loop practice is one session with its start, duration, speed and passes', async () => {
    const view = renderTracker();
    act(() => {
      view.player.setSpeed(0.855556);
      view.player.setRange({ startBar: 5, endBar: 8 });
      view.player.setLooping(true);
    });
    view.play();
    for (let pass = 0; pass < 6; pass++) act(() => view.engine.fire('finished', undefined));
    view.seconds(60);
    view.pause();

    await waitFor(() => expect(view.hook.result.current.lastLogged).not.toBeNull());

    expect(logged()).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        user_id: USER,
        loop_id: 'loop-a',
        started_at: '2026-11-23T18:00:00.000Z',
        duration_seconds: 60,
        speed_ratio: 0.855556,
        repeats: 6,
      },
    ]);
    expect(view.hook.result.current.lastLogged).toMatchObject({ durationSeconds: 60 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs nothing in jam mode', async () => {
    const view = renderTracker(null);

    view.playFor(120);
    await Promise.resolve();

    expect(logged()).toEqual([]);
  });

  it('keeps a stop under 30 seconds and adds the next stretch to it', async () => {
    const view = renderTracker();
    view.playFor(20);
    expect(logged()).toEqual([]);

    view.seconds(300);
    view.playFor(15);

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      started_at: '2026-11-23T18:00:00.000Z',
      duration_seconds: 35,
    });
  });

  it('gives each session its own id', async () => {
    const view = renderTracker();
    view.playFor(40);
    view.playFor(50);

    await waitFor(() => expect(logged()).toHaveLength(2));
    expect(logged()[0]!.id).not.toBe(logged()[1]!.id);
    expect(logged().map((row) => row.duration_seconds)).toEqual([40, 50]);
  });

  it('leaves out a count-in, and does not end the session at one', async () => {
    const view = renderTracker();
    act(() => {
      view.player.setCountInBars(1);
      view.player.setCountInMode('every_repeat');
      view.player.setRange({ startBar: 5, endBar: 8 });
      view.player.setLooping(true);
    });
    act(() => view.player.play());
    expect(view.player.getSnapshot().status).toBe('countingIn');
    view.seconds(2);
    act(() => view.engine.fire('stateChanged', { playing: true }));
    view.seconds(20);
    // The pass ends: the service counts in again before the repeat.
    act(() => {
      view.engine.fire('finished', undefined);
      view.engine.fire('stateChanged', { playing: false });
    });
    expect(view.player.getSnapshot().status).toBe('countingIn');
    view.seconds(2);
    act(() => view.engine.fire('stateChanged', { playing: true }));
    view.seconds(20);
    expect(logged()).toEqual([]);

    act(() => {
      view.player.pause();
      view.engine.fire('stateChanged', { playing: false });
    });

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      started_at: '2026-11-23T18:00:02.000Z',
      duration_seconds: 40,
      repeats: 1,
    });
  });
});

describe('leaving the loop', () => {
  it('for another loop logs the first at the speed it was played at', async () => {
    const view = renderTracker('loop-a');
    act(() => view.player.setSpeed(0.6));
    view.play();
    view.seconds(45);

    // "Play loop" on B: its saved speed and the new loop arrive in one render.
    act(() => {
      view.player.setSpeed(1.1);
      view.hook.rerender({ loopId: 'loop-b' });
    });

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      loop_id: 'loop-a',
      duration_seconds: 45,
      speed_ratio: 0.6,
    });

    view.seconds(31);
    view.pause();
    await waitFor(() => expect(logged()).toHaveLength(2));
    expect(logged()[1]).toMatchObject({
      loop_id: 'loop-b',
      duration_seconds: 31,
      speed_ratio: 1.1,
    });
  });

  it('back to the whole song logs it and drops a session that was too short', async () => {
    const view = renderTracker('loop-a');
    view.play();
    view.seconds(10);
    act(() => view.hook.rerender({ loopId: null }));
    view.seconds(60);
    act(() => view.hook.rerender({ loopId: 'loop-a' }));
    view.seconds(31);

    act(() => view.hook.rerender({ loopId: null }));

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      started_at: '2026-11-23T18:01:10.000Z',
      duration_seconds: 31,
    });
  });

  it('by leaving the screen logs through the query client, and refreshes what the session moved', async () => {
    const view = renderTracker();
    const history: PracticeSession[] = [];
    view.queryClient.setQueryData(sessionKeys.forLoop(USER, 'loop-a'), history);
    view.queryClient.setQueryData(loopKeys.practice(USER), []);
    view.play();
    view.seconds(45);

    view.hook.unmount();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ loop_id: 'loop-a', duration_seconds: 45 });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(view.queryClient.getQueryState(loopKeys.practice(USER))?.isInvalidated).toBe(true),
    );
    expect(
      view.queryClient.getQueryData<PracticeSession[]>(sessionKeys.forLoop(USER, 'loop-a')),
    ).toEqual([expect.objectContaining({ loop_id: 'loop-a', duration_seconds: 45 })]);
  });

  it('by leaving the screen after too little play logs nothing', async () => {
    const view = renderTracker();
    view.play();
    view.seconds(29);

    view.hook.unmount();
    await Promise.resolve();

    expect(logged()).toEqual([]);
  });
});

describe('a page that is hidden or going away', () => {
  it('logs with keepalive when the page is hidden mid-practice, and starts again when it is back', async () => {
    const view = renderTracker();
    view.play();
    view.seconds(40);

    setVisibility('hidden');

    expect(keptAlive()).toEqual([
      expect.objectContaining({ user_id: USER, loop_id: 'loop-a', duration_seconds: 40 }),
    ]);
    expect(logged()).toEqual([]);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access');

    // An hour in a pocket, the player still saying "playing", counts for nothing.
    view.seconds(3600);
    setVisibility('visible');
    view.seconds(35);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ duration_seconds: 35 });
    expect(logged()[0]!.id).not.toBe(keptAlive()[0]!.id);
  });

  it('logs with keepalive on pagehide, once, whichever of the two events comes first', async () => {
    const view = renderTracker();
    view.play();
    view.seconds(40);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    setVisibility('hidden');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(keptAlive()).toHaveLength(1);
    expect(keptAlive()[0]).toMatchObject({ loop_id: 'loop-a', duration_seconds: 40 });
    expect(logged()).toEqual([]);
    // This page lived to see the answer: the session shows as logged.
    await waitFor(() => expect(view.hook.result.current.lastLogged).not.toBeNull());
  });

  it('keeps a session that is still too short when the page is only hidden', async () => {
    const view = renderTracker();
    view.play();
    view.seconds(20);
    setVisibility('hidden');
    expect(fetchMock).not.toHaveBeenCalled();

    view.seconds(600);
    setVisibility('visible');
    view.seconds(15);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ duration_seconds: 35 });
  });

  it('sends nothing on pagehide after too little play', () => {
    const view = renderTracker();
    view.play();
    view.seconds(29);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toEqual([]);
  });

  it('sends a keepalive that failed again, the same session, if the page lives on', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const view = renderTracker();
    view.play();
    view.seconds(40);

    setVisibility('hidden');

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]!.id).toBe(keptAlive()[0]!.id);
  });
});

describe('a log that fails', () => {
  it('is kept, and Try again sends the same session, which then counts as logged', async () => {
    queryResult.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const view = renderTracker();
    view.playFor(40);

    await waitFor(() => expect(view.hook.result.current.unsaved).toHaveLength(1));
    expect(view.hook.result.current.lastLogged).toBeNull();

    act(() => view.hook.result.current.retryUnsaved());

    await waitFor(() => expect(view.hook.result.current.unsaved).toEqual([]));
    expect(logged()).toHaveLength(2);
    expect(logged()[1]).toEqual(logged()[0]);
    expect(view.hook.result.current.lastLogged).toMatchObject({ durationSeconds: 40 });
  });

  it('keeps each of several failures, and one retry clears them all', async () => {
    queryResult
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const view = renderTracker();
    view.playFor(40);
    view.playFor(50);
    await waitFor(() => expect(view.hook.result.current.unsaved).toHaveLength(2));

    act(() => view.hook.result.current.retryUnsaved());

    // Both sends answer for themselves, not only the later one.
    await waitFor(() => expect(view.hook.result.current.unsaved).toEqual([]));
    expect(logged().map((row) => row.duration_seconds)).toEqual([40, 50, 40, 50]);
  });

  it('is not kept when the loop has been deleted: there is nothing to log to', async () => {
    queryResult.mockResolvedValueOnce({
      data: null,
      error: { message: 'violates foreign key constraint', code: '23503' },
    });
    const view = renderTracker();
    view.playFor(40);

    await waitFor(() => expect(logged()).toHaveLength(1));
    await Promise.resolve();

    expect(view.hook.result.current.unsaved).toEqual([]);
    expect(view.hook.result.current.lastLogged).toBeNull();
  });
});
