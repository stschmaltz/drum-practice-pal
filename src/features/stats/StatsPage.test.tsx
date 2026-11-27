import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { Route } from 'react-router';
import { queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { loopRow } from '@/test/loopTable';
import { renderRoutes } from '@/test/render';
import { BADGES } from './badges';
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
