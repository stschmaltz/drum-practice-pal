/* eslint-disable react-refresh/only-export-components -- test helpers, never hot-reloaded */
/**
 * Render helpers for component tests: a fresh QueryClient without retries, a
 * fixed auth state, and a MemoryRouter at `path`. Pair with fakeSupabase.ts.
 */
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, useLocation, useNavigate } from 'react-router';
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

type Path = string | { pathname: string; search?: string; hash?: string; state?: unknown };

interface RenderOptions {
  path?: Path;
  /** History entries before `path`, oldest first, for tests of Back after a redirect. */
  before?: string[];
  auth?: AuthState;
  queryClient?: QueryClient;
}

/**
 * Renders `routes` (a set of <Route>s) at `path`, plus a catch-all location
 * readout so redirects can be asserted with `screen.getByTestId('location')`,
 * and the browser's Back and Forward (`historyBack()`, `historyForward()`).
 */
export function renderRoutes(routes: ReactNode, options: RenderOptions = {}) {
  const queryClient = options.queryClient ?? testQueryClient();
  const entries = [...(options.before ?? []), options.path ?? '/'];
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext value={options.auth ?? signedInAs()}>
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
          <Routes>{routes}</Routes>
          <LocationReadout />
          <HistoryControls />
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

/** Hidden, so no role query finds them; pressed by `historyBack` / `historyForward`. */
function HistoryControls() {
  const navigate = useNavigate();
  return (
    <div hidden>
      <button type="button" data-testid="history-back" onClick={() => void navigate(-1)} />
      <button type="button" data-testid="history-forward" onClick={() => void navigate(1)} />
    </div>
  );
}

/** The browser's Back button, for a test rendered with `renderRoutes`. */
export function historyBack(): void {
  fireEvent.click(screen.getByTestId('history-back'));
}

/** The browser's Forward button. */
export function historyForward(): void {
  fireEvent.click(screen.getByTestId('history-forward'));
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
