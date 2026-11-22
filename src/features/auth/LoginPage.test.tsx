import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { fakeSupabase, resetFakeSupabase } from '@/test/fakeSupabase';
import { loadingAuth, renderRoutes, RouteMarker, signedInAs, signedOut } from '@/test/render';
import { LoginPage } from './LoginPage';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const routes = (
  <>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<RouteMarker name="home" />} />
    <Route path="/settings" element={<RouteMarker name="settings" />} />
  </>
);

function renderLogin(path = '/login', auth = signedOut) {
  renderRoutes(routes, { path, auth });
  return userEvent.setup();
}

async function sendEmail(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
}

beforeEach(resetFakeSupabase);

describe('LoginPage', () => {
  it('waits for the session before showing the form', () => {
    renderLogin('/login', loadingAuth);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('sends a signed-in user on to ?next=', () => {
    renderLogin('/login?next=%2Fsettings', signedInAs());
    expect(screen.getByText('At settings')).toBeInTheDocument();
  });

  it.each(['//evil.example', 'https://evil.example', '/login'])(
    'sends a signed-in user home when ?next=%s is unsafe',
    (next) => {
      renderLogin(`/login?next=${encodeURIComponent(next)}`, signedInAs());
      expect(screen.getByText('At home')).toBeInTheDocument();
    },
  );

  it('emails a sign-in link that returns to ?next=, then asks for the code', async () => {
    const user = renderLogin('/login?next=%2Fsettings');
    await sendEmail(user, '  Drummer@DrumPal.TEST ');

    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenCalledExactlyOnceWith({
      email: 'drummer@drumpal.test',
      options: {
        emailRedirectTo: `${window.location.origin}/settings`,
        shouldCreateUser: true,
      },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('drummer@drumpal.test');
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('shows why the email could not be sent and keeps the email form', async () => {
    fakeSupabase.auth.signInWithOtp.mockResolvedValue({
      data: null,
      error: { message: 'Email rate limit exceeded' },
    });
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't send the email: Email rate limit exceeded",
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('verifies a pasted code with spaces as the 6 digits, for the address it was sent to', async () => {
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    await user.type(await screen.findByLabelText('Code'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Sign in with code' }));

    expect(fakeSupabase.auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({
      email: 'drummer@drumpal.test',
      token: '123456',
      type: 'email',
    });
  });

  it('does not send a code that is the wrong length', async () => {
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    await user.type(await screen.findByLabelText('Code'), '12345');
    await user.click(screen.getByRole('button', { name: 'Sign in with code' }));
    expect(fakeSupabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('says when a code is rejected', async () => {
    fakeSupabase.auth.verifyOtp.mockResolvedValue({
      data: null,
      error: { message: 'Token has expired or is invalid' },
    });
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    await user.type(await screen.findByLabelText('Code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in with code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That code didn't work: Token has expired or is invalid",
    );
  });

  it('sends the email again to the same address', async () => {
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    await user.click(await screen.findByRole('button', { name: 'Send again' }));
    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenCalledTimes(2);
    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: 'drummer@drumpal.test' }),
    );
  });

  it('goes back to the email form, clearing the code and its error', async () => {
    fakeSupabase.auth.verifyOtp.mockResolvedValue({ data: null, error: { message: 'Bad code' } });
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    await user.type(await screen.findByLabelText('Code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in with code' }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    // The address stays filled in, ready to correct.
    expect(screen.getByLabelText('Email')).toHaveValue('drummer@drumpal.test');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Email'));
    await sendEmail(user, 'other@drumpal.test');
    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: 'other@drumpal.test' }),
    );
    expect(await screen.findByLabelText('Code')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains an expired magic link handed over by the guard', () => {
    renderRoutes(routes, {
      path: { pathname: '/login', state: { linkError: 'Email link is invalid or has expired' } },
      auth: signedOut,
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Email link is invalid or has expired Send yourself a new one.',
    );
  });
});
