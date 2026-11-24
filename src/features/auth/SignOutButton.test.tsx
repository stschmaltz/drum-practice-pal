import { act, fireEvent, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { fakeSupabase, resetFakeSupabase } from '@/test/fakeSupabase';
import { renderRoutes, settle } from '@/test/render';
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

describe('SignOutButton offline', () => {
  it('is off with a reason while offline (it would empty the device), and signs out once back online', async () => {
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    act(() => onlineManager.setOnline(false));
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button).toBeDisabled();
    expect(screen.getByTestId('offline-note')).toHaveTextContent(
      "You can sign out once you're back online.",
    );
    fireEvent.click(button);
    await settle();
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(screen.queryByTestId('offline-note')).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
