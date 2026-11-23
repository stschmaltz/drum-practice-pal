/**
 * Shared setup for the loop component and hook tests (Unit 08): a saved loop
 * row, and a real PlayerService over a FakePlayerEngine with the tempo-change
 * fixture's tempos loaded, so BPM and ranges are worked out by the service
 * and not by the test.
 */
import { useSyncExternalStore } from 'react';
import type { Loop } from '@/features/loops/loopForm';
import { DEFAULT_PLAYER_OPTIONS } from '@/features/player/playerOptions';
import { PlayerService, type PlayerSnapshot } from '@/features/player/PlayerService';
import type { WakeLockControl } from '@/features/player/wakeLock';
import {
  FakeClickOutput,
  FakePlayerEngine,
  TEMPO_CHANGE_BAR_TEMPOS,
  TICKS_PER_BAR,
} from './fakePlayerEngine';
import { opArgs, queryResult, type FakeResult, type QueryCall } from './fakeSupabase';

export const LOOP_SONG_ID = 'song-1';

export function loopRow(id: string, overrides: Partial<Loop> = {}): Loop {
  return {
    id,
    song_id: LOOP_SONG_ID,
    name: `Loop ${id}`,
    start_bar: 5,
    end_bar: 8,
    speed_ratio: 1,
    target_ratio: null,
    status: 'active',
    last_practiced_at: null,
    created_at: '2026-11-21T12:00:00Z',
    ...overrides,
  };
}

/** Bar `barNumber`'s start tick in a 4/4 song played straight through. */
export const startOfBar = (barNumber: number) => (barNumber - 1) * TICKS_PER_BAR;

/**
 * A player over a fake engine: 16 bars, 120 BPM for bars 1 to 8 and 90 from
 * bar 9, like the tempo-change fixture. `loaded: false` leaves the song loading.
 */
export function loopPlayer({ loaded = true }: { loaded?: boolean } = {}) {
  const engine = new FakePlayerEngine();
  const wakeLock = { setActive: vi.fn(), dispose: vi.fn() } satisfies WakeLockControl;
  const player = new PlayerService(engine, {
    drumTrackIndex: 0,
    wakeLock,
    unlockAudio: vi.fn(),
    clicks: new FakeClickOutput(),
    options: DEFAULT_PLAYER_OPTIONS,
  });
  player.load(new Uint8Array([1]));
  const finishLoading = () =>
    engine.finishLoading({ barCount: 16, barTempos: TEMPO_CHANGE_BAR_TEMPOS });
  if (loaded) finishLoading();
  return { engine, player, finishLoading };
}

/** The player's snapshot as React state, the way usePlayer hands it to a screen. */
export function usePlayerSnapshot(player: PlayerService): PlayerSnapshot {
  return useSyncExternalStore(player.subscribe, player.getSnapshot);
}

/**
 * Answers every loops query from an in-memory table the way PostgREST would
 * (list, insert, update, delete), through fakeSupabase's `queryResult`. Tests
 * read `rows()` to see what was saved and `sent(method)` for the payloads.
 * `failNext(method, message)` makes the next such query fail; `holdNext(method)`
 * keeps it pending.
 */
export function serveLoopTable(initial: Loop[] = []) {
  let rows = initial;
  const failures = new Map<string, string>();
  const gates = new Map<string, Promise<void>>();
  const eq = (call: QueryCall, column: string) =>
    call.ops.find((op) => op.method === 'eq' && op.args[0] === column)?.args[1];
  const failure = (method: string): FakeResult | null => {
    const message = failures.get(method);
    if (message === undefined) return null;
    failures.delete(method);
    return { data: null, error: { message } };
  };

  queryResult.mockImplementation(async (call) => {
    if (call.table !== 'loops') return { data: null, error: null };
    const method = (['insert', 'update', 'delete'] as const).find((m) => opArgs(call, m));
    const gate = gates.get(method ?? 'select');
    if (gate) {
      gates.delete(method ?? 'select');
      await gate;
    }
    const inserted = opArgs(call, 'insert')?.[0] as Partial<Loop> | undefined;
    if (inserted) {
      const failed = failure('insert');
      if (failed) return failed;
      const row = loopRow(inserted.id ?? 'new', inserted);
      rows = [...rows, row];
      return { data: row, error: null };
    }
    const changes = opArgs(call, 'update')?.[0] as Partial<Loop> | undefined;
    if (changes) {
      const failed = failure('update');
      if (failed) return failed;
      rows = rows.map((row) => (row.id === eq(call, 'id') ? { ...row, ...changes } : row));
      return { data: rows.find((row) => row.id === eq(call, 'id')) ?? null, error: null };
    }
    if (opArgs(call, 'delete')) {
      const failed = failure('delete');
      if (failed) return failed;
      rows = rows.filter((row) => row.id !== eq(call, 'id'));
      return { data: null, error: null };
    }
    const failed = failure('select');
    if (failed) return failed;
    return { data: rows.filter((row) => row.song_id === eq(call, 'song_id')), error: null };
  });

  return {
    rows: () => rows,
    /** As another device would: changes the table without this client knowing. */
    setRows: (next: Loop[]) => {
      rows = next;
    },
    failNext: (method: 'select' | 'insert' | 'update' | 'delete', message: string) => {
      failures.set(method, message);
    },
    /** Holds the next such query until the returned function is called, to see the pending state. */
    holdNext: (method: 'select' | 'insert' | 'update' | 'delete') => {
      let release!: () => void;
      gates.set(method, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    /** The payloads of every `method` write sent so far. */
    sent: (method: 'insert' | 'update' | 'delete') =>
      queryResult.mock.calls
        .map(([call]) => call)
        .filter((call) => call.table === 'loops' && opArgs(call, method))
        .map((call) => opArgs(call, method)?.[0]),
  };
}
