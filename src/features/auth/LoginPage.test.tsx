import { act, fireEvent, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { fakeSupabase, resetFakeSupabase } from '@/test/fakeSupabase';
import {
  loadingAuth,
  renderRoutes,
  RouteMarker,
  settle,
  signedInAs,
  signedOut,
} from '@/test/render';
import { LoginPage } from './LoginPage';
import { EXPIRED_LINK_MESSAGE } from './loginRedirect';

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

  it('asks for no code where the email carries only the link', async () => {
    vi.stubEnv('VITE_SIGN_IN_CODE', 'off');
    try {
      const user = renderLogin();
      await sendEmail(user, 'drummer@drumpal.test');

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent('Open it on this device to sign in.');
      expect(status).not.toHaveTextContent('code');
      expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('shows why the email could not be sent and keeps the email form', async () => {
    fakeSupabase.auth.signInWithOtp.mockResolvedValue({
      data: null,
      error: {
        message: 'Email rate limit exceeded',
        code: 'over_email_send_rate_limit',
      },
    });
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't send the email. Too many emails were asked for. Wait a minute, then try again.",
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

  // Unit 13 Test: without a connection Auth's client says "Failed to fetch"; the page never does.
  it('says the server could not be reached when the email request never got there', async () => {
    fakeSupabase.auth.signInWithOtp.mockResolvedValue({
      data: null,
      // As supabase-js's auth client builds it.
      error: Object.assign(new Error('Failed to fetch'), {
        name: 'AuthRetryableFetchError',
        status: 0,
      }),
    });
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "Couldn't send the email. The server couldn't be reached. Check the connection and try again.",
    );
    expect(alert).not.toHaveTextContent('Failed to fetch');
  });

  it('says when a code is rejected', async () => {
    fakeSupabase.auth.verifyOtp.mockResolvedValue({
      data: null,
      error: { message: 'Token has expired or is invalid', code: 'otp_expired' },
    });
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    await user.type(await screen.findByLabelText('Code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in with code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That code didn't work. It's wrong, has expired or was already used. Check it, or ask for a new email.",
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

  it("clears a rejected code's error when the email is sent again", async () => {
    fakeSupabase.auth.verifyOtp.mockResolvedValue({ data: null, error: { message: 'Bad code' } });
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    await user.type(await screen.findByLabelText('Code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in with code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work");

    await user.click(screen.getByRole('button', { name: 'Send again' }));
    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('builds the magic link from ?next= without its fragment', async () => {
    const user = renderLogin(`/login?next=${encodeURIComponent('/settings#frag')}`);
    await sendEmail(user, 'drummer@drumpal.test');
    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: `${window.location.origin}/settings`,
        }) as unknown,
      }),
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
      path: { pathname: '/login', state: { linkError: EXPIRED_LINK_MESSAGE } },
      auth: signedOut,
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      `${EXPIRED_LINK_MESSAGE} Send yourself a new one.`,
    );
  });
});

describe('LoginPage offline', () => {
  it('turns sending the email off with a reason, and an Enter in the field sends nothing', async () => {
    const user = renderLogin();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByTestId('offline-note')).toHaveTextContent('Signing in needs a connection.');
    const send = screen.getByRole('button', { name: 'Email me a sign-in link' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('Email'), 'drummer@drumpal.test{Enter}');
    fireEvent.submit(send.closest('form')!);
    await settle();
    expect(fakeSupabase.auth.signInWithOtp).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(send).toBeEnabled();
    await user.click(send);
    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('turns the code and "send again" off when the connection goes after the email was sent', async () => {
    const user = renderLogin();
    await sendEmail(user, 'drummer@drumpal.test');
    const code = await screen.findByLabelText('Code');
    await user.type(code, '123456');
    act(() => onlineManager.setOnline(false));

    const verify = screen.getByRole('button', { name: 'Sign in with code' });
    expect(verify).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send again' })).toBeDisabled();
    fireEvent.submit(verify.closest('form')!);
    await settle();
    expect(fakeSupabase.auth.verifyOtp).not.toHaveBeenCalled();
    expect(fakeSupabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);

    act(() => onlineManager.setOnline(true));
    await user.click(verify);
    expect(fakeSupabase.auth.verifyOtp).toHaveBeenCalledTimes(1);
  });
});

describe('LoginPage email field (12 UX pass)', () => {
  const pointer = (fine: boolean) =>
    // jsdom has no matchMedia, and Vitest 4 won't spy on a missing property.
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(pointer: fine)' ? fine : false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
  afterEach(() => vi.unstubAllGlobals());

  it('shows an example address in the empty field', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@example.com');
  });

  it('takes focus on a device with a mouse or trackpad', () => {
    pointer(true);
    renderLogin();
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('leaves focus alone on a touch screen, where it would bring up the keyboard unasked', () => {
    pointer(false);
    renderLogin();
    expect(screen.getByLabelText('Email')).not.toHaveFocus();
  });
});
