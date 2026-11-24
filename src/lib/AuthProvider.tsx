import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext, LOADING_AUTH, authStateFromSession, type AuthState } from './auth';
import { isOnline } from './network';
import { readStoredSession } from './storedSession';
import { supabase } from './supabase';

/**
 * Tracks the Supabase session. supabase-js refreshes tokens on its own
 * (autoRefreshToken) and reports every change here. A refresh the server
 * refused arrives as SIGNED_OUT, which sends guarded routes back to /login.
 * One that failed for want of a network sends nothing (supabase-js 2.119
 * keeps the session and tries again), except at start: see storedSession.ts.
 *
 * `onSignedOut` empties this device of the user's data kept for offline use;
 * the in-memory query cache is cleared here.
 */
export function AuthProvider({
  children,
  onSignedOut,
}: {
  children: ReactNode;
  onSignedOut?: () => void;
}) {
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState<AuthState>(startingAuth);
  const signedOut = useRef(onSignedOut);
  useEffect(() => {
    signedOut.current = onSignedOut;
  }, [onSignedOut]);

  useEffect(() => {
    // INITIAL_SESSION fires once the stored session (or a magic-link fragment in
    // the URL) has been read, so 'loading' lasts until we actually know.
    // Supabase warns against awaiting its own calls inside this callback.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        signedOut.current?.();
      }
      const kept = event === 'INITIAL_SESSION' && !session ? readStoredSession() : null;
      setAuth(authStateFromSession(session ?? kept));
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext value={auth}>{children}</AuthContext>;
}

/**
 * Loading, except offline with a session stored: then the user is signed in
 * at once. supabase-js would get there too (storedSession.ts), but with an
 * expired access token it first retries the refresh for up to 30 seconds,
 * and the app would sit on "Loading…" all that time.
 */
function startingAuth(): AuthState {
  if (isOnline()) return LOADING_AUTH;
  const kept = readStoredSession();
  return kept ? authStateFromSession(kept) : LOADING_AUTH;
}
