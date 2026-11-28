import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { offlineDb } from '@/features/offline/offlineDb';
import { outboxEntries } from '@/features/offline/outbox';
import { useOutboxReplay } from '@/features/offline/useOutboxReplay';
import { hasUnsentWrites, useHasUnsentWrites } from '@/features/offline/unsentWrites';
import { loopKeys } from '@/features/loops/loopKeys';
import { songKeys } from '@/features/library/useSongs';
import {
  FAKE_AUTH_STORAGE_KEY,
  fakeSession,
  fakeSupabase,
  opArgs,
  queryResult,
  resetFakeSupabase,
  type FakeResult,
} from '@/test/fakeSupabase';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import { settle, signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import { sessionKeys } from './sessionKeys';
import type { PracticeSession } from './sessions';
import { usePracticeTracker } from './usePracticeTracker';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const T0 = Date.parse('2026-11-23T18:00:00.000Z');
const USER = 'user-1';

const ok: FakeResult = { data: null, error: null };
const offline: FakeResult = { data: null, error: { message: 'offline' } };
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

/** `pagehide` as the page is left or put in the back/forward cache, `pageshow` as it comes back. */
function firePageEvent(type: 'pagehide' | 'pageshow') {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

/** The tracker over a real player, as the song page wires it; the loop is a prop. */
function renderTracker(
  initialLoopId: string | null = 'loop-a',
  { strict = false }: { strict?: boolean } = {},
) {
  const { engine, player } = loopPlayer();
  const queryClient = testQueryClient();
  const hook = renderHook(
    ({ loopId }: { loopId: string | null }) =>
      usePracticeTracker(player, usePlayerSnapshot(player), loopId),
    {
      wrapper: wrapperFor(queryClient, signedInAs(USER)),
      initialProps: { loopId: initialLoopId },
      // Mounts, cleans up and mounts again, as the app does in development.
      reactStrictMode: strict,
    },
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
  /** Starts playing and lets that many seconds pass, still playing. */
  const playOn = (count: number) => {
    play();
    seconds(count);
  };
  const playFor = (count: number) => {
    playOn(count);
    pause();
  };
  const loopBars5To8 = () =>
    act(() => {
      player.setRange({ startBar: 5, endBar: 8 });
      player.setLooping(true);
    });
  /** The loop reaches its end and wraps, that many times. */
  const finishPasses = (count: number) => {
    for (let pass = 0; pass < count; pass++) act(() => engine.fire('finished', undefined));
  };
  const historyKey = sessionKeys.forLoop(USER, 'loop-a');
  return {
    engine,
    player,
    queryClient,
    hook,
    /** What the hook returns now. */
    tracker: () => hook.result.current,
    seconds,
    play,
    pause,
    playOn,
    playFor,
    loopBars5To8,
    finishPasses,
    /** Loop A's history as an opened, empty one, so a logged session has a cache to join. */
    cacheEmptyHistory: () => queryClient.setQueryData<PracticeSession[]>(historyKey, []),
    cachedHistory: () => queryClient.getQueryData<PracticeSession[]>(historyKey),
    isInvalidated: (queryKey: readonly unknown[]) =>
      queryClient.getQueryState(queryKey)?.isInvalidated,
  };
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
    act(() => view.player.setSpeed(0.855556));
    view.loopBars5To8();
    view.play();
    view.finishPasses(6);
    view.seconds(60);
    view.pause();

    await waitFor(() => expect(view.tracker().lastLogged).not.toBeNull());

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
    expect(view.tracker().lastLogged).toMatchObject({ durationSeconds: 60 });
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
    });
    view.loopBars5To8();
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

    view.pause();

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
    view.playOn(45);

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
    view.playOn(10);
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
    view.cacheEmptyHistory();
    view.queryClient.setQueryData(loopKeys.practice(USER), []);
    view.playOn(45);

    view.hook.unmount();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ loop_id: 'loop-a', duration_seconds: 45 });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(view.isInvalidated(loopKeys.practice(USER))).toBe(true));
    expect(view.cachedHistory()).toEqual([
      expect.objectContaining({ loop_id: 'loop-a', duration_seconds: 45 }),
    ]);
  });

  it('by leaving the screen after too little play logs nothing', async () => {
    const view = renderTracker();
    view.playOn(29);

    view.hook.unmount();
    await Promise.resolve();

    expect(logged()).toEqual([]);
  });
});

