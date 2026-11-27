import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { Route } from 'react-router';
import { queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { loopRow } from '@/test/loopTable';
import { renderRoutes } from '@/test/render';
import { StatsPage } from './StatsPage';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const ok = (data: unknown): FakeResult => ({ data, error: null });
const daysAgo = (days: number, hour = 12) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour).toISOString();
};

const LOOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessions = [
  {
    id: 's1',
    loop_id: LOOP,
    started_at: daysAgo(0, 8),
    duration_seconds: 600,
    speed_ratio: 0.7,
    repeats: 20,
  },
  {
    id: 's2',
    loop_id: LOOP,
    started_at: daysAgo(1),
    duration_seconds: 300,
    speed_ratio: 0.8,
    repeats: 10,
  },
  {
    id: 's3',
    loop_id: LOOP,
    started_at: daysAgo(20),
    duration_seconds: 1200,
    speed_ratio: 0.6,
    repeats: 40,
  },
];
const loops = [
  {
    ...loopRow(LOOP, { name: 'Groove', status: 'finished', finished_at: daysAgo(1) }),
    song: { title: 'Groove 120', artist: '' },
  },
];

function serve() {
  queryResult.mockImplementation(async (call) =>
    call.table === 'practice_sessions' ? ok(sessions) : ok(loops),
  );
}

function renderStats(path = '/stats') {
  renderRoutes(<Route path="/stats" element={<StatsPage />} />, { path });
  return userEvent.setup();
}

const total = (id: string) => screen.getByTestId(id).textContent;

beforeEach(resetFakeSupabase);

describe('StatsPage', () => {
  it('sums the week, then the month and all time, keeping the choice in the URL', async () => {
    serve();
    const user = renderStats();
    await screen.findByTestId('stats-totals');
    expect([
      total('total-time'),
      total('total-days'),
      total('total-passes'),
      total('total-mastered'),
    ]).toEqual(['15 min', '2', '30', '1']);

    await user.click(screen.getByRole('radio', { name: 'Month' }));
    expect(total('total-time')).toBe('35 min');
    expect(total('total-days')).toBe('3');
    expect(screen.getByTestId('location')).toHaveTextContent('/stats?range=month');

    await user.click(screen.getByRole('radio', { name: 'Week' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/stats$/);
  });

  it('opens on the range the URL names', async () => {
    serve();
    renderStats('/stats?range=all');
    await screen.findByTestId('stats-totals');
    expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked();
    expect(total('total-passes')).toBe('70');
  });

  it('draws each chart with words for it', async () => {
    serve();
    renderStats();
    expect(
      await screen.findByRole('img', { name: /Minutes practised per day, last 14 days: 15 min/ }),
    ).toBeVisible();
    expect(screen.getByRole('img', { name: /Practised on 3 of the last \d+ days/ })).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Speed of Groove over 3 sessions: from 60% to 70%.' }),
    ).toBeVisible();
    expect(
      screen.getByRole('table', { name: 'Speed of Groove at each session' }),
    ).toBeInTheDocument();
  });

  it('lists the badges, earned ones marked and locked ones with their progress', async () => {
    serve();
    renderStats();
    const badges = within(await screen.findByRole('list', { name: 'Badges' })).getAllByRole(
      'listitem',
    );
    const byLabel = (label: string) => badges.find((badge) => badge.textContent?.includes(label));
    expect(byLabel('First loop mastered')).toHaveAttribute('data-earned', 'true');
    expect(byLabel('First loop mastered')).toHaveTextContent('Earned');
    expect(byLabel('7-day streak')).not.toHaveAttribute('data-earned');
    expect(byLabel('7-day streak')).toHaveTextContent('2 of 7 days in a row');
  });

  it('says so offline with nothing cached', async () => {
    serve();
    act(() => onlineManager.setOnline(false));
    renderStats();
    expect(
      await screen.findByText(/your stats haven't been opened on this device yet/),
    ).toBeVisible();
  });
});
