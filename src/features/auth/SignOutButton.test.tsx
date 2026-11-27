import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { fakeSupabase, resetFakeSupabase } from '@/test/fakeSupabase';
import { songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import { offlineDb } from '@/features/offline/offlineDb';
import { settingsKeys } from '@/features/settings/useSettings';
import { sessionKeys } from '@/features/practice/sessionKeys';
import { renderRoutes, settle, testQueryClient } from '@/test/render';
import { SignOutButton } from './SignOutButton';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

beforeEach(resetFakeSupabase);

describe('SignOutButton', () => {
  it('signs out of this device only', async () => {
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(fakeSupabase.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' }),
    );
  });

  it('says when signing out failed', async () => {
    fakeSupabase.auth.signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't sign out. Something went wrong. Try again.",
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
    await waitFor(() => expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1));
  });
});

describe('SignOutButton offline, pressed before it has caught up', () => {
  it('refuses: signing out would empty the device of what is queued', async () => {
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    act(() => {
      onlineManager.setOnline(false);
      // The connection went a moment ago; React hasn't drawn the button off yet.
      expect(button).toBeEnabled();
      fireEvent.click(button);
    });
    await settle();
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();
  });
});

describe('SignOutButton with writes on their way', () => {
  /** A write of `mutationKey` the server hasn't answered yet; `answer()` lets it land. */
  function pendingWrite(queryClient: QueryClient, mutationKey: readonly unknown[]) {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    void queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey, mutationFn: () => answered })
      .execute(undefined);
    return () => act(() => answer());
  }

  it.each([
    ['a loop edit', loopKeys.writes('user-1')],
    ['a practice session log', sessionKeys.logs('user-1')],
    // Bug hunt S2: signed out mid-upload, the rest of it ran as nobody and left a file behind.
    ['a song upload, edit or delete', songKeys.writes('user-1')],
    ['a settings save', settingsKeys.writes('user-1')],
  ])(
    'is off with a reason while %s is unanswered online, and signs out once it lands',
    async (_case, key) => {
      const queryClient = testQueryClient();
      const answer = pendingWrite(queryClient, key);
      renderRoutes(<Route path="/" element={<SignOutButton />} />, { queryClient });
      const button = screen.getByRole('button', { name: 'Sign out' });
      await waitFor(() => expect(button).toBeDisabled());
      expect(screen.getByTestId('offline-note')).toHaveTextContent('still on their way');
      fireEvent.click(button);
      await settle();
      expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();

      answer();
      await waitFor(() => expect(button).toBeEnabled());
      expect(screen.queryByTestId('offline-note')).not.toBeInTheDocument();
      await userEvent.click(button);
      await waitFor(() => expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1));
    },
  );

  it('refuses a press that comes before the button has caught up with a write just started', async () => {
    const queryClient = testQueryClient();
    renderRoutes(<Route path="/" element={<SignOutButton />} />, { queryClient });
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button).toBeEnabled();
    pendingWrite(queryClient, loopKeys.writes('user-1'));
    // Still enabled on screen: TanStack Query tells React on a timer.
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await settle();
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("is not held up by another user's writes", async () => {
    const queryClient = testQueryClient();
    pendingWrite(queryClient, loopKeys.writes('someone-else'));
    renderRoutes(<Route path="/" element={<SignOutButton />} />, { queryClient });
    await settle();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});

// Bug hunt D3: another tab's queued write is only in the outbox the tabs share, which
// signing out empties; this tab's mutation cache knows nothing of it.
describe('SignOutButton with another tab’s writes in the outbox', () => {
  const otherTabsEdit = {
    kind: 'loopEdit',
    id: 'queued-elsewhere',
    userId: 'user-1',
    queuedAt: 1,
    songId: 'song-1',
    loopId: 'loop-1',
    changes: { speed_ratio: 0.8 },
  } as const;

  it('is off with a reason while the user has an outbox entry, and signs out once it has gone', async () => {
    await offlineDb.outbox.put(otherTabsEdit);
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByTestId('offline-note')).toHaveTextContent('still on their way');

    await act(() => offlineDb.outbox.delete(otherTabsEdit.id));
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await waitFor(() => expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1));
  });

  it('refuses a press that comes before the button has caught up with the entry', async () => {
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    await settle();
    await offlineDb.outbox.put(otherTabsEdit);
    fireEvent.click(button);
    await settle();
    expect(fakeSupabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("is not held up by another user's entries", async () => {
    await offlineDb.outbox.put({ ...otherTabsEdit, userId: 'someone-else' });
    renderRoutes(<Route path="/" element={<SignOutButton />} />);
    await settle();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(fakeSupabase.auth.signOut).toHaveBeenCalledTimes(1));
  });
});