// Unit 20, batch 5 (17.1): the speed is the tracker's, whichever way the session is sent.
describe('a session with a last try at full speed', () => {
  /** Ten minutes at 80%, then a minute at 100%, still playing. */
  const tenMinutesThenATry = (view: ReturnType<typeof renderTracker>) => {
    act(() => view.player.setSpeed(0.8));
    view.playOn(600);
    act(() => view.player.setSpeed(1));
    view.seconds(60);
  };
  const mostlyAt80 = { loop_id: 'loop-a', duration_seconds: 660, speed_ratio: 0.8 };

  it('is logged at the speed most of it was played at when it is paused', async () => {
    const view = renderTracker();
    tenMinutesThenATry(view);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject(mostlyAt80);
    expect(view.tracker().lastLogged).toMatchObject({ speedRatio: 0.8 });
  });

  it('is logged the same as the screen goes', async () => {
    const view = renderTracker();
    view.cacheEmptyHistory();
    tenMinutesThenATry(view);

    view.hook.unmount();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject(mostlyAt80);
    expect(view.cachedHistory()).toEqual([expect.objectContaining({ speed_ratio: 0.8 })]);
  });

  it('is logged the same with keepalive from a hidden page, and on pagehide', () => {
    const hidden = renderTracker();
    tenMinutesThenATry(hidden);
    setVisibility('hidden');
    expect(keptAlive()).toEqual([expect.objectContaining(mostlyAt80)]);
    hidden.hook.unmount();
    Reflect.deleteProperty(document, 'visibilityState');
    fetchMock.mockClear();

    vi.setSystemTime(T0);
    const left = renderTracker();
    tenMinutesThenATry(left);
    firePageEvent('pagehide');
    expect(keptAlive()).toEqual([expect.objectContaining(mostlyAt80)]);
  });

  it('is logged at that speed when another loop is chosen, at a third speed, in the same render', async () => {
    const view = renderTracker('loop-a');
    tenMinutesThenATry(view);

    act(() => {
      view.player.setSpeed(0.5);
      view.hook.rerender({ loopId: 'loop-b' });
    });

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject(mostlyAt80);
  });

  it('the sitting still ends on the speed it was left at', () => {
    const view = renderTracker();
    tenMinutesThenATry(view);
    view.pause();

    expect(view.tracker().sitting()).toMatchObject({ playedSeconds: 660, endSpeedRatio: 1 });
  });
});

