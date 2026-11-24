/**
 * A queued write whose access token the server refused (PGRST301, PGRST303).
 * supabase-js refreshes a session only when its stored expiry is near
 * (`__loadSession` in auth-js 2.119), so a token refused for another reason (a
 * bad signature, a server clock ahead of this one) would be sent again
 * unchanged at every retry, and the write would never land or fail. So the
 * write refreshes the session itself before it goes again.
 */
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { isTokenRefusal } from './network';
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
 * Runs `send`; on a token refusal refreshes the session and sends once more at
 * once. A refresh that couldn't reach the server leaves the token refusal to
 * the write's retries (`retryNetworkFailures`), which wait for a connection;
 * a refresh the server refused, or a new token refused too, fails the write.
 */
export async function sendRefreshingToken<T>(send: () => Promise<T>): Promise<T> {
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
