/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { createAdminClient, findUserIdsByEmail } from '../../scripts/supabase-admin.ts';
import { appUrl, expect, signIn, signInEmailFor, test, type E2eUser } from './auth';
import { textSpillingOutOf } from './designPage';
import { navLink, sessionsOf } from './practicePage';

// Units 16 and 17: every number on the Stats page is worked out on the device
// from the user's sessions and loops. These work the same numbers out again
// here, from the rows in the database and with none of the app's code, and
// expect the page to agree.

const admin = createAdminClient();
/** The seed user (`scripts/seed.ts`). Only read here, never changed. */
const DEMO_EMAIL = 'demo@drumpal.test';

type Session = Awaited<ReturnType<typeof sessionsOf>>[number];

/** The user's loops with their song, read with the service role. */
async function loopsWithSongOf(user: E2eUser) {
  const { data, error } = await admin
    .from('loops')
    .select('id, name, status, finished_at, created_at, song_id, song:songs!loops_song_fkey(title)')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
}
type LoopRow = Awaited<ReturnType<typeof loopsWithSongOf>>[number];

/**
 * Signs in as the seed user. The phone, tablet and desktop projects share that
 * one account, and a magic link made for it replaces the one before, so a
 * link another project has just overtaken is asked for again.
 */
async function signInAsSeedUser(page: Page, user: E2eUser, path: string) {
  for (let attempt = 1; ; attempt += 1) {
    const { link } = await signInEmailFor(user.email, appUrl(path));
    await page.goto(link);
    try {
      await page.waitForURL((url) => url.pathname === path && url.hash === '', { timeout: 10_000 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
}

/** The Period choice: a radio drawn by its label (SegmentedControl), so the label takes the press. */
async function choosePeriod(page: Page, label: 'Week' | 'Month' | 'All time') {
  await page
    .getByRole('radiogroup', { name: 'Period' })
    .locator('label')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
  await expect(page.getByRole('radio', { name: label })).toBeChecked();
}

// The expected numbers, from the rows -----------------------------------------

/** A total of play time as the page writes it: "45 min", "2 h", "1 h 5 min"; "<1 min" under a minute. */
function minutesText(seconds: number): string {
  if (seconds > 0 && seconds < 60) return '<1 min';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

const daysText = (days: number) => (days === 1 ? '1 day' : `${days} days`);

/** Local midnight `days` before today (0: today's). */
function midnight(daysBack: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
}

/** A local day as a number that sorts in date order and steps by one: days since 1970, local. */
function dayNumber(iso: string): number {
  const date = new Date(iso);
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A local day number as a date, at midnight. */
const dateOfDay = (day: number) => {
  const utc = new Date(day * 86_400_000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
};

/** The day number of the Monday that begins a day's week. */
const mondayOf = (day: number) => day - ((dateOfDay(day).getDay() + 6) % 7);

const today = () => dayNumber(new Date().toISOString());

interface Totals {
  seconds: number;
  days: number;
  mastered: number;
}

/** Totals from `start` up to, not including, `end`. */
function totalsBetween(
  sessions: Session[],
  loops: LoopRow[],
  start: Date | null,
  end: Date | null,
) {
  const inside = (iso: string) => {
    const time = Date.parse(iso);
    return (start === null || time >= start.getTime()) && (end === null || time < end.getTime());
  };
  const counted = sessions.filter((session) => inside(session.started_at));
  return {
    seconds: sum(counted.map((session) => session.duration_seconds)),
    days: new Set(counted.map((session) => dayNumber(session.started_at))).size,
    mastered: loops.filter(
      (loop) => loop.status === 'finished' && loop.finished_at !== null && inside(loop.finished_at),
    ).length,
  };
}

type Period = 'week' | 'month';

/**
 * The lines under the three totals: how each compares with the period before,
 * null for no line. None at all when the period before has no practice in it.
 */
function changeTexts(now: Totals, before: Totals, period: Period) {
  if (before.days === 0) return { time: null, days: null, mastered: null };
  const than = `than the ${period} before`;
  const same = `Same as the ${period} before`;
  const count = (current: number, earlier: number) => {
    if (current === 0 && earlier === 0) return null;
    if (current === earlier) return same;
    const amount = Math.abs(current - earlier).toLocaleString('en');
    return `${amount} ${current > earlier ? 'more' : 'fewer'} ${than}`;
  };
  const time = () => {
    if (now.seconds === 0 && before.seconds === 0) return null;
    // Compared as shown: whole minutes, and "<1 min" against "0 min".
    const minutes = Math.floor(now.seconds / 60) - Math.floor(before.seconds / 60);
    const moved = minutes !== 0 ? minutes : Number(now.seconds > 0) - Number(before.seconds > 0);
    if (moved === 0) return same;
    const amount = minutes !== 0 ? minutesText(Math.abs(minutes) * 60) : '<1 min';
    return `${amount} ${moved > 0 ? 'more' : 'less'} ${than}`;
  };
  return {
    time: time(),
    days: count(now.days, before.days),
    mastered: count(now.mastered, before.mastered),
  };
}

/** The streak running now (ending today or yesterday) and the longest ever, in days. */
function streaks(sessions: Session[]) {
  const days = [...new Set(sessions.map((session) => dayNumber(session.started_at)))].sort(
    (a, b) => a - b,
  );
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  const runEndingOn = new Map<number, number>();
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    runEndingOn.set(day, run);
    longest = Math.max(longest, run);
    previous = day;
  }
  return { current: runEndingOn.get(today()) ?? runEndingOn.get(today() - 1) ?? 0, longest };
}

/** One loop's working speed per practice day, oldest first: the percent with the most play time, the slower on a tie. */
function workingSpeeds(sessions: Session[], loopId: string) {
  const byDay = new Map<number, Map<number, number>>();
  for (const session of sessions.filter((each) => each.loop_id === loopId)) {
    const day = dayNumber(session.started_at);
    const percents = byDay.get(day) ?? new Map<number, number>();
    const percent = Math.round(session.speed_ratio * 100);
    percents.set(percent, (percents.get(percent) ?? 0) + session.duration_seconds);
    byDay.set(day, percents);
  }
  return [...byDay]
    .sort(([a], [b]) => a - b)
    .map(([, percents]) => {
      let best = { percent: 0, seconds: -1 };
      for (const [percent, seconds] of percents) {
        if (seconds > best.seconds || (seconds === best.seconds && percent < best.percent)) {
          best = { percent, seconds };
        }
      }
      return best.percent;
    });
}

/** A progress row's speed line: "70% → 85%, up 15", or the one speed after one day. */
function speedText(percents: number[]): string {
  const first = percents[0] ?? 0;
  const last = percents[percents.length - 1] ?? 0;
  if (percents.length < 2) return `${last}%`;
  const moved =
    last === first ? 'no change' : `${last > first ? 'up' : 'down'} ${Math.abs(last - first)}`;
  return `${first}% → ${last}%, ${moved}`;
}

// What the page shows ---------------------------------------------------------

const TOTAL_NAMES = ['time', 'days', 'mastered'] as const;

async function expectTotals(page: Page, expected: Totals) {
  await expect(page.getByTestId('total-time')).toHaveText(minutesText(expected.seconds));
  await expect(page.getByTestId('total-days')).toHaveText(String(expected.days));
  await expect(page.getByTestId('total-mastered')).toHaveText(String(expected.mastered));
  // Three totals: "Loop passes" went in QA fix round 1.
  await expect(page.getByTestId('stats-totals').locator('dt')).toHaveCount(3);
}

/** Each total's change line, or that it has none. */
async function expectChanges(
  page: Page,
  expected: Record<(typeof TOTAL_NAMES)[number], string | null>,
) {
  for (const total of TOTAL_NAMES) {
    const line = page.getByTestId(`total-${total}-change`);
    const text = expected[total];
    if (text === null) await expect(line).toHaveCount(0);
    else await expect(line).toHaveText(text);
  }
}

const NO_CHANGES = { time: null, days: null, mastered: null };

/** Every loop that has a session, with what its progress row should say. */
async function expectLoopProgress(page: Page, sessions: Session[], loops: LoopRow[]) {
  const practised = loops.filter((loop) => sessions.some((each) => each.loop_id === loop.id));
  // Not vacuous: there are rows to check.
  expect(practised.length).toBeGreaterThan(0);
  const rows = page.getByTestId('loop-progress');
  await expect(rows).toHaveCount(Math.min(practised.length, 6));
  for (const loop of practised.slice(0, 6)) {
    const own = sessions.filter((each) => each.loop_id === loop.id);
    const percents = workingSpeeds(sessions, loop.id);
    const row = page.locator(`[data-testid="loop-progress"][data-loop="${loop.id}"]`);
    await expect(row.getByTestId('loop-progress-speed')).toHaveText(speedText(percents));
    await expect(row.getByTestId('loop-progress-time')).toHaveText(
      `· ${minutesText(sum(own.map((each) => each.duration_seconds)))} · ${daysText(percents.length)}`,
    );
    await expect(row.getByRole('link', { name: loop.name })).toHaveAttribute(
      'href',
      `/songs/${loop.song_id}/loops/${loop.id}`,
    );
  }
}

/** "Where the time went" for a period that starts at `start`: each song's minutes, most first. */
async function expectSongTimes(
  page: Page,
  sessions: Session[],
  loops: LoopRow[],
  start: Date | null,
) {
  const bySong = new Map<string, { title: string; seconds: number }>();
  for (const session of sessions) {
    if (start !== null && Date.parse(session.started_at) < start.getTime()) continue;
    const loop = loops.find((each) => each.id === session.loop_id);
    if (!loop) throw new Error(`session ${session.id} has no loop`);
    const song = bySong.get(loop.song_id) ?? { title: loop.song.title, seconds: 0 };
    song.seconds += session.duration_seconds;
    bySong.set(loop.song_id, song);
  }
  const expected = [...bySong.values()]
    .sort((a, b) => b.seconds - a.seconds || a.title.localeCompare(b.title))
    .map((song) => `${song.title}${minutesText(song.seconds)}`);
  // The seed and the fixture below have five songs or fewer: no "Other" row.
  expect(expected.length).toBeLessThanOrEqual(5);
  await expect(page.getByTestId('song-time')).toHaveText(expected);
}

/** Play time per local day. */
function secondsPerDay(sessions: Session[]): Map<number, number> {
  const byDay = new Map<number, number>();
  for (const session of sessions) {
    const day = dayNumber(session.started_at);
    byDay.set(day, (byDay.get(day) ?? 0) + session.duration_seconds);
  }
  return byDay;
}

/** The records, or that there are none yet: they wait for a second practice day. */
async function expectRecords(page: Page, sessions: Session[]) {
  const byDay = secondsPerDay(sessions);
  if (byDay.size < 2) {
    await expect(page.getByRole('heading', { name: /^Records/ })).toHaveCount(0);
    for (const record of ['record-streak', 'record-day', 'record-session']) {
      await expect(page.getByTestId(record)).toHaveCount(0);
    }
    return;
  }
  await expect(page.getByRole('heading', { name: 'Records All time' })).toBeVisible();
  await expect(page.getByTestId('record-streak')).toHaveText(daysText(streaks(sessions).longest));
  await expect(page.getByTestId('record-day')).toHaveText(minutesText(Math.max(...byDay.values())));
  await expect(page.getByTestId('record-session')).toHaveText(
    minutesText(Math.max(...sessions.map((session) => session.duration_seconds))),
  );
}

/**
 * A date as the page writes it in Playwright's browser (en-US): "Nov 23", with
 * its year when that isn't this one (or when told).
 */
function dateText(date: Date, withYear = date.getFullYear() !== new Date().getFullYear()): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date);
}

/**
 * The weeks the practice-days map spans, oldest first, each with its Monday,
 * days practised and play time: from the week of the first session to this
 * one, never fewer than 12 nor more than 26.
 */
function heatmapWeeks(sessions: Session[]) {
  const byDay = secondsPerDay(sessions);
  const thisMonday = mondayOf(today());
  const firstDay = Math.min(...byDay.keys(), today());
  const spanned = (thisMonday - mondayOf(firstDay)) / 7 + 1;
  const count = Math.min(Math.max(spanned, 12), 26);
  return Array.from({ length: count }, (_, index) => {
    const monday = thisMonday - (count - 1 - index) * 7;
    const practised = [0, 1, 2, 3, 4, 5, 6]
      .map((weekday) => byDay.get(monday + weekday) ?? 0)
      .filter((seconds) => seconds > 0);
    return { monday, days: practised.length, seconds: sum(practised) };
  });
}

/**
 * The two-week chart's caption, and everything the practice-days map says:
 * the weeks it spans beside its heading, the days practised in them, the best
 * calendar week (from the second practised day on) and the table of weeks
 * behind the picture.
 */
async function expectDayCounts(page: Page, sessions: Session[]) {
  const twoWeeks = totalsBetween(sessions, [], midnight(13), null);
  await expect(page.getByTestId('daily-summary')).toHaveText(
    `${minutesText(twoWeeks.seconds)} over ${twoWeeks.days} of the last 14 days.`,
  );

  const weeks = heatmapWeeks(sessions);
  await expect(
    page.getByRole('heading', { name: `Practice days Last ${weeks.length} weeks` }),
  ).toBeVisible();
  const practised = sum(weeks.map((week) => week.days));
  await expect(page.getByTestId('heatmap-days')).toHaveText(
    `Practised on ${practised} ${practised === 1 ? 'day' : 'days'} in the last ${weeks.length} weeks.`,
  );

  const bestWeek = page.getByTestId('heatmap-best-week');
  if (practised < 2) {
    // The best week of one day would be that day again.
    await expect(bestWeek).toHaveCount(0);
  } else {
    // The earlier of two equal weeks.
    const best = weeks.reduce((top, week) => (week.seconds > top.seconds ? week : top));
    await expect(bestWeek).toHaveText(
      `Best calendar week: ${minutesText(best.seconds)} over ${daysText(best.days)}, the week of ${dateText(dateOfDay(best.monday))}.`,
    );
  }

  // The picture's numbers for a screen reader: a row a week.
  const rows = page.getByRole('table', { name: 'Practice days by week' }).locator('tbody tr');
  await expect(rows.locator('th')).toHaveText(
    weeks.map((week) => dateText(dateOfDay(week.monday))),
  );
  await expect(rows.locator('td:nth-of-type(1)')).toHaveText(weeks.map((week) => `${week.days}`));
  await expect(rows.locator('td:nth-of-type(2)')).toHaveText(
    weeks.map((week) => minutesText(week.seconds)),
  );
}

/**
 * "Not practised lately": the active loops whose last session (or, never
 * practised, whose saving) was seven calendar days ago or more, the longest
 * left first, three at most; no block at all when there is none.
 */
async function expectNeglected(page: Page, sessions: Session[], loops: LoopRow[]) {
  const left = loops
    .filter((loop) => loop.status === 'active')
    .map((loop) => {
      const own = sessions.filter((each) => each.loop_id === loop.id);
      const last =
        own.length > 0 ? Math.max(...own.map((each) => dayNumber(each.started_at))) : null;
      return {
        loop,
        practised: last !== null,
        days: today() - (last ?? dayNumber(loop.created_at)),
      };
    })
    .filter((each) => each.days >= 7)
    .sort((a, b) => b.days - a.days || a.loop.id.localeCompare(b.loop.id))
    .slice(0, 3);

  const items = page.getByTestId('neglected-loop');
  await expect(items).toHaveCount(left.length);
  const heading = page.getByRole('heading', { name: 'Not practised lately' });
  if (left.length === 0) {
    await expect(heading).toHaveCount(0);
    return;
  }
  await expect(heading).toBeVisible();
  expect(
    await items.evaluateAll((all) => all.map((item) => item.getAttribute('data-loop'))),
  ).toEqual(left.map((each) => each.loop.id));
  for (const { loop, practised, days } of left) {
    const item = page.locator(`[data-testid="neglected-loop"][data-loop="${loop.id}"]`);
    await expect(item.getByTestId('neglected-when')).toHaveText(
      practised ? `last practised ${days} days ago` : `not practised yet, saved ${days} days ago`,
    );
    await expect(item.getByText(loop.song.title, { exact: true })).toBeVisible();
    await expect(item.getByRole('link', { name: loop.name })).toHaveAttribute(
      'href',
      `/songs/${loop.song_id}/loops/${loop.id}`,
    );
  }
}

/** The badges that should be earned, by their labels, in the page's order. */
function earnedBadges(sessions: Session[], loops: LoopRow[]): string[] {
  const { longest } = streaks(sessions);
  const hours = sum(sessions.map((session) => session.duration_seconds)) / 3600;
  const passes = sum(sessions.map((session) => session.repeats));
  const finished = loops.filter((loop) => loop.status === 'finished').length;
  const songs = new Map<string, boolean>();
  for (const loop of loops) {
    songs.set(loop.song_id, (songs.get(loop.song_id) ?? true) && loop.status === 'finished');
  }
  const songMastered = [...songs.values()].some(Boolean);
  const all: [label: string, earned: boolean][] = [
    ['3-day streak', longest >= 3],
    ['7-day streak', longest >= 7],
    ['30-day streak', longest >= 30],
    ['1 hour practised', hours >= 1],
    ['10 hours practised', hours >= 10],
    ['50 hours practised', hours >= 50],
    ['100 passes', passes >= 100],
    ['1,000 passes', passes >= 1000],
    ['First loop mastered', finished >= 1],
    ['5 loops mastered', finished >= 5],
    ['Song mastered', songMastered],
  ];
  return all.filter(([, earned]) => earned).map(([label]) => label);
}

/** Everything on the page that doesn't follow the Period choice. */
async function expectWholePage(page: Page, sessions: Session[], loops: LoopRow[]) {
  const { current, longest } = streaks(sessions);
  await expect(page.getByTestId('streak-line')).toHaveText(
    `${current > 0 ? `On a ${current}-day streak.` : 'No streak running.'} ${
      current === longest ? 'Your longest yet.' : `Your longest is ${daysText(longest)}.`
    }`,
  );
  await expectDayCounts(page, sessions);
  // Sections the Period choice doesn't move say what they cover.
  await expect(page.getByRole('heading', { name: 'Loop progress All time' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Badges All time' })).toBeVisible();
  await expectLoopProgress(page, sessions, loops);
  await expectNeglected(page, sessions, loops);
  await expectRecords(page, sessions);
  const earned = earnedBadges(sessions, loops);
  await expect(page.locator('[data-testid="badge"][data-earned="true"]')).toHaveText(earned);
  // Three more are "Next up"; the rest wait behind the disclosure.
  await expect(page.getByTestId('badge')).toHaveCount(Math.min(earned.length + 3, 11));
  const showAll = page.getByRole('button', { name: 'Show all badges' });
  if (earned.length + 3 >= 11) {
    // Nothing is left to wait behind it.
    await expect(showAll).toHaveCount(0);
    return;
  }
  await showAll.click();
  await expect(page.getByTestId('badge')).toHaveCount(11);
  await page.getByRole('button', { name: 'Show fewer badges' }).click();
}

test('every number on the seed user’s page is what their sessions in the database add up to', async ({
  page,
}) => {
  const [id] = await findUserIdsByEmail(admin, DEMO_EMAIL);
  if (!id) throw new Error(`${DEMO_EMAIL} is missing: run npm run db:seed`);
  const demo = { id, email: DEMO_EMAIL };
  const sessions = await sessionsOf(demo);
  // The seed logs sessions; a test on none would pass on zeros.
  expect(sessions.length).toBeGreaterThan(0);
  const loops = await loopsWithSongOf(demo);

  await signInAsSeedUser(page, demo, '/stats');
  for (const [label, days] of [
    ['All time', null],
    ['Month', 30],
    ['Week', 7],
  ] as const) {
    await choosePeriod(page, label);
    const start = days === null ? null : midnight(days - 1);
    const totals = totalsBetween(sessions, loops, start, null);
    await expectTotals(page, totals);
    await expectSongTimes(page, sessions, loops, start);
    if (days === null || start === null) {
      await expectChanges(page, NO_CHANGES);
      continue;
    }
    // The period before: as many days, ending where this one starts.
    const before = totalsBetween(sessions, loops, midnight(2 * days - 1), start);
    // The seed practises in both periods before, so the lines are there to check.
    expect(before.days).toBeGreaterThan(0);
    await expectChanges(page, changeTexts(totals, before, days === 7 ? 'week' : 'month'));
  }
  await expectWholePage(page, sessions, loops);
  // The seed leaves "Single bar" alone for 19 days, so the page names it.
  // (`expectNeglected` has checked its days against the rows.)
  await expect(
    page.getByTestId('neglected-loop').getByRole('link', { name: 'Single bar' }),
  ).toBeVisible();
});

/** The longest text the database takes for a loop's name and a song's title, with no space to break at. */
const LONG_LOOP_NAME = 'Paradiddlediddle'.repeat(7).slice(0, 100);
const LONG_SONG_TITLE = 'Supercalifragilistic'.repeat(15);

/**
 * Two songs by the service role. "Verse" has a week of work with, yesterday,
 * ten minutes at 80% and then a minute's try at 100%; a finished loop; and a
 * loop and a song with names as long as they come.
 */
async function seedPractice(user: E2eUser) {
  const song = async (title: string) => {
    const songId = crypto.randomUUID();
    const inserted = await admin.from('songs').insert({
      id: songId,
      user_id: user.id,
      title,
      artist: 'Fixture',
      file_path: `${user.id}/${songId}.gp`,
      file_hash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
      original_tempo: 120,
      bar_count: 16,
    });
    if (inserted.error) throw inserted.error;
    return songId;
  };
  const [statsSong, longSong] = [await song('Stats Song'), await song(LONG_SONG_TITLE)];
  const [verse, done, long] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const loops = await admin.from('loops').insert([
    { id: verse, user_id: user.id, song_id: statsSong, name: 'Verse', start_bar: 1, end_bar: 2 },
    { id: done, user_id: user.id, song_id: statsSong, name: 'Done', start_bar: 3, end_bar: 4 },
    {
      id: long,
      user_id: user.id,
      song_id: longSong,
      name: LONG_LOOP_NAME,
      start_bar: 1,
      end_bar: 2,
    },
  ]);
  if (loops.error) throw loops.error;
  const finished = await admin.from('loops').update({ status: 'finished' }).eq('id', done);
  if (finished.error) throw finished.error;

  // Local noon, so no session sits near a midnight whatever time the test runs.
  const noon = (daysBack: number, minutes = 0) => {
    const day = midnight(daysBack);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, minutes).toISOString();
  };
  const row = (
    loop_id: string,
    started_at: string,
    duration_seconds: number,
    speed_ratio: number,
    repeats: number,
  ) => ({
    id: crypto.randomUUID(),
    user_id: user.id,
    loop_id,
    started_at,
    duration_seconds,
    speed_ratio,
    repeats,
  });
  const sessions = await admin.from('practice_sessions').insert([
    row(verse, noon(9), 420, 0.6, 12),
    row(verse, noon(2), 300, 0.7, 10),
    row(verse, noon(1), 600, 0.8, 20),
    row(verse, noon(1, 15), 60, 1, 2),
    row(done, noon(40), 540, 0.95, 14),
    row(done, noon(1, 30), 360, 1, 11),
    // Today, as long as the clock allows: not after now, or the server would refuse it as ahead.
    row(long, midnight(0).toISOString(), 240, 0.65, 8),
  ]);
  if (sessions.error) throw sessions.error;
  return { verse };
}

test('a try at full speed is not a day at full speed, and nothing overflows', async ({
  page,
  user,
}) => {
  const { verse } = await seedPractice(user);
  await signIn(page, user, '/');
  // Today, yesterday and the day before, in the Songs header.
  await expect(page.getByTestId('streak')).toHaveText('Practice streak: 3 days');

  await navLink(page, 'Stats').click();
  await choosePeriod(page, 'All time');
  await expect(page).toHaveURL(/\/stats\?range=all$/);
  const sessions = await sessionsOf(user);
  const loops = await loopsWithSongOf(user);
  await expectTotals(page, totalsBetween(sessions, loops, null, null));
  await expectSongTimes(page, sessions, loops, null);
  await expectWholePage(page, sessions, loops);

  // Every loop here is finished or was practised this week: nothing is named as left.
  await expect(page.getByTestId('neglected-loop')).toHaveCount(0);
  // Three practice days, so the records are listed: the streak's two ends, the session's loop.
  await expect(page.getByTestId('record-streak-when')).toContainText('–');
  await expect(page.getByTestId('record-session-when')).toHaveText(/^Verse, /);

  // The week leaves out the sessions 9 and 40 days ago: 26 minutes on three
  // days, against the 7 minutes of nine days ago in the week before.
  await choosePeriod(page, 'Week');
  await expect(page.getByTestId('total-time')).toHaveText('26 min');
  await expectChanges(page, {
    time: '19 min more than the week before',
    days: '2 more than the week before',
    mastered: '1 more than the week before',
  });
  // The month before has only the session 40 days ago.
  await choosePeriod(page, 'Month');
  const month = totalsBetween(sessions, loops, midnight(29), null);
  const monthBefore = totalsBetween(sessions, loops, midnight(59), midnight(29));
  await expectTotals(page, month);
  await expectChanges(page, changeTexts(month, monthBefore, 'month'));
  await expect(page.getByTestId('total-time-change')).toHaveText(
    '24 min more than the month before',
  );

  // Unit 17's acceptance. Yesterday on "Verse": ten minutes at 80%, one at 100%.
  const row = page.locator(`[data-testid="loop-progress"][data-loop="${verse}"]`);
  await expect(row.getByTestId('loop-progress-speed')).toHaveText('60% → 80%, up 20');
  await expect(row.getByTestId('loop-progress-time')).toHaveText('· 23 min · 3 days');
  await expect(page.getByTestId('speed-chart')).toHaveCount(0);
  await row.getByRole('button', { name: 'Chart of Verse' }).click();
  const chart = page.getByRole('img', {
    name: /^Speed of Verse over 3 practice days: from 60% on .+ to 80% on .+\.$/,
  });
  await expect(chart).toBeVisible();
  await expect(page.getByTestId('speed-point')).toHaveCount(3);
  expect(
    await page
      .getByTestId('speed-point')
      .evaluateAll((points) => points.map((point) => point.getAttribute('data-percent'))),
  ).toEqual(['60', '70', '80']);
  // The numbers are on the picture, not only behind it: each point's percent and the days' dates.
  await expect(chart.locator('text', { hasText: /^80%$/ })).toHaveCount(1);
  await expect(chart.locator('text', { hasText: /^60%$/ })).toHaveCount(1);

  // Names as long as the database takes neither widen the page nor run out of their rows.
  await expect(page.getByRole('link', { name: LONG_LOOP_NAME })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    'sideways page scroll',
  ).toBeLessThanOrEqual(0);
  expect(await textSpillingOutOf(page.getByRole('main'))).toEqual([]);

  // A row's name goes to the loop's practice screen.
  await row.getByRole('link', { name: 'Verse' }).click();
  await expect(page).toHaveURL(new RegExp(`/loops/${verse}$`));
});

test('a new user sees the one empty state', async ({ page, user }) => {
  await signIn(page, user, '/stats');
  await expect(page.getByText(/^No practice yet/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Songs' })).toBeVisible();
  await expect(page.getByTestId('stats-totals')).toHaveCount(0);
  await expect(page.getByRole('img')).toHaveCount(0);
});

// Unit 17 Test: fixtures put in by the service role, for the states the two above don't reach.

async function addSong(user: E2eUser, title: string): Promise<string> {
  const songId = crypto.randomUUID();
  const inserted = await admin.from('songs').insert({
    id: songId,
    user_id: user.id,
    title,
    artist: 'Fixture',
    file_path: `${user.id}/${songId}.gp`,
    file_hash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
    original_tempo: 120,
    bar_count: 16,
  });
  if (inserted.error) throw inserted.error;
  return songId;
}

async function addLoop(user: E2eUser, songId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  const inserted = await admin
    .from('loops')
    .insert({ id, user_id: user.id, song_id: songId, name, start_bar: 1, end_bar: 2 });
  if (inserted.error) throw inserted.error;
  return id;
}

async function addSession(
  user: E2eUser,
  loopId: string,
  startedAt: Date,
  seconds: number,
  speedRatio: number,
  repeats: number,
) {
  const inserted = await admin.from('practice_sessions').insert({
    id: crypto.randomUUID(),
    user_id: user.id,
    loop_id: loopId,
    started_at: startedAt.toISOString(),
    duration_seconds: seconds,
    speed_ratio: speedRatio,
    repeats,
  });
  if (inserted.error) throw inserted.error;
}

/** Local noon `daysBack` days ago: clear of midnight whenever the test runs. */
function noonOf(daysBack: number): Date {
  const day = midnight(daysBack);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
}

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Plan, QA focus "one session ever": day one must not read as a failure.
test('after one session ever, every section speaks from that session', async ({ page, user }) => {
  const loop = await addLoop(user, await addSong(user, 'First Song'), 'First Loop');
  // Today's first instant: never after now, which the server would refuse.
  await addSession(user, loop, midnight(0), 300, 0.8, 12);
  const sessions = await sessionsOf(user);
  expect(sessions).toHaveLength(1);
  const loops = await loopsWithSongOf(user);

  await signIn(page, user, '/stats');
  await expectTotals(page, { seconds: 300, days: 1, mastered: 0 });
  // Nothing before this week to compare with: no "5 min more than the week before".
  await expectChanges(page, NO_CHANGES);
  await expectSongTimes(page, sessions, loops, midnight(6));
  await expectWholePage(page, sessions, loops);
  await expect(page.getByTestId('streak-line')).toHaveText('On a 1-day streak. Your longest yet.');
  // The map is its shortest, and neither a best week nor records restate the one day.
  await expect(page.getByTestId('heatmap-days')).toHaveText(
    'Practised on 1 day in the last 12 weeks.',
  );
  await expect(page.getByTestId('heatmap-best-week')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Records/ })).toHaveCount(0);
  await expect(page.getByTestId('neglected-loop')).toHaveCount(0);

  // One practice day: the speed alone, no arrow; no list to open.
  await expect(page.getByTestId('loop-progress-speed')).toHaveText('80%');
  await expect(page.getByTestId('loop-progress-time')).toHaveText('· 5 min · 1 day');
  await expect(page.getByRole('button', { name: /^Show all \d+ loops$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chart of First Loop' }).click();
  await expect(
    page.getByRole('img', { name: /^Speed of First Loop: 80% on .+, its one practice day\.$/ }),
  ).toBeVisible();
  await expect(page.getByTestId('speed-point')).toHaveCount(1);

  await expect(page.getByText(/^None earned yet/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Next up' }).getByRole('listitem')).toHaveCount(3);

  expect(await sidewaysScroll(page), 'sideways page scroll').toBeLessThanOrEqual(0);
  expect(await textSpillingOutOf(page.getByRole('main'))).toEqual([]);
});

test('seven songs and loops: five songs then Other, six loops then "Show all", one chart at a time', async ({
  page,
  user,
}) => {
  // Song A was practised yesterday and longest, Song G seven days ago and least.
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const loopIds: string[] = [];
  const songIds: string[] = [];
  for (const [index, letter] of letters.entries()) {
    const song = await addSong(user, `Song ${letter}`);
    const loop = await addLoop(user, song, `Loop ${letter}`);
    songIds.push(song);
    await addSession(user, loop, noonOf(index + 1), (7 - index) * 120, 0.6 + index * 0.05, 3);
    loopIds.push(loop);
  }
  expect(await sessionsOf(user)).toHaveLength(7);

  await signIn(page, user, '/stats');
  await choosePeriod(page, 'All time');
  await expect(page.getByTestId('total-time')).toHaveText('56 min');
  // 14, 12, 10, 8 and 6 minutes, then Songs F and G together.
  await expect(page.getByTestId('song-time')).toHaveText([
    'Song A14 min',
    'Song B12 min',
    'Song C10 min',
    'Song D8 min',
    'Song E6 min',
    'Other (2 songs)6 min',
  ]);
  // The bars are measured against the longest named song, and "Other" with them: never the scale.
  expect(
    await page
      .getByTestId('song-bar')
      .evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).style.width)),
  ).toEqual(['100%', '85.71%', '71.43%', '57.14%', '42.86%', '42.86%']);
  // The week is today and the six days before: Song G, seven days ago, has no time in it.
  await choosePeriod(page, 'Week');
  await expect(page.getByTestId('total-time')).toHaveText('54 min');
  await expect(page.getByTestId('song-time')).toHaveText([
    'Song A14 min',
    'Song B12 min',
    'Song C10 min',
    'Song D8 min',
    'Song E6 min',
    'Other (1 song)4 min',
  ]);
  await expect(page.getByRole('link', { name: /^Other/ })).toHaveCount(0);

  // Loop G was last practised seven days ago: named as left, with its song and a way to it.
  const left = page.getByTestId('neglected-loop');
  await expect(left).toHaveCount(1);
  await expect(left.getByTestId('neglected-when')).toHaveText('last practised 7 days ago');
  await expect(left.getByText('Song G', { exact: true })).toBeVisible();
  await expect(left.getByRole('link', { name: 'Loop G' })).toHaveAttribute(
    'href',
    `/songs/${songIds[6]}/loops/${loopIds[6]}`,
  );

  // Six loops, last practised first; the seventh behind one button that keeps focus.
  const rows = page.getByTestId('loop-progress');
  const names = () => rows.getByRole('link').allTextContents();
  await expect(rows).toHaveCount(6);
  expect(await names()).toEqual(['Loop A', 'Loop B', 'Loop C', 'Loop D', 'Loop E', 'Loop F']);
  const showAll = page.getByRole('button', { name: 'Show all 7 loops' });
  await showAll.focus();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(7);
  expect((await names())[6]).toBe('Loop G');
  const showFewer = page.getByRole('button', { name: 'Show fewer', exact: true });
  await expect(showFewer).toBeFocused();
  await expect(showFewer).toHaveAttribute('aria-expanded', 'true');

  // One chart at a time, and the period leaves it open.
  await page.getByRole('button', { name: 'Chart of Loop A' }).click();
  await expect(page.getByRole('img', { name: /^Speed of Loop A: 60% on / })).toBeVisible();
  const chartOfG = page.getByRole('button', { name: 'Chart of Loop G' });
  await chartOfG.click();
  await expect(page.getByTestId('speed-chart')).toHaveCount(1);
  await expect(page.getByRole('img', { name: /^Speed of Loop G: 90% on / })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chart of Loop A' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await choosePeriod(page, 'Month');
  await expect(chartOfG).toHaveAttribute('aria-expanded', 'true');
  await expect(rows).toHaveCount(7);

  // The numbers behind each graphic are there for a screen reader: a row a day, a row a point.
  await expect(
    page.getByRole('table', { name: 'Minutes practised per day' }).locator('tbody tr'),
  ).toHaveCount(14);
  await expect(
    page.getByRole('table', { name: 'Speed of Loop G on each practice day' }).locator('tbody tr'),
  ).toHaveText([/90%\s*2 min$/]);

  // With everything open nothing widens the page or leaves its box, at this size.
  await page.getByRole('button', { name: 'Show all badges' }).click();
  await expect(page.getByTestId('badge')).toHaveCount(11);
  expect(await sidewaysScroll(page), 'sideways page scroll').toBeLessThanOrEqual(0);
  expect(await textSpillingOutOf(page.getByRole('main'))).toEqual([]);

  // "Show fewer" takes the seventh row and its chart away again.
  await showFewer.click();
  await expect(rows).toHaveCount(6);
  await expect(page.getByTestId('speed-chart')).toHaveCount(0);

  // A song's bar goes to the song.
  await page.getByRole('link', { name: 'Song A' }).click();
  await expect(page).toHaveURL(/\/songs\/[0-9a-f-]{36}$/);
});

interface DrawnText {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The text drawn in the charts matched by `selector`: each one's words and box on screen. */
const chartTexts = (page: Page, selector: string): Promise<DrawnText[]> =>
  page.locator(`${selector} text`).evaluateAll((texts) =>
    texts.map((text) => {
      const box = text.getBoundingClientRect();
      return {
        text: text.textContent ?? '',
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      };
    }),
  );

/** Pairs of texts whose boxes share any area (touching edges don't count), as "a / b". */
function overlapping(texts: DrawnText[]): string[] {
  const pairs: string[] = [];
  texts.forEach((a, index) => {
    for (const b of texts.slice(index + 1)) {
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        pairs.push(`${a.text} / ${b.text}`);
      }
    }
  });
  return pairs;
}

// 17 QA issue 1: a loop practised on hundreds of days drew a band of dots with
// its percents over it and one date under another.
test('a year of practice days on one loop draws a line with three days marked and two dates, readable at 390 px', async ({
  page,
  user,
}) => {
  const DAYS = 365;
  const loop = await addLoop(user, await addSong(user, 'Year Song'), 'Year Loop');
  // Oldest first, yesterday last: 50% up to 100% on the 300th day, then 95%.
  const percentOn = (index: number) => (index <= 300 ? 50 + Math.round(index / 6) : 95);
  const inserted = await admin.from('practice_sessions').insert(
    Array.from({ length: DAYS }, (_, index) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      loop_id: loop,
      started_at: noonOf(DAYS - index).toISOString(),
      duration_seconds: 600,
      speed_ratio: percentOn(index) / 100,
      repeats: 20,
    })),
  );
  if (inserted.error) throw inserted.error;
  const sessions = await sessionsOf(user);
  expect(sessions).toHaveLength(DAYS);
  const loops = await loopsWithSongOf(user);

  await signIn(page, user, '/stats');
  await choosePeriod(page, 'All time');
  await expectTotals(page, totalsBetween(sessions, loops, null, null));
  await expectWholePage(page, sessions, loops);
  const row = page.locator(`[data-testid="loop-progress"][data-loop="${loop}"]`);
  await expect(row.getByTestId('loop-progress-speed')).toHaveText('50% → 95%, up 45');

  await row.getByRole('button', { name: 'Chart of Year Loop' }).click();
  const chart = page.getByRole('img', {
    name: /^Speed of Year Loop over 365 practice days: from 50% on .+ to 95% on .+\.$/,
  });
  const first = noonOf(DAYS);
  const last = noonOf(1);
  const withYear = first.getFullYear() !== last.getFullYear();

  const expectReadableChart = async (size: string) => {
    await expect(chart, size).toBeVisible();
    // The line, and a dot only on the first day, the best and the last: no band of 365.
    await expect(chart.locator('path'), size).toHaveCount(1);
    expect(
      await page
        .getByTestId('speed-point')
        .evaluateAll((points) => points.map((point) => point.getAttribute('data-percent'))),
      size,
    ).toEqual(['50', '100', '95']);
    await expect(page.getByTestId('speed-label'), size).toHaveText(['50%', '100%', '95%']);
    // Both ends dated, each with its year only when the two differ in year.
    await expect(page.getByTestId('speed-date'), size).toHaveText([
      dateText(first, withYear),
      dateText(last, withYear),
    ]);
    const texts = await chartTexts(page, '[data-testid="speed-chart"]');
    // Not vacuous: two axis percents, three points' percents, two dates.
    expect(texts, size).toHaveLength(7);
    expect(overlapping(texts), `${size}: chart texts drawn over one another`).toEqual([]);
    // Every chart on the page, at this width: no text under 10 px tall.
    const all = await chartTexts(page, 'main svg[role="img"]');
    expect(all.length, size).toBeGreaterThan(texts.length);
    expect(
      all
        .filter((each) => each.bottom - each.top < 10)
        .map((each) => `${each.text}: ${each.bottom - each.top}`),
      `${size}: chart text under 10 px`,
    ).toEqual([]);
    expect(await sidewaysScroll(page), `${size}: sideways page scroll`).toBeLessThanOrEqual(0);
  };

  await expectReadableChart('this size');
  // The table behind the picture still has every day.
  await expect(
    page
      .getByRole('table', { name: 'Speed of Year Loop on each practice day' })
      .locator('tbody tr'),
  ).toHaveCount(DAYS);
  // And at a phone's width, whatever the project's: the chart is smallest there.
  await page.setViewportSize({ width: 390, height: 844 });
  await expectReadableChart('390 px');
});