// Unit 20, batch 5 Test: the row is built once, by the tracker, and every way
// out and every later send carries that row, whatever the speed is by then.
describe('the speed of a logged session, window by window', () => {
  /** 40 s at 85 BPM typed at 120 (0.708333, "71%"), then 20 s at 100%, still playing. */
  const mostlyAtATypedBpm = (view: ReturnType<typeof renderTracker>) => {
    act(() => view.player.setSpeed(0.708333));
    view.playOn(40);
    act(() => view.player.setSpeed(1));
    view.seconds(20);
  };
  const withoutId = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([field]) => field !== 'id'));
  const theRow = {
    user_id: USER,
    loop_id: 'loop-a',
    started_at: '2026-11-23T18:00:00.000Z',
    duration_seconds: 60,
    speed_ratio: 0.708333,
    repeats: 0,
  };

  it('the three ways out send the same row, the exact ratio of a typed BPM in it', async () => {
    const paused = renderTracker();
    mostlyAtATypedBpm(paused);
    paused.pause();
    await waitFor(() => expect(logged()).toHaveLength(1));
    const byMutation = withoutId(logged()[0]!);
    paused.hook.unmount();
    queryResult.mockClear();

    vi.setSystemTime(T0);
    const left = renderTracker();
    mostlyAtATypedBpm(left);
    left.hook.unmount();
    await waitFor(() => expect(logged()).toHaveLength(1));
    const unobserved = withoutId(logged()[0]!);
    queryResult.mockClear();

    vi.setSystemTime(T0);
    const hidden = renderTracker();
    mostlyAtATypedBpm(hidden);
    setVisibility('hidden');
    const byKeepalive = withoutId(keptAlive()[0]!);

    expect(byMutation).toEqual(theRow);
    expect(unobserved).toEqual(theRow);
    expect(byKeepalive).toEqual(theRow);
    expect(logged()).toEqual([]);
  });

  it('a keepalive that failed is sent again as the same row, though the speed has changed on the hidden page', async () => {
    let fail!: (error: Error) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((_, reject) => (fail = reject)));
    const view = renderTracker();
    mostlyAtATypedBpm(view);
    setVisibility('hidden');
    expect(keptAlive()).toHaveLength(1);

    // A key pressed with the page hidden, the keepalive still unanswered.
    act(() => view.player.setSpeed(0.5));
    await act(async () => fail(new TypeError('Failed to fetch')));

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toEqual(keptAlive()[0]);
    expect(logged()[0]).toMatchObject(theRow);
  });

  it('a log on its way is not touched by a change of speed, which belongs to the next session', async () => {
    const first = heldAnswer();
    queryResult.mockReturnValueOnce(first.promise);
    const view = renderTracker();
    mostlyAtATypedBpm(view);
    view.pause();
    await waitFor(() => expect(logged()).toHaveLength(1));
    const sent = structuredClone(logged()[0]!);

    act(() => view.player.setSpeed(0.9));
    view.playFor(31);
    await waitFor(() => expect(logged()).toHaveLength(2));
    await act(async () => first.answer(ok));

    await waitFor(() => expect(view.tracker().lastLogged).not.toBeNull());
    expect(logged()[0]).toEqual(sent);
    expect(logged()[0]).toMatchObject(theRow);
    // The next one has none of the first's 40 seconds at 71%: it is 31 seconds at 90%.
    expect(logged()[1]).toMatchObject({ duration_seconds: 31, speed_ratio: 0.9 });
  });

  it('"Try again" sends the row that failed, not one at the speed set since', async () => {
    queryResult.mockResolvedValueOnce(offline);
    const view = renderTracker();
    mostlyAtATypedBpm(view);
    view.pause();
    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    expect(view.tracker().unsaved[0]).toMatchObject({ speedRatio: 0.708333 });

    act(() => view.player.setSpeed(0.5));
    act(() => view.tracker().retryUnsaved());

    await waitFor(() => expect(view.tracker().unsaved).toEqual([]));
    expect(logged()).toHaveLength(2);
    expect(logged()[1]).toEqual(logged()[0]);
    expect(logged()[1]).toMatchObject(theRow);
  });

  it('waits offline in the outbox with that speed, and is logged with it when the connection is back', async () => {
    const view = renderTracker();
    act(() => onlineManager.setOnline(false));
    mostlyAtATypedBpm(view);
    view.pause();

    await waitFor(async () =>
      expect(await outboxEntries(USER)).toEqual([
        expect.objectContaining({
          kind: 'session',
          record: expect.objectContaining({ durationSeconds: 60, speedRatio: 0.708333 }) as unknown,
        }),
      ]),
    );
    await settle();
    expect(logged()).toEqual([]);
    act(() => view.player.setSpeed(0.5));

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject(theRow);
  });

  it('a speed set during the count-in is the speed of what is then played', async () => {
    const view = renderTracker();
    act(() => {
      view.player.setSpeed(0.7);
      view.player.setCountInBars(1);
    });
    act(() => view.player.play());
    expect(view.player.getSnapshot().status).toBe('countingIn');
    view.seconds(1);
    act(() => view.player.setSpeed(0.9));
    view.seconds(1);
    act(() => view.engine.fire('stateChanged', { playing: true }));
    view.seconds(35);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      started_at: '2026-11-23T18:00:02.000Z',
      duration_seconds: 35,
      speed_ratio: 0.9,
    });
  });

  it('a speed set in the count-in before a repeat takes nothing from the pass before it', async () => {
    const view = renderTracker();
    act(() => {
      view.player.setSpeed(0.7);
      view.player.setCountInBars(1);
      view.player.setCountInMode('every_repeat');
    });
    view.loopBars5To8();
    act(() => view.player.play());
    view.seconds(2);
    act(() => view.engine.fire('stateChanged', { playing: true }));
    view.seconds(20);
    act(() => {
      view.engine.fire('finished', undefined);
      view.engine.fire('stateChanged', { playing: false });
    });
    expect(view.player.getSnapshot().status).toBe('countingIn');
    act(() => view.player.setSpeed(1));
    view.seconds(2);
    act(() => view.engine.fire('stateChanged', { playing: true }));
    view.seconds(15);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    // 20 s at 70%, 15 at 100%; the count-ins are nobody's.
    expect(logged()[0]).toMatchObject({ duration_seconds: 35, speed_ratio: 0.7, repeats: 1 });
  });

  it('a session still under the minimum keeps each go at its own speed across the pauses', async () => {
    const view = renderTracker();
    act(() => view.player.setSpeed(0.6));
    view.playFor(12);
    act(() => view.player.setSpeed(0.75));
    view.seconds(30);
    view.playFor(12);
    act(() => view.player.setSpeed(0.6));
    await settle();
    expect(logged()).toEqual([]);

    view.playFor(12);

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      started_at: '2026-11-23T18:00:00.000Z',
      duration_seconds: 36,
      speed_ratio: 0.6,
    });
  });

  it('a session still under the minimum, taken past it on a try at full speed, leaves a hidden page at the speed it mostly had', () => {
    const view = renderTracker();
    act(() => view.player.setSpeed(0.6));
    view.playFor(25);
    act(() => view.player.setSpeed(1));
    view.playOn(6);

    setVisibility('hidden');

    expect(keptAlive()).toEqual([
      expect.objectContaining({ duration_seconds: 31, speed_ratio: 0.6 }),
    ]);
  });

  it('a speed set while the page is hidden has no play time until the page is back', async () => {
    const view = renderTracker();
    act(() => view.player.setSpeed(0.8));
    view.playOn(20);
    // Too short to end: the hidden page keeps it. The player goes on "playing" in the pocket.
    setVisibility('hidden');
    expect(fetchMock).not.toHaveBeenCalled();
    view.seconds(600);
    act(() => view.player.setSpeed(1));
    view.seconds(3000);

    setVisibility('visible');
    view.seconds(15);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    // 20 s at 80% before, 15 at 100% after: none of the hour is anybody's.
    expect(logged()[0]).toMatchObject({ duration_seconds: 35, speed_ratio: 0.8 });
  });

  it('with effects run twice it is still one row at the speed most of it was played at', async () => {
    const view = renderTracker('loop-a', { strict: true });
    mostlyAtATypedBpm(view);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    await settle();
    expect(logged()).toHaveLength(1);
    expect(logged()[0]).toMatchObject(theRow);
  });
});

