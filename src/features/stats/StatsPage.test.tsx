import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { Route } from 'react-router';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { sessionKeys } from '@/features/practice/sessionKeys';
import { loopRow } from '@/test/loopTable';
import { inBrowserLocale } from '@/test/browserLocale';
import { renderRoutes, settle, testQueryClient } from '@/test/render';
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

const chartButton = (loopName: string) =>
  screen.getByRole('button', { name: `Chart of ${loopName}` });

/** The page as first rendered, nothing read yet, with the steps its tests repeat. */
function renderStats(path = '/stats', cache?: QueryClient) {
  const { queryClient } = renderRoutes(<Route path="/stats" element={<StatsPage />} />, {
    path,
    queryClient: cache,
  });
  const user = userEvent.setup();
  return {
    user,
    queryClient,
    choosePeriod: (name: 'Week' | 'Month' | 'All time') =>
      user.click(screen.getByRole('radio', { name })),
    /** Opens the loop's chart under its row, or closes it. */
    toggleChart: (loopName: string) => user.click(chartButton(loopName)),
    /** Both lists read again, as after another device's change. */
    readAgain: () =>
      act(async () => {
        await queryClient.invalidateQueries();
      }),
  };
}

/** The page once both lists are in and its sections are drawn. */
async function openStats(path = '/stats') {
  const view = renderStats(path);
  await screen.findByTestId('stats-totals');
  return view;
}

const text = (id: string) => screen.getByTestId(id).textContent;
const progressRows = () =>
  within(screen.getByRole('list', { name: 'Loop progress' })).getAllByTestId('loop-progress');

beforeEach(resetFakeSupabase);

