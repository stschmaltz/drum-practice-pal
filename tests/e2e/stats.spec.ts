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
    .select('id, name, status, finished_at, song_id, song:songs!loops_song_fkey(title)')
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

/** A total of play time as the page writes it: "45 min", "2 h", "1 h 5 min". */
function minutesText(seconds: number): string {
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

interface Totals {
  minutes: number;
  days: number;
  passes: number;
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
    minutes: Math.floor(sum(counted.map((session) => session.duration_seconds)) / 60),
    seconds: sum(counted.map((session) => session.duration_seconds)),
    days: new Set(counted.map((session) => dayNumber(session.started_at))).size,
    passes: sum(counted.map((session) => session.repeats)),
    mastered: loops.filter(
      (loop) => loop.status === 'finished' && loop.finished_at !== null && inside(loop.finished_at),
    ).length,
  };
}

/** The line under a total: how it compares with the period before, or null for no line. */
function changeText(now: number, before: number, unit: 'min' | '', period: 'week' | 'month') {
  if (now === 0 && before === 0) return null;
  if (now === before) return `Same as the ${period} before`;
  const amount = Math.abs(now - before);
  const words =
    unit === 'min'
      ? `${minutesText(amount * 60)} ${now > before ? 'more' : 'less'}`
      : `${amount.toLocaleString('en')} ${now > before ? 'more' : 'fewer'}`;
  return `${words} than the ${period} before`;
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
  const today = dayNumber(new Date().toISOString());
  return { current: runEndingOn.get(today) ?? runEndingOn.get(today - 1) ?? 0, longest };
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

async function expectTotals(page: Page, expected: Totals) {
  await expect(page.getByTestId('total-time')).toHaveText(minutesText(expected.minutes * 60));
  await expect(page.getByTestId('total-passes')).toHaveText(expected.passes.toLocaleString('en'));
  await expect(page.getByTestId('total-days')).toHaveText(String(expected.days));
  await expect(page.getByTestId('total-mastered')).toHaveText(String(expected.mastered));
}

/** A total's change line, or that it has none. */
async function expectChange(page: Page, total: string, expected: string | null) {
  const line = page.getByTestId(`total-${total}-change`);
  if (expected === null) await expect(line).toHaveCount(0);
  else await expect(line).toHaveText(expected);
}

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

async function expectRecords(page: Page, sessions: Session[]) {
  const byDay = new Map<number, number>();
  for (const session of sessions) {
    const day = dayNumber(session.started_at);
    byDay.set(day, (byDay.get(day) ?? 0) + session.duration_seconds);
  }
  await expect(page.getByTestId('record-streak')).toHaveText(daysText(streaks(sessions).longest));
  await expect(page.getByTestId('record-day')).toHaveText(minutesText(Math.max(...byDay.values())));
  await expect(page.getByTestId('record-session')).toHaveText(
    minutesText(Math.max(...sessions.map((session) => session.duration_seconds))),
  );
}

/** The two-week chart's caption and the heatmap's: play time and days practised in each window. */
async function expectDayCounts(page: Page, sessions: Session[]) {
  const twoWeeks = totalsBetween(sessions, [], midnight(13), null);
  await expect(page.getByTestId('daily-summary')).toContainText(
    `${minutesText(twoWeeks.seconds)} over ${twoWeeks.days} of the last 14 days.`,
  );
  // 25 whole weeks and this one up to today, Monday first.
  const shown = 25 * 7 + ((new Date().getDay() + 6) % 7) + 1;
  const mapped = totalsBetween(sessions, [], midnight(shown - 1), null);
  await expect(page.getByTestId('heatmap-days')).toHaveText(
    `Practised on ${mapped.days} of the last ${shown} days.`,
  );
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
  await expectLoopProgress(page, sessions, loops);
  await expectRecords(page, sessions);
  const earned = earnedBadges(sessions, loops);
  await expect(page.locator('[data-testid="badge"][data-earned="true"]')).toHaveText(earned);
  // Three more are "Next up"; the rest wait behind the disclosure.
  await expect(page.getByTestId('badge')).toHaveCount(Math.min(earned.length + 3, 11));
  await page.getByRole('button', { name: 'Show all badges' }).click();
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
      for (const total of ['time', 'days', 'passes', 'mastered']) {
        await expectChange(page, total, null);
      }
      continue;
    }
    // The period before: as many days, ending where this one starts.
    const before = totalsBetween(sessions, loops, midnight(2 * days - 1), start);
    const period = days === 7 ? 'week' : 'month';
    await expectChange(page, 'time', changeText(totals.minutes, before.minutes, 'min', period));
    await expectChange(page, 'days', changeText(totals.days, before.days, '', period));
    await expectChange(page, 'passes', changeText(totals.passes, before.passes, '', period));
    await expectChange(page, 'mastered', changeText(totals.mastered, before.mastered, '', period));
  }
  await expectWholePage(page, sessions, loops);
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

  // The week leaves out the sessions 9 and 40 days ago.
  await choosePeriod(page, 'Week');
  await expect(page.getByTestId('total-passes')).toHaveText(String(10 + 20 + 2 + 11 + 8));
  await expect(page.getByTestId('total-passes-change')).toHaveText('39 more than the week before');

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
  await expectTotals(page, { minutes: 5, days: 1, passes: 12, mastered: 0 });
  await expectChange(page, 'time', '5 min more than the week before');
  await expectChange(page, 'days', '1 more than the week before');
  await expectChange(page, 'passes', '12 more than the week before');
  await expectChange(page, 'mastered', null);
  await expectSongTimes(page, sessions, loops, midnight(6));
  await expectWholePage(page, sessions, loops);
  await expect(page.getByTestId('streak-line')).toHaveText('On a 1-day streak. Your longest yet.');

  // One practice day: the speed alone, no arrow; no list to open.
  await expect(page.getByTestId('loop-progress-speed')).toHaveText('80%');
  await expect(page.getByTestId('loop-progress-time')).toHaveText('· 5 min · 1 day');
  await expect(page.getByRole('button', { name: /^Show all \d+ loops$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chart of First Loop' }).click();
  await expect(
    page.getByRole('img', { name: /^Speed of First Loop: 80% on .+, its one practice day\.$/ }),
  ).toBeVisible();
  await expect(page.getByTestId('speed-point')).toHaveCount(1);

  // A streak of one day is one date, and the session's loop is named.
  await expect(page.getByTestId('record-streak-when')).not.toContainText('–');
  await expect(page.getByTestId('record-session-when')).toHaveText(/^First Loop, /);
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
  for (const [index, letter] of letters.entries()) {
    const loop = await addLoop(user, await addSong(user, `Song ${letter}`), `Loop ${letter}`);
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