describe('a page that is hidden or going away', () => {
  it('logs with keepalive when the page is hidden mid-practice, and starts again when it is back', async () => {
    const view = renderTracker();
    view.playOn(40);

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
    view.playOn(40);

    firePageEvent('pagehide');
    setVisibility('hidden');
    firePageEvent('pagehide');

    expect(keptAlive()).toHaveLength(1);
    expect(keptAlive()[0]).toMatchObject({ loop_id: 'loop-a', duration_seconds: 40 });
    expect(logged()).toEqual([]);
    // This page lived to see the answer: the session shows as logged.
    await waitFor(() => expect(view.tracker().lastLogged).not.toBeNull());
  });

  it('keeps a session that is still too short when the page is only hidden', async () => {
    const view = renderTracker();
    view.playOn(20);
    setVisibility('hidden');
    expect(fetchMock).not.toHaveBeenCalled();

    view.seconds(600);
    setVisibility('visible');
    view.seconds(15);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ duration_seconds: 35 });
  });

  it('counts no passes played to a hidden page under a session still too short to end', async () => {
    const view = renderTracker();
    view.loopBars5To8();
    view.play();
    view.finishPasses(2);
    view.seconds(20);

    // A laptop tab in the background: the loop plays on and wraps.
    setVisibility('hidden');
    view.finishPasses(5);
    view.seconds(600);
    setVisibility('visible');
    view.finishPasses(1);
    view.seconds(15);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ duration_seconds: 35, repeats: 3 });
  });

  it('sends nothing on pagehide after too little play', () => {
    const view = renderTracker();
    view.playOn(29);

    firePageEvent('pagehide');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toEqual([]);
  });

  it('sends a keepalive that failed again, the same session, if the page lives on', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const view = renderTracker();
    view.playOn(40);

    setVisibility('hidden');

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]!.id).toBe(keptAlive()[0]!.id);
  });
});

describe('a log that fails', () => {
  it('is kept, and Try again sends the same session, which then counts as logged', async () => {
    queryResult.mockResolvedValueOnce(offline);
    const view = renderTracker();
    view.playFor(40);

    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    expect(view.tracker().lastLogged).toBeNull();

    act(() => view.tracker().retryUnsaved());

    await waitFor(() => expect(view.tracker().unsaved).toEqual([]));
    expect(logged()).toHaveLength(2);
    expect(logged()[1]).toEqual(logged()[0]);
    expect(view.tracker().lastLogged).toMatchObject({ durationSeconds: 40 });
  });

  it('keeps each of several failures, and one retry clears them all', async () => {
    queryResult.mockResolvedValueOnce(offline).mockResolvedValueOnce(offline);
    const view = renderTracker();
    view.playFor(40);
    view.playFor(50);
    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(2));

    act(() => view.tracker().retryUnsaved());

    // Both sends answer for themselves, not only the later one.
    await waitFor(() => expect(view.tracker().unsaved).toEqual([]));
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

    expect(view.tracker().unsaved).toEqual([]);
    expect(view.tracker().lastLogged).toBeNull();
  });

  it('reads the loops again when the loop has gone (Unit 13), and no other list', async () => {
    queryResult.mockResolvedValueOnce({
      data: null,
      error: { message: 'violates foreign key constraint', code: '23503' },
    });
    const view = renderTracker();
    view.queryClient.setQueryData(loopKeys.practice(USER), []);
    view.queryClient.setQueryData(songKeys.forUser(USER), []);
    view.playFor(40);

    await waitFor(() => expect(view.isInvalidated(loopKeys.practice(USER))).toBe(true));
    expect(view.isInvalidated(songKeys.forUser(USER))).toBe(false);
    expect(view.tracker().lastLogged).toBeNull();
  });
});

/** An answer the test gives when it chooses, to see what happens while a log is on its way. */
function heldAnswer() {
  let answer!: (result: FakeResult) => void;
  const promise = new Promise<FakeResult>((resolve) => (answer = resolve));
  return { promise, answer };
}

describe('while a session log is on its way', () => {
  it('Play again opens a new session with its own id, and each log answers for itself', async () => {
    const first = heldAnswer();
    const second = heldAnswer();
    queryResult.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = renderTracker();
    view.playFor(40);
    await waitFor(() => expect(logged()).toHaveLength(1));

    view.playFor(50);
    await waitFor(() => expect(logged()).toHaveLength(2));
    expect(logged()[1]!.id).not.toBe(logged()[0]!.id);
    expect(view.tracker().lastLogged).toBeNull();

    // The later one fails and the earlier one lands: neither takes the other's place.
    await act(async () => second.answer(offline));
    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    await act(async () => first.answer(ok));

    await waitFor(() => expect(view.tracker().lastLogged).toMatchObject({ durationSeconds: 40 }));
    expect(view.tracker().unsaved).toEqual([
      expect.objectContaining({ id: logged()[1]!.id, durationSeconds: 50 }),
    ]);
  });

  it('leaving the screen lets it finish, and the caches still hear of it', async () => {
    const held = heldAnswer();
    queryResult.mockReturnValueOnce(held.promise);
    const view = renderTracker();
    view.cacheEmptyHistory();
    view.queryClient.setQueryData(loopKeys.practice(USER), []);
    view.queryClient.setQueryData(songKeys.forUser(USER), []);
    view.playFor(40);
    await waitFor(() => expect(logged()).toHaveLength(1));

    view.hook.unmount();
    held.answer(ok);

    await waitFor(() =>
      expect(view.cachedHistory()).toEqual([expect.objectContaining({ duration_seconds: 40 })]),
    );
    expect(view.isInvalidated(loopKeys.practice(USER))).toBe(true);
    expect(view.isInvalidated(songKeys.forUser(USER))).toBe(true);
    // The session that ended was already sent: unmounting sends nothing more.
    expect(logged()).toHaveLength(1);
  });

  it('Try again pressed twice sends the same session twice and keeps it once', async () => {
    queryResult.mockResolvedValueOnce(offline);
    const view = renderTracker();
    view.playFor(40);
    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    // Both retries fail too.
    queryResult.mockResolvedValueOnce(offline).mockResolvedValueOnce(offline);

    act(() => {
      view.tracker().retryUnsaved();
      view.tracker().retryUnsaved();
    });

    await waitFor(() => expect(logged()).toHaveLength(3));
    expect(new Set(logged().map((row) => row.id)).size).toBe(1);
    await settle();
    expect(view.tracker().unsaved).toHaveLength(1);

    act(() => view.tracker().retryUnsaved());
    await waitFor(() => expect(view.tracker().unsaved).toEqual([]));
    expect(view.tracker().lastLogged).toMatchObject({ durationSeconds: 40 });
  });
});

