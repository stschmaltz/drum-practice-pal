import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '@/lib/auth';
import { signInFailureCopy } from '@/lib/errorCopy';
import { isOnline, useOnline } from '@/lib/network';
import { ErrorAlert } from '@/components/ErrorAlert';
import { FullPageMessage } from '@/components/FullPageMessage';
import { OfflineNote } from '@/components/OfflineNote';
import { Wordmark } from '@/components/Brand';
import {
  cardClass,
  dangerPanelClass,
  ghostButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from '@/components/styles';
import { safeNextPath, type LoginRedirectState } from './loginRedirect';
import { useSendSignInEmail, useVerifySignInCode } from './useAuthActions';
import {
  normalizeEmail,
  normalizeSignInCode,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_CODE_PATTERN,
} from './signInInput';

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
  const online = useOnline();

  if (auth.status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>;
  if (auth.status === 'signedIn') return <Navigate to={next} replace />;

  const send = (to: string) => {
    if (!isOnline()) return;
    sendEmail.mutate(
      { email: to, redirectTo: `${window.location.origin}${next}` },
      { onSuccess: () => setSentTo(to) },
    );
  };

  const sendError = sendEmail.error && (
    <ErrorAlert>Couldn't send the email. {signInFailureCopy(sendEmail.error)}</ErrorAlert>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-4 sm:p-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <h1>
          <Wordmark size="lg" />
        </h1>
        <p className="text-ink-muted">Sign in with a link sent to your email.</p>
      </header>
      <div className={`${cardClass} flex flex-col gap-5 p-5 sm:p-6`}>
        {linkError && !sentTo && (
          <p role="alert" className={`${dangerPanelClass} text-sm text-danger`}>
            {linkError} Send yourself a new one.
          </p>
        )}

        {!online && <OfflineNote>You're offline. Signing in needs a connection.</OfflineNote>}

        {sentTo === null ? (
          <EmailStep
            email={email}
            onEmailChange={setEmail}
            sending={sendEmail.isPending}
            offline={!online}
            onSend={send}
            sendError={sendError}
          />
        ) : (
          <CodeStep
            email={sentTo}
            sending={sendEmail.isPending}
            offline={!online}
            onSendAgain={() => send(sentTo)}
            onUseDifferentEmail={() => {
              setSentTo(null);
              sendEmail.reset();
            }}
            sendError={sendError}
          />
        )}
      </div>
    </main>
  );
}

function EmailStep({
  email,
  onEmailChange,
  sending,
  offline,
  onSend,
  sendError,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  sending: boolean;
  /** Nothing can be sent: the button is off. */
  offline: boolean;
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
      <label className={`flex flex-col gap-1 ${labelClass}`}>
        Email
        <input
          className={inputClass}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          // Straight to the one field on a laptop. Not on a touch screen, where focus brings
          // up the keyboard over the page before it has been read (and iOS ignores it anyway).
          autoFocus={pointerIsFine()}
          required
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </label>
      <button type="submit" className={primaryButtonClass} disabled={sending || offline}>
        {sending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      {sendError}
    </form>
  );
}

/** A mouse or trackpad: no on-screen keyboard to bring up. False where it can't be asked (tests, old browsers). */
function pointerIsFine(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

function CodeStep({
  email,
  sending,
  offline,
  onSendAgain,
  onUseDifferentEmail,
  sendError,
}: {
  email: string;
  sending: boolean;
  offline: boolean;
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
    if (normalized && isOnline()) verifyCode.mutate({ email, code: normalized });
  };

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-ink-soft">
        Check <strong className="break-all">{email}</strong> for a sign-in link. Open it on this
        device, or type the {SIGN_IN_CODE_LENGTH}-digit code from the email below.
      </p>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <label className={`flex flex-col gap-1 ${labelClass}`}>
          Code
          <input
            className={`${inputClass} text-center font-mono text-xl tracking-[0.4em]`}
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern={SIGN_IN_CODE_PATTERN}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={verifyCode.isPending || offline}
        >
          {verifyCode.isPending ? 'Checking…' : 'Sign in with code'}
        </button>
        {verifyCode.error && (
          <ErrorAlert>That code didn't work. {signInFailureCopy(verifyCode.error)}</ErrorAlert>
        )}
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          className={ghostButtonClass}
          disabled={sending || offline}
          onClick={() => {
            // A new email means a new code, so the last code's error no longer applies.
            verifyCode.reset();
            onSendAgain();
          }}
        >
          {sending ? 'Sending…' : 'Send again'}
        </button>
        {/* Unmounting this step clears the code and its error. */}
        <button type="button" className={ghostButtonClass} onClick={onUseDifferentEmail}>
          Use a different email
        </button>
      </div>
      {sendError}
    </div>
  );
}