describe('StatsPage', () => {
  it('sums the week, then the month and all time, keeping the choice in the URL', async () => {
    serve();
    const { choosePeriod } = await openStats();
    expect(screen.getByRole('heading', { name: 'Last 7 days' })).toBeVisible();
    expect([text('total-time'), text('total-days'), text('total-mastered')]).toEqual([
      '15 min',
      '2',
      '1',
    ]);
    // 17 QA: "Loop passes" was a count with no meaning of its own. Three totals, no fourth.
    expect(within(screen.getByTestId('stats-totals')).getAllByRole('term')).toHaveLength(3);
    expect(screen.queryByText('Loop passes')).not.toBeInTheDocument();

    await choosePeriod('Month');
    expect(screen.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
    expect(text('total-time')).toBe('35 min');
    expect(text('total-days')).toBe('3');
    expect(screen.getByTestId('location')).toHaveTextContent('/stats?range=month');

    await choosePeriod('Week');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/stats$/);
  });

  it('opens on the range the URL names', async () => {
    serve();
    await openStats('/stats?range=all');
    expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked();
    expect(text('total-time')).toBe('35 min');
  });

  describe('against the period before', () => {
    const changeLines = () =>
      ['time', 'days', 'mastered'].map(
        (total) => screen.queryByTestId(`total-${total}-change`)?.textContent ?? null,
      );

    it('says how each total of the week and the month compares, and nothing for all time', async () => {
      // The week before this one: 5 minutes on one day. Forty days ago: 2 minutes.
      serve({
        sessions: [...sessions, session(daysAgo(9), 300, 0.6, 50), session(daysAgo(40), 120, 0.6)],
        loops,
      });
      const { choosePeriod } = await openStats();
      expect(changeLines()).toEqual([
        '10 min more than the week before',
        '1 more than the week before',
        '1 more than the week before',
      ]);

      await choosePeriod('Month');
      expect(changeLines()).toEqual([
        '38 min more than the month before',
        '3 more than the month before',
        '1 more than the month before',
      ]);

      await choosePeriod('All time');
      expect(text('total-time')).toBe('42 min');
      expect(changeLines()).toEqual([null, null, null]);
    });

    // 17 QA issue 7: "n more than the week before" against a week with nothing in it.
    it('has no line under any total when the period before has no practice at all', async () => {
      // Twenty days ago is before the week before, and inside the month.
      serve();
      const { choosePeriod } = await openStats();
      expect(text('total-time')).toBe('15 min');
      expect(changeLines()).toEqual([null, null, null]);

      await choosePeriod('Month');
      expect(text('total-time')).toBe('35 min');
      expect(changeLines()).toEqual([null, null, null]);
    });

    it('still says a week with nothing in it is less than a week that had practice', async () => {
      serve({ sessions: [session(daysAgo(9), 300, 0.6, 50)], loops: [] });
      await openStats();
      expect(text('total-time')).toBe('0 min');
      expect(changeLines()).toEqual([
        '5 min less than the week before',
        '1 fewer than the week before',
        null,
      ]);
    });

    it('leaves out the line for a total that is nothing in both periods', async () => {
      serve({
        sessions: [...sessions, session(daysAgo(9), 300, 0.6)],
        loops: [practiceLoop(LOOP, 'Groove', GROOVE_SONG)],
      });
      await openStats();
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
    // The whole caption: nothing after it that only says what a bar chart is (17 QA).
    expect(text('daily-summary')).toBe('15 min over 2 of the last 14 days.');
    expect(screen.getByRole('table', { name: 'Minutes practised per day' })).toBeInTheDocument();

    // Three weeks of history: the map is its shortest, twelve weeks, and counts in weeks.
    expect(
      screen.getByRole('img', { name: 'Practised on 3 days in the last 12 weeks.' }),
    ).toBeVisible();
    expect(text('heatmap-days')).toBe('Practised on 3 days in the last 12 weeks.');
    // 20 minutes three weeks ago beats this week's 15 (or less, when a Monday falls between).
    expect(text('heatmap-best-week')).toMatch(
      /Best calendar week: 20 min over 1 day, the week of .+\.$/,
    );
    expect(screen.getAllByTestId('heatmap-month').length).toBeGreaterThanOrEqual(2);
  });

  // 17 QA issue 5: which sections follow the Period choice, and what the others cover.
  it('says beside each heading what the section covers', async () => {
    serve();
    const { choosePeriod } = await openStats();
    const headings = () =>
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings()).toEqual([
      'Last 7 days',
      'Where the time went Last 7 days',
      'Last two weeks',
      'Loop progress All time',
      'Practice days Last 12 weeks',
      'Records All time',
      'Badges All time',
    ]);
    await choosePeriod('Month');
    // Only the first two follow the choice.
    expect(headings()).toEqual([
      'Last 30 days',
      'Where the time went Last 30 days',
      'Last two weeks',
      'Loop progress All time',
      'Practice days Last 12 weeks',
      'Records All time',
      'Badges All time',
    ]);
  });

  it('spans the practice days from the first practice week, up to 26 weeks', async () => {
    serve({ sessions: [...sessions, session(daysAgo(400), 600, 0.5)], loops });
    await openStats();
    expect(screen.getByRole('heading', { name: 'Practice days Last 26 weeks' })).toBeVisible();
    expect(text('heatmap-days')).toBe('Practised on 3 days in the last 26 weeks.');
  });

  // 17 QA issue 3: the map's days were only `<title>`s inside the `img`.
  it('gives the practice days as a table by week: week starting, days practised, minutes', async () => {
    serve();
    await openStats();
    const table = screen.getByRole('table', { name: 'Practice days by week' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Week starting', 'Days practised', 'Practice']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent));
    // A row a week, not a row a day.
    expect(rows).toHaveLength(12);
    expect(rows.every(([week]) => /\d/.test(week ?? ''))).toBe(true);
    const practised = rows.filter(([, days]) => days !== '0');
    // Today and yesterday are one week or two (a Monday between); twenty days ago is another.
    expect(practised.map(([, days]) => Number(days)).reduce((a, b) => a + b, 0)).toBe(3);
    expect(practised.map(([, , minutes]) => minutes)).toContain('20 min');
    expect(
      rows.filter(([, days]) => days === '0').every(([, , minutes]) => minutes === '0 min'),
    ).toBe(true);
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
      await openStats();
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
      const { user, toggleChart } = await openStats();
      // No lone chart and no picker: a chart is asked for.
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

      const grooveChart = chartButton('Groove');
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

      await toggleChart('Fill');
      expect(grooveChart).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getAllByTestId('speed-chart')).toHaveLength(1);
      expect(
        screen.getByRole('img', { name: /^Speed of Fill: 50% on .+, its one practice day\.$/ }),
      ).toBeVisible();

      await toggleChart('Fill');
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
      const { toggleChart } = await openStats();
      expect(screen.getByTestId('loop-progress-speed')).toHaveTextContent('70% → 80%, up 10');
      await toggleChart('Groove');
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
      const { user } = await openStats();
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
      await openStats();
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
      const { choosePeriod } = await openStats();
      expect(songTimes()).toEqual(['Waltz25 min', 'Groove 12015 min']);
      expect(screen.getByRole('link', { name: 'Waltz' })).toHaveAttribute(
        'href',
        `/songs/${OTHER_SONG.id}`,
      );

      await choosePeriod('All time');
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
      await openStats();
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
      const { choosePeriod } = await openStats();
      expect(screen.getByText('No practice in this period.')).toBeVisible();
      await choosePeriod('Month');
      expect(songTimes()).toEqual(['Groove 12020 min']);
    });
  });

  it('lists the records with when each was set', async () => {
    serve();
    await openStats();
    expect(text('record-streak')).toBe('2 days');
    // Yesterday to today, as two dates.
    expect(text('record-streak-when')).toMatch(/.+ – .+/);
    expect(text('record-day')).toBe('20 min');
    expect(text('record-session')).toBe('20 min');
    expect(text('record-session-when')).toMatch(/^Groove, /);
  });

  // 17 QA issue 9: "Other" set the scale, and the five named songs drew as slivers.
  describe('the song bars', () => {
    const bar = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-testid="song-bar"]')!;
    const rows = () => screen.getAllByTestId('song-time');
    const manySongs = (seconds: number[]) => {
      const songs = seconds.map((_, index) => ({
        loop: `4000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
        song: { id: `song-${index}`, title: `Song ${index}` },
      }));
      return {
        sessions: songs.map(({ loop }, index) =>
          session(daysAgo(1), seconds[index] ?? 0, 0.8, 1, loop),
        ),
        loops: songs.map(({ loop, song }) => practiceLoop(loop, 'Loop', song)),
      };
    };

    it('are scaled to the named song with the most time, with Other muted and no wider', async () => {
      // Five named songs of 10 to 6 minutes; five more of 5 minutes each are Other: 25 minutes.
      serve(manySongs([600, 540, 480, 420, 360, 300, 300, 300, 300, 300]));
      await openStats();
      const [first, second, , , fifth, other] = rows();
      expect(rows()).toHaveLength(6);
      expect(bar(first!).style.width).toBe('100%');
      expect(bar(second!).style.width).toBe('90%');
      expect(bar(fifth!).style.width).toBe('60%');
      for (const row of rows().slice(0, 5)) expect(bar(row)).toHaveClass('bg-selected-line');

      expect(other).toHaveTextContent('Other (5 songs)25 min');
      // Capped at the full width, and drawn apart from the songs.
      expect(bar(other!).style.width).toBe('100%');
      expect(bar(other!)).toHaveClass('bg-ink-muted');
      expect(bar(other!)).not.toHaveClass('bg-selected-line');
    });

    it('give a smaller Other its own share of the longest song', async () => {
      serve(manySongs([600, 500, 400, 300, 200, 90, 60]));
      await openStats();
      const other = rows()[5]!;
      expect(other).toHaveTextContent('Other (2 songs)2 min');
      expect(bar(other).style.width).toBe('25%');
    });
  });

  describe('badges', () => {
    const badges = () => screen.getAllByTestId('badge');
    const labels = (list: HTMLElement) =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent ?? '');

    it('lists the earned ones, then the three closest to done with their progress', async () => {
      serve();
      await openStats();
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
      const { user } = await openStats();
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
      await openStats();
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
      expect(screen.queryByRole('heading', { name: /^Records/ })).not.toBeInTheDocument();
    });

    it('still shows the stats for loops mastered without a session, and says what is missing', async () => {
      serve({ sessions: [], loops });
      await openStats('/stats?range=all');
      expect(text('total-mastered')).toBe('1');
      expect(screen.queryByText(/No practice yet/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('streak-line')).not.toBeInTheDocument();
      expect(screen.getByText('No practice in this period.')).toBeVisible();
      expect(screen.getByText('Practise a loop to see how its speed moves.')).toBeVisible();
      // No records without practice, and no section waiting for them.
      expect(screen.queryByRole('heading', { name: /^Records/ })).not.toBeInTheDocument();
      expect(screen.queryByTestId('record-streak')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /^Badges/ })).toBeVisible();
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
    const { toggleChart } = await openStats();

    expect([text('total-time'), text('total-days'), text('total-mastered')]).toEqual([
      '5 min',
      '1',
      '0',
    ]);
    // 17 QA issue 7: nothing came before, so nothing is compared.
    for (const total of ['time', 'days', 'mastered']) {
      expect(screen.queryByTestId(`total-${total}-change`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('streak-line')).toHaveTextContent(
      'On a 1-day streak. Your longest yet.',
    );

    expect(
      within(screen.getByRole('list', { name: 'Practice time by song' }))
        .getAllByTestId('song-time')
        .map((row) => row.textContent),
    ).toEqual(['Groove 1205 min']);
    expect(text('daily-summary')).toBe('5 min over 1 of the last 14 days.');

    // One day has nothing to compare: the speed alone, no arrow and no "no change".
    expect(progressRows()).toHaveLength(1);
    expect(text('loop-progress-speed')).toBe('80%');
    expect(screen.getByTestId('loop-progress-time')).toHaveTextContent('5 min · 1 day');
    expect(screen.queryByRole('button', { name: /^Show all \d+ loops$/ })).not.toBeInTheDocument();
    await toggleChart('Groove');
    expect(
      screen.getByRole('img', { name: /^Speed of Groove: 80% on .+, its one practice day\.$/ }),
    ).toBeVisible();
    expect(screen.getAllByTestId('speed-point')).toHaveLength(1);

    // The map is as short as it gets, and a best week of one day would only repeat the day.
    expect(text('heatmap-days')).toBe('Practised on 1 day in the last 12 weeks.');
    expect(screen.queryByTestId('heatmap-best-week')).not.toBeInTheDocument();

    // Every record would be that one session: they wait for a second practice day.
    expect(screen.queryByRole('heading', { name: /^Records/ })).not.toBeInTheDocument();
    for (const record of ['record-streak', 'record-day', 'record-session']) {
      expect(screen.queryByTestId(record)).not.toBeInTheDocument();
    }
    // Nothing is neglected on day one.
    expect(screen.queryByRole('heading', { name: 'Not practised lately' })).not.toBeInTheDocument();

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
      await openStats();
      expect(rowNames()).toEqual(['Loop 0', 'Loop 1', 'Loop 2', 'Loop 3', 'Loop 4', 'Loop 5']);
      expect(screen.getByRole('button', { name: 'Show all 7 loops' })).toBeVisible();
    });

    it('takes a chart away with its row on "Show fewer", and still opens one chart at a time after', async () => {
      serve(manyLoops(7));
      const { user, toggleChart } = await openStats();
      await user.click(screen.getByRole('button', { name: 'Show all 7 loops' }));
      await toggleChart('Loop 6');
      expect(screen.getByRole('img', { name: /^Speed of Loop 6:/ })).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Show fewer' }));
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Chart of Loop 6' })).not.toBeInTheDocument();

      await toggleChart('Loop 0');
      expect(screen.getAllByTestId('speed-chart')).toHaveLength(1);
      expect(screen.getByRole('img', { name: /^Speed of Loop 0:/ })).toBeVisible();
    });

    it('keeps the open chart and the whole list when the period changes', async () => {
      serve(manyLoops(7));
      const { user, choosePeriod, toggleChart } = await openStats();
      await user.click(screen.getByRole('button', { name: 'Show all 7 loops' }));
      await toggleChart('Loop 6');

      await choosePeriod('Month');
      expect(screen.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();
      expect(rowNames()).toHaveLength(7);
      expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(chartButton('Loop 6')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('img', { name: /^Speed of Loop 6:/ })).toBeVisible();
    });

    it('redraws an open chart, still open and still focused, when a new practice day is read', async () => {
      const served = { sessions: [...sessions], loops: [activeGroove] };
      serve(served);
      const { user, readAgain } = await openStats();
      const chart = chartButton('Groove');
      await user.click(chart);
      expect(screen.getAllByTestId('speed-point')).toHaveLength(3);

      // Another device practised three days ago, at 65%.
      served.sessions = [...sessions, session(daysAgo(3), 240, 0.65)];
      await readAgain();
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
      const { user, toggleChart, readAgain } = await openStats();
      await toggleChart('Fill');
      expect(screen.getByRole('img', { name: /^Speed of Fill:/ })).toBeVisible();
      expect(rowNames()).toEqual(['Groove', 'Fill']);

      // The delete cascades: the loop and its sessions are gone from both lists.
      served.sessions = sessions;
      served.loops = [activeGroove];
      await readAgain();
      await waitFor(() => expect(rowNames()).toEqual(['Groove']));
      expect(rowNames()).toEqual(['Groove']);
      expect(screen.queryByTestId('speed-chart')).not.toBeInTheDocument();
      expect(screen.queryByText('Fill')).not.toBeInTheDocument();
      expect(songTimes()).toEqual(['Groove 12015 min']);
      expect(text('record-session')).toBe('20 min');

      const groove = chartButton('Groove');
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
      const { toggleChart, readAgain } = await openStats();
      await toggleChart('Fill');
      expect(songTimes()).toEqual(['Waltz25 min', 'Groove 12015 min']);
      expect(text('record-session-when')).toMatch(/^Fill, /);

      served.loops = [activeGroove];
      await readAgain();
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

    // Unit 20, batch 9 (17 QA): "Other (1 song)" was a row that hid one name.
    it('names a single sixth song like the five before it, with its bar and its link', async () => {
      serve({
        sessions: sixSongs.map(({ loop }, index) =>
          session(daysAgo(1), (6 - index) * 120, 0.8, 1, loop),
        ),
        loops: sixSongs.map(({ loop, song }) => practiceLoop(loop, 'Loop', song)),
      });
      await openStats();
      expect(songTimes()).toEqual([
        'Song 012 min',
        'Song 110 min',
        'Song 28 min',
        'Song 36 min',
        'Song 44 min',
        'Song 52 min',
      ]);
      const list = screen.getByRole('list', { name: 'Practice time by song' });
      expect(within(list).queryByText(/^Other/)).not.toBeInTheDocument();
      expect(within(list).getByRole('link', { name: 'Song 5' })).toHaveAttribute(
        'href',
        '/songs/song-5',
      );
      expect(within(list).getAllByTestId('song-bar')[5]).toHaveClass('bg-selected-line');
    });

    it('sums a sixth and a seventh song as Other, which is not a song and goes nowhere', async () => {
      const seven = [
        ...sixSongs,
        { loop: '30000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', song: { id: 'song-6', title: 'Song 6' } },
      ];
      serve({
        sessions: seven.map(({ loop }, index) =>
          session(daysAgo(1), (7 - index) * 120, 0.8, 1, loop),
        ),
        loops: seven.map(({ loop, song }) => practiceLoop(loop, 'Loop', song)),
      });
      await openStats();
      expect(songTimes()).toHaveLength(6);
      expect(songTimes()[5]).toBe('Other (2 songs)6 min');
      expect(screen.queryByRole('link', { name: /^Other/ })).not.toBeInTheDocument();
    });

    it('leaves out a song with no time in the period, and brings it back in a period that has some', async () => {
      const waltzLoop = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      serve({
        sessions: [today, session(daysAgo(20), 2400, 0.9, 1, waltzLoop)],
        loops: [activeGroove, practiceLoop(waltzLoop, 'Intro', WALTZ)],
      });
      const { choosePeriod } = await openStats();
      expect(songTimes()).toEqual(['Groove 12010 min']);
      const list = screen.getByRole('list', { name: 'Practice time by song' });
      expect(within(list).queryByText('Waltz')).not.toBeInTheDocument();
      expect(within(list).queryByText(/^Other/)).not.toBeInTheDocument();

      await choosePeriod('Month');
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
      const { user } = renderStats();
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
      const { readAgain, queryClient } = await openStats();

      queryResult.mockImplementation(async () => lost);
      await readAgain();
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
      const { user, toggleChart } = await openStats();
      await toggleChart('Groove');
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
        'total-mastered',
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
      await openStats();
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
      const { toggleChart } = await openStats();
      await toggleChart('Groove');
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
      const button = chartButton('Groove');
      const region = document.getElementById(button.getAttribute('aria-controls') ?? '');
      expect(region).toContainElement(screen.getByTestId('speed-chart'));
    });
  });
});

// Build (QA fix round 1): what 17 QA found, each as the page shows it.
describe('StatsPage, after QA', () => {
  const activeGroove = practiceLoop(LOOP, 'Groove', GROOVE_SONG);
  const cells = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent));

  // Issue 2: one 45-second session read "0 min" in eight places and "<1" in a ninth.
  describe('under a minute of practice', () => {
    it('reads "<1 min" in the total, the song’s bar, the day’s bar and its table, the caption and the loop’s row', async () => {
      serve({ sessions: [session(daysAgo(0, 0), 45, 0.7, 2)], loops: [activeGroove] });
      const { toggleChart } = await openStats();
      expect(text('total-time')).toBe('<1 min');
      expect(text('total-days')).toBe('1');
      expect(screen.getByTestId('song-time')).toHaveTextContent('Groove 120<1 min');
      expect(text('daily-summary')).toBe('<1 min over 1 of the last 14 days.');
      const today = screen.getAllByTestId('daily-bar')[13]!;
      expect(today.querySelector('text')?.textContent).toBe('<1');
      expect(cells(screen.getByRole('table', { name: 'Minutes practised per day' }))[13]).toEqual([
        'Today',
        '<1 min',
      ]);
      expect(screen.getByTestId('loop-progress-time')).toHaveTextContent('<1 min · 1 day');
      await toggleChart('Groove');
      expect(
        cells(screen.getByRole('table', { name: 'Speed of Groove on each practice day' }))[0]?.[2],
      ).toBe('<1 min');
    });

    it('reads "<1 min" in the records, the best week and the weeks’ table, and compares as it reads', async () => {
      serve({
        sessions: [session(daysAgo(0, 0), 45, 0.7), session(daysAgo(10), 40, 0.7)],
        loops: [activeGroove],
      });
      await openStats();
      expect(text('record-day')).toBe('<1 min');
      expect(text('record-session')).toBe('<1 min');
      expect(text('heatmap-best-week')).toMatch(/Best calendar week: <1 min over 1 day/);
      const weeks = cells(screen.getByRole('table', { name: 'Practice days by week' }));
      expect(weeks.filter(([, days]) => days === '1').map(([, , time]) => time)).toEqual([
        '<1 min',
        '<1 min',
      ]);
      // "<1 min" this week and "<1 min" the week before: the same, as shown.
      expect(text('total-time')).toBe('<1 min');
      expect(text('total-time-change')).toBe('Same as the week before');
    });
  });

  // Issue 1: 336 dots merged into a band with labels drawn over it.
  describe('a loop’s chart by how many days it has', () => {
    /** One session a day for `count` days ending today, at the percents `speedOf` gives, oldest first. */
    const daily = (count: number, speedOf: (index: number) => number) =>
      Array.from({ length: count }, (_, index) =>
        session(daysAgo(count - 1 - index), 120, speedOf(index) / 100),
      );
    const openChart = async (served: unknown[]) => {
      serve({ sessions: served, loops: [activeGroove] });
      const { toggleChart } = await openStats();
      await toggleChart('Groove');
      return screen.getByTestId('speed-chart');
    };
    const dots = (chart: HTMLElement) => chart.querySelectorAll('circle').length;
    const labels = (chart: HTMLElement) =>
      within(chart)
        .queryAllByTestId('speed-label')
        .map((label) => label.textContent);
    const dates = (chart: HTMLElement) =>
      within(chart)
        .queryAllByTestId('speed-date')
        .map((label) => label.textContent ?? '');

    it('with a few days dots and labels every day, and dates the two ends', async () => {
      const chart = await openChart(daily(5, (index) => 60 + index * 5));
      expect(dots(chart)).toBe(5);
      expect(labels(chart)).toEqual(['60%', '65%', '70%', '75%', '80%']);
      expect(dates(chart)).toHaveLength(2);
    });

    it('from nine days keeps a dot a day but labels only the first, the best and the last', async () => {
      // Twelve days; the seventh is the best.
      const chart = await openChart(daily(12, (index) => (index === 6 ? 95 : 60 + index)));
      expect(dots(chart)).toBe(12);
      expect(labels(chart)).toEqual(['60%', '95%', '71%']);
      expect(dates(chart)).toHaveLength(2);
    });

    it('past thirty days draws the line with dots on the first, the best and the last day only', async () => {
      const chart = await openChart(daily(40, (index) => (index === 20 ? 100 : 50 + index)));
      expect(dots(chart)).toBe(3);
      expect(screen.getAllByTestId('speed-point')).toHaveLength(3);
      expect(labels(chart)).toEqual(['50%', '100%', '89%']);
      expect(dates(chart)).toHaveLength(2);
      // The line still runs through every day, and the table still has them all.
      expect(chart.querySelector('path')?.getAttribute('d')?.match(/[ML]/g)).toHaveLength(40);
      expect(
        cells(screen.getByRole('table', { name: 'Speed of Groove on each practice day' })),
      ).toHaveLength(40);
      expect(chart).toHaveAccessibleName(/^Speed of Groove over 40 practice days: from 50% on /);
    });

    it('gives both dates their year when the line crosses a new year', async () => {
      const chart = await openChart([session(daysAgo(400), 300, 0.6), ...daily(3, () => 80)]);
      const [first, last] = dates(chart);
      expect(first).toMatch(/\d{4}/);
      expect(last).toMatch(/\d{4}/);
    });

    it('dates one day once, in the middle', async () => {
      const chart = await openChart(daily(1, () => 80));
      expect(dots(chart)).toBe(1);
      expect(labels(chart)).toEqual(['80%']);
      expect(dates(chart)).toHaveLength(1);
    });

    it('never names "100%" twice at one spot when every day is at full speed or over', async () => {
      const chart = await openChart(daily(3, (index) => 100 + index * 10));
      const axis = Array.from(chart.querySelectorAll('text'))
        .filter((label) => !label.hasAttribute('data-testid'))
        .map((label) => label.textContent);
      expect(axis).toEqual(['100%']);
    });

    it('draws a row’s sparkline as a line with one dot at its end, however many days', async () => {
      serve({ sessions: daily(40, (index) => 50 + index), loops: [activeGroove] });
      await openStats();
      const sparkline = screen.getByTestId('sparkline');
      expect(sparkline.querySelectorAll('circle')).toHaveLength(1);
      expect(sparkline.querySelector('path')?.getAttribute('d')?.match(/[ML]/g)).toHaveLength(40);
    });
  });

  // The plan's third question, "what have I been neglecting", had no answer that named anything.
  describe('not practised lately', () => {
    const WALTZ = { id: 'song-waltz', title: 'Waltz' };
    const id = (letter: string) => `${letter.repeat(8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    const saved = (letter: string, name: string, daysBack: number, song = GROOVE_SONG) => ({
      ...practiceLoop(id(letter), name, song),
      created_at: daysAgo(daysBack),
    });
    const neglected = () =>
      within(screen.getByRole('list', { name: 'Not practised lately' })).getAllByTestId(
        'neglected-loop',
      );

    it('names the active loops left a week or more, practised ones first, with their song, how long, and a way to them', async () => {
      serve({
        sessions: [
          session(daysAgo(0), 300, 0.8, 1, id('b')),
          session(daysAgo(12), 300, 0.7, 1, id('c')),
          session(daysAgo(30), 300, 0.7, 1, id('c')),
          session(daysAgo(90), 300, 1, 1, id('e')),
        ],
        loops: [
          saved('b', 'Today’s loop', 40),
          saved('c', 'Verse', 40),
          saved('d', 'Fill', 20, WALTZ),
          { ...saved('e', 'Done', 100), status: 'finished', finished_at: daysAgo(90) },
        ],
      });
      await openStats();
      expect(screen.getByRole('heading', { name: 'Not practised lately' })).toBeVisible();
      const [first, second, ...rest] = neglected();
      expect(rest).toHaveLength(0);
      // A loop that was being practised comes before one never started, though that one has waited longer.
      expect(first).toHaveTextContent('Verse');
      expect(first).toHaveTextContent('Groove 120');
      expect(within(first!).getByTestId('neglected-when')).toHaveTextContent(
        'last practised 12 days ago',
      );
      expect(within(first!).getByRole('link', { name: 'Verse' })).toHaveAttribute(
        'href',
        `/songs/${GROOVE_SONG.id}/loops/${id('c')}`,
      );
      expect(second).toHaveTextContent('Fill');
      expect(second).toHaveTextContent('Waltz');
      expect(within(second!).getByTestId('neglected-when')).toHaveTextContent(
        'not practised yet, saved 20 days ago',
      );
      expect(within(second!).getByRole('link', { name: 'Fill' })).toHaveAttribute(
        'href',
        `/songs/${WALTZ.id}/loops/${id('d')}`,
      );
    });

    it('shows three at most, the most recently practised first', async () => {
      const letters = ['b', 'c', 'd', 'e', 'f'];
      serve({
        sessions: [
          session(daysAgo(0), 300, 0.8),
          ...letters.map((letter, index) => session(daysAgo(10 + index), 60, 0.7, 1, id(letter))),
        ],
        loops: [activeGroove, ...letters.map((letter) => saved(letter, `Loop ${letter}`, 50))],
      });
      await openStats();
      expect(neglected().map((row) => within(row).getByRole('link').textContent)).toEqual([
        'Loop b',
        'Loop c',
        'Loop d',
      ]);
    });

    it('is not there when every active loop was practised this week or only just saved', async () => {
      serve({
        sessions: [session(daysAgo(0), 300, 0.8), session(daysAgo(6), 300, 0.8, 1, id('b'))],
        loops: [activeGroove, saved('b', 'Verse', 40), saved('c', 'New today', 0)],
      });
      await openStats();
      expect(
        screen.queryByRole('heading', { name: 'Not practised lately' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('neglected-loop')).not.toBeInTheDocument();
    });
  });
});

// Unit 20, batch 9: stats copy and locale.
describe('StatsPage, copy and locale', () => {
  const activeGroove = practiceLoop(LOOP, 'Groove', GROOVE_SONG);
  const pageText = () => document.body.textContent ?? '';

  // 17 QA issue 4 and round 1: "…, the week of 8. Juni.." in an English sentence.
  describe('with the browser set to German', () => {
    inBrowserLocale('de');
    const english = (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en', options).format(date);
    const yearIfNotThis = (date: Date): Intl.DateTimeFormatOptions =>
      date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' };
    const short = (date: Date) =>
      english(date, { day: 'numeric', month: 'short', ...yearIfNotThis(date) });
    /** A month or a weekday as German shortens it: "8. Juni", "Sa., 14. Nov.". */
    const GERMAN =
      /Jan\.|Feb\.|März|Apr\.|Mai|Juni|Juli|Aug\.|Sept\.|Okt\.|Nov\.|Dez\.|Mo\.|Di\.|Mi\.|Do\.|Fr\.|Sa\.|So\./;

    it('writes every date in English, and ends each sentence in one full stop', async () => {
      // Practice on two days of one earlier week, so there is a best week and a best day.
      const earlier = new Date(daysAgo(40));
      const monday = new Date(
        earlier.getFullYear(),
        earlier.getMonth(),
        earlier.getDate() - ((earlier.getDay() + 6) % 7),
        12,
      );
      const tuesday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1, 12);
      serve({
        sessions: [
          session(monday.toISOString(), 1800, 0.6),
          session(tuesday.toISOString(), 2400, 0.7),
          today,
        ],
        loops: [activeGroove],
      });
      const { toggleChart } = await openStats();

      expect(text('heatmap-best-week')).toBe(
        ` Best calendar week: 1 h 10 min over 2 days, the week of ${short(monday)}.`,
      );
      expect(text('record-day-when')).toBe(
        english(tuesday, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          ...yearIfNotThis(tuesday),
        }),
      );
      expect(text('record-session-when')).toBe(`Groove, ${short(tuesday)}`);
      const months = screen.getAllByTestId('heatmap-month').map((month) => month.textContent);
      for (const month of months) expect(month).toMatch(/^[A-Z][a-z]{2}$/);
      expect(months).toContain(english(new Date(), { month: 'short' }));
      // The weekdays under the fourteen bars: German has a "D" (Dienstag, Donnerstag).
      const letters = Array.from(
        screen.getByTestId('daily-minutes-chart').querySelectorAll('[data-testid="daily-bar"]'),
      ).map((bar) => Array.from(bar.querySelectorAll('text')).at(-2)?.textContent);
      expect(letters).toHaveLength(14);
      for (const letter of letters) expect(letter).toMatch(/^[MTWFS]$/);

      await toggleChart('Groove');
      expect(
        screen.getByRole('img', { name: /^Speed of Groove over 3 practice days/ }),
      ).toHaveAccessibleName(
        `Speed of Groove over 3 practice days: from 60% on ${short(monday)} to 70% on ${short(new Date())}.`,
      );
      // Nowhere on the page: a doubled full stop, or a month or weekday as German writes it.
      const written = [
        pageText(),
        ...screen.getAllByRole('img').map((img) => img.getAttribute('aria-label') ?? ''),
      ];
      for (const words of written) {
        expect(words).not.toMatch(/\.\./);
        expect(words).not.toMatch(GERMAN);
      }
    });
  });

  // 17 QA round 1, issue 1: "1,100" days beside "1100 h" and "On a 1100-day streak".
  it('groups every count of a thousand or more: hours, days, the streak and its record', async () => {
    const DAYS = 1100;
    const everyDay = Array.from({ length: DAYS }, (_, index) => session(daysAgo(index), 3600, 0.8));
    // More rows than one page of the read: answer each page with its own rows.
    queryResult.mockImplementation(async (call) => {
      if (call.table !== 'practice_sessions') return ok([activeGroove]);
      const [from, to] = (opArgs(call, 'range') ?? [0, DAYS]) as [number, number];
      return ok(everyDay.slice(from, to + 1));
    });
    const { toggleChart } = await openStats('/stats?range=all');
    expect([text('total-time'), text('total-days')]).toEqual(['1,100 h', '1,100']);
    expect(text('streak-line')).toBe('On a 1,100-day streak. Your longest yet.');
    expect(text('record-streak')).toBe('1,100 days');
    expect(within(progressRows()[0]!).getByTestId('loop-progress-time')).toHaveTextContent(
      '1,100 h · 1,100 days',
    );
    await toggleChart('Groove');
    expect(
      screen.getByRole('img', { name: /^Speed of Groove over 1,100 practice days: / }),
    ).toBeInTheDocument();
    // No run of four digits is left in anything the page writes but a year. Each piece of
    // text by itself: neighbours run together in `textContent` ("12" then "01").
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const pieces = screen.getAllByRole('img').map((img) => img.getAttribute('aria-label') ?? '');
    while (walker.nextNode()) pieces.push(walker.currentNode.textContent ?? '');
    expect(pieces.length).toBeGreaterThan(100);
    const fourDigits = pieces.flatMap((piece) => piece.match(/\d{4,}/g) ?? []);
    expect(fourDigits.filter((digits) => !/^(19|20)\d\d$/.test(digits))).toEqual([]);
  });

  // 17 Review: `sessions.error ?? loops.error` gave the sessions read's reason whichever failed to load.
  describe('when a list fails to load', () => {
    const lost: FakeResult = {
      data: null,
      error: { message: 'TypeError: Failed to fetch', code: '' },
    };
    const refused: FakeResult = {
      data: null,
      error: { message: 'permission denied for table loops', code: '42501' },
    };
    const NO_CONNECTION = "The server couldn't be reached. Check the connection and try again.";
    const REFUSED = 'The server refused it. Try again, or reload the page.';

    it('gives the reason of the read that failed to load, not of a refetch that failed over cached rows', async () => {
      // The sessions are on the device from an earlier visit; their refresh has no connection.
      const cache = testQueryClient();
      cache.setQueryData(sessionKeys.every('user-1'), sessions);
      queryResult.mockImplementation(async (call) =>
        call.table === 'practice_sessions' ? lost : refused,
      );
      renderStats('/stats', cache);
      const alert = await screen.findByRole('alert');
      // Both reads have failed by now: the sessions' over its rows, the loops' with nothing to show.
      await waitFor(() =>
        expect(cache.getQueryState(sessionKeys.every('user-1'))).toMatchObject({
          status: 'error',
          fetchStatus: 'idle',
        }),
      );
      expect(cache.getQueryState(sessionKeys.every('user-1'))?.data).toHaveLength(3);
      await settle();
      expect(alert).toHaveTextContent(`Couldn't load your stats. ${REFUSED}`);
      expect(alert).not.toHaveTextContent(NO_CONNECTION);
      expect(alert).not.toHaveTextContent(/permission denied/);
    });

    it('gives the loops read’s reason when only it failed', async () => {
      queryResult.mockImplementation(async (call) =>
        call.table === 'practice_sessions' ? ok(sessions) : lost,
      );
      renderStats();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        `Couldn't load your stats. ${NO_CONNECTION}`,
      );
    });

    it('gives the sessions read’s reason when both failed to load', async () => {
      queryResult.mockImplementation(async (call) =>
        call.table === 'practice_sessions' ? refused : lost,
      );
      renderStats();
      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(alert).toHaveTextContent(`Couldn't load your stats. ${REFUSED}`));
    });

    // Unit 20, batch 9 Test: one read at a time, and "Try again" that mends only one.
    describe('and "Try again" is pressed', () => {
      let answers: { sessions: FakeResult; loops: FakeResult };
      const reads = (table: string) =>
        queryResult.mock.calls.filter(([call]) => call.table === table).length;
      const tryAgain = (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Try again' }));

      beforeEach(() => {
        queryResult.mockImplementation(async (call) =>
          call.table === 'practice_sessions' ? answers.sessions : answers.loops,
        );
      });

      it('gives the sessions read’s reason when only it failed', async () => {
        answers = { sessions: refused, loops: ok(loops) };
        renderStats();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(`Couldn't load your stats. ${REFUSED}`);
        expect(alert).not.toHaveTextContent(NO_CONNECTION);
      });

      it('moves to the loops read’s reason when both failed and only the sessions come back', async () => {
        answers = { sessions: refused, loops: lost };
        const { user } = renderStats();
        const alert = await screen.findByRole('alert');
        await waitFor(() => expect(alert).toHaveTextContent(REFUSED));
        await waitFor(() => expect(reads('loops')).toBe(1));

        answers = { sessions: ok(sessions), loops: lost };
        await tryAgain(user);
        // Both were asked again, and the one still failing speaks for itself.
        await waitFor(() =>
          expect(screen.getByRole('alert')).toHaveTextContent(
            `Couldn't load your stats. ${NO_CONNECTION}`,
          ),
        );
        expect([reads('practice_sessions'), reads('loops')]).toEqual([2, 2]);
        expect(screen.getByRole('alert')).not.toHaveTextContent(REFUSED);
        expect(screen.queryByTestId('stats-totals')).not.toBeInTheDocument();

        // The next press asks only for what is still missing, and the page opens.
        answers = { sessions: ok(sessions), loops: ok(loops) };
        await tryAgain(user);
        await screen.findByTestId('stats-totals');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await settle();
        expect([reads('practice_sessions'), reads('loops')]).toEqual([2, 3]);
      });

      it('keeps the sessions read’s reason when both failed and only the loops come back', async () => {
        answers = { sessions: refused, loops: lost };
        const { user } = renderStats();
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(REFUSED));
        await waitFor(() => expect(reads('loops')).toBe(1));

        answers = { sessions: refused, loops: ok(loops) };
        await tryAgain(user);
        await waitFor(() => expect(reads('loops')).toBe(2));
        await settle();
        expect(screen.getByRole('alert')).toHaveTextContent(`Couldn't load your stats. ${REFUSED}`);
        expect(screen.getByRole('alert')).not.toHaveTextContent(NO_CONNECTION);
        expect(screen.queryByTestId('stats-totals')).not.toBeInTheDocument();
      });

      it('asks again only for the read with nothing to show, and opens on the cached rows of the other', async () => {
        const cache = testQueryClient();
        cache.setQueryData(sessionKeys.every('user-1'), sessions);
        answers = { sessions: lost, loops: refused };
        const { user } = renderStats('/stats', cache);
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(REFUSED));
        await waitFor(() =>
          expect(cache.getQueryState(sessionKeys.every('user-1'))).toMatchObject({
            status: 'error',
            fetchStatus: 'idle',
          }),
        );
        const sessionReads = reads('practice_sessions');
        expect(sessionReads).toBe(1);

        answers = { sessions: lost, loops: ok(loops) };
        await tryAgain(user);
        await screen.findByTestId('stats-totals');
        expect(text('total-time')).toBe('15 min');
        await settle();
        expect(reads('practice_sessions')).toBe(sessionReads);
      });
    });
  });

  // 17 Review: `new Date()` at render, and nothing drew the page again when the day changed.
  describe('left open past midnight', () => {
    const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
    const dailyDays = () =>
      Array.from(screen.getByTestId('daily-minutes-chart').querySelectorAll('[data-day]')).map(
        (bar) => bar.getAttribute('data-day'),
      );
    const todayRow = () =>
      within(screen.getByRole('table', { name: 'Minutes practised per day' })).getByRole('row', {
        name: /^Today/,
      }).textContent;
    /** The page is looked at again: a phone unlocked, a tab come back to. */
    const lookAgain = () => act(() => void document.dispatchEvent(new Event('visibilitychange')));

    beforeEach(() => {
      // Only the clock: TanStack Query and Testing Library keep real timers.
      vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('moves "today" on when the page is looked at again the next day, and ends a streak the day after', async () => {
      vi.setSystemTime(at(26, 23, 50));
      serve({ sessions: [session(at(26, 20).toISOString(), 600, 0.7)], loops: [activeGroove] });
      await openStats();
      expect(dailyDays().at(-1)).toBe('2026-11-26');
      expect(todayRow()).toBe('Today10 min');
      expect(text('streak-line')).toBe('On a 1-day streak. Your longest yet.');
      const reads = queryResult.mock.calls.length;

      vi.setSystemTime(at(27, 0, 5));
      lookAgain();
      expect(dailyDays().at(-1)).toBe('2026-11-27');
      expect(dailyDays()).toHaveLength(14);
      expect(todayRow()).toBe('Today0 min');
      // Yesterday's practice still holds the streak today.
      expect(text('streak-line')).toBe('On a 1-day streak. Your longest yet.');
      expect(
        within(screen.getByTestId('practice-heatmap')).getAllByTestId('heatmap-today'),
      ).toHaveLength(1);

      vi.setSystemTime(at(28, 0, 5));
      lookAgain();
      expect(dailyDays().at(-1)).toBe('2026-11-28');
      expect(text('streak-line')).toBe('No streak running. Your longest is 1 day.');
      // Only drawn again: the day changing reads nothing.
      expect(queryResult.mock.calls).toHaveLength(reads);
    });

    it('keeps the period chosen and a chart left open when the day changes', async () => {
      vi.setSystemTime(at(26, 23, 50));
      serve({
        sessions: [
          session(at(26, 20).toISOString(), 600, 0.7),
          session(at(20, 20).toISOString(), 600, 0.6),
        ],
        loops: [activeGroove],
      });
      const { choosePeriod, toggleChart } = await openStats();
      await choosePeriod('Month');
      await toggleChart('Groove');
      vi.setSystemTime(at(27, 0, 5));
      lookAgain();
      expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked();
      expect(chartButton('Groove')).toHaveAttribute('aria-expanded', 'true');
      expect(dailyDays().at(-1)).toBe('2026-11-27');
    });

    // Unit 20, batch 9 Test: what the reader set, and what the map does, when the day changes.
    describe('with the map in a box it can scroll', () => {
      let scrolledTo: number[];
      const mapBox = () => screen.getByTestId('practice-heatmap').parentElement;
      /** The map's oldest day, from its first square's tooltip ("Sep 14: 0 min"). */
      const oldestDay = () =>
        screen.getByTestId('practice-heatmap').querySelector('title')?.textContent?.split(':')[0];
      const mapHeading = () => screen.getByRole('heading', { name: /^Practice days/ }).textContent;

      beforeEach(() => {
        scrolledTo = [];
        vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(351);
        vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation((value: number) => {
          scrolledTo.push(value);
        });
      });
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('keeps "Show all" and leaves the map where the reader scrolled it when the day changes inside a week', async () => {
        // A Thursday.
        vi.setSystemTime(at(26, 23, 50));
        const ids = Array.from(
          { length: 7 },
          (_, index) => `5000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
        );
        serve({
          sessions: ids.map((id, index) =>
            session(at(25 - index, 20).toISOString(), 120, 0.6, 1, id),
          ),
          loops: ids.map((id, index) => practiceLoop(id, `Loop ${index}`, GROOVE_SONG)),
        });
        const { user } = await openStats();
        await user.click(screen.getByRole('button', { name: 'Show all 7 loops' }));
        expect(progressRows()).toHaveLength(7);
        const box = mapBox();
        expect(scrolledTo).toEqual([351]);
        expect(mapHeading()).toBe('Practice days Last 12 weeks');
        const oldest = oldestDay();

        vi.setSystemTime(at(27, 0, 5));
        lookAgain();
        // Drawn again for Friday...
        expect(dailyDays().at(-1)).toBe('2026-11-27');
        // ...with the whole list still open, and the same box, not scrolled again.
        expect(progressRows()).toHaveLength(7);
        expect(screen.getByRole('button', { name: 'Show fewer' })).toBeVisible();
        expect(mapBox()).toBe(box);
        expect(oldestDay()).toBe(oldest);
        expect(scrolledTo).toEqual([351]);
      });

      it.each([
        { history: 'two days', firstDaysBack: 1, weeks: 12 },
        { history: 'most of a year', firstDaysBack: 300, weeks: 26 },
      ])(
        'on a Monday midnight with $history of practice the map moves on a week, as wide as it was, and is not scrolled again',
        async ({ firstDaysBack, weeks }) => {
          // A Sunday.
          vi.setSystemTime(at(29, 23, 50));
          serve({
            sessions: [
              session(at(29, 20).toISOString(), 600, 0.7),
              session(at(29 - firstDaysBack, 20).toISOString(), 600, 0.6),
            ],
            loops: [activeGroove],
          });
          await openStats();
          const map = () => screen.getByTestId('practice-heatmap');
          const heading = `Practice days Last ${weeks} weeks`;
          expect(mapHeading()).toBe(heading);
          const oldest = oldestDay();
          const viewBox = map().getAttribute('viewBox');
          expect(map().querySelectorAll('title')).toHaveLength(weeks * 7);
          expect(scrolledTo).toEqual([351]);

          vi.setSystemTime(at(30, 0, 5));
          lookAgain();
          expect(dailyDays().at(-1)).toBe('2026-11-30');
          expect(mapHeading()).toBe(heading);
          // Its first column is now the week after.
          expect(oldestDay()).not.toBe(oldest);
          expect(map().getAttribute('viewBox')).toBe(viewBox);
          // The new week has one day so far: Monday, ringed.
          expect(within(map()).getAllByTestId('heatmap-today')).toHaveLength(1);
          expect(map().querySelectorAll('title')).toHaveLength(weeks * 7 - 6);
          expect(scrolledTo).toEqual([351]);
        },
      );

      it('on a Monday midnight that adds a week to the map, opens it on the newest week again', async () => {
        vi.setSystemTime(at(29, 23, 50));
        serve({
          // First practised 13 weeks before this one: 14 weeks on the map, 15 from Monday.
          sessions: [
            session(at(29, 20).toISOString(), 600, 0.7),
            session(at(29 - 7 * 13, 20).toISOString(), 600, 0.6),
          ],
          loops: [activeGroove],
        });
        await openStats();
        expect(mapHeading()).toBe('Practice days Last 14 weeks');
        expect(scrolledTo).toEqual([351]);
        const oldest = oldestDay();

        vi.setSystemTime(at(30, 0, 5));
        lookAgain();
        expect(mapHeading()).toBe('Practice days Last 15 weeks');
        // The same first week, one more column on the right: today's.
        expect(oldestDay()).toBe(oldest);
        expect(scrolledTo).toEqual([351, 351]);
      });
    });

    describe('with the tab hidden', () => {
      let visibility: DocumentVisibilityState;
      const show = (state: DocumentVisibilityState) => {
        visibility = state;
        lookAgain();
      };
      beforeEach(() => {
        visibility = 'visible';
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => visibility,
        });
      });
      afterEach(() => {
        // Back to jsdom's own, on the prototype.
        Reflect.deleteProperty(document, 'visibilityState');
      });

      it('over midnight: yesterday’s page while nobody looks, today’s the moment it is shown', async () => {
        vi.setSystemTime(at(26, 23, 50));
        serve({ sessions: [session(at(26, 20).toISOString(), 600, 0.7)], loops: [activeGroove] });
        const { choosePeriod } = await openStats();
        await choosePeriod('All time');
        const reads = queryResult.mock.calls.length;

        vi.setSystemTime(at(26, 23, 55));
        show('hidden');
        expect(dailyDays().at(-1)).toBe('2026-11-26');
        expect(todayRow()).toBe('Today10 min');

        vi.setSystemTime(at(27, 7));
        show('visible');
        expect(dailyDays().at(-1)).toBe('2026-11-27');
        expect(todayRow()).toBe('Today0 min');
        expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked();
        expect(screen.getByTestId('location')).toHaveTextContent('/stats?range=all');
        expect(queryResult.mock.calls).toHaveLength(reads);
      });

      it('hidden after midnight (the phone locked at five past): the day has moved on already when it is shown', async () => {
        vi.setSystemTime(at(26, 23, 50));
        serve({ sessions: [session(at(26, 20).toISOString(), 600, 0.7)], loops: [activeGroove] });
        await openStats();
        vi.setSystemTime(at(27, 0, 5));
        show('hidden');
        expect(dailyDays().at(-1)).toBe('2026-11-27');
        show('visible');
        expect(dailyDays().at(-1)).toBe('2026-11-27');
        expect(dailyDays()).toHaveLength(14);
      });
    });

    it('goes back a day when the clock is put back over midnight', async () => {
      vi.setSystemTime(at(27, 0, 5));
      serve({ sessions: [session(at(26, 20).toISOString(), 600, 0.7)], loops: [activeGroove] });
      await openStats();
      expect(dailyDays().at(-1)).toBe('2026-11-27');
      expect(todayRow()).toBe('Today0 min');

      vi.setSystemTime(at(26, 23, 0));
      lookAgain();
      expect(dailyDays().at(-1)).toBe('2026-11-26');
      expect(todayRow()).toBe('Today10 min');
      expect(
        within(screen.getByTestId('practice-heatmap')).getAllByTestId('heatmap-today'),
      ).toHaveLength(1);
    });

    it('takes a session that arrives after midnight as today’s, on the page drawn for the new day', async () => {
      vi.setSystemTime(at(26, 23, 50));
      serve({ sessions: [session(at(26, 20).toISOString(), 600, 0.7)], loops: [activeGroove] });
      const { readAgain } = await openStats();
      vi.setSystemTime(at(27, 0, 5));
      lookAgain();
      expect(todayRow()).toBe('Today0 min');
      // Practised on another device at two minutes past.
      serve({
        sessions: [
          session(at(26, 20).toISOString(), 600, 0.7),
          session(at(27, 0, 2).toISOString(), 180, 0.7),
        ],
        loops: [activeGroove],
      });
      await readAgain();
      await waitFor(() => expect(todayRow()).toBe('Today3 min'));
      expect(text('streak-line')).toBe('On a 2-day streak. Your longest yet.');
    });
  });

  // 17 QA round 1: under 358 px of page the map scrolls in its own box, and opened on its oldest week.
  describe('a practice-days map wider than its box', () => {
    let scrolledTo: number[];
    beforeEach(() => {
      scrolledTo = [];
      // jsdom lays nothing out: every box is 0 wide. Give the map's box 351 px of content.
      vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(351);
      vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation((value: number) => {
        scrolledTo.push(value);
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('opens scrolled to its newest week, and is left where the reader put it afterwards', async () => {
      serve();
      const { readAgain } = await openStats();
      expect(screen.getByTestId('practice-heatmap').parentElement).toHaveClass('overflow-x-auto');
      expect(scrolledTo).toEqual([351]);

      // Another device's session arrives: the page is drawn again, the box not moved.
      serve({ sessions: [...sessions, session(daysAgo(2), 300, 0.7)], loops });
      await readAgain();
      await waitFor(() => expect(text('total-days')).toBe('3'));
      expect(scrolledTo).toEqual([351]);
    });
  });
  // Unit 20, batch 9 Test (17.3b): the sixth song on the page, across the periods and beside unknown loops.
  describe('where the time went, at the sixth song', () => {
    const songTimes = () =>
      within(screen.getByRole('list', { name: 'Practice time by song' }))
        .getAllByTestId('song-time')
        .map((row) => row.textContent);
    const seven = Array.from({ length: 7 }, (_, index) => ({
      loop: `4000000${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      song: { id: `song-${index}`, title: `Song ${index}` },
    }));
    const loopsOf = (songs: typeof seven) =>
      songs.map(({ loop, song }) => practiceLoop(loop, 'Loop', song));
    const firstFive = ['Song 012 min', 'Song 110 min', 'Song 28 min', 'Song 36 min', 'Song 44 min'];
    /** Songs 0 to 4 yesterday, 12 minutes down to 4. */
    const fiveYesterday = () =>
      seven
        .slice(0, 5)
        .map(({ loop }, index) => session(daysAgo(1), (6 - index) * 120, 0.8, 1, loop));

    it('goes from five names to six to five and Other as the period takes in a sixth and a seventh song', async () => {
      serve({
        sessions: [
          ...fiveYesterday(),
          session(daysAgo(20), 120, 0.8, 1, seven[5]!.loop),
          session(daysAgo(100), 60, 0.8, 1, seven[6]!.loop),
        ],
        loops: loopsOf(seven),
      });
      const { choosePeriod } = await openStats();
      expect(songTimes()).toEqual(firstFive);

      await choosePeriod('Month');
      expect(songTimes()).toEqual([...firstFive, 'Song 52 min']);

      await choosePeriod('All time');
      expect(songTimes()).toEqual([...firstFive, 'Other (2 songs)3 min']);

      await choosePeriod('Week');
      expect(songTimes()).toEqual(firstFive);
    });

    it('names both when the fifth and sixth tie, in title order', async () => {
      const six = seven.slice(0, 6);
      serve({
        sessions: six.map(({ loop }, index) =>
          session(daysAgo(1), index < 4 ? (6 - index) * 120 : 240, 0.8, 1, loop),
        ),
        // The loops come in the other order: the tie is cut by title, not by arrival.
        loops: loopsOf(six).reverse(),
      });
      await openStats();
      expect(songTimes()).toEqual([...firstFive, 'Song 54 min']);
    });

    // Build's decision, pinned: six names and the unknown time apart, not "Other (1 song)" holding both.
    it('draws seven rows for six songs and sessions of a loop that is gone: six names, then plain Other', async () => {
      const six = seven.slice(0, 6);
      serve({
        sessions: [
          ...fiveYesterday(),
          session(daysAgo(1), 120, 0.8, 1, six[5]!.loop),
          session(daysAgo(1), 60, 0.8, 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
        ],
        loops: loopsOf(six),
      });
      await openStats();
      expect(songTimes()).toEqual([...firstFive, 'Song 52 min', 'Other1 min']);
      const list = screen.getByRole('list', { name: 'Practice time by song' });
      expect(within(list).getAllByRole('link')).toHaveLength(6);
      const bars = within(list).getAllByTestId('song-bar');
      expect(bars[5]).toHaveClass('bg-selected-line');
      expect(bars[6]).toHaveClass('bg-ink-muted');
      // The rows add up to the period's total: 42 minutes of songs and the one of the lost loop.
      expect(text('total-time')).toBe('43 min');
    });
  });

  // Unit 20, batch 9 Test (17.5a): grouped the English way where the browser would group, or write digits, its own.
  describe.each(['de', 'ar-EG'])('counts in a browser set to %s', (locale) => {
    inBrowserLocale(locale);

    it('are grouped with a comma and written in Western digits', async () => {
      // What this browser would have written, to prove the test could fail.
      expect((1100).toLocaleString()).not.toBe('1,100');
      const DAYS = 1100;
      const everyDay = Array.from({ length: DAYS }, (_, index) =>
        session(daysAgo(index), 3600, 0.8),
      );
      queryResult.mockImplementation(async (call) => {
        if (call.table !== 'practice_sessions') return ok([activeGroove]);
        const [from, to] = (opArgs(call, 'range') ?? [0, DAYS]) as [number, number];
        return ok(everyDay.slice(from, to + 1));
      });
      const { toggleChart } = await openStats('/stats?range=all');
      expect([text('total-time'), text('total-days')]).toEqual(['1,100 h', '1,100']);
      expect(text('streak-line')).toBe('On a 1,100-day streak. Your longest yet.');
      expect(text('record-streak')).toBe('1,100 days');
      await toggleChart('Groove');
      const written = [
        pageText(),
        ...screen.getAllByRole('img').map((img) => img.getAttribute('aria-label') ?? ''),
        ...Array.from(document.querySelectorAll('[title]'), (each) => each.getAttribute('title')),
      ].join('\n');
      expect(written).toContain('over 1,100 practice days');
      // No digit of another script, no German or Arabic thousands mark between digits.
      expect(written).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F]/);
      expect(written).not.toMatch(/\d[.\u066C\u00A0\u202F’']\d{3}(?!\d)/);
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
