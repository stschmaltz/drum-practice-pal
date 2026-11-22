import { act, render, renderHook, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  authListenerCount,
  emitAuthEvent,
  fakeSession,
  resetFakeSupabase,
} from '@/test/fakeSupabase';
import { testQueryClient, wrapperFor, signedOut } from '@/test/render';
import { useAuth, useSignedInUser } from './auth';
import { AuthProvider } from './AuthProvider';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

function AuthReadout() {
  const auth = useAuth();
  return <p>{`${auth.status} ${auth.user?.email ?? ''}`.trim()}</p>;
}

function renderProvider(queryClient = testQueryClient()) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthReadout />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

beforeEach(resetFakeSupabase);

describe('AuthProvider', () => {
  it('stays loading until supabase-js reports the stored session', () => {
    renderProvider();
    expect(screen.getByText('loading')).toBeInTheDocument();
    act(() => emitAuthEvent('INITIAL_SESSION', null));
    expect(screen.getByText('signedOut')).toBeInTheDocument();
  });

  it('follows sign-in, token refresh and sign-out', () => {
    renderProvider();
    act(() => emitAuthEvent('INITIAL_SESSION', null));
    act(() => emitAuthEvent('SIGNED_IN', fakeSession('u1', 'a@drumpal.test')));
    expect(screen.getByText('signedIn a@drumpal.test')).toBeInTheDocument();
    act(() => emitAuthEvent('TOKEN_REFRESHED', fakeSession('u1', 'a@drumpal.test')));
    expect(screen.getByText('signedIn a@drumpal.test')).toBeInTheDocument();
    // A refresh that fails (revoked token) arrives as SIGNED_OUT too.
    act(() => emitAuthEvent('SIGNED_OUT', null));
    expect(screen.getByText('signedOut')).toBeInTheDocument();
  });

  it("clears every cached query on sign-out, so the next account can't see them", () => {
    const { queryClient } = renderProvider();
    act(() => emitAuthEvent('INITIAL_SESSION', fakeSession('u1')));
    queryClient.setQueryData(['settings', 'u1'], { metronome_on: true });
    act(() => emitAuthEvent('SIGNED_OUT', null));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('keeps the cache on other events', () => {
    const { queryClient } = renderProvider();
    act(() => emitAuthEvent('INITIAL_SESSION', fakeSession('u1')));
    queryClient.setQueryData(['settings', 'u1'], { metronome_on: true });
    act(() => emitAuthEvent('TOKEN_REFRESHED', fakeSession('u1')));
    expect(queryClient.getQueryData(['settings', 'u1'])).toEqual({ metronome_on: true });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderProvider();
    expect(authListenerCount()).toBe(1);
    unmount();
    expect(authListenerCount()).toBe(0);
  });
});

describe('auth hooks', () => {
  it('useAuth throws outside AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('inside <AuthProvider>');
  });

  it('useSignedInUser throws when nobody is signed in', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderHook(() => useSignedInUser(), { wrapper: wrapperFor(testQueryClient(), signedOut) }),
    ).toThrow('inside <RequireAuth>');
  });

  it('useSignedInUser returns the signed-in user', () => {
    const { result } = renderHook(() => useSignedInUser(), {
      wrapper: wrapperFor(testQueryClient()),
    });
    expect(result.current.id).toBe('user-1');
  });
});
