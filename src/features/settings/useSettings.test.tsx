import { act, renderHook, waitFor } from '@testing-library/react';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import type { Settings } from './settingsForm';
import { settingsKeys, useSettings, useUpdateSettings } from './useSettings';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const saved: Settings = {
  metronome_on: true,
  metronome_volume: 0.8,
  count_in_bars: 0,
  count_in_mode: 'start',
  metronome_sound: 'click',
  metronome_accent: true,
  metronome_accent_sound: 'click',
  metronome_subdivision: 1,
  drums_muted_default: false,
};

function deferred() {
  let resolve!: (value: FakeResult) => void;
  const promise = new Promise<FakeResult>((r) => (resolve = r));
  return { promise, resolve };
}

function renderSettingsHooks(userId = 'user-1') {
  const queryClient = testQueryClient();
  const wrapper = wrapperFor(queryClient, signedInAs(userId));
  const hooks = renderHook(() => ({ query: useSettings(), update: useUpdateSettings() }), {
    wrapper,
  });
  return { ...hooks, queryClient, key: settingsKeys.forUser(userId) };
}

beforeEach(resetFakeSupabase);

describe('settingsKeys', () => {
  it('includes the user id, so two accounts never share a cache entry', () => {
    expect(settingsKeys.forUser('a')).not.toEqual(settingsKeys.forUser('b'));
    expect(settingsKeys.forUser('a').slice(0, 1)).toEqual(settingsKeys.all);
  });
});

describe('useSettings', () => {
  it("loads the signed-in user's row", async () => {
    queryResult.mockResolvedValue({ data: saved, error: null });
    const { result } = renderSettingsHooks('user-7');

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.query.data).toEqual(saved);
    const call = queryResult.mock.calls[0]?.[0];
    expect(call?.table).toBe('user_settings');
    expect(opArgs(call!, 'eq')).toEqual(['user_id', 'user-7']);
  });

  it('surfaces a Supabase error as a query error', async () => {
    queryResult.mockResolvedValue({ data: null, error: { message: 'JWT expired' } });
    const { result } = renderSettingsHooks();
    await waitFor(() => expect(result.current.query.isError).toBe(true));
    expect(result.current.query.error?.message).toBe('JWT expired');
  });
});

describe('useUpdateSettings', () => {
  it('shows the change at once, sends only the changed fields, then keeps the saved row', async () => {
    queryResult.mockResolvedValueOnce({ data: saved, error: null });
    const { result, queryClient, key } = renderSettingsHooks();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    const write = deferred();
    queryResult.mockReturnValueOnce(write.promise);
    // The refetch after the write settles.
    queryResult.mockResolvedValue({ data: { ...saved, count_in_bars: 2 }, error: null });
    act(() => result.current.update.mutate({ count_in_bars: 2 }));

    await waitFor(() => expect(queryClient.getQueryData<Settings>(key)?.count_in_bars).toBe(2));
    const updateCall = queryResult.mock.calls[1]?.[0];
    expect(opArgs(updateCall!, 'update')).toEqual([{ count_in_bars: 2 }]);
    expect(opArgs(updateCall!, 'eq')).toEqual(['user_id', 'user-1']);

    // The DB clamps or normalises nothing here, but the cache must hold what it returned.
    write.resolve({ data: { ...saved, count_in_bars: 2 }, error: null });
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(queryClient.getQueryData<Settings>(key)).toEqual({ ...saved, count_in_bars: 2 });
    // Refetched afterwards so the cache matches the DB.
    await waitFor(() => expect(queryResult).toHaveBeenCalledTimes(3));
  });

  it('rolls back to the previous values when the write fails', async () => {
    queryResult.mockResolvedValueOnce({ data: saved, error: null });
    const { result, queryClient, key } = renderSettingsHooks();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    const write = deferred();
    queryResult.mockReturnValueOnce(write.promise);
    // Hold the follow-up refetch, so the rollback itself is what restores the cache.
    const refetch = deferred();
    queryResult.mockReturnValueOnce(refetch.promise);
    act(() => result.current.update.mutate({ metronome_on: false, metronome_volume: 0.3 }));
    await waitFor(() => expect(queryClient.getQueryData<Settings>(key)?.metronome_on).toBe(false));

    write.resolve({ data: null, error: { message: 'new row violates check constraint' } });
    await waitFor(() => expect(queryClient.getQueryData<Settings>(key)).toEqual(saved));
    expect(queryResult).toHaveBeenCalledTimes(3);

    // The mutation settles once the refetch it triggered lands.
    refetch.resolve({ data: saved, error: null });
    await waitFor(() => expect(result.current.update.isError).toBe(true));
    expect(result.current.update.error?.message).toBe('new row violates check constraint');
    expect(queryClient.getQueryData<Settings>(key)).toEqual(saved);
  });

  it('a slow refetch started before the write does not overwrite the optimistic value', async () => {
    queryResult.mockResolvedValueOnce({ data: saved, error: null });
    const { result, queryClient, key } = renderSettingsHooks();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    const staleRefetch = deferred();
    queryResult.mockReturnValueOnce(staleRefetch.promise);
    void queryClient.refetchQueries({ queryKey: key });

    const write = deferred();
    queryResult.mockReturnValueOnce(write.promise);
    queryResult.mockResolvedValue({ data: { ...saved, drums_muted_default: true }, error: null });
    act(() => result.current.update.mutate({ drums_muted_default: true }));
    await waitFor(() => expect(result.current.update.isPending).toBe(true));
    await act(async () => staleRefetch.resolve({ data: saved, error: null }));

    // Still the optimistic value while the write is in flight.
    expect(queryClient.getQueryData<Settings>(key)?.drums_muted_default).toBe(true);
    write.resolve({ data: { ...saved, drums_muted_default: true }, error: null });
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(queryClient.getQueryData<Settings>(key)?.drums_muted_default).toBe(true);
  });
});
