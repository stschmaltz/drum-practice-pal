import { PAGE_SIZE } from '@/lib/fetchAllPages';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  type FakeResult,
  type QueryCall,
} from '@/test/fakeSupabase';
import { SESSION_SELECT, type PracticeSession } from './sessions';
import {
  fetchAllSessions,
  fetchLoopSessions,
  logSession,
  logSessionOnExit,
  uniqueById,
} from './sessionsApi';
import type { SessionRecord } from './sessionTracker';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const USER = 'user-1';
const LOOP = 'loop-1';

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string, code?: string): FakeResult => ({
  data: null,
  error: { message, code },
});

const calls = () => queryResult.mock.calls.map(([call]) => call);
const eqs = (call: QueryCall) =>
  call.ops.filter((op) => op.method === 'eq').map((op) => op.args as [string, unknown]);

const session = (id: string): PracticeSession => ({
  id,
  loop_id: LOOP,
  started_at: '2026-11-23T18:00:00.000Z',
  duration_seconds: 60,
  speed_ratio: 1,
  repeats: 4,
});

const record: SessionRecord = {
  id: 'session-1',
  loopId: LOOP,
  startedAt: '2026-11-23T18:00:00.000Z',
  durationSeconds: 61,
  speedRatio: 0.855556,
  repeats: 7,
};

const sentRow = {
  id: 'session-1',
  user_id: USER,
  loop_id: LOOP,
  started_at: '2026-11-23T18:00:00.000Z',
  duration_seconds: 61,
  speed_ratio: 0.855556,
  repeats: 7,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetFakeSupabase();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAllSessions', () => {
  // Copilot review on #30: a session replayed between two page requests, with an earlier
  // start, moves the rows along, and the next page begins with the last row of the page
  // before. Counted twice it doubled its time and passes on the Stats page.
  it('keeps one copy of a session that two pages both returned', async () => {
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) => session(`p1-${i}`));
    const repeated = firstPage[PAGE_SIZE - 1]!;
    queryResult
      .mockResolvedValueOnce(ok(firstPage))
      .mockResolvedValueOnce(ok([repeated, session('last')]));

    const sessions = await fetchAllSessions(USER);

    expect(sessions).toHaveLength(PAGE_SIZE + 1);
    expect(sessions.filter((each) => each.id === repeated.id)).toHaveLength(1);
    expect(sessions.at(-1)?.id).toBe('last');
  });

  it('uniqueById keeps the first copy and the order', () => {
    expect(uniqueById([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'c' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });
});

describe('fetchLoopSessions', () => {
  it("reads the loop's sessions, scoped to the user, newest first in a total order", async () => {
    queryResult.mockResolvedValueOnce(ok([session('a'), session('b')]));

    expect(await fetchLoopSessions(USER, LOOP)).toEqual([session('a'), session('b')]);

    const [call] = calls();
    expect(call!.table).toBe('practice_sessions');
    expect(opArgs(call!, 'select')).toEqual([SESSION_SELECT]);
    expect(eqs(call!)).toEqual([
      ['user_id', USER],
      ['loop_id', LOOP],
    ]);
    expect(call!.ops.filter((op) => op.method === 'order').map((op) => op.args)).toEqual([
      ['started_at', { ascending: false }],
      ['id'],
    ]);
    expect(opArgs(call!, 'range')).toEqual([0, PAGE_SIZE - 1]);
  });

  it('reads every page, not only the first', async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => session(`p1-${i}`));
    queryResult.mockResolvedValueOnce(ok(fullPage)).mockResolvedValueOnce(ok([session('last')]));

    const sessions = await fetchLoopSessions(USER, LOOP);

    expect(sessions).toHaveLength(PAGE_SIZE + 1);
    expect(opArgs(calls()[1]!, 'range')).toEqual([PAGE_SIZE, PAGE_SIZE * 2 - 1]);
  });

  // 20 batch 5 Review: the same miss as fetchAllSessions. A session logged between two page
  // requests (newest first, so it sorts before the offset) makes the next page begin with the
  // last row of the page before. History adds a day's sessions up, so the copy would double
  // that session's time and passes in its day's row with nothing to show for it.
  it('keeps one copy of a session that two pages both returned', async () => {
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) => session(`p1-${i}`));
    const repeated = firstPage[PAGE_SIZE - 1]!;
    queryResult
      .mockResolvedValueOnce(ok(firstPage))
      .mockResolvedValueOnce(ok([repeated, session('last')]));

    const sessions = await fetchLoopSessions(USER, LOOP);

    expect(sessions).toHaveLength(PAGE_SIZE + 1);
    expect(sessions.filter((each) => each.id === repeated.id)).toHaveLength(1);
    expect(sessions.at(-1)?.id).toBe('last');
  });

  it('throws when a page fails, the second included', async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => session(`p1-${i}`));
    queryResult.mockResolvedValueOnce(ok(fullPage)).mockResolvedValueOnce(fail('boom'));

    await expect(fetchLoopSessions(USER, LOOP)).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('logSession', () => {
  it('inserts the session under its own id, leaving a row that already has it alone', async () => {
    queryResult.mockResolvedValueOnce(ok(null));

    expect(await logSession(USER, record)).toBe('logged');

    const [call] = calls();
    expect(call!.table).toBe('practice_sessions');
    expect(opArgs(call!, 'upsert')).toEqual([
      sentRow,
      { onConflict: 'id', ignoreDuplicates: true },
    ]);
  });

  it('says the loop is gone, without throwing, when the loop was deleted', async () => {
    queryResult.mockResolvedValueOnce(fail('violates foreign key constraint', '23503'));

    expect(await logSession(USER, record)).toBe('loopGone');
  });

  it.each([
    ['a refused value', '23514'],
    ['a missing grant', '42501'],
    ['a failure with no code', undefined],
  ])('throws on %s', async (_what, code) => {
    queryResult.mockResolvedValueOnce(fail('nope', code));

    await expect(logSession(USER, record)).rejects.toMatchObject({ message: 'nope' });
  });
});

describe('logSessionOnExit', () => {
  it('sends the same row with keepalive and the token it was given', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    expect(await logSessionOnExit('the-token', USER, record)).toBe('logged');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/rest/v1/practice_sessions?on_conflict=id');
    expect(init).toMatchObject({ keepalive: true });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer the-token');
    expect(JSON.parse(init?.body as string)).toEqual(sentRow);
    // Not through supabase-js, which can't ask for keepalive.
    expect(queryResult).not.toHaveBeenCalled();
  });

  it('says the loop is gone when the loop was deleted', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: '23503' }), { status: 409 }));

    expect(await logSessionOnExit('the-token', USER, record)).toBe('loopGone');
  });

  it('reports any other refusal, and a dead network, as failed', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '23514' }), { status: 400 }),
    );
    expect(await logSessionOnExit('the-token', USER, record)).toBe('failed');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await logSessionOnExit('the-token', USER, record)).toBe('failed');
  });
});
