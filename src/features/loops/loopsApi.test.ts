import { PAGE_SIZE } from '@/lib/fetchAllPages';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  type FakeResult,
  type QueryCall,
} from '@/test/fakeSupabase';
import { LOOP_SELECT, type Loop, type NewLoop } from './loopForm';
import { createLoop, deleteLoop, fetchLoops, updateLoop } from './loopsApi';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const USER = 'user-1';
const SONG = 'song-1';

const loop = (id: string, overrides: Partial<Loop> = {}): Loop => ({
  id,
  song_id: SONG,
  name: `Loop ${id}`,
  start_bar: 5,
  end_bar: 8,
  speed_ratio: 1,
  target_ratio: null,
  status: 'active',
  last_practiced_at: null,
  created_at: '2026-11-20T10:00:00Z',
  ...overrides,
});

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string, code?: string): FakeResult => ({
  data: null,
  error: { message, code },
});

const calls = () => queryResult.mock.calls.map(([call]) => call);
const eqs = (call: QueryCall) =>
  call.ops.filter((op) => op.method === 'eq').map((op) => op.args as [string, unknown]);

beforeEach(() => {
  resetFakeSupabase();
});

describe('fetchLoops', () => {
  it("reads the song's loops, scoped to the user, in a total order", async () => {
    queryResult.mockResolvedValueOnce(ok([loop('a'), loop('b')]));

    expect(await fetchLoops(USER, SONG)).toEqual([loop('a'), loop('b')]);

    const [call] = calls();
    expect(call!.table).toBe('loops');
    expect(opArgs(call!, 'select')).toEqual([LOOP_SELECT]);
    expect(eqs(call!)).toEqual([
      ['user_id', USER],
      ['song_id', SONG],
    ]);
    expect(call!.ops.filter((op) => op.method === 'order').map((op) => op.args[0])).toEqual([
      'created_at',
      'id',
    ]);
    expect(opArgs(call!, 'range')).toEqual([0, PAGE_SIZE - 1]);
  });

  it('reads every page, not only the first', async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => loop(`p1-${i}`));
    queryResult.mockResolvedValueOnce(ok(fullPage)).mockResolvedValueOnce(ok([loop('last')]));

    const loops = await fetchLoops(USER, SONG);

    expect(loops).toHaveLength(PAGE_SIZE + 1);
    expect(loops.at(-1)?.id).toBe('last');
    expect(opArgs(calls()[1]!, 'range')).toEqual([PAGE_SIZE, PAGE_SIZE * 2 - 1]);
  });

  it('throws when a page fails, instead of returning what it has', async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => loop(`p1-${i}`));
    queryResult.mockResolvedValueOnce(ok(fullPage)).mockResolvedValueOnce(fail('timeout'));
    await expect(fetchLoops(USER, SONG)).rejects.toMatchObject({ message: 'timeout' });
  });
});

describe('createLoop', () => {
  const newLoop: NewLoop = {
    id: 'new-id',
    song_id: SONG,
    name: 'Chorus fill',
    start_bar: 5,
    end_bar: 8,
    speed_ratio: 0.708333,
    target_ratio: 1,
  };

  it('inserts the loop for the user and returns the saved row', async () => {
    const saved = loop('new-id', { name: 'Chorus fill', speed_ratio: 0.708333, target_ratio: 1 });
    queryResult.mockResolvedValueOnce(ok(saved));

    expect(await createLoop(USER, newLoop)).toEqual(saved);

    const [call] = calls();
    expect(call!.table).toBe('loops');
    expect(opArgs(call!, 'insert')).toEqual([{ ...newLoop, user_id: USER }]);
    expect(opArgs(call!, 'select')).toEqual([LOOP_SELECT]);
  });

  it('sends only columns a client may write', async () => {
    queryResult.mockResolvedValueOnce(ok(loop('new-id')));
    await createLoop(USER, newLoop);
    const [row] = opArgs(calls()[0]!, 'insert') as [Record<string, unknown>];
    expect(Object.keys(row).sort()).toEqual(
      [
        'end_bar',
        'id',
        'name',
        'song_id',
        'speed_ratio',
        'start_bar',
        'target_ratio',
        'user_id',
      ].sort(),
    );
  });

  it('throws the database error', async () => {
    queryResult.mockResolvedValueOnce(fail('end_bar 20 is past the last bar', '23514'));
    await expect(createLoop(USER, newLoop)).rejects.toMatchObject({ code: '23514' });
  });

  it('throws when no row comes back', async () => {
    queryResult.mockResolvedValueOnce(ok(null));
    await expect(createLoop(USER, newLoop)).rejects.toThrow('No loop returned');
  });
});

describe('updateLoop', () => {
  it('sends only the changes, scoped to the loop and the user', async () => {
    const saved = loop('a', { speed_ratio: 0.9 });
    queryResult.mockResolvedValueOnce(ok(saved));

    expect(await updateLoop(USER, 'a', { speed_ratio: 0.9 })).toEqual(saved);

    const [call] = calls();
    expect(opArgs(call!, 'update')).toEqual([{ speed_ratio: 0.9 }]);
    expect(eqs(call!)).toEqual([
      ['id', 'a'],
      ['user_id', USER],
    ]);
    expect(opArgs(call!, 'select')).toEqual([LOOP_SELECT]);
  });

  it('throws the database error', async () => {
    queryResult.mockResolvedValueOnce(fail('permission denied', '42501'));
    await expect(updateLoop(USER, 'a', { name: 'x' })).rejects.toMatchObject({ code: '42501' });
  });
});

describe('deleteLoop', () => {
  it('deletes the loop, scoped to the user', async () => {
    queryResult.mockResolvedValueOnce(ok(null));
    await deleteLoop(USER, 'a');
    const [call] = calls();
    expect(call!.table).toBe('loops');
    expect(opArgs(call!, 'delete')).toEqual([]);
    expect(eqs(call!)).toEqual([
      ['id', 'a'],
      ['user_id', USER],
    ]);
  });

  it('throws when the delete fails', async () => {
    queryResult.mockResolvedValueOnce(fail('network'));
    await expect(deleteLoop(USER, 'a')).rejects.toMatchObject({ message: 'network' });
  });
});