describe('a keepalive log on a page that lives on', () => {
  it('tells the caches once it is in', async () => {
    const view = renderTracker();
    view.cacheEmptyHistory();
    view.queryClient.setQueryData(loopKeys.practice(USER), []);
    view.playOn(40);

    setVisibility('hidden');

    await waitFor(() =>
      expect(view.cachedHistory()).toEqual([
        expect.objectContaining({ id: keptAlive()[0]!.id, duration_seconds: 40 }),
      ]),
    );
    expect(view.isInvalidated(loopKeys.practice(USER))).toBe(true);
    expect(logged()).toEqual([]);
  });

  it('is dropped quietly when the loop has been deleted: not sent again, not shown, not cached', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: '23503', message: 'violates foreign key constraint' }), {
        status: 409,
      }),
    );
    const view = renderTracker();
    view.cacheEmptyHistory();
    view.playOn(40);

    setVisibility('hidden');

    // The refusal has arrived and been read before anything is said about what did not follow it.
    expect(keptAlive()).toHaveLength(1);
    await settle();
    expect(keptAlive()).toHaveLength(1);
    expect(logged()).toEqual([]);
    expect(view.tracker().lastLogged).toBeNull();
    expect(view.tracker().unsaved).toEqual([]);
    expect(view.cachedHistory()).toEqual([]);
  });

  // Unit 13 Test (09 QA issue 7): the keepalive path reads the loops again too, as the mutation does.
  it('reads the loops again when the loop has gone, so the page stops showing it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: '23503', message: 'violates foreign key constraint' }), {
        status: 409,
      }),
    );
    const view = renderTracker();
    const forSong = loopKeys.forSong(USER, 'song-1');
    view.queryClient.setQueryData(loopKeys.practice(USER), []);
    view.queryClient.setQueryData(forSong, []);
    view.queryClient.setQueryData(songKeys.forUser(USER), []);
    view.playOn(40);

    setVisibility('hidden');

    await waitFor(() => expect(view.isInvalidated(loopKeys.practice(USER))).toBe(true));
    expect(view.isInvalidated(forSong)).toBe(true);
    expect(view.isInvalidated(songKeys.forUser(USER))).toBe(false);
    expect(keptAlive()).toHaveLength(1);
    expect(logged()).toEqual([]);
  });

  it('any other refusal is sent again through the app, and a second failure is kept for Try again', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    queryResult.mockResolvedValueOnce(offline);
    const view = renderTracker();
    view.playOn(40);

    setVisibility('hidden');

    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    expect(view.tracker().unsaved[0]!.id).toBe(keptAlive()[0]!.id);
    expect(logged()).toHaveLength(1);
  });
});

describe('a keepalive log still on its way', () => {
  it('counts as an unsent write until it is answered, through its fallback too', async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    let landLog!: (result: FakeResult) => void;
    queryResult.mockReturnValueOnce(new Promise<FakeResult>((resolve) => (landLog = resolve)));
    const view = renderTracker();
    const unsent = renderHook(() => useHasUnsentWrites(USER), {
      wrapper: wrapperFor(view.queryClient, signedInAs(USER)),
    });
    expect(hasUnsentWrites(view.queryClient, USER)).toBe(false);
    view.playOn(40);

    setVisibility('hidden');
    expect(keptAlive()).toHaveLength(1);
    // Back on show before the keepalive's answer: Sign out must still wait.
    setVisibility('visible');
    expect(hasUnsentWrites(view.queryClient, USER)).toBe(true);
    await waitFor(() => expect(unsent.result.current).toBe(true));

    // It failed: the same record goes through the mutation, still unsent.
    await act(async () => answer(new Response('{}', { status: 401 })));
    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(hasUnsentWrites(view.queryClient, USER)).toBe(true);
    expect(unsent.result.current).toBe(true);

    await act(async () => landLog(ok));
    await waitFor(() => expect(unsent.result.current).toBe(false));
    expect(hasUnsentWrites(view.queryClient, USER)).toBe(false);
  });
});

