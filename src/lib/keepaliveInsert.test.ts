import { FAKE_REST_CONFIG } from '@/test/fakeSupabase';
import { keepaliveInsert } from './keepaliveInsert';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const row = {
  id: 'session-1',
  user_id: 'user-1',
  loop_id: 'loop-1',
  started_at: '2026-11-23T18:00:00.000Z',
  duration_seconds: 60,
  speed_ratio: 0.85,
  repeats: 7,
};

const fetchMock = vi.fn<typeof fetch>();

const respond = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('keepaliveInsert', () => {
  it('posts the row with keepalive, the key, the token and "ignore duplicates"', async () => {
    fetchMock.mockResolvedValue(respond(201));

    expect(await keepaliveInsert('practice_sessions', row, 'the-token')).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${FAKE_REST_CONFIG.url}/rest/v1/practice_sessions?on_conflict=id`);
    expect(init).toMatchObject({
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: FAKE_REST_CONFIG.publishableKey,
        Authorization: 'Bearer the-token',
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
    });
    expect(JSON.parse(init?.body as string)).toEqual(row);
  });

  it('starts the request before it returns, so a caller in pagehide need not wait', () => {
    fetchMock.mockResolvedValue(respond(201));

    void keepaliveInsert('practice_sessions', row, 'the-token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives the database's error code when the insert is refused", async () => {
    fetchMock.mockResolvedValue(respond(409, { code: '23503', message: 'no such loop' }));

    expect(await keepaliveInsert('practice_sessions', row, 'the-token')).toEqual({
      ok: false,
      code: '23503',
    });
  });

  it.each([
    ['a body that is not JSON', new Response('<html>Bad gateway</html>', { status: 502 })],
    ['a body with no code', respond(401, { message: 'JWT expired' })],
    ['a code that is not text', respond(500, { code: 500 })],
    ['a body that is not an object', respond(500, 'oops')],
  ])('fails without a code for %s', async (_what, response) => {
    fetchMock.mockResolvedValue(response);

    expect(await keepaliveInsert('practice_sessions', row, 'the-token')).toEqual({
      ok: false,
      code: null,
    });
  });

  it('fails without throwing when the network does', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await keepaliveInsert('practice_sessions', row, 'the-token')).toEqual({
      ok: false,
      code: null,
    });
  });
});
