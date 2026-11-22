import { screen } from '@testing-library/react';
import { Route, useLocation } from 'react-router';
import { loadingAuth, renderRoutes, RouteMarker, signedInAs, signedOut } from '@/test/render';
import { EXPIRED_LINK_MESSAGE, type LoginRedirectState } from './loginRedirect';
import { RequireAuth } from './RequireAuth';

function LoginProbe() {
  const state = useLocation().state as LoginRedirectState | null;
  return <p>{`Login, link error: ${state?.linkError ?? 'none'}`}</p>;
}

const routes = (
  <>
    <Route path="/login" element={<LoginProbe />} />
    <Route
      path="*"
      element={
        <RequireAuth>
          <RouteMarker name="guarded page" />
        </RequireAuth>
      }
    />
  </>
);

describe('RequireAuth', () => {
  it('shows a loading message, not the page or a redirect, while the session is unknown', () => {
    renderRoutes(routes, { path: '/settings', auth: loadingAuth });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('At guarded page')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it('renders the page for a signed-in user', () => {
    renderRoutes(routes, { path: '/settings', auth: signedInAs() });
    expect(screen.getByText('At guarded page')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to /login with the page and query as ?next=', () => {
    renderRoutes(routes, { path: '/songs/abc?tab=loops', auth: signedOut });
    expect(screen.getByText('Login, link error: none')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/login?next=${encodeURIComponent('/songs/abc?tab=loops')}`,
    );
  });

  it('sends a signed-out visitor at / to plain /login', () => {
    renderRoutes(routes, { path: '/', auth: signedOut });
    expect(screen.getByTestId('location').textContent).toBe('/login');
  });

  it('passes an expired magic-link error from the hash on to /login', () => {
    renderRoutes(routes, {
      path: {
        pathname: '/',
        hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      },
      auth: signedOut,
    });
    expect(screen.getByText(`Login, link error: ${EXPIRED_LINK_MESSAGE}`)).toBeInTheDocument();
  });
});
