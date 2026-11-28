import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import {
  FAKE_AUTH_STORAGE_KEY,
  fakeSession,
  fakeSupabase,
  resetFakeSupabase,
} from '@/test/fakeSupabase';
import { failureKind } from './errorCopy';
import { retryNetworkFailures } from './network';
import { sendRefreshingToken } from './tokenRefresh';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const badSignature = { message: 'JWSError JWSInvalidSignature', code: 'PGRST301' };
const expired = { message: 'JWT expired', code: 'PGRST303' };
const refused = { message: 'permission denied', code: '42501' };

beforeEach(resetFakeSupabase);

/** A send that fails with each of `errors` in turn, then answers 'saved'. */
function sendFailing(...errors: unknown[]) {
  const send = vi.fn(async () => {
    const error = errors.shift();
    if (error) throw error;
    return 'saved';
  });
  return send;
}

describe('sendRefreshingToken (Copilot review: a token getSession still thinks is good)', () => {
  it('sends once and refreshes nothing when the server takes it', async () => {
    const send = sendFailing();
    await expect(sendRefreshingToken(send)).resolves.toBe('saved');
    expect(send).toHaveBeenCalledTimes(1);
    expect(fakeSupabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('leaves a refusal of the write itself alone', async () => {
    const send = sendFailing(refused);
    await expect(sendRefreshingToken(send)).rejects.toBe(refused);
    expect(send).toHaveBeenCalledTimes(1);
    expect(fakeSupabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it.each([
    ['a bad signature', badSignature],
    ['an expired token', expired],
  ])('%s: refreshes the session, then sends again with the new token', async (_what, error) => {
    const send = sendFailing(error);
    await expect(sendRefreshingToken(send)).resolves.toBe('saved');
    expect(send).toHaveBeenCalledTimes(2);
    expect(fakeSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    const refreshed = fakeSupabase.auth.refreshSession.mock.invocationCallOrder[0]!;
    expect(refreshed).toBeGreaterThan(send.mock.invocationCallOrder[0]!);
    expect(refreshed).toBeLessThan(send.mock.invocationCallOrder[1]!);
  });

  it('a refresh that could not reach the server keeps the write queued for the retries', async () => {
    fakeSupabase.auth.refreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });
    const send = sendFailing(badSignature);
    const failure = await sendRefreshingToken(send).catch((error: unknown) => error);
    expect(send).toHaveBeenCalledTimes(1);
    expect(retryNetworkFailures(1, failure)).toBe(true);
  });

  it('a refused refresh is a final refusal: not sent again, and not retried', async () => {
    fakeSupabase.auth.refreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    });
    const send = sendFailing(badSignature);
    const failure = await sendRefreshingToken(send).catch((error: unknown) => error);
    expect(send).toHaveBeenCalledTimes(1);
    expect(retryNetworkFailures(1, failure)).toBe(false);
    expect(failure).toMatchObject({ message: expect.stringMatching(/sign in again/i) });
  });

  it('a new token refused too is a final refusal, so it never loops', async () => {
    const send = sendFailing(badSignature, badSignature);
    const failure = await sendRefreshingToken(send).catch((error: unknown) => error);
    expect(send).toHaveBeenCalledTimes(2);
    expect(fakeSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(retryNetworkFailures(1, failure)).toBe(false);
  });

  it('a connection that drops on the second send is still the retries’ to deal with', async () => {
    const dropped = new TypeError('Failed to fetch');
    const send = sendFailing(badSignature, dropped);
    await expect(sendRefreshingToken(send)).rejects.toBe(dropped);
  });
});

describe('sendRefreshingToken with no session in memory (13.23: a write never goes out as anon)', () => {
  /** supabase-js after a refresh that failed for the connection: nothing in memory, the session still stored. */
  const noSession = {
    data: { session: null },
    error: new AuthRetryableFetchError('Failed to fetch', 0),
  };
  const storeSession = () =>
    localStorage.setItem(FAKE_AUTH_STORAGE_KEY, JSON.stringify(fakeSession()));

  it('a session still stored: nothing is sent, and the failure is one the retries wait on', async () => {
    storeSession();
    fakeSupabase.auth.getSession.mockResolvedValue(noSession);
    const send = sendFailing();
    const failure = await sendRefreshingToken(send).catch((error: unknown) => error);
    expect(send).not.toHaveBeenCalled();
    expect(retryNetworkFailures(1, failure)).toBe(true);
    expect(failureKind(failure)).toBe('network');
    expect(fakeSupabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('asks again at every try, and sends once the session is back', async () => {
    storeSession();
    fakeSupabase.auth.getSession.mockResolvedValueOnce(noSession);
    const send = sendFailing();
    await expect(sendRefreshingToken(send)).rejects.toBeDefined();
    await expect(sendRefreshingToken(send)).resolves.toBe('saved');
    expect(send).toHaveBeenCalledTimes(1);
    expect(fakeSupabase.auth.getSession).toHaveBeenCalledTimes(2);
  });

  it('a session that could not be read at all is treated the same while one is stored', async () => {
    storeSession();
    fakeSupabase.auth.getSession.mockRejectedValue(new Error('lock'));
    const send = sendFailing();
    const failure = await sendRefreshingToken(send).catch((error: unknown) => error);
    expect(send).not.toHaveBeenCalled();
    expect(retryNetworkFailures(1, failure)).toBe(true);
  });

  it('no session stored either (signed out): the write goes to the server, whose refusal is final', async () => {
    fakeSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const send = sendFailing(refused);
    const failure = await sendRefreshingToken(send).catch((error: unknown) => error);
    expect(send).toHaveBeenCalledTimes(1);
    expect(failure).toBe(refused);
    expect(retryNetworkFailures(1, failure)).toBe(false);
  });

  it('asks for the session before the send, never after it', async () => {
    const send = sendFailing();
    await sendRefreshingToken(send);
    expect(fakeSupabase.auth.getSession.mock.invocationCallOrder[0]!).toBeLessThan(
      send.mock.invocationCallOrder[0]!,
    );
  });
});
