/**
 * The session supabase-js keeps in localStorage, for the one case where it
 * keeps a session but reports none.
 *
 * At start supabase-js reports the stored session as INITIAL_SESSION. If the
 * access token has expired it refreshes first, and with no connection that
 * refresh fails: supabase-js keeps the session (so it can refresh later) but
 * reports INITIAL_SESSION with null. A refresh the server refused removes the
 * session instead. So "no session reported, one still stored" means the
 * refresh only lacked a network, and the user is still signed in: the app
 * opens on the stored session, and supabase-js refreshes it (reporting
 * TOKEN_REFRESHED) on its next request or timer tick once there's a connection.
 */
import type { Session } from '@supabase/supabase-js';
import { authStorageKey } from './supabase';

/** A stored session, or null when `raw` isn't one (missing, not JSON, or missing what a session has). */
export function sessionFromStorage(raw: string | null): Session | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const session = value as Partial<Session>;
  const userId = (session.user as { id?: unknown } | undefined)?.id;
  if (
    typeof session.access_token !== 'string' ||
    typeof session.refresh_token !== 'string' ||
    typeof userId !== 'string' ||
    userId === ''
  ) {
    return null;
  }
  return session as Session;
}

/** The session in localStorage now; null if there is none or storage can't be read. */
export function readStoredSession(): Session | null {
  try {
    return sessionFromStorage(localStorage.getItem(authStorageKey));
  } catch {
    return null;
  }
}
