import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import type { Session } from '@supabase/supabase-js';
import { emitAuthEvent, fakeSession, queryResult, resetFakeSupabase } from '@/test/fakeSupabase';
import { testQueryClient } from '@/test/render';
import { App } from './App';
import { AuthProvider } from './lib/AuthProvider';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

function renderAt(path: string, session: Session | null) {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  act(() => emitAuthEvent('INITIAL_SESSION', session));
}

beforeEach(resetFakeSupabase);

/** Where the router is, and its Back button. */
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div hidden>
      <output data-testid="probe-location">{`${location.pathname}${location.search}`}</output>
      <button type="button" data-testid="probe-back" onClick={() => void navigate(-1)} />
    </div>
  );
}

describe('App', () => {
  it.each(['/', '/library', '/stats', '/settings', '/songs/abc', '/no-such-page'])(
    'sends signed-out visitors from %s to the login page',
    (path) => {
      renderAt(path, null);
      expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Drum Practice Pal' })).toBeInTheDocument();
    },
  );

  it.each([
    ['/', 'Songs'],
    // The library of earlier builds is the songs list now.
    ['/library', 'Songs'],
    ['/stats', 'Stats'],
    ['/songs/abc', 'Song not found'],
    // Lazy-loaded with the player; "abc" isn't a song id.
    ['/songs/abc/play', 'Song not found'],
    ['/songs/abc/loops/def', 'Song not found'],
    ['/no-such-page', 'Page not found'],
  ])('shows a signed-in user %s inside the shell', async (path, heading) => {
    renderAt(path, fakeSession());
    // The player routes' first lazy import (alphaTab's modules) can take over a second cold.
    expect(
      await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
  });

  it('sends /library on to the songs list with its search and sort, replacing it in the history', async () => {
    queryResult.mockResolvedValue({ data: [], error: null });
    render(
      <QueryClientProvider client={testQueryClient()}>
        <AuthProvider>
          <MemoryRouter
            initialEntries={['/settings', '/library?q=fill&sort=added']}
            initialIndex={1}
          >
            <App />
            <Probe />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    act(() => emitAuthEvent('INITIAL_SESSION', fakeSession()));

    expect(await screen.findByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
    expect(screen.getByTestId('probe-location')).toHaveTextContent(/^\/\?q=fill&sort=added$/);

    // Back skips the old address: pushed, it would land on /library and bounce forward again.
    fireEvent.click(screen.getByTestId('probe-back'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByTestId('probe-location')).toHaveTextContent(/^\/settings$/);
  });

  it('sends a signed-in user away from /login to ?next=', () => {
    renderAt('/login?next=%2Fsettings', fakeSession());
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('sends a user back to /login when the session ends', () => {
    renderAt('/library', fakeSession());
    act(() => emitAuthEvent('SIGNED_OUT', null));
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
  });
});
