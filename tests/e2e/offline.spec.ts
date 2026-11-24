/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  loopPanel,
  openLoopPanel,
  playLoopButton,
  saveNewLoop,
  saveSpeedButton,
  commit,
  loopPercentField,
} from './loopsPage';
import { openFixture, playButton } from './playerPage';
import { loopsOf, playFor, sessionCount, sessionsOf, shortSessions } from './practicePage';

// Unit 11: PWA and offline. The service worker is blocked for every other spec
// (playwright.config.ts); these need it.
test.use({ serviceWorkers: 'allow' });

/** Waits until the service worker has installed (precached the app) and is active. */
async function serviceWorkerReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

/**
 * Waits until the query cache kept for offline (IndexedDB, written a second
 * after a change) holds `text`, so a reload offline finds it.
 */
async function persistedCacheHolds(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>((resolve) => {
              const open = indexedDB.open('drum-practice-pal');
              open.onerror = () => resolve('');
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains('queryCache')) return resolve('');
                const get = db
                  .transaction('queryCache')
                  .objectStore('queryCache')
                  .get('query-cache');
                get.onsuccess = () =>
                  resolve((get.result as { value?: string } | undefined)?.value ?? '');
                get.onerror = () => resolve('');
              };
            }),
        ),
      { timeout: 10_000 },
    )
    .toContain(text);
}

/** Entries in the device's outbox: writes not yet confirmed by the server. */
function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('drum-practice-pal');
        open.onsuccess = () => {
          const count = open.result.transaction('outbox').objectStore('outbox').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
}

const banner = (page: Page) => page.getByTestId('app-banner');

test('offline, a song opened before plays its loops, and the practice syncs once with no duplicates', async ({
  page,
  context,
  user,
}) => {
  test.setTimeout(120_000);
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 6 });
  await serviceWorkerReady(page);
  await persistedCacheHolds(page, 'Verse');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
  await expect(banner(page)).toContainText("You're offline.");
  // Score, alphaTab's worker and the soundfont all came from the device.
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });

  // Practise the loop and save a speed, all offline.
  await openLoopPanel(page);
  await playLoopButton(page, 'Verse').click();
  await playFor(page, 3_000);
  await expect(page.getByTestId('session-waiting')).toContainText('saved on this device');
  await openLoopPanel(page);
  await commit(loopPercentField(page), '80');
  await saveSpeedButton(page).click();
  await expect(loopPanel(page).getByTestId('loop-speed-queued')).toBeVisible();
  await expect.poll(() => outboxCount(page)).toBe(2);
  await sessionCount(user).toBe(0);

  // Closed and opened again before the connection is back: the device kept both.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
  await expect.poll(() => outboxCount(page)).toBe(2);

  await context.setOffline(false);
  await sessionCount(user).toBe(1);
  await expect.poll(async () => (await loopsOf(user))[0]?.speed_ratio).toBe(0.8);
  await expect.poll(() => outboxCount(page)).toBe(0);
  await expect(banner(page)).toBeHidden();

  // Opened again online: nothing is sent twice.
  await page.reload();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await page.waitForTimeout(2_000);
  const sessions = await sessionsOf(user);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({ speed_ratio: 1 });
});

test('offline, the library is readable and uploads are off, and the app opens on any route', async ({
  page,
  context,
  user,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await serviceWorkerReady(page);
  await page.goto('/library');
  await expect(page.getByRole('list').getByRole('link', { name: 'Groove 120' })).toBeVisible();
  await persistedCacheHolds(page, 'Groove 120');

  await context.setOffline(true);
  await page.goto('/library');
  await expect(banner(page)).toContainText("You're offline.");
  await expect(page.getByRole('list').getByRole('link', { name: 'Groove 120' })).toBeVisible();
  await expect(page.getByLabel('Upload a Guitar Pro file')).toBeDisabled();
  await expect(page.getByTestId('offline-note').filter({ hasText: 'uploaded once' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByLabel('Upload a Guitar Pro file')).toBeEnabled();
});

test('a start without a connection keeps the user signed in when the access token has expired', async ({
  page,
  context,
  user,
}) => {
  await signIn(page, user, '/library');
  await serviceWorkerReady(page);
  await expect(page.getByText(/No songs yet/)).toBeVisible();
  await persistedCacheHolds(page, '"songs"');

  await context.setOffline(true);
  // As after a night away: the stored access token has expired, so supabase-js would
  // refresh it at start, and with no connection reports no session.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.endsWith('-auth-token')) continue;
      const session = JSON.parse(localStorage.getItem(key) ?? '{}') as { expires_at?: number };
      session.expires_at = Math.floor(Date.now() / 1000) - 60;
      localStorage.setItem(key, JSON.stringify(session));
    }
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect(page.getByText(/No songs yet/)).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);

  // Back online, supabase-js refreshes the token (and the user stays signed in).
  await context.setOffline(false);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
          const session = JSON.parse(localStorage.getItem(key ?? '') ?? '{}') as {
            expires_at?: number;
          };
          return (session.expires_at ?? 0) * 1000 > Date.now();
        }),
      { timeout: 45_000 },
    )
    .toBe(true);
  await expect(page).not.toHaveURL(/\/login/);
});
