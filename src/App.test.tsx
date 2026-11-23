import { act, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { Session } from '@supabase/supabase-js';
import { emitAuthEvent, fakeSession, resetFakeSupabase } from '@/test/fakeSupabase';
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

describe('App', () => {
  it.each(['/', '/library', '/settings', '/songs/abc', '/no-such-page'])(
    'sends signed-out visitors from %s to the login page',
    (path) => {
      renderAt(path, null);
      expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Drum Practice Pal' })).toBeInTheDocument();
    },
  );

  it.each([
    ['/', 'On the go'],
    ['/library', 'Library'],
    // Lazy-loaded with the player; "abc" isn't a song id.
    ['/songs/abc', 'Song not found'],
    ['/no-such-page', 'Page not found'],
  ])('shows a signed-in user %s inside the shell', async (path, heading) => {
    renderAt(path, fakeSession());
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
  });

  it('sends a signed-in user away from /login to ?next=', () => {
    renderAt('/login?next=%2Flibrary', fakeSession());
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
  });

  it('sends a user back to /login when the session ends', () => {
    renderAt('/library', fakeSession());
    act(() => emitAuthEvent('SIGNED_OUT', null));
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
  });
});
