/// <reference lib="dom" />
import { expect, signInEmailFor, test } from './auth';
import {
  commit,
  expectLooping,
  loopPanel,
  loopPercentField,
  openLoopPanel,
  playLoopButton,
  saveNewLoop,
} from './loopsPage';
import {
  barNumber,
  fixture,
  nextBarPoint,
  playButton,
  scoreSettled,
  status,
  tapAndWaitForBar,
  viewport,
} from './playerPage';
import {
  homeItem,
  homeTab,
  loopsOf,
  navLink,
  playFor,
  sessionCount,
  sessionLogged,
  sessionsOf,
  shortSessions,
} from './practicePage';

// Unit 13: the whole first run, at each of the three sizes, through the UI a
// new user meets: sign in with the emailed code, upload, jam, save a loop,
// practise it, reach full speed and finish it. Each step's own spec covers its
// edges; this one proves they join up.

test('first run: sign in, upload, jam, save a loop, practise, hit full speed, finish', async ({
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

  // A new account opens on an empty home page that points to the library.
  await expect(page.getByRole('heading', { level: 1, name: 'On the go' })).toBeVisible();
  await expect(page.getByText(/Nothing on the go/)).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Go to Library' }).click();
  await expect(page.getByText('No songs yet.', { exact: false })).toBeVisible();

  // Upload.
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Groove 120”.' })).toBeVisible();
  await page.getByRole('list').getByRole('link', { name: 'Groove 120' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });

  // Jam: the song opens at 100%, plays, and a tap on a bar moves there.
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

  // Save a loop and slow it down: the loop keeps the speed it is played at.
  await saveNewLoop(page, { name: 'Groove', firstBar: 5, lastBar: 6 });
  await expectLooping(page, 'Groove', 'Bars 5 to 6');
  await openLoopPanel(page);
  await commit(loopPercentField(page), '80');
  await expect.poll(async () => (await loopsOf(user))[0]?.speed_ratio).toBe(0.8);

  // Practise it: a session is logged at its speed.
  await playLoopButton(page, 'Groove').click();
  await expect(status(page)).toContainText(/Bar [56] of/);
  await playFor(page, 3_000);
  await expect(sessionLogged(page)).toContainText('of Groove at 80%');
  await sessionCount(user).toBe(1);

  // Hit full speed: the loop asks, and is finished only when told.
  await openLoopPanel(page);
  await commit(loopPercentField(page), '100');
  const prompt = loopPanel(page).getByTestId('finish-prompt');
  await expect(prompt).toContainText("You're playing it at full speed");
  expect((await loopsOf(user))[0]?.status).toBe('active');
  await prompt.getByRole('button', { name: 'Mark finished' }).click();
  await expect(loopPanel(page).getByRole('region', { name: 'Finished loops' })).toContainText(
    'Groove',
  );
  await expect.poll(async () => (await loopsOf(user))[0]?.status).toBe('finished');

  // Home has it under Finished, with its history kept.
  await navLink(page, 'On the go').click();
  await expect(homeTab(page, 'On the go')).toContainText('On the go (0)');
  await homeTab(page, 'Finished').click();
  await expect(homeItem(page, 'Groove')).toContainText('Groove 120');
  await expect(homeItem(page, 'Groove')).toContainText('Bars 5 to 6 · 100%');
  expect(await sessionsOf(user)).toHaveLength(1);
});
