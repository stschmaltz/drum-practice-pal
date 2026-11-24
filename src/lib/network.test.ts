import { act, renderHook } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import {
  isNetworkFailure,
  isOnline,
  networkRetryDelay,
  retryNetworkFailures,
  useOnline,
  waitsForNetwork,
} from './network';

describe('isNetworkFailure', () => {
  it.each([
    ['fetch rejecting', new TypeError('Failed to fetch')],
    ['supabase-js, Chrome', { message: 'TypeError: Failed to fetch', code: '' }],
    [
      'supabase-js, Firefox',
      { message: 'TypeError: NetworkError when attempting to fetch resource.', code: '' },
    ],
    ['supabase-js, Safari', { message: 'TypeError: Load failed', code: '' }],
    ['supabase-js without a fetch name', { message: 'FetchError: socket hang up', code: '' }],
    ['no code at all', { message: 'TypeError: Failed to fetch' }],
  ])('is true for %s', (_case, error) => {
    expect(isNetworkFailure(error)).toBe(true);
  });

  it.each([
    [
      'a Postgres refusal',
      { message: 'new row violates row-level security policy', code: '42501' },
    ],
    ['a PostgREST error', { message: 'TypeError: looks like one', code: 'PGRST116' }],
    ['a plain error', new Error('boom')],
    ['a message with no fetch name', { message: 'Failed to fetch', code: '' }],
    ['an abort', { message: 'AbortError: The operation was aborted', code: '' }],
    ['null', null],
    ['a string', 'TypeError: Failed to fetch'],
  ])('is false for %s', (_case, error) => {
    expect(isNetworkFailure(error)).toBe(false);
  });
});

describe('retrying queued writes', () => {
  it('retries a connection failure however many times it has failed', () => {
    const failure = { message: 'TypeError: Failed to fetch', code: '' };
    expect(retryNetworkFailures(1, failure)).toBe(true);
    expect(retryNetworkFailures(50, failure)).toBe(true);
  });

  it("never retries the server's refusal", () => {
    expect(retryNetworkFailures(0, { message: 'nope', code: '23514' })).toBe(false);
  });

  // Bug hunt D4: an access token that expired while the write waited is refused with a
  // 401, which isn't the server saying no to the write: the next try refreshes it.
  it.each([
    ['an expired token', { message: 'JWT expired', code: 'PGRST303' }],
    [
      'a token that could not be read',
      { message: 'JWSError JWSInvalidSignature', code: 'PGRST301' },
    ],
  ])('retries %s, however many times it has failed', (_case, error) => {
    expect(retryNetworkFailures(1, error)).toBe(true);
    expect(retryNetworkFailures(50, error)).toBe(true);
    expect(isNetworkFailure(error)).toBe(false);
  });

  it('backs off from a second to half a minute', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(networkRetryDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
});

describe('waitsForNetwork', () => {
  it('is true only for a query with nothing to show that is paused for the connection', () => {
    expect(waitsForNetwork({ isPending: true, fetchStatus: 'paused' })).toBe(true);
    expect(waitsForNetwork({ isPending: true, fetchStatus: 'fetching' })).toBe(false);
    expect(waitsForNetwork({ isPending: true, fetchStatus: 'idle' })).toBe(false);
    // Cached data shows while the refetch waits.
    expect(waitsForNetwork({ isPending: false, fetchStatus: 'paused' })).toBe(false);
  });
});

describe('online state', () => {
  it('follows the browser’s online and offline events', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    expect(isOnline()).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
    expect(isOnline()).toBe(true);
  });

  it('starts from navigator.onLine, not from "online until told otherwise"', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      vi.resetModules();
      const fresh = await import('./network');
      expect(fresh.isOnline()).toBe(false);
    } finally {
      onLine.mockRestore();
      onlineManager.setOnline(true);
    }
  });
});
