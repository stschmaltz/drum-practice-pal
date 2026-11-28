/**
 * The real client (not the fake the component tests use) over a `fetch` that
 * never reaches a server: what one read costs when the connection is gone.
 */
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { queryClient as appQueryClient } from './queryClient';
import { supabase } from './supabase';
import { unwrap } from './supabaseResult';

/** A connection that drops every request, as the browser reports it. */
function droppedConnection() {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The REST requests among those sent (auth may send its own). */
const restRequests = (fetchMock: ReturnType<typeof droppedConnection>) =>
  fetchMock.mock.calls.filter(([input]) =>
    String(input instanceof Request ? input.url : input).includes('/rest/v1/'),
  );

describe('the browser client’s reads on a dropped connection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fail on the first lost request: postgrest-js sends nothing again under TanStack Query’s retries', async () => {
    const fetchMock = droppedConnection();

    const read = supabase.from('loops').select('id').eq('song_id', 'song-1');
    const settled = vi.fn();
    void read.then(settled);
    // No timer is needed for the answer: nothing waits to try again.
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0]?.[0]).toMatchObject({ data: null });
    expect(settled.mock.calls[0]?.[0].error.message).toContain('Failed to fetch');
    expect(restRequests(fetchMock)).toHaveLength(1);

    // And nothing is sent later either (postgrest-js's own retries would come at 1, 3 and 7 s).
    await vi.advanceTimersByTimeAsync(10_000);
    expect(restRequests(fetchMock)).toHaveLength(1);
  });

  it('a read that asks for postgrest-js’s retries still gets them: three more, at 1, 2 and 4 s', async () => {
    const fetchMock = droppedConnection();

    const settled = vi.fn();
    void supabase
      .from('songs')
      .select('id')
      .eq('id', 'song-1')
      .retry(true)
      .maybeSingle()
      .then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(restRequests(fetchMock)).toHaveLength(1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(restRequests(fetchMock)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(restRequests(fetchMock)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(restRequests(fetchMock)).toHaveLength(4);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0]?.[0].error.message).toContain('Failed to fetch');
  });

  it('writes were never sent again by postgrest-js, and still aren’t', async () => {
    const fetchMock = droppedConnection();

    const settled = vi.fn();
    void supabase.from('loops').update({ name: 'Verse' }).eq('id', 'loop-1').then(settled);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(restRequests(fetchMock)).toHaveLength(1);
  });

  it('a list read under the app’s query defaults says it failed 3 s on, not 24: three requests, 1 and 2 s apart', async () => {
    const fetchMock = droppedConnection();
    const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
    const observer = new QueryObserver(client, {
      queryKey: ['loops', 'song-1'],
      queryFn: async () =>
        unwrap(await supabase.from('loops').select('id').eq('song_id', 'song-1'), 'loops'),
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await vi.advanceTimersByTimeAsync(2999);
      expect(observer.getCurrentResult().status).toBe('pending');
      expect(restRequests(fetchMock)).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(1);
      expect(restRequests(fetchMock)).toHaveLength(3);
      expect(observer.getCurrentResult().isLoadingError).toBe(true);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(restRequests(fetchMock)).toHaveLength(3);
    } finally {
      unsubscribe();
      client.clear();
    }
  });
});
