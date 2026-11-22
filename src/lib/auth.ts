import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type AuthState =
  | { status: 'loading'; session: null; user: null }
  | { status: 'signedOut'; session: null; user: null }
  | { status: 'signedIn'; session: Session; user: User };

export const LOADING_AUTH: AuthState = { status: 'loading', session: null, user: null };

export function authStateFromSession(session: Session | null): AuthState {
  return session
    ? { status: 'signedIn', session, user: session.user }
    : { status: 'signedOut', session: null, user: null };
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

/**
 * The signed-in user, for screens behind <RequireAuth>. Query hooks key their
 * data by this id, so one user's cache is never served to another.
 */
export function useSignedInUser(): User {
  const auth = useAuth();
  if (auth.status !== 'signedIn') {
    throw new Error('useSignedInUser must be used inside <RequireAuth>');
  }
  return auth.user;
}
