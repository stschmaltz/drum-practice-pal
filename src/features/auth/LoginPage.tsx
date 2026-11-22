import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '@/lib/auth';
import { FullPageMessage } from '@/components/FullPageMessage';
import { buttonClass, inputClass, primaryButtonClass } from '@/components/styles';
import { safeNextPath } from './nextPath';
import type { LoginRedirectState } from './RequireAuth';
import { useSendSignInEmail, useVerifySignInCode } from './useAuthActions';
import { normalizeEmail, normalizeSignInCode, SIGN_IN_CODE_LENGTH } from './signInInput';

export function LoginPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const next = safeNextPath(searchParams.get('next'));
  const linkError = (location.state as LoginRedirectState | null)?.linkError ?? null;

  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const sendEmail = useSendSignInEmail();
  const verifyCode = useVerifySignInCode();

  if (auth.status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>;
  if (auth.status === 'signedIn') return <Navigate to={next} replace />;

  const send = (to: string) => {
    sendEmail.mutate(
      { email: to, redirectTo: `${window.location.origin}${next}` },
      { onSuccess: () => setSentTo(to) },
    );
  };

  const onSubmitEmail = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (normalized) send(normalized);
  };

  const onSubmitCode = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeSignInCode(code);
    // On success AuthProvider sees SIGNED_IN and the redirect above takes over.
    if (sentTo && normalized) verifyCode.mutate({ email: sentTo, code: normalized });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Drum Practice Pal</h1>
        <p className="text-neutral-400">Sign in with a link sent to your email.</p>
      </header>

      {linkError && !sentTo && (
        <p role="alert" className="rounded-md bg-red-950 p-3 text-sm text-red-200">
          {linkError} Send yourself a new one.
        </p>
      )}

      {sentTo === null ? (
        <form className="flex flex-col gap-3" onSubmit={onSubmitEmail}>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              className={inputClass}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit" className={primaryButtonClass} disabled={sendEmail.isPending}>
            {sendEmail.isPending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {sendEmail.error && (
            <p role="alert" className="text-sm text-red-300">
              Couldn't send the email: {sendEmail.error.message}
            </p>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="status">
            Check <strong className="break-all">{sentTo}</strong> for a sign-in link. Open it on
            this device, or type the {SIGN_IN_CODE_LENGTH}-digit code from the email below.
          </p>
          <form className="flex flex-col gap-3" onSubmit={onSubmitCode}>
            <label className="flex flex-col gap-1 text-sm">
              Code
              <input
                className={`${inputClass} tracking-widest`}
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern={`[0-9 ]{${SIGN_IN_CODE_LENGTH},}`}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button type="submit" className={primaryButtonClass} disabled={verifyCode.isPending}>
              {verifyCode.isPending ? 'Checking…' : 'Sign in with code'}
            </button>
            {verifyCode.error && (
              <p role="alert" className="text-sm text-red-300">
                That code didn't work: {verifyCode.error.message}
              </p>
            )}
          </form>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              className={buttonClass}
              disabled={sendEmail.isPending}
              onClick={() => send(sentTo)}
            >
              {sendEmail.isPending ? 'Sending…' : 'Send again'}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setSentTo(null);
                setCode('');
                verifyCode.reset();
                sendEmail.reset();
              }}
            >
              Use a different email
            </button>
          </div>
          {sendEmail.error && (
            <p role="alert" className="text-sm text-red-300">
              Couldn't send the email: {sendEmail.error.message}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
