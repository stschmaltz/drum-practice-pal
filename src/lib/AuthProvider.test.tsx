import { act, render, renderHook, screen } from '@testing-library/react';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import {
  authListenerCount,
  emitAuthEvent,
  FAKE_AUTH_STORAGE_KEY,
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

function renderProvider(queryClient = testQueryClient(), onSignedOut?: () => void) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider onSignedOut={onSignedOut}>
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

  it('empties the device of the offline copies on sign-out, and only then', () => {
    const onSignedOut = vi.fn();
    renderProvider(testQueryClient(), onSignedOut);
    act(() => emitAuthEvent('INITIAL_SESSION', fakeSession('u1')));
    act(() => emitAuthEvent('TOKEN_REFRESHED', fakeSession('u1')));
    expect(onSignedOut).not.toHaveBeenCalled();
    act(() => emitAuthEvent('SIGNED_OUT', null));
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  describe('a start without a connection', () => {
    afterEach(() => localStorage.clear());

    it('opens on the stored session when the refresh at start only lacked a network', () => {
      // supabase-js keeps the session after a refresh that failed to reach the server,
      // but reports INITIAL_SESSION with none.
      localStorage.setItem(
        FAKE_AUTH_STORAGE_KEY,
        JSON.stringify({ ...fakeSession('u1', 'a@drumpal.test'), expires_at: 1 }),
      );
      renderProvider();
      act(() => emitAuthEvent('INITIAL_SESSION', null));
      expect(screen.getByText('signedIn a@drumpal.test')).toBeInTheDocument();
      // Back online, the refresh goes through.
      act(() => emitAuthEvent('TOKEN_REFRESHED', fakeSession('u1', 'a@drumpal.test')));
      expect(screen.getByText('signedIn a@drumpal.test')).toBeInTheDocument();
    });

    it('opens on the stored session at once when the app starts offline', () => {
      localStorage.setItem(
        FAKE_AUTH_STORAGE_KEY,
        JSON.stringify({ ...fakeSession('u1', 'a@drumpal.test'), expires_at: 1 }),
      );
      onlineManager.setOnline(false);
      renderProvider();
      // supabase-js has said nothing yet: it is retrying the refresh.
      expect(screen.getByText('signedIn a@drumpal.test')).toBeInTheDocument();
    });

    it('waits for supabase-js when it starts offline with nothing stored', () => {
      onlineManager.setOnline(false);
      renderProvider();
      expect(screen.getByText('loading')).toBeInTheDocument();
    });

    it('is signed out when nothing is stored (a refused refresh removes the session)', () => {
      renderProvider();
      act(() => emitAuthEvent('INITIAL_SESSION', null));
      expect(screen.getByText('signedOut')).toBeInTheDocument();
    });

    it('never reads the stored session for a sign-out', () => {
      localStorage.setItem(FAKE_AUTH_STORAGE_KEY, JSON.stringify(fakeSession('u1')));
      renderProvider();
      act(() => emitAuthEvent('INITIAL_SESSION', fakeSession('u1')));
      act(() => emitAuthEvent('SIGNED_OUT', null));
      expect(screen.getByText('signedOut')).toBeInTheDocument();
    });
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
  // The console.error spies below would otherwise stay silenced for the rest of the file.
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
