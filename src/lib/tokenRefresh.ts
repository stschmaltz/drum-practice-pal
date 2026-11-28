/**
 * A queued write and the session it is signed with. Two things can be wrong
 * with the session that are not the server's refusal of the write:
 *
 * - The server refused the access token (PGRST301, PGRST303). supabase-js
 *   refreshes a session only when its stored expiry is near (`__loadSession`
 *   in auth-js 2.119), so a token refused for another reason (a bad signature,
 *   a server clock ahead of this one) would be sent again unchanged at every
 *   retry, and the write would never land or fail. So the write refreshes the
 *   session itself before it goes again.
 * - supabase-js has no session at all, though one is still stored: its refresh
 *   of an expired token failed for the connection. It then signs requests with
 *   the publishable key, so the write would go out as `anon` and come back
 *   42501, which is also what a missing grant says. So the write asks for the
 *   session before it sends, and waits for its retries when there is none.
 */
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { SessionNotLoadedError, isTokenRefusal } from './network';
import { readStoredSession } from './storedSession';
import { supabase } from './supabase';

/** The session can't give the write a token the server takes: a refusal, not something to retry. */
export class TokenRefusedError extends Error {
  readonly code = 'token_refused';
  constructor() {
    super('Your sign-in has expired. Sign in again to save this.');
    this.name = 'TokenRefusedError';
  }
}

/**
 * Whether supabase-js has a session to sign a request with. Asking is also
 * what makes it try the refresh again (`getSession` refreshes an expired
 * token), though not at every ask: auth-js answers with the last failure
 * for a minute after one (`REFRESH_FAILURE_COOLDOWN_MS`), so a held-back write
 * can land up to a minute, plus its own back-off, after the connection is back.
 *
 * The answer's `error` is not read on purpose: whatever it says, the question
 * here is only whether there is a session, and storage is what tells "the
 * refresh found no connection" from "signed out" (see `sendRefreshingToken`).
 */
async function hasSessionInMemory(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  } catch {
    return false;
  }
}

/**
 * Runs `send`, but only with a session to sign it: with none in memory while
 * one is still stored it sends nothing and throws `SessionNotLoadedError`, a
 * network failure, so the write's retries (`retryNetworkFailures`) wait for
 * the connection. With none stored either the user is signed out, and the
 * write goes to the server for its refusal as before.
 *
 * On a token refusal it refreshes the session and sends once more at once. A
 * refresh that couldn't reach the server leaves the token refusal to the
 * retries too; a refresh the server refused, or a new token refused too,
 * fails the write.
 */
export async function sendRefreshingToken<T>(send: () => Promise<T>): Promise<T> {
  // Storage is read after the answer, not before: a refresh the server refused
  // removes the stored session while `getSession` is still answering.
  if (!(await hasSessionInMemory()) && readStoredSession() !== null) {
    throw new SessionNotLoadedError();
  }
  try {
    return await send();
  } catch (error) {
    if (!isTokenRefusal(error)) throw error;
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      if (isAuthRetryableFetchError(refreshError)) throw error;
      throw new TokenRefusedError();
    }
  }
  try {
    return await send();
  } catch (error) {
    if (isTokenRefusal(error)) throw new TokenRefusedError();
    throw error;
  }
}
