import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { resetFakeSupabase } from '@/test/fakeSupabase';
import { renderRoutes, RouteMarker, signedInAs } from '@/test/render';
import { AppShell } from './AppShell';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const routes = (
  <Route element={<AppShell />}>
    <Route index element={<RouteMarker name="Songs" />} />
    <Route path="stats" element={<RouteMarker name="Stats" />} />
    <Route path="settings" element={<RouteMarker name="Settings" />} />
    <Route path="songs/:id" element={<RouteMarker name="Song" />} />
    <Route path="songs/:id/loops/:loopId" element={<RouteMarker name="Practice" />} />
    <Route path="no-such-page" element={<RouteMarker name="Not found" />} />
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
    renderRoutes(routes, { path: '/stats' });
    expect(screen.getByRole('main')).toHaveTextContent('At Stats');
  });

  it('links to Songs, Stats and Settings in each nav', () => {
    renderRoutes(routes, { path: '/' });
    expect(navs()).toHaveLength(2);
    for (const nav of navs()) {
      const links = within(nav).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(['Songs', 'Stats', 'Settings']);
      expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/stats', '/settings']);
    }
  });

  it.each([
    ['/', 'Songs'],
    // A song's screens are a level below Songs.
    ['/songs/abc', 'Songs'],
    ['/songs/abc/loops/def', 'Songs'],
    ['/stats', 'Stats'],
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
    renderRoutes(routes, { path: '/no-such-page' });
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

describe('AppShell account line (12 UX pass)', () => {
  it('shows the address’s initial in a circle, hidden from screen readers, and the whole address in a title', () => {
    renderRoutes(routes, { path: '/', auth: signedInAs('u1', 'drummer@drumpal.test') });
    const line = screen.getByTitle('drummer@drumpal.test');
    expect(line).toHaveTextContent(/^Ddrummer@drumpal\.test$/);
    const initial = line.querySelector('[aria-hidden="true"]');
    expect(initial).toHaveTextContent('D');
    expect(line.querySelector('.truncate')).toHaveTextContent('drummer@drumpal.test');
  });

  it('marks the current page in the selected colour with an edge, not the brand', () => {
    renderRoutes(routes, { path: '/stats' });
    for (const nav of navs()) {
      const current = within(nav).getByRole('link', { name: 'Stats' });
      expect(current).toHaveAttribute('aria-current', 'page');
      expect(current.className).toMatch(/selected-line/);
      expect(current.className).not.toMatch(/text-brand/);
    }
  });
});
