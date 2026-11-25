/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, signIn, test, type E2eUser } from './auth';
import {
  firstBarField,
  lastBarField,
  loopForm,
  loopItem,
  loopNameField,
  loopPanel,
  newLoopButton,
  openLoopPanel,
  saveLoopButton,
} from './loopsPage';
import { fixture, metronomeButton, openFixture, playButton } from './playerPage';
import { loopsOf } from './practicePage';

// Unit 13 Test: the carried-forward fixes a user meets on a flaky connection,
// end to end against the local stack. A lost answer is `route.fetch()` then
// `route.abort()`: the server has done the write and the page sees a failure.

const admin = createAdminClient();
const NETWORK_COPY = "The server couldn't be reached. Check the connection and try again.";

async function songsOf(user: E2eUser) {
  const { data, error } = await admin.from('songs').select('id, title').eq('user_id', user.id);
  if (error) throw error;
  return data;
}

async function filesOf(user: E2eUser) {
  const { data, error } = await admin.storage.from('gp-files').list(user.id);
  if (error) throw error;
  return data.map((file) => file.name);
}

/** Lets the first `method` request to `table` reach the database, then drops its answer. */
async function loseFirstAnswer(page: Page, table: string, method: string) {
  const lost = { count: 0 };
  await page.route(`**/rest/v1/${table}*`, async (route) => {
    if (route.request().method() !== method || lost.count > 0) return route.continue();
    lost.count += 1;
    await route.fetch();
    await route.abort('connectionfailed');
  });
  return lost;
}

test('an upload whose save answer is lost is still added, with its file', async ({
  page,
  user,
}) => {
  await signIn(page, user, '/library');
  const lost = await loseFirstAnswer(page, 'songs', 'POST');

  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture('groove-120'));

  await expect(page.getByRole('status').filter({ hasText: 'Added “Groove 120”.' })).toBeVisible();
  expect(lost.count).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const songs = await songsOf(user);
  expect(songs).toHaveLength(1);
  expect(await filesOf(user)).toEqual([`${songs[0]!.id}.gp`]);

  // The song plays: its file is the one kept, not one removed by a rollback.
  await page.getByRole('list').getByRole('link', { name: 'Groove 120' }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
});

test('Save loop pressed again after a lost answer saves one loop', async ({ page, user }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const lost = await loseFirstAnswer(page, 'loops', 'POST');

  await openLoopPanel(page);
  await newLoopButton(page).click();
  await firstBarField(page).fill('3');
  await lastBarField(page).fill('4');
  await loopNameField(page).fill('Flaky fill');
  await saveLoopButton(page).click();

  const alert = loopForm(page).getByRole('alert');
  await expect(alert).toHaveText(`Couldn't save the loop. ${NETWORK_COPY}`);
  expect(lost.count).toBe(1);
  // The first press did reach the server.
  expect(await loopsOf(user)).toHaveLength(1);

  await saveLoopButton(page).click();
  await expect(loopForm(page)).toHaveCount(0);
  await expect(page.getByTestId('active-loop')).toContainText('Flaky fill');
  await expect(loopPanel(page).getByRole('listitem')).toHaveCount(1);
  await expect(loopItem(page, 'Flaky fill')).toContainText('Bars 3 to 4');
  expect(await loopsOf(user)).toHaveLength(1);
});

test('a settings save that never reaches the server says so in fixed copy', async ({
  page,
  user,
}) => {
  await signIn(page, user, '/settings');
  const metronome = page.getByLabel('Metronome on when playback starts');
  await expect(metronome).toBeVisible();
  await page.route('**/rest/v1/user_settings*', (route) =>
    route.request().method() === 'PATCH' ? route.abort('connectionfailed') : route.continue(),
  );

  await metronome.click();
  await page.getByRole('button', { name: 'Save settings' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText(`Couldn't save your settings. ${NETWORK_COPY}`);
  await expect(alert).not.toContainText('Failed to fetch');
});

test('a shortcut says what it changed, for a screen reader', async ({ page, user }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const said = page.getByTestId('shortcut-announcement');
  await expect(said).toHaveAttribute('role', 'status');
  await expect(said).toHaveText('');
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  const wasOn = (await metronomeButton(page).getAttribute('aria-pressed')) === 'true';
  await page.keyboard.press('m');
  await expect(said).toHaveText(`Metronome ${wasOn ? 'off' : 'on'}`);
  await page.keyboard.press('ArrowUp');
  await expect(said).toHaveText('Speed 105%');
});
