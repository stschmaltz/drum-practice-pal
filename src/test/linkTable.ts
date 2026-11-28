/**
 * A saved song link and an in-memory song_links table for the fake Supabase
 * client (Unit 14), like `loopTable` for loops: it answers the list, insert,
 * update and delete the app sends the way PostgREST would.
 */
import type { SongLinkRow } from '@/features/recordings/songLinkForm';
import { opArgs, queryResult, type FakeResult, type QueryCall } from './fakeSupabase';

export const LINK_SONG_ID = '11111111-1111-4111-8111-111111111111';
export const VIDEO_ID = 'dQw4w9WgXcQ';
export const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
export const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?playsinline=1&rel=0`;
export const SPOTIFY_URL = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

export function linkRow(id: string, overrides: Partial<SongLinkRow> = {}): SongLinkRow {
  return {
    id,
    song_id: LINK_SONG_ID,
    kind: 'other',
    provider: 'web',
    url: `https://example.com/${id}`,
    created_at: '2026-11-21T12:00:00Z',
    ...overrides,
  };
}

/** A YouTube link saved as the song's Original (or another kind). */
export const videoLink = (id = 'link-original', overrides: Partial<SongLinkRow> = {}) =>
  linkRow(id, { kind: 'original', provider: 'youtube', url: WATCH_URL, ...overrides });

/** A Spotify link saved as the song's Drumless (or another kind). */
export const spotifyLink = (id = 'link-drumless', overrides: Partial<SongLinkRow> = {}) =>
  linkRow(id, { kind: 'drumless', provider: 'spotify', url: SPOTIFY_URL, ...overrides });

type LinkQueryMethod = 'select' | 'insert' | 'update' | 'delete';
const LINK_WRITES = ['insert', 'update', 'delete'] as const;

const duplicate: FakeResult = {
  data: null,
  error: { message: 'duplicate key value violates unique constraint', code: '23505' },
};

/**
 * Pass a song_links query to `answer`. Tests read `rows()` to see what is
 * saved and `sent(method)` for the payloads. `failNext(method, error)` makes
 * the next such query fail; `holdNext(method)` keeps it pending until the
 * returned function is called; `loseNext(method)` carries it out and then
 * answers as a dropped connection. `setRows` changes the table as another
 * device would.
 */
export function linkTable(initial: SongLinkRow[] = []) {
  let rows = initial;
  const failures = new Map<LinkQueryMethod, NonNullable<FakeResult['error']>>();
  const lost = new Set<LinkQueryMethod>();
  const gates = new Map<LinkQueryMethod, Promise<void>>();
  const filter = (call: QueryCall, method: string, column: string) =>
    call.ops.find((op) => op.method === method && op.args[0] === column)?.args[1];

  async function answer(call: QueryCall): Promise<FakeResult> {
    const method = LINK_WRITES.find((write) => opArgs(call, write)) ?? 'select';
    const gate = gates.get(method);
    if (gate) {
      gates.delete(method);
      await gate;
    }
    const failed = failures.get(method);
    if (failed) {
      failures.delete(method);
      return { data: null, error: failed };
    }
    const result = carryOut(call, method);
    if (!lost.delete(method)) return result;
    return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
  }

  function carryOut(call: QueryCall, method: LinkQueryMethod): FakeResult {
    if (method === 'insert') {
      const inserted = opArgs(call, 'insert')?.[0] as SongLinkRow;
      if (rows.some((row) => row.id === inserted.id)) return duplicate;
      // The partial unique index: one Original and one Drumless per song.
      const taken = rows.some(
        (row) =>
          row.song_id === inserted.song_id && row.kind === inserted.kind && row.kind !== 'other',
      );
      if (taken) return duplicate;
      const row = linkRow(inserted.id, {
        song_id: inserted.song_id,
        kind: inserted.kind,
        provider: inserted.provider,
        url: inserted.url,
        // The database stamps its own "now": later than every row a test starts with.
        created_at: new Date(Date.UTC(2026, 10, 27, 12, 0, rows.length)).toISOString(),
      });
      rows = [...rows, row];
      return { data: null, error: null };
    }
    if (method === 'update') {
      const id = filter(call, 'eq', 'id');
      const changes = opArgs(call, 'update')?.[0] as Partial<SongLinkRow>;
      const found = rows.some((row) => row.id === id);
      rows = rows.map((row) => (row.id === id ? { ...row, ...changes } : row));
      // `.select('id').maybeSingle()` after an update: the row's id, or nothing.
      return { data: found ? { id } : null, error: null };
    }
    if (method === 'delete') {
      const ids = filter(call, 'in', 'id') as string[];
      rows = rows.filter((row) => !ids.includes(row.id));
      return { data: null, error: null };
    }
    return {
      data: rows.filter((row) => row.song_id === filter(call, 'eq', 'song_id')),
      error: null,
    };
  }

  return {
    answer,
    rows: () => rows,
    setRows: (next: SongLinkRow[]) => {
      rows = next;
    },
    failNext: (
      method: LinkQueryMethod,
      error: NonNullable<FakeResult['error']> = { message: 'refused', code: '42501' },
    ) => {
      failures.set(method, error);
    },
    loseNext: (method: LinkQueryMethod) => {
      lost.add(method);
    },
    holdNext: (method: LinkQueryMethod) => {
      let release!: () => void;
      gates.set(method, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    /** What every `method` write sent so far carried: a payload, or the ids of a delete. */
    sent: (method: (typeof LINK_WRITES)[number]) =>
      queryResult.mock.calls
        .map(([call]) => call)
        .filter((call) => call.table === 'song_links' && opArgs(call, method))
        .map((call) =>
          method === 'delete' ? filter(call, 'in', 'id') : opArgs(call, method)?.[0],
        ),
  };
}

export type LinkTable = ReturnType<typeof linkTable>;
