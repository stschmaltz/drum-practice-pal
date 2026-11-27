/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { createAdminClient, findUserIdsByEmail } from '../../scripts/supabase-admin.ts';
import { expect, signIn, test, type E2eUser } from './auth';
import { loopsOf, navLink, sessionsOf } from './practicePage';

// Unit 16: the Stats page's numbers are sums over the user's sessions in the
// database, worked out on the device.

const admin = createAdminClient();
/** The seed user (`scripts/seed.ts`). Only read here, never changed. */
const DEMO_EMAIL = 'demo@drumpal.test';

/** The Period choice: a radio drawn by its label (SegmentedControl), so the label takes the press. */
async function choosePeriod(page: Page, label: 'Week' | 'Month' | 'All time') {
  await page
    .getByRole('radiogroup', { name: 'Period' })
    .locator('label')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
  await expect(page.getByRole('radio', { name: label })).toBeChecked();
}

/** A song, a finished loop and an active one, and sessions over the last weeks, by the service role. */
async function seedPractice(user: E2eUser) {
  const songId = crypto.randomUUID();
  const song = await admin.from('songs').insert({
    id: songId,
    user_id: user.id,
    title: 'Stats Song',
    artist: 'Fixture',
    file_path: `${user.id}/${songId}.gp`,
    file_hash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
    original_tempo: 120,
    bar_count: 16,
  });
  if (song.error) throw song.error;
  const [done, open] = [crypto.randomUUID(), crypto.randomUUID()];
  const loops = await admin.from('loops').insert([
    { id: done, user_id: user.id, song_id: songId, name: 'Done', start_bar: 1, end_bar: 2 },
    { id: open, user_id: user.id, song_id: songId, name: 'Open', start_bar: 3, end_bar: 4 },
  ]);
  if (loops.error) throw loops.error;
  const finished = await admin.from('loops').update({ status: 'finished' }).eq('id', done);
  if (finished.error) throw finished.error;

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const sessions = await admin.from('practice_sessions').insert(
    [0, 1, 2, 9, 40].map((days, index) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      loop_id: index % 2 === 0 ? done : open,
      started_at: daysAgo(days),
      duration_seconds: 300 + index * 120,
      speed_ratio: 0.6 + index * 0.05,
      repeats: 10 + index,
    })),
  );
  if (sessions.error) throw sessions.error;
}

/** A total of play time as the page writes it (`minutesLabel`): "45 min", "2 h", "1 h 5 min". */
function minutesText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

type Session = Awaited<ReturnType<typeof sessionsOf>>[number];

/** The totals the page should show, worked out here from the rows: local days, the range from midnight. */
function expectedTotals(sessions: Session[], days: number | null) {
  const now = new Date();
  const start =
    days === null ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const counted = sessions.filter(
    (session) => start === null || Date.parse(session.started_at) >= start.getTime(),
  );
  return {
    time: minutesText(counted.reduce((total, session) => total + session.duration_seconds, 0)),
    passes: String(counted.reduce((total, session) => total + session.repeats, 0)),
    days: String(
      new Set(counted.map((session) => new Date(session.started_at).toDateString())).size,
    ),
  };
}

async function expectTotals(page: Page, expected: ReturnType<typeof expectedTotals>) {
  await expect(page.getByTestId('total-time')).toHaveText(expected.time);
  await expect(page.getByTestId('total-passes')).toHaveText(expected.passes);
  await expect(page.getByTestId('total-days')).toHaveText(expected.days);
}

test('the seed user’s totals for each period are the sums of their sessions in the database', async ({
  page,
}) => {
  const [id] = await findUserIdsByEmail(admin, DEMO_EMAIL);
  if (!id) throw new Error(`${DEMO_EMAIL} is missing: run npm run db:seed`);
  const demo = { id, email: DEMO_EMAIL };
  const sessions = await sessionsOf(demo);
  // The seed logs sessions; a test on none would pass on zeros.
  expect(sessions.length).toBeGreaterThan(0);
  const loops = await loopsOf(demo);

  await signIn(page, demo, '/stats');
  for (const [label, days] of [
    ['All time', null],
    ['Month', 30],
    ['Week', 7],
  ] as const) {
    await choosePeriod(page, label);
    await expectTotals(page, expectedTotals(sessions, days));
  }
  await choosePeriod(page, 'All time');
  await expect(page.getByTestId('total-mastered')).toHaveText(
    String(loops.filter((loop) => loop.status === 'finished').length),
  );
});

test('all-time totals are the sums of the sessions in the database', async ({ page, user }) => {
  await seedPractice(user);
  await signIn(page, user, '/');
  // A streak of three days in the header (today, yesterday and the day before).
  await expect(page.getByTestId('streak')).toHaveText('Practice streak: 3 days');

  await navLink(page, 'Stats').click();
  await choosePeriod(page, 'All time');
  await expect(page).toHaveURL(/\/stats\?range=all$/);

  const sessions = await sessionsOf(user);
  const seconds = sessions.reduce((total, session) => total + session.duration_seconds, 0);
  const passes = sessions.reduce((total, session) => total + session.repeats, 0);
  const days = new Set(sessions.map((session) => new Date(session.started_at).toDateString())).size;
  await expect(page.getByTestId('total-time')).toHaveText(`${Math.floor(seconds / 60)} min`);
  await expect(page.getByTestId('total-passes')).toHaveText(String(passes));
  await expect(page.getByTestId('total-days')).toHaveText(String(days));
  await expect(page.getByTestId('total-mastered')).toHaveText('1');

  // The week leaves out the sessions 9 and 40 days ago.
  await choosePeriod(page, 'Week');
  await expect(page.getByTestId('total-passes')).toHaveText(String(10 + 11 + 12));

  // Every chart says in words what it draws.
  await expect(page.getByRole('img', { name: /Minutes practised per day/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Practised on \d+ of the last/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Speed of / })).toBeVisible();
  await expect(
    page.getByTestId('badge').filter({ hasText: 'First loop mastered' }),
  ).toHaveAttribute('data-earned', 'true');
});
