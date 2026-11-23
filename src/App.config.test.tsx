import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';

// A build with no Supabase env: supabase.ts exports the reason instead of throwing.
vi.mock('@/lib/supabase', async () => ({
  ...(await import('@/test/fakeSupabase')).fakeSupabaseModule,
  supabaseConfigError: 'Missing VITE_SUPABASE_URL.',
}));

describe('App without Supabase env', () => {
  it.each(['/', '/login', '/library'])(
    'shows the configuration message at %s instead of a blank page',
    (path) => {
      // No AuthProvider or QueryClient: nothing that needs the client may render.
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );
      expect(screen.getByText("This build isn't connected to Supabase.")).toBeInTheDocument();
      expect(screen.getByText('Missing VITE_SUPABASE_URL. See .env.example.')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
});
