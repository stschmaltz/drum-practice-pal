import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { Route } from 'react-router';
import { queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { sessionKeys } from '@/features/practice/sessionKeys';
import { loopRow } from '@/test/loopTable';
import { renderRoutes, settle } from '@/test/render';
import { BADGES, badgeProgress } from './badges';
import { BadgeSection } from './BadgeSection';
import { StatsPage } from './StatsPage';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const ok = (data: unknown): FakeResult => ({ data, error: null });
const daysAgo = (days: number, hour = 12) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour).toISOString();
};

const LOOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let nextSession = 0;
function session(
  started_at: string,
  duration_seconds: number,
  speed_ratio: number,
  repeats = 1,
  loop_id = LOOP,
) {
  nextSession += 1;
  return { id: `s${nextSession}`, loop_id, started_at, duration_seconds, speed_ratio, repeats };
}

const today = session(daysAgo(0, 8), 600, 0.7, 20);
const yesterday = session(daysAgo(1), 300, 0.8, 10);
const weeksAgo = session(daysAgo(20), 1200, 0.6, 40);
const sessions = [today, yesterday, weeksAgo];

const practiceLoop = (id: string, name: string, song: { id: string; title: string }) => ({
  ...loopRow(id, { name, song_id: song.id }),
  song: { title: song.title, artist: '' },
});
const GROOVE_SONG = { id: 'song-groove', title: 'Groove 120' };
const loops = [
  {
    ...practiceLoop(LOOP, 'Groove', GROOVE_SONG),
    status: 'finished',
    finished_at: daysAgo(1),
  },
];

function serve(served: { sessions: unknown[]; loops: unknown[] } = { sessions, loops }) {
  queryResult.mockImplementation(async (call) =>
    call.table === 'practice_sessions' ? ok(served.sessions) : ok(served.loops),
  );
}

function renderStats(path = '/stats') {
  renderRoutes(<Route path="/stats" element={<StatsPage />} />, { path });
  return userEvent.setup();
}

const text = (id: string) => screen.getByTestId(id).textContent;
const progressRows = () =>
  within(screen.getByRole('list', { name: 'Loop progress' })).getAllByTestId('loop-progress');

beforeEach(resetFakeSupabase);