describe('a keepalive log answered after the screen has gone', () => {
  it('is sent again without the hook when it failed, and the caches hear of it', async () => {
    let refuse!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (refuse = resolve)));
    const view = renderTracker();
    // Collected at once when nothing holds it, so a mutation left in the cache is one that is held.
    view.queryClient.setDefaultOptions({ mutations: { retry: false, gcTime: 10 } });
    view.cacheEmptyHistory();
    view.playOn(40);
    setVisibility('hidden');
    expect(keptAlive()).toHaveLength(1);

    // Back on show, then off to another route before the answer.
    setVisibility('visible');
    view.pause();
    view.hook.unmount();
    refuse(new Response('{}', { status: 401 }));

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]!.id).toBe(keptAlive()[0]!.id);
    await waitFor(() =>
      expect(view.cachedHistory()).toEqual([expect.objectContaining({ duration_seconds: 40 })]),
    );
    // Run from the cache and collected like any mutation, not held for good by the dead screen's observer.
    await waitFor(() => expect(view.queryClient.getMutationCache().getAll()).toEqual([]));
  });
});

describe('a page that comes back from the back/forward cache', () => {
  it('carries on as a new session after the one pagehide ended', async () => {
    const view = renderTracker();
    view.playOn(40);
    firePageEvent('pagehide');
    expect(keptAlive()).toHaveLength(1);

    // An hour in the cache, then back with the player as it was.
    view.seconds(3600);
    firePageEvent('pageshow');
    view.seconds(35);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      started_at: '2026-11-23T19:00:40.000Z',
      duration_seconds: 35,
    });
    expect(logged()[0]!.id).not.toBe(keptAlive()[0]!.id);
  });

  it('pagehide while paused drops a short session for good', async () => {
    const view = renderTracker();
    view.playFor(20);
    firePageEvent('pagehide');
    firePageEvent('pageshow');

    view.playFor(15);
    // 15 s on their own, not 35 with what was left behind. The next stop proves the tracker is live.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toEqual([]);
    view.playFor(15);

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({
      started_at: '2026-11-23T18:00:20.000Z',
      duration_seconds: 30,
    });
  });
});

