/**
 * Sign-in helpers for Playwright specs. They need the local Supabase stack
 * (npm run db:start). Each test makes its own throwaway user, so specs can run
 * in parallel across the phone, tablet and desktop projects.
 */
import path from 'node:path';
import { test as base, type Page } from '@playwright/test';
import { createAdminClient, removeUserFiles } from '../../scripts/supabase-admin.ts';

const admin = createAdminClient();

export interface E2eUser {
  id: string;
  email: string;
}

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${crypto.randomUUID()}@drumpal.test`;
}

/** Creates a confirmed user without sending email. */
export async function createE2eUser(label: string): Promise<E2eUser> {
  const email = uniqueEmail(label);
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email };
}

/** Deletes the user and their files; settings, songs and loops cascade. */
export async function deleteE2eUser(user: E2eUser): Promise<void> {
  await removeUserFiles(admin, user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

/** The link and 6-digit code a sign-in email would carry. Replaces any earlier code. */
export async function signInEmailFor(email: string, redirectTo: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });
  if (error) throw error;
  return { link: data.properties.action_link, code: data.properties.email_otp };
}

/**
 * Playwright's `test` with a fresh `user` per test. As a fixture, teardown only
 * runs for a user that was actually created, and a failed cleanup fails the test.
 */
export const test = base.extend<{ user: E2eUser }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring even when empty
  user: async ({}, provide, testInfo) => {
    const user = await createE2eUser(path.basename(testInfo.file, '.spec.ts'));
    await provide(user);
    await deleteE2eUser(user);
  },
});

export { expect } from '@playwright/test';

/**
 * Signs `page` in through the real magic-link redirect and lands on `path`.
 * Each Playwright context has its own storage, so a second context is a second device.
 */
export async function signIn(page: Page, user: E2eUser, path = '/'): Promise<void> {
  const { link } = await signInEmailFor(user.email, appUrl(path));
  await page.goto(link);
  await page.waitForURL((url) => url.pathname === path && url.hash === '');
}

/** Absolute URL of an app path, from the project's baseURL in playwright.config.ts. */
export function appUrl(path: string): string {
  const baseURL = base.info().project.use.baseURL;
  if (!baseURL) throw new Error('playwright.config.ts sets no baseURL');
  return new URL(path, baseURL).toString();
}
