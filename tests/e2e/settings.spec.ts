import { expect, test } from '@playwright/test';
import { createE2eUser, deleteE2eUser, signIn, type E2eUser } from './auth';

// Unit 03 acceptance: change a setting on one device, see it on another after refresh.

let user: E2eUser;

test.beforeEach(async () => {
  user = await createE2eUser('settings');
});

test.afterEach(async () => {
  await deleteE2eUser(user);
});

test('a saved setting shows on a second device after refresh', async ({ browser }) => {
  // Two contexts have separate storage, so each is its own signed-in device.
  const laptopContext = await browser.newContext();
  const phoneContext = await browser.newContext();
  try {
    const laptop = await laptopContext.newPage();
    const phone = await phoneContext.newPage();
    await signIn(laptop, user, '/settings');
    await signIn(phone, user, '/settings');

    const phoneCountIn = phone.getByRole('radio', { name: '2 bars' });
    await expect(phone.getByRole('radio', { name: 'Off' })).toBeChecked();

    await laptop.getByRole('radio', { name: '2 bars' }).check();
    await laptop.getByRole('radio', { name: 'Before every loop repeat' }).check();
    await laptop.getByLabel('Mute the drum track by default').check();
    await laptop.getByLabel('Metronome volume').fill('35');
    await laptop.getByRole('button', { name: 'Save settings' }).click();
    await expect(laptop.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    await phone.reload();
    await expect(phoneCountIn).toBeChecked();
    await expect(phone.getByRole('radio', { name: 'Before every loop repeat' })).toBeChecked();
    await expect(phone.getByLabel('Mute the drum track by default')).toBeChecked();
    await expect(phone.getByLabel('Metronome volume')).toHaveValue('35');
  } finally {
    await laptopContext.close();
    await phoneContext.close();
  }
});

test('discarding edits restores the saved values', async ({ page }) => {
  await signIn(page, user, '/settings');
  const metronome = page.getByLabel('Metronome on when playback starts');
  await expect(metronome).toBeChecked();
  await metronome.uncheck();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(metronome).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled();
});

test('saved settings come back after signing out and in again', async ({ page }) => {
  await signIn(page, user, '/settings');
  await page.getByRole('radio', { name: '1 bar' }).check();
  await page.getByLabel('Metronome on when playback starts').uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, user, '/settings');
  await expect(page.getByRole('radio', { name: '1 bar' })).toBeChecked();
  await expect(page.getByLabel('Metronome on when playback starts')).not.toBeChecked();
});
