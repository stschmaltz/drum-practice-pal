import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext, LOADING_AUTH, authStateFromSession, type AuthState } from './auth';
import { supabase } from './supabase';

/**
 * Tracks the Supabase session. supabase-js refreshes tokens on its own
 * (autoRefreshToken) and reports every change here, including a failed refresh,
 * which arrives as SIGNED_OUT and sends guarded routes back to /login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState<AuthState>(LOADING_AUTH);

  useEffect(() => {
    // INITIAL_SESSION fires once the stored session (or a magic-link fragment in
    // the URL) has been read, so 'loading' lasts until we actually know.
    // Supabase warns against awaiting its own calls inside this callback.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') queryClient.clear();
      setAuth(authStateFromSession(session));
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext value={auth}>{children}</AuthContext>;
}
