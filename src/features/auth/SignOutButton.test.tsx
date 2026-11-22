import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { fakeSupabase, resetFakeSupabase } from '@/test/fakeSupabase';
import { renderRoutes } from '@/test/render';
import { SignOutButton } from './SignOutButton';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

beforeEach(resetFakeSupabase);

describe('SignOutButton', () => {
  it('signs out of this device only', async () => {
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
  });

  it('says when signing out failed', async () => {
    fakeSupabase.auth.signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't sign out: Failed to fetch",
    );
  });
});