describe('with effects run twice (StrictMode)', () => {
  it('logs nothing at mount, and one session for one stretch of practice', async () => {
    const view = renderTracker('loop-a', { strict: true });
    expect(logged()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    view.playFor(40);

    await waitFor(() => expect(view.tracker().lastLogged).not.toBeNull());
    expect(logged()).toHaveLength(1);
    expect(logged()[0]).toMatchObject({ duration_seconds: 40 });
  });

  it('counts each pass once', async () => {
    const view = renderTracker('loop-a', { strict: true });
    view.loopBars5To8();
    view.play();
    view.finishPasses(3);
    view.seconds(40);
    view.pause();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ repeats: 3 });
  });

  it('sends one keepalive on pagehide, and one log when the screen goes', async () => {
    const hidden = renderTracker('loop-a', { strict: true });
    hidden.playOn(40);
    firePageEvent('pagehide');
    expect(keptAlive()).toHaveLength(1);
    hidden.hook.unmount();
    fetchMock.mockClear();

    const left = renderTracker('loop-a', { strict: true });
    left.playOn(45);
    left.hook.unmount();

    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ duration_seconds: 45 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('offline (Unit 11)', () => {
  const goOffline = () => act(() => onlineManager.setOnline(false));
  const goOnline = () => act(() => onlineManager.setOnline(true));
  const queued = async () => (await outboxEntries(USER)).map((entry) => entry.id);
  const dropped: FakeResult = {
    data: null,
    error: { message: 'TypeError: Failed to fetch', code: '' },
  };

  it('a stop offline sends nothing, keeps the session on the device and says it waits; back online it is logged once', async () => {
    const view = renderTracker();
    goOffline();
    view.playFor(45);

    await waitFor(() => expect(view.tracker().waiting).toHaveLength(1));
    const id = view.tracker().waiting[0]!.id;
    await waitFor(async () => expect(await queued()).toEqual([id]));
    await settle();
    expect(logged()).toEqual([]);
    expect(view.tracker().unsaved).toEqual([]);

    goOnline();
    await waitFor(() => expect(view.tracker().lastLogged?.id).toBe(id));
    expect(logged().map((row) => row.id)).toEqual([id]);
    expect(view.tracker().waiting).toEqual([]);
    await waitFor(async () => expect(await queued()).toEqual([]));
  });

  it('a page hidden offline tries no keepalive (it could only fail): the session waits for the connection', async () => {
    const view = renderTracker();
    view.playOn(40);
    goOffline();

    firePageEvent('pagehide');
    setVisibility('hidden');
    await waitFor(async () => expect(await queued()).toHaveLength(1));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toEqual([]);

    goOnline();
    await waitFor(() => expect(logged()).toHaveLength(1));
    expect(logged()[0]).toMatchObject({ loop_id: 'loop-a', duration_seconds: 40 });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(async () => expect(await queued()).toEqual([]));
  });

  it('a session waiting offline when the screen goes is still logged, once, when the connection is back', async () => {
    const view = renderTracker();
    view.cacheEmptyHistory();
    goOffline();
    view.playFor(45);
    await waitFor(() => expect(view.tracker().waiting).toHaveLength(1));

    view.hook.unmount();
    // renderHook's unmount takes the QueryClientProvider too; in the app it stays (the
    // signed-in layout), still listening for the connection.
    view.queryClient.mount();
    await settle();
    expect(logged()).toEqual([]);

    goOnline();
    await waitFor(() => expect(logged()).toHaveLength(1));
    await waitFor(() =>
      expect(view.cachedHistory()).toEqual([
        expect.objectContaining({ loop_id: 'loop-a', duration_seconds: 45 }),
      ]),
    );
    await settle();
    expect(logged()).toHaveLength(1);
    view.queryClient.unmount();
  });

  it('is in the outbox before the keepalive leaves, and out of it once the keepalive is in', async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const view = renderTracker();
    view.playOn(40);

    firePageEvent('pagehide');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const id = keptAlive()[0]!.id as string;
    await waitFor(async () => expect(await queued()).toEqual([id]));

    answer(new Response(null, { status: 201 }));
    await waitFor(async () => expect(await queued()).toEqual([]));
    expect(logged()).toEqual([]);
    expect(view.tracker().lastLogged?.id).toBe(id);
  });

  it('a request the connection dropped is sent again by itself, the same session, and never offered as "Try again"', async () => {
    queryResult.mockResolvedValueOnce(dropped).mockResolvedValue(ok);
    const view = renderTracker();
    view.playFor(45);

    await waitFor(() => expect(view.tracker().lastLogged).not.toBeNull(), { timeout: 3000 });
    expect(view.tracker().unsaved).toEqual([]);
    const ids = logged().map((row) => row.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });
});

// Unit 20 Test (13.23): supabase-js lost its session (a refresh that found no connection),
// the session still stored. A log must wait, not go out as anon and be dropped as refused.
describe('with no session in memory, one still stored (Unit 20)', () => {
  const queued = async () => (await outboxEntries(USER)).map((entry) => entry.id);
  const permissionDenied: FakeResult = {
    data: null,
    error: { message: 'permission denied for table practice_sessions', code: '42501' },
  };
  const asked = () => fakeSupabase.auth.getSession.mock.calls.length;

  /** The next `tries` sends find no session; after that it is back. */
  function sessionLost(tries = 1) {
    localStorage.setItem(FAKE_AUTH_STORAGE_KEY, JSON.stringify(fakeSession(USER)));
    for (let count = 0; count < tries; count++) {
      fakeSupabase.auth.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: new AuthRetryableFetchError('Failed to fetch', 0),
      });
    }
  }

  it('a stop sends nothing and offers no "Try again"; the session waits on the device and is logged once when the session is back', async () => {
    sessionLost();
    const view = renderTracker();
    const unsent = renderHook(() => useHasUnsentWrites(USER), {
      wrapper: wrapperFor(view.queryClient, signedInAs(USER)),
    });
    view.playFor(45);

    await waitFor(() => expect(asked()).toBe(1));
    await settle();
    expect(logged()).toEqual([]);
    expect(view.tracker().unsaved).toEqual([]);
    expect(view.tracker().waiting).toHaveLength(1);
    const id = view.tracker().waiting[0]!.id;
    expect(await queued()).toEqual([id]);
    // Sign out would empty the device of it.
    expect(hasUnsentWrites(view.queryClient, USER)).toBe(true);
    expect(unsent.result.current).toBe(true);

    await waitFor(() => expect(view.tracker().lastLogged?.id).toBe(id), { timeout: 3000 });
    expect(logged().map((row) => row.id)).toEqual([id]);
    expect(view.tracker().unsaved).toEqual([]);
    expect(view.tracker().waiting).toEqual([]);
    await waitFor(async () => expect(await queued()).toEqual([]));
    await waitFor(() => expect(unsent.result.current).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a hidden page: the keepalive with the stale token is refused, and its fallback waits instead of going out as anon', async () => {
    // The token the page holds is the stored, expired one: the server answers 401.
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    sessionLost();
    const view = renderTracker();
    view.playOn(40);

    setVisibility('hidden');
    await waitFor(() => expect(asked()).toBe(1));
    await settle();
    const id = keptAlive()[0]!.id as string;
    expect(logged()).toEqual([]);
    expect(view.tracker().unsaved).toEqual([]);
    expect(await queued()).toEqual([id]);

    // TanStack Query holds a retry while the page is hidden; in a browser the event
    // reaches the window, where it listens.
    setVisibility('visible');
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(logged()).toHaveLength(1), { timeout: 3000 });
    expect(logged()[0]!.id).toBe(id);
    await waitFor(async () => expect(await queued()).toEqual([]));
    expect(view.tracker().unsaved).toEqual([]);
    expect(keptAlive()).toHaveLength(1);
  });

  it('a session that ends as the screen goes is held the same way, and logged once', async () => {
    sessionLost();
    const view = renderTracker();
    view.cacheEmptyHistory();
    view.playOn(45);
    view.hook.unmount();

    await waitFor(() => expect(asked()).toBe(1));
    await settle();
    expect(logged()).toEqual([]);
    expect(await queued()).toHaveLength(1);

    await waitFor(() => expect(logged()).toHaveLength(1), { timeout: 3000 });
    await waitFor(() =>
      expect(view.cachedHistory()).toEqual([expect.objectContaining({ duration_seconds: 45 })]),
    );
    await waitFor(async () => expect(await queued()).toEqual([]));
    await settle();
    expect(logged()).toHaveLength(1);
  });

  it('a 42501 with a session in memory is a real refusal: sent once, kept for "Try again", out of the outbox', async () => {
    localStorage.setItem(FAKE_AUTH_STORAGE_KEY, JSON.stringify(fakeSession(USER)));
    queryResult.mockResolvedValueOnce(permissionDenied);
    const view = renderTracker();
    view.playFor(45);

    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    expect(logged()).toHaveLength(1);
    expect(view.tracker().waiting).toEqual([]);
    expect(view.tracker().lastLogged).toBeNull();
    await waitFor(async () => expect(await queued()).toEqual([]));
    await settle();
    expect(logged()).toHaveLength(1);
  });
});

// Unit 20 Test (14.6): one session id can be queued again while the removal of its last
// entry is still on its way: a keepalive that failed, its fallback refused, then "Try again"
// pressed twice. The second press's entry must stay this page's, or a replay sends it too.
describe('a session queued again while its last outbox removal is on its way (Unit 20)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stays claimed by this page: a replay mounted meanwhile sends nothing, and it is logged by its own retry', async () => {
    const refused: FakeResult = { data: null, error: { message: 'nope', code: '23514' } };
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    queryResult.mockResolvedValueOnce(refused);
    const view = renderTracker();
    view.playOn(40);
    setVisibility('hidden');
    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    setVisibility('visible');
    const id = keptAlive()[0]!.id as string;
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));

    // First "Try again": refused again. Its row is deleted; the removal hasn't finished.
    const realDelete = offlineDb.outbox.delete.bind(offlineDb.outbox);
    let finishRemoval!: () => void;
    const removalHeld = new Promise<void>((resolve) => (finishRemoval = resolve));
    const deleting = vi.spyOn(offlineDb.outbox, 'delete').mockImplementationOnce(((key: string) =>
      (async () => {
        await realDelete(key);
        await removalHeld;
      })()) as never);
    queryResult.mockResolvedValueOnce(refused);
    act(() => view.tracker().retryUnsaved());
    await waitFor(() => expect(deleting).toHaveBeenCalledWith(id));
    expect(logged()).toHaveLength(2);

    // Second "Try again", before that removal is done: queued again, its answer on its way.
    const second = heldAnswer();
    queryResult.mockReturnValueOnce(second.promise);
    act(() => view.tracker().retryUnsaved());
    await waitFor(() => expect(logged()).toHaveLength(3));
    expect((await outboxEntries(USER)).map((entry) => entry.id)).toEqual([id]);
    await act(async () => finishRemoval());
    await settle();

    renderHook(() => useOutboxReplay(), {
      wrapper: wrapperFor(view.queryClient, signedInAs(USER)),
      reactStrictMode: true,
    });
    await settle();
    expect(logged()).toHaveLength(3);
    expect((await outboxEntries(USER)).map((entry) => entry.id)).toEqual([id]);

    await act(async () => second.answer(ok));
    await waitFor(() => expect(view.tracker().lastLogged?.id).toBe(id));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    expect(logged().map((row) => row.id)).toEqual([id, id, id]);
  });
});

