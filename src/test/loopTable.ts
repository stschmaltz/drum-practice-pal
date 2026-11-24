/**
 * A saved loop row and an in-memory loops table for the fake Supabase client
 * (Unit 08), shared by the loop tests and the song page's.
 */
import type { Loop } from '@/features/loops/loopForm';
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
    finished_at: null,
    last_practiced_at: null,
    created_at: '2026-11-21T12:00:00Z',
    ...overrides,
  };
}

type LoopQueryMethod = 'select' | 'insert' | 'update' | 'delete';
const LOOP_WRITES = ['insert', 'update', 'delete'] as const;

/**
 * A loops table that answers queries the way PostgREST would (list, insert,
 * update, delete). Pass a loops query to `answer`; a test whose client serves
 * only loops uses `serveLoopTable` instead. Tests read `rows()` to see what
 * was saved and `sent(method)` for the payloads. `failNext(method, message)`
 * makes the next such query fail; `holdNext(method)` keeps it pending.
 */
export function loopTable(initial: Loop[] = []) {
  let rows = initial;
  const failures = new Map<LoopQueryMethod, string>();
  const gates = new Map<LoopQueryMethod, Promise<void>>();
  const eq = (call: QueryCall, column: string) =>
    call.ops.find((op) => op.method === 'eq' && op.args[0] === column)?.args[1];
  const failure = (method: LoopQueryMethod): FakeResult | null => {
    const message = failures.get(method);
    if (message === undefined) return null;
    failures.delete(method);
    return { data: null, error: { message } };
  };

  async function answer(call: QueryCall): Promise<FakeResult> {
    const method = LOOP_WRITES.find((write) => opArgs(call, write)) ?? 'select';
    const gate = gates.get(method);
    if (gate) {
      gates.delete(method);
      await gate;
    }
    const failed = failure(method);
    if (failed) return failed;

    if (method === 'insert') {
      const inserted = opArgs(call, 'insert')?.[0] as Partial<Loop>;
      const row = loopRow(inserted.id ?? 'new', inserted);
      rows = [...rows, row];
      return { data: row, error: null };
    }
    if (method === 'update') {
      const changes = opArgs(call, 'update')?.[0] as Partial<Loop>;
      rows = rows.map((row) => (row.id === eq(call, 'id') ? { ...row, ...changes } : row));
      return { data: rows.find((row) => row.id === eq(call, 'id')) ?? null, error: null };
    }
    if (method === 'delete') {
      rows = rows.filter((row) => row.id !== eq(call, 'id'));
      return { data: null, error: null };
    }
    return { data: rows.filter((row) => row.song_id === eq(call, 'song_id')), error: null };
  }

  return {
    answer,
    rows: () => rows,
    /** As another device would: changes the table without this client knowing. */
    setRows: (next: Loop[]) => {
      rows = next;
    },
    failNext: (method: LoopQueryMethod, message: string) => {
      failures.set(method, message);
    },
    /** Holds the next such query until the returned function is called, to see the pending state. */
    holdNext: (method: LoopQueryMethod) => {
      let release!: () => void;
      gates.set(method, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    /** The payloads of every `method` write sent so far. */
    sent: (method: (typeof LOOP_WRITES)[number]) =>
      queryResult.mock.calls
        .map(([call]) => call)
        .filter((call) => call.table === 'loops' && opArgs(call, method))
        .map((call) => opArgs(call, method)?.[0]),
  };
}

export type LoopTable = ReturnType<typeof loopTable>;

/** A `loopTable` behind fakeSupabase's `queryResult`, for tests that query nothing but loops. */
export function serveLoopTable(initial: Loop[] = []): LoopTable {
  const table = loopTable(initial);
  queryResult.mockImplementation(async (call) =>
    call.table === 'loops' ? table.answer(call) : { data: null, error: null },
  );
  return table;
}
