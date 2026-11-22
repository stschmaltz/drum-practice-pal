import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { resetFakeSupabase } from '@/test/fakeSupabase';
import { renderRoutes, RouteMarker, signedInAs } from '@/test/render';
import { AppShell } from './AppShell';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const routes = (
  <Route element={<AppShell />}>
    <Route index element={<RouteMarker name="On the go" />} />
    <Route path="library" element={<RouteMarker name="Library" />} />
    <Route path="settings" element={<RouteMarker name="Settings" />} />
    <Route path="songs/:id" element={<RouteMarker name="Song" />} />
  </Route>
);

// jsdom has no CSS, so both navs (bottom tabs and sidebar) are in the tree;
// which one shows at which width is covered by tests/e2e/auth.spec.ts.
function navs() {
  return screen.getAllByRole('navigation', { name: 'Main' });
}

beforeEach(resetFakeSupabase);

describe('AppShell', () => {
  it('renders the current page inside the shell', () => {
    renderRoutes(routes, { path: '/library' });
    expect(screen.getByRole('main')).toHaveTextContent('At Library');
  });

  it('links to On the go, Library and Settings in each nav', () => {
    renderRoutes(routes, { path: '/' });
    expect(navs()).toHaveLength(2);
    for (const nav of navs()) {
      const links = within(nav).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(['On the go', 'Library', 'Settings']);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/',
        '/library',
        '/settings',
      ]);
    }
  });

  it.each([
    ['/', 'On the go'],
    ['/library', 'Library'],
    ['/settings', 'Settings'],
  ])('marks only the current page as active at %s', (path, label) => {
    renderRoutes(routes, { path });
    for (const nav of navs()) {
      const current = within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');
      expect(current.map((link) => link.textContent)).toEqual([label]);
    }
  });

  it('marks no tab active on a page outside the nav', () => {
    renderRoutes(routes, { path: '/songs/abc' });
    for (const nav of navs()) {
      expect(within(nav).queryByRole('link', { current: 'page' })).not.toBeInTheDocument();
    }
  });

  it('navigates when a tab is tapped', async () => {
    renderRoutes(routes, { path: '/' });
    const [first] = navs();
    await userEvent.click(within(first!).getByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('main')).toHaveTextContent('At Settings');
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it("shows who's signed in, with a sign-out button", () => {
    renderRoutes(routes, { path: '/', auth: signedInAs('u1', 'drummer@drumpal.test') });
    expect(screen.getByText('drummer@drumpal.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
