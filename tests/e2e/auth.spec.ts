import { expect, test } from '@playwright/test';
import { appUrl, createE2eUser, deleteE2eUser, signIn, signInEmailFor, type E2eUser } from './auth';

// Unit 03: auth guard, magic-link and code sign-in, sign-out, responsive nav.

let user: E2eUser;

test.beforeEach(async () => {
  user = await createE2eUser('auth');
});

test.afterEach(async () => {
  await deleteE2eUser(user);
});

test('a guarded deep link returns to itself after the magic link', async ({ page }) => {
  await page.goto('/library');
  await expect(page).toHaveURL(/\/login\?next=%2Flibrary$/);
  await signIn(page, user, '/library');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
});

test('signs in with the emailed code', async ({ page }) => {
  await page.goto('/login?next=/settings');
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText(user.email);

  // Issue a fresh code the way the email would; it replaces the one just sent.
  const { code } = await signInEmailFor(user.email, page.url());
  await page.getByLabel('Code').fill(code);
  await page.getByRole('button', { name: 'Sign in with code' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('a wrong code shows an error and stays signed out', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Sign in with code' }).click();
  await expect(page.getByRole('alert')).toContainText("That code didn't work");
  await expect(page).toHaveURL(/\/login$/);
});

test('nav is bottom tabs on phone and a sidebar from 768 px', async ({ page, viewport }) => {
  await signIn(page, user, '/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toHaveCount(1);
  const box = await nav.boundingBox();
  const size = viewport ?? { width: 0, height: 0 };
  if (size.width < 768) {
    expect(box?.y).toBeGreaterThan(size.height / 2);
    expect(box?.width).toBe(size.width);
  } else {
    expect(box?.x).toBeLessThan(size.width / 4);
  }

  await nav.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(nav.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await nav.getByRole('link', { name: 'On the go' }).click();
  await expect(page.getByRole('heading', { name: 'On the go' })).toBeVisible();
});

test('sign-out returns to login and guards the app again', async ({ page }) => {
  await signIn(page, user, '/settings');
  // Settings has a sign-out button at every size; the sidebar adds one from 768 px.
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
});

test('the session survives a reload, and /login sends a signed-in user on', async ({ page }) => {
  await signIn(page, user, '/library');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await page.goto('/login?next=%2Fsettings');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('a used magic link explains itself on the login page', async ({ browser, page }) => {
  const { link } = await signInEmailFor(user.email, appUrl('/library'));
  await page.goto(link);
  await page.waitForURL((url) => url.pathname === '/library' && url.hash === '');

  // Opening the same link again, on a device with no session.
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await second.goto(link);
    await expect(second).toHaveURL(/\/login\?next=%2Flibrary$/);
    await expect(second.getByRole('alert')).toContainText('Send yourself a new one.');
    await expect(second.getByLabel('Email')).toBeVisible();
  } finally {
    await other.close();
  }
});

test('signing out on one device leaves the other signed in', async ({ browser, page }) => {
  const other = await browser.newContext();
  try {
    const phone = await other.newPage();
    await signIn(page, user, '/settings');
    await signIn(phone, user, '/settings');

    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await phone.reload();
    await expect(phone.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await phone.getByRole('link', { name: 'Library' }).first().click();
    await expect(phone.getByRole('heading', { name: 'Library' })).toBeVisible();
  } finally {
    await other.close();
  }
});

test('an unknown address shows not found inside the shell', async ({ page }) => {
  await signIn(page, user, '/');
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to On the go' }).click();
  await expect(page.getByRole('heading', { name: 'On the go' })).toBeVisible();
});