// Copilot review on #37: "Try again" pressed twice sends one session id twice at once. The
// send answered first must leave the outbox row to the one still on its way, whichever of
// the two that is, or a page closed then has nothing to send again.
describe('two sends of one session at once (Unit 20, Copilot review)', () => {
  const refused: FakeResult = { data: null, error: { message: 'nope', code: '23514' } };

  /** A refused session, then "Try again" twice with both answers held: the first and second send. */
  async function twoRetriesOnTheirWay() {
    queryResult.mockResolvedValueOnce(refused);
    const view = renderTracker();
    view.playFor(40);
    await waitFor(() => expect(view.tracker().unsaved).toHaveLength(1));
    const id = view.tracker().unsaved[0]!.id;
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));

    const first = heldAnswer();
    const second = heldAnswer();
    queryResult.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => {
      view.tracker().retryUnsaved();
      view.tracker().retryUnsaved();
    });
    await waitFor(() => expect(logged()).toHaveLength(3));
    expect((await outboxEntries(USER)).map((entry) => entry.id)).toEqual([id]);
    return { view, id, first, second };
  }

  it.each([
    { answeredFirst: 'first', stillOnItsWay: 'second' },
    { answeredFirst: 'second', stillOnItsWay: 'first' },
  ] as const)(
    'the $answeredFirst refused leaves the row for the $stillOnItsWay, which no replay takes and which then lands',
    async ({ answeredFirst, stillOnItsWay }) => {
      const sends = await twoRetriesOnTheirWay();
      const { view, id } = sends;

      await act(async () => sends[answeredFirst].answer(refused));
      await settle();
      // Still on the device, for the send that has no answer yet.
      expect((await outboxEntries(USER)).map((entry) => entry.id)).toEqual([id]);

      // And still this page's: a replay mounted now leaves it to that send.
      renderHook(() => useOutboxReplay(), {
        wrapper: wrapperFor(view.queryClient, signedInAs(USER)),
        reactStrictMode: true,
      });
      await settle();
      expect(logged()).toHaveLength(3);

      await act(async () => sends[stillOnItsWay].answer(ok));
      await waitFor(() => expect(view.tracker().lastLogged?.id).toBe(id));
      await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
      expect(view.tracker().unsaved).toEqual([]);
      expect(logged().map((row) => row.id)).toEqual([id, id, id]);
    },
  );
});
