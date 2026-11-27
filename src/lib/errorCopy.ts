/**
 * What the app says when something fails. Never the error's own message: a
 * browser's "Failed to fetch" or a Postgres constraint name means nothing to
 * a drummer, and text from the server is not ours to show. Each failure maps
 * to a fixed sentence by its kind (no connection, sign-in refused, item gone,
 * refused by the server); only errors the app wrote itself
 * (`UserFacingError`) are shown as they are.
 */
import { isNetworkFailure, isTokenRefusal } from './network';
import { PG } from './postgresCodes';

/** An error whose message the app wrote to be shown as is. */
export class UserFacingError extends Error {
  override name = 'UserFacingError';
}

export const FAILURE_COPY = {
  network: "The server couldn't be reached. Check the connection and try again.",
  signIn: 'Your sign-in has run out. Sign in again to carry on.',
  gone: 'It has been deleted, on this device or another.',
  refused: 'The server refused it. Try again, or reload the page.',
  unknown: 'Something went wrong. Try again.',
} as const;

export type FailureKind = keyof typeof FAILURE_COPY;

/** Postgres and PostgREST codes that mean the row the write was about isn't there any more. */
const GONE_CODES = new Set<string>([PG.FOREIGN_KEY_VIOLATION, PG.NO_ROWS]);

function fieldOf(error: unknown, field: 'code' | 'name' | 'status' | 'originalError'): unknown {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

/** Which of the fixed sentences fits this failure. */
export function failureKind(error: unknown): FailureKind {
  // supabase-js's auth client wraps a failed fetch as AuthRetryableFetchError, and
  // its storage client as StorageUnknownError carrying the TypeError.
  if (
    isNetworkFailure(error) ||
    fieldOf(error, 'name') === 'AuthRetryableFetchError' ||
    fieldOf(error, 'originalError') instanceof TypeError
  ) {
    return 'network';
  }
  const code = fieldOf(error, 'code');
  // 'token_refused' is TokenRefusedError's (tokenRefresh.ts, which this pure module can't import).
  if (isTokenRefusal(error) || code === 'token_refused') return 'signIn';
  if (typeof code === 'string' && GONE_CODES.has(code)) return 'gone';
  if (typeof code === 'string' && code !== '') return 'refused';
  const status = fieldOf(error, 'status');
  if (typeof status === 'number' && status >= 400) return 'refused';
  return 'unknown';
}

/** The sentence to show after "Couldn't …:" for any failure. */
export function failureCopy(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  return FAILURE_COPY[failureKind(error)];
}

/** Supabase Auth's codes for a sign-in email or code, mapped to fixed copy. */
const TOO_MANY_TRIES = 'Too many tries. Wait a minute, then try again.';
const SIGN_IN_COPY: Partial<Record<string, string>> = {
  over_email_send_rate_limit: 'Too many emails were asked for. Wait a minute, then try again.',
  over_request_rate_limit: TOO_MANY_TRIES,
  otp_expired: "It's wrong, has expired or was already used. Check it, or ask for a new email.",
  email_address_invalid: "That email address isn't one the server takes.",
  signup_disabled: 'New accounts are closed.',
};

/** `failureCopy` for the sign-in page, which knows Auth's own codes too. */
export function signInFailureCopy(error: unknown): string {
  const code = fieldOf(error, 'code');
  if (typeof code === 'string') {
    const known = SIGN_IN_COPY[code];
    if (known !== undefined) return known;
  }
  if (fieldOf(error, 'status') === 429) return TOO_MANY_TRIES;
  return failureCopy(error);
}
