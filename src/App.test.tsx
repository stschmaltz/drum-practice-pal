import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './lib/AuthProvider';

// Signed out: the fake client reports no session as soon as App subscribes.
vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    auth: {
      onAuthStateChange: (callback: (event: string, session: null) => void) => {
        queueMicrotask(() => callback('INITIAL_SESSION', null));
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

function renderAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it.each(['/', '/library', '/settings', '/songs/abc'])(
    'sends signed-out visitors from %s to the login page',
    async (path) => {
      renderAt(path);
      expect(
        await screen.findByRole('button', { name: 'Email me a sign-in link' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Drum Practice Pal' })).toBeInTheDocument();
    },
  );
});
