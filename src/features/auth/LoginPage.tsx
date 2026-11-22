import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '@/lib/auth';
import { ErrorAlert } from '@/components/ErrorAlert';
import { FullPageMessage } from '@/components/FullPageMessage';
import { buttonClass, inputClass, primaryButtonClass } from '@/components/styles';
import { safeNextPath, type LoginRedirectState } from './loginRedirect';
import { useSendSignInEmail, useVerifySignInCode } from './useAuthActions';
import { normalizeEmail, normalizeSignInCode, SIGN_IN_CODE_LENGTH } from './signInInput';

/** Step one asks for an email; once it's sent, step two takes the code from it. */
export function LoginPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const next = safeNextPath(searchParams.get('next'));
  const linkError = (location.state as LoginRedirectState | null)?.linkError ?? null;

  // Kept here, not in EmailStep, so the address is still filled in after "Use a different email".
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sendEmail = useSendSignInEmail();

  if (auth.status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>;
  if (auth.status === 'signedIn') return <Navigate to={next} replace />;

  const send = (to: string) => {
    sendEmail.mutate(
      { email: to, redirectTo: `${window.location.origin}${next}` },
      { onSuccess: () => setSentTo(to) },
    );
  };

  const sendError = sendEmail.error && (
    <ErrorAlert>Couldn't send the email: {sendEmail.error.message}</ErrorAlert>
  );

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
        <EmailStep
          email={email}
          onEmailChange={setEmail}
          sending={sendEmail.isPending}
          onSend={send}
          sendError={sendError}
        />
      ) : (
        <CodeStep
          email={sentTo}
          sending={sendEmail.isPending}
          onSendAgain={() => send(sentTo)}
          onUseDifferentEmail={() => {
            setSentTo(null);
            sendEmail.reset();
          }}
          sendError={sendError}
        />
      )}
    </main>
  );
}

function EmailStep({
  email,
  onEmailChange,
  sending,
  onSend,
  sendError,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  sending: boolean;
  onSend: (email: string) => void;
  sendError: ReactNode;
}) {
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (normalized) onSend(normalized);
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
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
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </label>
      <button type="submit" className={primaryButtonClass} disabled={sending}>
        {sending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      {sendError}
    </form>
  );
}

function CodeStep({
  email,
  sending,
  onSendAgain,
  onUseDifferentEmail,
  sendError,
}: {
  email: string;
  sending: boolean;
  onSendAgain: () => void;
  onUseDifferentEmail: () => void;
  sendError: ReactNode;
}) {
  const [code, setCode] = useState('');
  const verifyCode = useVerifySignInCode();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeSignInCode(code);
    // On success AuthProvider sees SIGNED_IN and LoginPage's redirect takes over.
    if (normalized) verifyCode.mutate({ email, code: normalized });
  };

  return (
    <div className="flex flex-col gap-4">
      <p role="status">
        Check <strong className="break-all">{email}</strong> for a sign-in link. Open it on this
        device, or type the {SIGN_IN_CODE_LENGTH}-digit code from the email below.
      </p>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
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
          <ErrorAlert>That code didn't work: {verifyCode.error.message}</ErrorAlert>
        )}
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          className={buttonClass}
          disabled={sending}
          onClick={() => {
            // A new email means a new code, so the last code's error no longer applies.
            verifyCode.reset();
            onSendAgain();
          }}
        >
          {sending ? 'Sending…' : 'Send again'}
        </button>
        {/* Unmounting this step clears the code and its error. */}
        <button type="button" className={buttonClass} onClick={onUseDifferentEmail}>
          Use a different email
        </button>
      </div>
      {sendError}
    </div>
  );
}