describe('StatsPage', () => {
  it('sums the week, then the month and all time, keeping the choice in the URL', async () => {
    serve();
    const user = renderStats();
    await screen.findByTestId('stats-totals');
    expect(screen.getByRole('heading', { name: 'Last 7 days' })).toBeVisible();
    expect([
      text('total-time'),
      text('total-days'),
      text('total-passes'),
      text('total-mastered'),
    ]).toEqual(['15 min', '2', '30', '1']);

    await user.click(screen.getByRole('radio', { name: 'Month' }));
    expect(screen.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
    expect(text('total-time')).toBe('35 min');
    expect(text('total-days')).toBe('3');
    expect(screen.getByTestId('location')).toHaveTextContent('/stats?range=month');

    await user.click(screen.getByRole('radio', { name: 'Week' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/stats$/);
  });

  it('opens on the range the URL names', async () => {
    serve();
    renderStats('/stats?range=all');
    await screen.findByTestId('stats-totals');
    expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked();
    expect(text('total-passes')).toBe('70');
  });

  describe('against the period before', () => {
    it('says how each total of the week and the month compares, and nothing for all time', async () => {
      // The week before this one: 5 minutes on one day, 50 passes.
      serve({ sessions: [...sessions, session(daysAgo(9), 300, 0.6, 50)], loops });
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      expect(text('total-time-change')).toBe('10 min more than the week before');
      expect(text('total-days-change')).toBe('1 more than the week before');
      expect(text('total-passes-change')).toBe('20 fewer than the week before');
      expect(text('total-mastered-change')).toBe('1 more than the week before');

      await user.click(screen.getByRole('radio', { name: 'Month' }));
      // Nothing in the thirty days before these thirty.
      expect(text('total-time-change')).toBe('40 min more than the month before');
      expect(text('total-passes-change')).toBe('120 more than the month before');

      await user.click(screen.getByRole('radio', { name: 'All time' }));
      expect(text('total-time')).toBe('40 min');
      expect(screen.queryByTestId('total-time-change')).not.toBeInTheDocument();
      expect(screen.queryByTestId('total-mastered-change')).not.toBeInTheDocument();
    });

    it('leaves out the line for a total that is nothing in both periods', async () => {
      serve({ sessions, loops: [practiceLoop(LOOP, 'Groove', GROOVE_SONG)] });
      renderStats();
      await screen.findByTestId('stats-totals');
      expect(text('total-mastered')).toBe('0');
      expect(screen.queryByTestId('total-mastered-change')).not.toBeInTheDocument();
      expect(screen.getByTestId('total-time-change')).toBeInTheDocument();
    });
  });

  describe('the streak line', () => {
    it('gives the streak running now, and says when it is the longest', async () => {
      serve();
      renderStats();
      expect(await screen.findByTestId('streak-line')).toHaveTextContent(
        'On a 2-day streak. Your longest yet.',
      );
    });

    it('gives the longest streak beside a shorter one running now', async () => {
      const run = [10, 11, 12].map((days) => session(daysAgo(days), 60, 0.6));
      serve({ sessions: [...sessions, ...run], loops });
      renderStats();
      expect(await screen.findByTestId('streak-line')).toHaveTextContent(
        'On a 2-day streak. Your longest is 3 days.',
      );
    });

    it('says when no streak is running', async () => {
      serve({ sessions: [weeksAgo], loops });
      renderStats();
      expect(await screen.findByTestId('streak-line')).toHaveTextContent(
        'No streak running. Your longest is 1 day.',
      );
    });
  });

  it('draws the two-week and practice-day graphics with their numbers in words', async () => {
    serve();
    renderStats();
    expect(
      await screen.findByRole('img', { name: /Minutes practised per day, last 14 days: 15 min/ }),
    ).toBeVisible();
    expect(text('daily-summary')).toMatch(/^15 min over 2 of the last 14 days\./);
    expect(screen.getByRole('table', { name: 'Minutes practised per day' })).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /Practised on 3 of the last \d+ days/ })).toBeVisible();
    expect(text('heatmap-days')).toMatch(/^Practised on 3 of the last \d+ days\.$/);
    // 20 minutes three weeks ago beats this week's 15 (or less, when a Monday falls between).
    expect(text('heatmap-best-week')).toMatch(/Best week: 20 min over 1 day, the week of /);
    expect(screen.getAllByTestId('heatmap-month').length).toBeGreaterThanOrEqual(5);
  });

  // 16 QA issue 6: practised days on the brand, empty ones a quiet cell, and today ringed.
  it('marks today on the heatmap whether or not it was practised, and fills practised days', async () => {
    serve({ sessions: [yesterday, weeksAgo], loops });
    renderStats();
    const heatmap = await screen.findByTestId('practice-heatmap');
    expect(within(heatmap).getAllByTestId('heatmap-today')).toHaveLength(1);
    const cells = Array.from(heatmap.querySelectorAll('rect[data-level]'));
    // Today wasn't practised in this list; yesterday and 20 days ago were.
    const practised = cells.filter((cell) => cell.getAttribute('data-level') !== '0');
    expect(practised).toHaveLength(2);
    for (const cell of practised) expect(cell.getAttribute('class')).toMatch(/fill-brand/);
    for (const cell of cells.filter((each) => each.getAttribute('data-level') === '0')) {
      expect(cell.getAttribute('class')).toBe('fill-raised');
    }
  });

  describe('loop progress', () => {
    it('lists a practised loop with its speeds, play time and days, linked to its practice screen', async () => {
      serve();
      renderStats();
      await screen.findByTestId('stats-totals');
      const [row, ...others] = progressRows();
      expect(others).toHaveLength(0);
      expect(within(row!).getByRole('link', { name: /^Groove/ })).toHaveAttribute(
        'href',
        `/songs/${GROOVE_SONG.id}/loops/${LOOP}`,
      );
      expect(within(row!).getByText('Groove 120')).toBeVisible();
      expect(within(row!).getByTestId('loop-progress-speed')).toHaveTextContent('60% → 70%, up 10');
      expect(within(row!).getByTestId('loop-progress-time')).toHaveTextContent('35 min · 3 days');
      expect(within(row!).getByTestId('sparkline')).toHaveAttribute('aria-hidden', 'true');
    });

    it('opens a loop’s chart under its row and closes it again, one chart at a time', async () => {
      const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      serve({
        sessions: [...sessions, session(daysAgo(2), 120, 0.5, 1, other)],
        loops: [...loops, practiceLoop(other, 'Fill', GROOVE_SONG)],
      });
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      // No lone chart and no picker: a chart is asked for.
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

      const grooveChart = screen.getByRole('button', { name: 'Chart of Groove' });
      expect(grooveChart).toHaveAttribute('aria-expanded', 'false');
      await user.click(grooveChart);
      expect(grooveChart).toHaveAttribute('aria-expanded', 'true');
      expect(grooveChart).toHaveFocus();
      expect(
        screen.getByRole('img', {
          name: /^Speed of Groove over 3 practice days: from 60% on .+ to 70% on .+\.$/,
        }),
      ).toBeVisible();
      expect(
        screen.getByRole('table', { name: 'Speed of Groove on each practice day' }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Chart of Fill' }));
      expect(grooveChart).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getAllByTestId('speed-chart')).toHaveLength(1);
      expect(
        screen.getByRole('img', { name: /^Speed of Fill: 50% on .+, its one practice day\.$/ }),
      ).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Chart of Fill' }));
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
    });

    // Unit 17's acceptance: the day's work was at 80%, the minute at 100% a try.
    it('shows a day of ten minutes at 80% and a one-minute try at 100% as a day at 80%', async () => {
      serve({
        sessions: [
          session(daysAgo(3), 300, 0.7),
          session(daysAgo(1, 18), 600, 0.8),
          session(daysAgo(1, 19), 60, 1),
        ],
        loops: [practiceLoop(LOOP, 'Groove', GROOVE_SONG)],
      });
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      expect(screen.getByTestId('loop-progress-speed')).toHaveTextContent('70% → 80%, up 10');
      await user.click(screen.getByRole('button', { name: 'Chart of Groove' }));
      const points = screen.getAllByTestId('speed-point');
      expect(points.map((point) => point.getAttribute('data-percent'))).toEqual(['70', '80']);
      const table = screen.getByRole('table', { name: 'Speed of Groove on each practice day' });
      expect(within(table).queryByText('100%')).not.toBeInTheDocument();
      // The try still counts as play time that day.
      expect(within(table).getByText('11 min')).toBeInTheDocument();
    });

    it('shows six loops, active ones first, until "Show all" is pressed', async () => {
      const ids = Array.from(
        { length: 8 },
        (_, index) => `0000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      );
      const many = ids.map((id, index) => practiceLoop(id, `Loop ${index}`, GROOVE_SONG));
      serve({
        // Loop 0 practised last, Loop 7 longest ago; the finished Groove most recently of all.
        sessions: [today, ...ids.map((id, index) => session(daysAgo(index + 1), 120, 0.6, 1, id))],
        loops: [...loops, ...many],
      });
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      const names = () =>
        progressRows().map((row) => within(row).getByRole('link').textContent ?? '');
      expect(names()).toEqual(['Loop 0', 'Loop 1', 'Loop 2', 'Loop 3', 'Loop 4', 'Loop 5']);

      const showAll = screen.getByRole('button', { name: 'Show all 9 loops' });
      expect(showAll).toHaveAttribute('aria-expanded', 'false');
      await user.click(showAll);
      expect(names()).toHaveLength(9);
      // The mastered loop comes after every active one.
      expect(names()[8]).toBe('Groove, mastered');
      const showFewer = screen.getByRole('button', { name: 'Show fewer' });
      expect(showFewer).toHaveAttribute('aria-expanded', 'true');
      expect(showFewer).toHaveFocus();
      await user.click(showFewer);
      expect(names()).toHaveLength(6);
    });

    it('has no "Show all" for six loops or fewer', async () => {
      serve();
      renderStats();
      await screen.findByTestId('stats-totals');
      expect(
        screen.queryByRole('button', { name: /^Show all \d+ loops$/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe('where the time went', () => {
    const OTHER_SONG = { id: 'song-waltz', title: 'Waltz' };
    const waltzLoop = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const served = {
      sessions: [...sessions, session(daysAgo(2), 1500, 0.9, 1, waltzLoop)],
      loops: [...loops, practiceLoop(waltzLoop, 'Intro', OTHER_SONG)],
    };
    const songTimes = () =>
      within(screen.getByRole('list', { name: 'Practice time by song' }))
        .getAllByTestId('song-time')
        .map((row) => row.textContent);

    it('gives each song its play time in the chosen period, most first, linked to the song', async () => {
      serve(served);
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      expect(songTimes()).toEqual(['Waltz25 min', 'Groove 12015 min']);
      expect(screen.getByRole('link', { name: 'Waltz' })).toHaveAttribute(
        'href',
        `/songs/${OTHER_SONG.id}`,
      );

      await user.click(screen.getByRole('radio', { name: 'All time' }));
      expect(songTimes()).toEqual(['Groove 12035 min', 'Waltz25 min']);
    });

    it('sums the songs past the fifth as Other', async () => {
      const songs = Array.from({ length: 7 }, (_, index) => ({
        loop: `1000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
        song: { id: `song-${index}`, title: `Song ${index}` },
      }));
      serve({
        sessions: songs.map(({ loop }, index) =>
          session(daysAgo(1), (7 - index) * 120, 0.8, 1, loop),
        ),
        loops: songs.map(({ loop, song }) => practiceLoop(loop, 'Loop', song)),
      });
      renderStats();
      await screen.findByTestId('stats-totals');
      expect(songTimes()).toEqual([
        'Song 014 min',
        'Song 112 min',
        'Song 210 min',
        'Song 38 min',
        'Song 46 min',
        'Other (2 songs)6 min',
      ]);
    });

    it('says so when nothing was practised in the period', async () => {
      serve({ sessions: [weeksAgo], loops });
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      expect(screen.getByText('No practice in this period.')).toBeVisible();
      await user.click(screen.getByRole('radio', { name: 'Month' }));
      expect(songTimes()).toEqual(['Groove 12020 min']);
    });
  });

  it('lists the records with when each was set', async () => {
    serve();
    renderStats();
    await screen.findByTestId('stats-totals');
    expect(text('record-streak')).toBe('2 days');
    // Yesterday to today, as two dates.
    expect(text('record-streak-when')).toMatch(/.+ – .+/);
    expect(text('record-day')).toBe('20 min');
    expect(text('record-session')).toBe('20 min');
    expect(text('record-session-when')).toMatch(/^Groove, /);
  });

  describe('badges', () => {
    const badges = () => screen.getAllByTestId('badge');
    const labels = (list: HTMLElement) =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent ?? '');

    it('lists the earned ones, then the three closest to done with their progress', async () => {
      serve();
      renderStats();
      await screen.findByTestId('stats-totals');
      // One finished loop, the only loop of its song.
      expect(labels(screen.getByRole('list', { name: 'Badges earned' }))).toEqual([
        'First loop mastered',
        'Song mastered',
      ]);
      // 70 of 100 passes, 2 of 3 days running, 35 of 60 minutes.
      const nextUp = labels(screen.getByRole('list', { name: 'Next up' }));
      expect(nextUp).toHaveLength(3);
      expect(nextUp[0]).toMatch(/^100 passes.*70 of 100 passes$/);
      expect(nextUp[1]).toMatch(/^3-day streak.*2 of 3 days in a row$/);
      expect(nextUp[2]).toMatch(/^1 hour practised.*35 of 60 min$/);
      expect(badges()).toHaveLength(5);
    });

    it('keeps the rest behind "Show all badges"', async () => {
      serve();
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      expect(screen.queryByText('30-day streak')).not.toBeInTheDocument();
      const showAll = screen.getByRole('button', { name: 'Show all badges' });
      expect(showAll).toHaveAttribute('aria-expanded', 'false');
      await user.click(showAll);
      expect(labels(screen.getByRole('list', { name: 'More badges' }))).toHaveLength(
        BADGES.length - 5,
      );
      expect(screen.getByText('30-day streak')).toBeVisible();
      // Every badge is on the page once.
      expect(badges()).toHaveLength(BADGES.length);
      const showFewer = screen.getByRole('button', { name: 'Show fewer badges' });
      expect(showFewer).toHaveFocus();
      await user.click(showFewer);
      expect(badges()).toHaveLength(5);
    });

    it('says so when none is earned yet', async () => {
      serve({ sessions: [weeksAgo], loops: [practiceLoop(LOOP, 'Groove', GROOVE_SONG)] });
      renderStats();
      await screen.findByTestId('stats-totals');
      expect(screen.getByText(/^None earned yet/)).toBeVisible();
      expect(screen.queryByRole('list', { name: 'Badges earned' })).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Next up' })).toBeVisible();
    });
  });

  // 16 QA issue 5: a new user's Stats was a page of zeros and empty charts.
  describe('with no practice yet', () => {
    it('says so, with a way to Songs, in place of zeros and empty charts', async () => {
      serve({ sessions: [], loops: [] });
      renderStats();
      expect(await screen.findByText(/No practice yet/)).toBeVisible();
      expect(screen.getByRole('link', { name: 'Go to Songs' })).toHaveAttribute('href', '/');
      expect(screen.queryByTestId('stats-totals')).not.toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Records' })).not.toBeInTheDocument();
    });

    it('still shows the stats for loops mastered without a session, and says what is missing', async () => {
      serve({ sessions: [], loops });
      renderStats('/stats?range=all');
      await screen.findByTestId('stats-totals');
      expect(text('total-mastered')).toBe('1');
      expect(screen.queryByText(/No practice yet/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('streak-line')).not.toBeInTheDocument();
      expect(screen.getByText('No practice in this period.')).toBeVisible();
      expect(screen.getByText('Practise a loop to see how its speed moves.')).toBeVisible();
      expect(screen.getByText('Records start with your first session.')).toBeVisible();
    });
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

// Unit 17 Test: the states and windows Build's tests left out.
describe('StatsPage, edges', () => {
  const FILL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const WALTZ = { id: 'song-waltz', title: 'Waltz' };
  const activeGroove = practiceLoop(LOOP, 'Groove', GROOVE_SONG);

  function renderStatsWithClient(path = '/stats') {
    const { queryClient } = renderRoutes(<Route path="/stats" element={<StatsPage />} />, {
      path,
    });
    return { user: userEvent.setup(), queryClient };
  }
  /** Both lists read again, as after another device's change. */
  const readAgain = (queryClient: QueryClient) =>
    act(async () => {
      await queryClient.invalidateQueries();
    });
  const songTimes = () =>
    within(screen.getByRole('list', { name: 'Practice time by song' }))
      .getAllByTestId('song-time')
      .map((row) => row.textContent);
  const rowNames = () =>
    progressRows().map((row) => within(row).getByRole('link').textContent ?? '');
  const manyLoops = (count: number) => {
    const ids = Array.from(
      { length: count },
      (_, index) => `2000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    );
    return {
      // Loop 0 practised last.
      sessions: ids.map((id, index) => session(daysAgo(index + 1), 120, 0.6, 1, id)),
      loops: ids.map((id, index) => practiceLoop(id, `Loop ${index}`, GROOVE_SONG)),
    };
  };

  // Plan, QA focus and Build's walk-through: day one, after one session.
  it('after one session ever, every section says what that session gives and nothing reads as a failure', async () => {
    serve({ sessions: [session(daysAgo(0, 0), 300, 0.8, 12)], loops: [activeGroove] });
    const user = renderStats();
    await screen.findByTestId('stats-totals');

    expect([
      text('total-time'),
      text('total-days'),
      text('total-passes'),
      text('total-mastered'),
    ]).toEqual(['5 min', '1', '12', '0']);
    expect(text('total-time-change')).toBe('5 min more than the week before');
    expect(text('total-days-change')).toBe('1 more than the week before');
    expect(text('total-passes-change')).toBe('12 more than the week before');
    expect(screen.queryByTestId('total-mastered-change')).not.toBeInTheDocument();
    expect(screen.getByTestId('streak-line')).toHaveTextContent(
      'On a 1-day streak. Your longest yet.',
    );

    expect(
      within(screen.getByRole('list', { name: 'Practice time by song' }))
        .getAllByTestId('song-time')
        .map((row) => row.textContent),
    ).toEqual(['Groove 1205 min']);
    expect(text('daily-summary')).toMatch(/^5 min over 1 of the last 14 days\./);

    // One day has nothing to compare: the speed alone, no arrow and no "no change".
    expect(progressRows()).toHaveLength(1);
    expect(text('loop-progress-speed')).toBe('80%');
    expect(screen.getByTestId('loop-progress-time')).toHaveTextContent('5 min · 1 day');
    expect(screen.queryByRole('button', { name: /^Show all \d+ loops$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Chart of Groove' }));
    expect(
      screen.getByRole('img', { name: /^Speed of Groove: 80% on .+, its one practice day\.$/ }),
    ).toBeVisible();
    expect(screen.getAllByTestId('speed-point')).toHaveLength(1);

    expect(text('heatmap-days')).toMatch(/^Practised on 1 of the last \d+ days\.$/);
    expect(text('heatmap-best-week')).toMatch(/Best week: 5 min over 1 day, the week of /);

    // Every record is that session; a streak of one day is one date, not a span.
    expect(text('record-streak')).toBe('1 day');
    expect(text('record-streak-when')).not.toMatch(/–/);
    expect(text('record-day')).toBe('5 min');
    expect(text('record-session')).toBe('5 min');
    expect(text('record-session-when')).toMatch(/^Groove, /);

    expect(screen.getByText(/^None earned yet/)).toBeVisible();
    const nextUp = within(screen.getByRole('list', { name: 'Next up' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    // 1 of 3 days, 1 of 7 days, 12 of 100 passes: ahead of 5 of 60 minutes.
    expect(nextUp.map((label) => label.replace(/, not earned yet.*/, ''))).toEqual([
      '3-day streak',
      '7-day streak',
      '100 passes',
    ]);
  });

  describe('loop progress', () => {
    it('lists exactly six loops with no "Show all", and seven as six with "Show all 7 loops"', async () => {
      serve(manyLoops(6));
      const first = renderRoutes(<Route path="/stats" element={<StatsPage />} />, {
        path: '/stats',
      });
      await screen.findByTestId('stats-totals');
      expect(rowNames()).toHaveLength(6);
      expect(
        screen.queryByRole('button', { name: /^Show all \d+ loops$/ }),
      ).not.toBeInTheDocument();
      first.unmount();

      serve(manyLoops(7));
      renderStats();
      await screen.findByTestId('stats-totals');
      expect(rowNames()).toEqual(['Loop 0', 'Loop 1', 'Loop 2', 'Loop 3', 'Loop 4', 'Loop 5']);
      expect(screen.getByRole('button', { name: 'Show all 7 loops' })).toBeVisible();
    });

    it('takes a chart away with its row on "Show fewer", and still opens one chart at a time after', async () => {
      serve(manyLoops(7));
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      await user.click(screen.getByRole('button', { name: 'Show all 7 loops' }));
      await user.click(screen.getByRole('button', { name: 'Chart of Loop 6' }));
      expect(screen.getByRole('img', { name: /^Speed of Loop 6:/ })).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Show fewer' }));
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Chart of Loop 6' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Chart of Loop 0' }));
      expect(screen.getAllByTestId('speed-chart')).toHaveLength(1);
      expect(screen.getByRole('img', { name: /^Speed of Loop 0:/ })).toBeVisible();
    });

    it('keeps the open chart and the whole list when the period changes', async () => {
      serve(manyLoops(7));
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      await user.click(screen.getByRole('button', { name: 'Show all 7 loops' }));
      await user.click(screen.getByRole('button', { name: 'Chart of Loop 6' }));

      await user.click(screen.getByRole('radio', { name: 'Month' }));
      expect(screen.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
      expect(rowNames()).toHaveLength(7);
      expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Chart of Loop 6' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByRole('img', { name: /^Speed of Loop 6:/ })).toBeVisible();
    });

    it('redraws an open chart, still open and still focused, when a new practice day is read', async () => {
      const served = { sessions: [...sessions], loops: [activeGroove] };
      serve(served);
      const { user, queryClient } = renderStatsWithClient();
      await screen.findByTestId('stats-totals');
      const chart = screen.getByRole('button', { name: 'Chart of Groove' });
      await user.click(chart);
      expect(screen.getAllByTestId('speed-point')).toHaveLength(3);

      // Another device practised three days ago, at 65%.
      served.sessions = [...sessions, session(daysAgo(3), 240, 0.65)];
      await readAgain(queryClient);
      await waitFor(() => expect(screen.getAllByTestId('speed-point')).toHaveLength(4));
      expect(
        screen.getAllByTestId('speed-point').map((point) => point.getAttribute('data-percent')),
      ).toEqual(['60', '65', '80', '70']);
      expect(chart).toBeInTheDocument();
      expect(chart).toHaveAttribute('aria-expanded', 'true');
      expect(chart).toHaveFocus();
      expect(screen.getByTestId('loop-progress-time')).toHaveTextContent('39 min · 4 days');
    });

    it('drops a loop’s row and its open chart when the loop is deleted elsewhere, leaving the others closed and usable', async () => {
      const fill = session(daysAgo(2), 1500, 0.5, 3, FILL);
      const served = {
        sessions: [...sessions, fill],
        loops: [activeGroove, practiceLoop(FILL, 'Fill', WALTZ)],
      };
      serve(served);
      const { user, queryClient } = renderStatsWithClient();
      await screen.findByTestId('stats-totals');
      await user.click(screen.getByRole('button', { name: 'Chart of Fill' }));
      expect(screen.getByRole('img', { name: /^Speed of Fill:/ })).toBeVisible();
      expect(rowNames()).toEqual(['Groove', 'Fill']);

      // The delete cascades: the loop and its sessions are gone from both lists.
      served.sessions = sessions;
      served.loops = [activeGroove];
      await readAgain(queryClient);
      await waitFor(() => expect(rowNames()).toEqual(['Groove']));
      expect(rowNames()).toEqual(['Groove']);
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
      expect(screen.queryByText('Fill')).not.toBeInTheDocument();
      expect(songTimes()).toEqual(['Groove 12015 min']);
      expect(text('record-session')).toBe('20 min');

      const groove = screen.getByRole('button', { name: 'Chart of Groove' });
      expect(groove).toHaveAttribute('aria-expanded', 'false');
      await user.click(groove);
      expect(screen.getAllByTestId('speed-chart')).toHaveLength(1);
      expect(
        screen.getByRole('img', { name: /^Speed of Groove over 3 practice days/ }),
      ).toBeVisible();
    });

    // Build, "Missing a piece": the loops list is ahead of the sessions (or the other way round).
    it('with a loop gone from the list but its sessions still cached, keeps the time under Other and the record without a name', async () => {
      const served = {
        sessions: [...sessions, session(daysAgo(2), 1500, 0.5, 3, FILL)],
        loops: [activeGroove, practiceLoop(FILL, 'Fill', WALTZ)],
      };
      serve(served);
      const { user, queryClient } = renderStatsWithClient();
      await screen.findByTestId('stats-totals');
      await user.click(screen.getByRole('button', { name: 'Chart of Fill' }));
      expect(songTimes()).toEqual(['Waltz25 min', 'Groove 12015 min']);
      expect(text('record-session-when')).toMatch(/^Fill, /);

      served.loops = [activeGroove];
      await readAgain(queryClient);
      await screen.findByText('Other');
      expect(rowNames()).toEqual(['Groove']);
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
      // The bars still add up to the period's 40 minutes.
      expect(songTimes()).toEqual(['Groove 12015 min', 'Other25 min']);
      expect(text('total-time')).toBe('40 min');
      expect(text('record-session')).toBe('25 min');
      expect(text('record-session-when')).not.toMatch(/Fill|undefined|,/);
    });
  });

  describe('where the time went', () => {
    const sixSongs = Array.from({ length: 6 }, (_, index) => ({
      loop: `3000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      song: { id: `song-${index}`, title: `Song ${index}` },
    }));

    it('names a single sixth song as "Other (1 song)"', async () => {
      serve({
        sessions: sixSongs.map(({ loop }, index) =>
          session(daysAgo(1), (6 - index) * 120, 0.8, 1, loop),
        ),
        loops: sixSongs.map(({ loop, song }) => practiceLoop(loop, 'Loop', song)),
      });
      renderStats();
      await screen.findByTestId('stats-totals');
      expect(songTimes()).toEqual([
        'Song 012 min',
        'Song 110 min',
        'Song 28 min',
        'Song 36 min',
        'Song 44 min',
        'Other (1 song)2 min',
      ]);
      // "Other" is not a song: it goes nowhere.
      expect(screen.queryByRole('link', { name: /^Other/ })).not.toBeInTheDocument();
    });

    it('leaves out a song with no time in the period, and brings it back in a period that has some', async () => {
      const waltzLoop = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      serve({
        sessions: [today, session(daysAgo(20), 2400, 0.9, 1, waltzLoop)],
        loops: [activeGroove, practiceLoop(waltzLoop, 'Intro', WALTZ)],
      });
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      expect(songTimes()).toEqual(['Groove 12010 min']);
      const list = screen.getByRole('list', { name: 'Practice time by song' });
      expect(within(list).queryByText('Waltz')).not.toBeInTheDocument();
      expect(within(list).queryByText(/^Other/)).not.toBeInTheDocument();

      await user.click(screen.getByRole('radio', { name: 'Month' }));
      expect(songTimes()).toEqual(['Waltz40 min', 'Groove 12010 min']);
    });
  });

  describe('while its lists are read', () => {
    const lost: FakeResult = {
      data: null,
      error: { message: 'TypeError: Failed to fetch', code: '' },
    };
    const readsOf = (table: string) =>
      queryResult.mock.calls.filter(([call]) => call.table === table).length;

    it('says it is loading until both lists are in, with no zeros meanwhile', async () => {
      queryResult.mockImplementation((call) =>
        call.table === 'practice_sessions'
          ? new Promise<FakeResult>(() => {})
          : Promise.resolve(ok(loops)),
      );
      renderStats();
      expect(await screen.findByText('Loading your stats…')).toBeVisible();
      await settle();
      expect(screen.getByText('Loading your stats…')).toBeVisible();
      expect(screen.queryByTestId('stats-totals')).not.toBeInTheDocument();
      expect(screen.queryByText(/No practice yet/)).not.toBeInTheDocument();
    });

    it('says in fixed copy when the first read fails, and "Try again" reads only what failed', async () => {
      queryResult.mockImplementation(async (call) =>
        call.table === 'practice_sessions' ? lost : ok(loops),
      );
      const user = renderStats();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/^Couldn't load your stats\. /);
      expect(alert).not.toHaveTextContent(/Failed to fetch|TypeError/);
      expect(screen.queryByTestId('stats-totals')).not.toBeInTheDocument();
      const loopReads = readsOf('loops');
      const sessionReads = readsOf('practice_sessions');
      expect(loopReads).toBeGreaterThan(0);

      serve();
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      await screen.findByTestId('stats-totals');
      expect(text('total-time')).toBe('15 min');
      expect(readsOf('practice_sessions')).toBeGreaterThan(sessionReads);
      expect(readsOf('loops')).toBe(loopReads);
    });

    it('keeps the page when a later read fails over what is showing', async () => {
      serve();
      const { queryClient } = renderStatsWithClient();
      await screen.findByTestId('stats-totals');

      queryResult.mockImplementation(async () => lost);
      await readAgain(queryClient);
      const state = queryClient.getQueryState(sessionKeys.every('user-1'));
      expect(state?.status).toBe('error');
      expect(state?.data).toHaveLength(3);
      await settle();
      expect(text('total-time')).toBe('15 min');
      expect(progressRows()).toHaveLength(1);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // Plan: "a text alternative per graphic"; the brief: every number reaches a screen reader.
  describe('what a screen reader gets', () => {
    const hidden = (element: Element) => element.closest('[aria-hidden="true"], [hidden]') !== null;

    it('names every graphic, hides every other drawing, and keeps every number out of hidden parts', async () => {
      serve({
        sessions: [...sessions, session(daysAgo(2), 1500, 0.5, 3, FILL)],
        loops: [...loops, practiceLoop(FILL, 'Fill', WALTZ)],
      });
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      await user.click(screen.getByRole('button', { name: 'Chart of Groove' }));
      await user.click(screen.getByRole('button', { name: 'Show all badges' }));

      const graphics = screen.getAllByRole('img');
      expect(graphics).toHaveLength(3);
      for (const graphic of graphics) expect(graphic).toHaveAccessibleName(/\d/);
      // Icons, sparklines, the legend: drawings that say nothing a neighbour doesn't.
      for (const svg of Array.from(document.querySelectorAll('svg'))) {
        expect(svg.getAttribute('role') === 'img' || hidden(svg)).toBe(true);
      }

      const numbers = [
        'total-time',
        'total-days',
        'total-passes',
        'total-mastered',
        'total-time-change',
        'streak-line',
        'daily-summary',
        'heatmap-days',
        'heatmap-best-week',
        'record-streak',
        'record-streak-when',
        'record-day',
        'record-day-when',
        'record-session',
        'record-session-when',
      ].map((id) => screen.getByTestId(id));
      const repeated = ['song-time', 'loop-progress-speed', 'loop-progress-time', 'badge'].flatMap(
        (id) => screen.getAllByTestId(id),
      );
      for (const element of [...numbers, ...repeated]) {
        expect(element.textContent).not.toBe('');
        expect(hidden(element)).toBe(false);
      }
      // A song's bar is a drawing of the minutes beside it.
      for (const row of screen.getAllByTestId('song-time')) {
        const bar = row.querySelector('[aria-hidden="true"]');
        expect(bar).not.toBeNull();
        expect(bar?.textContent).toBe('');
        expect(row.textContent).toMatch(/\d+ min$/);
      }
      // A badge not yet earned says so and how far along it is, in words.
      for (const badge of screen.getAllByTestId('badge')) {
        if (badge.getAttribute('data-earned') === 'true') continue;
        expect(badge).toHaveTextContent(/, not earned yet/);
        expect(badge).toHaveTextContent(/\d of \d|Every loop of one song/);
      }
      // A mastered loop's trophy is said, not only drawn.
      expect(screen.getByRole('link', { name: /^Groove\s?, mastered$/ })).toBeVisible();
    });

    it('gives the two-week chart’s bars as a table: every day once, today named, the minutes the bars show', async () => {
      serve();
      renderStats();
      await screen.findByTestId('stats-totals');
      const rows = within(screen.getByRole('table', { name: 'Minutes practised per day' }))
        .getAllByRole('row')
        .slice(1)
        .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent));
      expect(rows).toHaveLength(14);
      expect(new Set(rows.map(([day]) => day)).size).toBe(14);
      expect(rows[13]).toEqual(['Today', '10 min']);
      expect(rows[12]?.[1]).toBe('5 min');
      expect(rows.slice(0, 12).every(([, minutes]) => minutes === '0 min')).toBe(true);

      // The numbers drawn over the bars are the same minutes.
      const bars = screen.getAllByTestId('daily-bar');
      expect(bars).toHaveLength(14);
      const drawn = bars.map((bar) =>
        Array.from(bar.querySelectorAll('text')).map((label) => label.textContent),
      );
      // An empty day carries its weekday and date only; a practised one its minutes first.
      expect(drawn.slice(0, 12).every((labels) => labels.length === 2)).toBe(true);
      expect(drawn[12]?.[0]).toBe('5');
      expect(drawn[13]?.[0]).toBe('10');
    });

    it('gives a loop’s chart as a table: a row per point with its date, percent and minutes', async () => {
      serve();
      const user = renderStats();
      await screen.findByTestId('stats-totals');
      await user.click(screen.getByRole('button', { name: 'Chart of Groove' }));
      const points = screen.getAllByTestId('speed-point');
      const rows = within(
        screen.getByRole('table', { name: 'Speed of Groove on each practice day' }),
      )
        .getAllByRole('row')
        .slice(1)
        .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent));
      expect(rows).toHaveLength(points.length);
      expect(rows.map(([, percent, minutes]) => [percent, minutes])).toEqual([
        ['60%', '20 min'],
        ['80%', '5 min'],
        ['70%', '10 min'],
      ]);
      expect(rows.every(([day]) => /\d/.test(day ?? ''))).toBe(true);
      // The button says what it opens and points at it.
      const button = screen.getByRole('button', { name: 'Chart of Groove' });
      const region = document.getElementById(button.getAttribute('aria-controls') ?? '');
      expect(region).toContainElement(screen.getByTestId('speed-chart'));
    });
  });
});

