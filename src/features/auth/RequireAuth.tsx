import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth';
import { FullPageMessage } from '@/components/FullPageMessage';
import { linkErrorFromHash, loginPathFor, type LoginRedirectState } from './loginRedirect';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>;
  if (auth.status === 'signedOut') {
    // The hash is left off: after a magic link it only holds auth tokens or errors.
    const state: LoginRedirectState = { linkError: linkErrorFromHash(location.hash) };
    return (
      <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} state={state} replace />
    );
  }
  return children;
}
