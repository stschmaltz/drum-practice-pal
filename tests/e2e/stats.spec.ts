/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, signIn, test, type E2eUser } from './auth';
import { navLink, sessionsOf } from './practicePage';

// Unit 14: the Stats page's numbers are sums over the user's sessions in the
// database, worked out on the device.

const admin = createAdminClient();

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

test('all-time totals are the sums of the sessions in the database', async ({ page, user }) => {
  await seedPractice(user);
  await signIn(page, user, '/');
  // A streak of three days in the header (today, yesterday and the day before).
  await expect(page.getByTestId('streak')).toHaveText(/3/);

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
