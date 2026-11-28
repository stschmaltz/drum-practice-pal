/// <reference lib="dom" />
import { expect, signInEmailFor, test } from './auth';
import { fillLoopForm, loopForm } from './loopsPage';
import {
  barNumber,
  fixture,
  nextBarPoint,
  openSongOverview,
  playButton,
  scoreSettled,
  tapAndWaitForBar,
  viewport,
} from './playerPage';
import {
  backTo,
  loopsOf,
  nudge,
  overviewItem,
  playFor,
  practiceSpeed,
  sessionCount,
  sessionCompleteLeftovers,
  sessionsOf,
  shortSessions,
  visitSummary,
} from './practicePage';

// Unit 13, redrawn for Unit 16's three levels: the whole first run, at each of
// the three sizes, through the UI a new user meets. Sign in with the emailed
// code, upload, jam the whole song, make a loop from the song's overview,
// practise it on its practice screen (a pause shows nothing), reach full speed,
// finish it, and back on the song the sitting is summed up. Each step's own spec covers its
// edges; this one proves they join up.

test('first run: sign in, upload, jam, make a loop, practise, hit full speed, finish', async ({
  page,
  user,
}) => {
  test.setTimeout(120_000);
  await shortSessions(page, 2);

  // Sign in with the 6-digit code, the way a phone or an installed app does.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText(user.email);
  // A fresh code the way the email would carry one; it replaces the one just sent.
  const { code } = await signInEmailFor(user.email, page.url());
  await page.getByLabel('Code').fill(code);
  await page.getByRole('button', { name: 'Sign in with code' }).click();

  // A new account opens on an empty songs list.
  await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
  await expect(page.getByText('No songs yet.', { exact: false })).toBeVisible();
  // No practice yet: no streak in the header.
  await expect(page.getByTestId('streak')).toHaveCount(0);

  // Upload, and open the song: its overview, with no loops yet.
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Groove 120”.' })).toBeVisible();
  await expect(page.getByTestId('song-line')).toHaveText('Fixture · No loops yet');
  await openSongOverview(page, 'Groove 120');
  await expect(page.getByText(/No loops yet/)).toBeVisible();

  // Jam the whole song: it opens at 100%, plays, and a tap on a bar moves there.
  await page.getByRole('link', { name: 'Play whole song' }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId('jam-speed')).toContainText('100%');
  await viewport(page).scrollIntoViewIfNeeded();
  await scoreSettled(page);
  const from = await barNumber(page);
  const landed = await tapAndWaitForBar(page, await nextBarPoint(page), from);
  expect(landed).toBe(from + 1);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(landed);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');

  // Back to the song, and "New loop": the bar picker opens. The save asks, in the form's
  // place, whether to practise the loop now or make another; "now" goes to its screen.
  await backTo(page, 'Groove 120').click();
  await page.getByRole('link', { name: 'New loop' }).click();
  await expect(loopForm(page)).toBeVisible({ timeout: 20_000 });
  await fillLoopForm(page, { name: 'Groove', firstBar: 5, lastBar: 6 });
  const saved = page.getByRole('group', { name: 'Saved “Groove”' });
  await expect(saved).toBeVisible();
  await expect(saved.getByRole('button', { name: 'Make another loop' })).toBeVisible();
  await expect(page).toHaveURL(/\/songs\/[^/]+\/play/);
  await saved.getByRole('link', { name: 'Practise it now' }).click();
  await expect(page).toHaveURL(/\/songs\/[^/]+\/loops\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Groove' })).toBeVisible();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(practiceSpeed(page)).toHaveText('100%');

  // Practise it at 80%: four nudges down, each saved as it is made, then play.
  for (let i = 0; i < 4; i++) await nudge(page, 'Slower').click();
  await expect(practiceSpeed(page)).toHaveText('80%');
  await expect.poll(async () => (await loopsOf(user))[0]?.speed_ratio).toBe(0.8);
  await playButton(page).click();
  await playFor(page, 3_000);

  // Nothing comes up at the pause; the session is in the database at its speed.
  await sessionCount(user).toBe(1);
  expect((await sessionsOf(user))[0]?.speed_ratio).toBe(0.8);
  await expect(sessionCompleteLeftovers(page)).toHaveCount(0);

  // Hit full speed: the loop asks, and is finished only when told.
  for (let i = 0; i < 4; i++) await nudge(page, 'Faster').click();
  await expect(practiceSpeed(page)).toHaveText('100%');
  const prompt = page.getByTestId('finish-prompt');
  await expect(prompt).toContainText("You're playing it at full speed");
  expect((await loopsOf(user))[0]?.status).toBe('active');
  await prompt.getByRole('button', { name: 'Mark finished' }).click();
  await expect.poll(async () => (await loopsOf(user))[0]?.status).toBe('finished');

  // Back on the song the sitting is summed up (opened at 100%, left at 100%), with the
  // streak; the loop is mastered, its history kept.
  await backTo(page, 'Groove 120').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
  const summary = visitSummary(page);
  await expect(summary.getByRole('listitem')).toHaveText([/^Groove: [3-6] s, 100%$/]);
  await expect(summary).toContainText('Streak: 1 day');
  await expect(page.getByTestId('song-facts')).toContainText('1 of 1 mastered');
  await expect(overviewItem(page, 'mastered', 'Groove')).toContainText('Bars 5 to 6 · 100%');
  expect(await sessionsOf(user)).toHaveLength(1);

  // And the songs list has the streak, and the song mastered.
  await backTo(page, 'Songs').click();
  await expect(page.getByTestId('streak')).toHaveText(/1/);
  await expect(page.getByTestId('song-line')).toHaveText('Fixture · Mastered');
});