describe('BadgeSection', () => {
  const fresh = badgeProgress({ sessions: [], loops: [] });
  const earnedBut = (left: number) =>
    fresh.map((badge, index) => ({ ...badge, earned: index >= left }));

  it('with every badge earned lists them all, with no "Next up" and nothing to show', () => {
    render(<BadgeSection badges={earnedBut(0)} />);
    expect(
      within(screen.getByRole('list', { name: 'Badges earned' })).getAllByRole('listitem'),
    ).toHaveLength(BADGES.length);
    expect(screen.queryByText('Next up')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/None earned yet/)).not.toBeInTheDocument();
  });

  it('with three left names them next up and offers no "Show all badges"', () => {
    render(<BadgeSection badges={earnedBut(3)} />);
    expect(
      within(screen.getByRole('list', { name: 'Next up' })).getAllByRole('listitem'),
    ).toHaveLength(3);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('with four left keeps one behind "Show all badges"', async () => {
    const user = userEvent.setup();
    render(<BadgeSection badges={earnedBut(4)} />);
    expect(screen.getAllByTestId('badge')).toHaveLength(BADGES.length - 1);
    await user.click(screen.getByRole('button', { name: 'Show all badges' }));
    expect(
      within(screen.getByRole('list', { name: 'More badges' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(screen.getAllByTestId('badge')).toHaveLength(BADGES.length);
  });

  it('with none earned and nothing started says so, and still names three', () => {
    render(<BadgeSection badges={fresh} />);
    expect(screen.getByText(/^None earned yet/)).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Next up' }))
        .getAllByRole('listitem')
        .map((item) => (item.textContent ?? '').replace(/, not earned yet.*/, '')),
    ).toEqual(['3-day streak', '7-day streak', '30-day streak']);
  });
});
