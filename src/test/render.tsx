/* eslint-disable react-refresh/only-export-components -- test helpers, never hot-reloaded */
/**
 * Render helpers for component tests: a fresh QueryClient without retries, a
 * fixed auth state, and a MemoryRouter at `path`. Pair with fakeSupabase.ts.
 */
import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, useLocation } from 'react-router';
import { AuthContext, authStateFromSession, LOADING_AUTH, type AuthState } from '@/lib/auth';
import { fakeSession } from './fakeSupabase';

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export const signedOut: AuthState = authStateFromSession(null);
export const loadingAuth: AuthState = LOADING_AUTH;
export function signedInAs(id = 'user-1', email = 'drummer@drumpal.test'): AuthState {
  return authStateFromSession(fakeSession(id, email));
}

interface RenderOptions {
  path?: string | { pathname: string; search?: string; hash?: string; state?: unknown };
  auth?: AuthState;
  queryClient?: QueryClient;
}

/**
 * Renders `routes` (a set of <Route>s) at `path`, plus a catch-all location
 * readout so redirects can be asserted with `screen.getByTestId('location')`.
 */
export function renderRoutes(routes: ReactNode, options: RenderOptions = {}) {
  const queryClient = options.queryClient ?? testQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext value={options.auth ?? signedInAs()}>
        <MemoryRouter initialEntries={[options.path ?? '/']}>
          <Routes>{routes}</Routes>
          <LocationReadout />
        </MemoryRouter>
      </AuthContext>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function LocationReadout() {
  const location = useLocation();
  return (
    <output data-testid="location" hidden>
      {`${location.pathname}${location.search}`}
    </output>
  );
}

/** A route element that only says where it is, for redirect targets. */
export function RouteMarker({ name }: { name: string }) {
  return <p>{`At ${name}`}</p>;
}

export function wrapperFor(queryClient: QueryClient, auth: AuthState = signedInAs()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext value={auth}>{children}</AuthContext>
      </QueryClientProvider>
    );
  };
}

/**
 * Lets work already under way finish and be drawn (TanStack Query notifies on
 * a timer). Only for a test about to assert that nothing changed: when
 * something should appear, wait for it with `findBy` or `waitFor` instead.
 */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
