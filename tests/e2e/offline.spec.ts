/// <reference lib="dom" />
import type { BrowserContext, Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  chooseLoopAction,
  commit,
  playLoopButton,
  loopItem,
  loopPanel,
  loopPercentField,
  newLoopButton,
  openLoopPanel,
  saveLoopButton,
  saveNewLoop,
  saveSpeedButton,
} from './loopsPage';
import { openFixture, openSongOverview, playButton } from './playerPage';
import {
  backTo,
  loopsOf,
  navLink,
  openPractice,
  overviewItem,
  playFor,
  sessionCount,
  sessionsOf,
  shortSessions,
} from './practicePage';

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

/** How many rows the app's IndexedDB stores hold, and the text of the cache kept for offline. */
function deviceData(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ songFiles: number; outbox: number; queryCache: string }>((resolve, reject) => {
        const open = indexedDB.open('drum-practice-pal');
        open.onerror = () => reject(new Error('IndexedDB would not open'));
        open.onsuccess = () => {
          const tx = open.result.transaction(['songFiles', 'outbox', 'queryCache']);
          const result = { songFiles: -1, outbox: -1, queryCache: '' };
          const songFiles = tx.objectStore('songFiles').count();
          songFiles.onsuccess = () => (result.songFiles = songFiles.result);
          const outbox = tx.objectStore('outbox').count();
          outbox.onsuccess = () => (result.outbox = outbox.result);
          const cache = tx.objectStore('queryCache').get('query-cache');
          cache.onsuccess = () =>
            (result.queryCache = (cache.result as { value?: string } | undefined)?.value ?? '');
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(new Error('IndexedDB read failed'));
        };
      }),
  );
}

/**
 * Every loop write the browser is asked to send while the context is offline, from the
 * page or its service worker. Offline, the app must not even try: a queued edit waits for
 * the connection. Switch the connection with `goingOffline` / `goingOnline`, not
 * `context.setOffline`, so the record knows which requests were sent offline.
 */
function recordLoopWritesWhileOffline(context: BrowserContext) {
  let offline = false;
  const sent: string[] = [];
  context.on('request', (request) => {
    if (offline && request.method() === 'PATCH' && request.url().includes('/rest/v1/loops')) {
      sent.push(request.url());
    }
  });
  return {
    sent,
    goingOffline: async () => {
      await context.setOffline(true);
      offline = true;
    },
    goingOnline: async () => {
      offline = false;
      await context.setOffline(false);
    },
  };
}

/** The Sign out button in the page's main content (the sidebar has its own). */
const settingsSignOut = (page: Page) =>
  page.getByRole('main').getByRole('button', { name: 'Sign out' });

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
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible();
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

test('signing out empties the device: song files, queued writes and the cache kept for offline', async ({
  page,
  context,
  user,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 6 });
  await serviceWorkerReady(page);
  await persistedCacheHolds(page, 'Verse');
  // A write in the outbox, as one not yet answered is.
  await context.setOffline(true);
  await openLoopPanel(page);
  await loopItem(page, 'Verse')
    .getByRole('button', { name: /^Mark finished/ })
    .click();
  await expect.poll(async () => (await deviceData(page)).outbox).toBe(1);
  await expect.poll(async () => (await deviceData(page)).songFiles).toBe(1);
  await context.setOffline(false);
  await expect.poll(async () => (await loopsOf(user))[0]?.status).toBe('finished');

  await page.goto('/settings');
  await expect(settingsSignOut(page)).toBeEnabled();
  expect(await deviceData(page)).toMatchObject({ songFiles: 1 });
  expect((await deviceData(page)).queryCache).toContain('Groove 120');
  await settingsSignOut(page).click();
  await page.waitForURL(/\/login/);
  await expect
    .poll(async () => {
      const data = await deviceData(page);
      return { ...data, queryCache: data.queryCache.includes('Groove 120') };
    })
    .toEqual({ songFiles: 0, outbox: 0, queryCache: false });

  // Nothing of theirs opens offline either: the app goes to the sign-in page.
  await context.setOffline(true);
  await page.goto('/library');
  await page.waitForURL(/\/login/);
  await expect(page.getByText('Groove 120')).toHaveCount(0);
});

test('the service worker never answers a missing file with the app page, and serves what it holds', async ({
  page,
  context,
  user,
}) => {
  await signIn(page, user, '/library');
  await serviceWorkerReady(page);
  // A page loaded before the worker took over is not its client; the next load is.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);

  const answers = await page.evaluate(async () => {
    const read = async (path: string) => {
      try {
        const response = await fetch(path);
        return `${response.status} ${response.headers.get('content-type') ?? ''}`;
      } catch {
        return 'network error';
      }
    };
    return {
      missingScript: await read('/assets/no-such-chunk.js'),
      missingFont: await read('/font/no-such-font.woff2'),
      missingSoundfont: await read('/soundfont/no-such.sf2'),
      soundfont: await read('/soundfont/sonivox.sf2'),
    };
  });
  for (const missing of [answers.missingScript, answers.missingFont, answers.missingSoundfont]) {
    expect(missing).toBe('network error');
  }
  expect(answers.soundfont).toMatch(/^200 /);
  expect(answers.soundfont).not.toMatch(/text\/html/);

  // A navigation is the one request answered with the page: any route opens offline.
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('offline, a loop opens from the home page and every control that needs the network is off with a reason; a finish made offline syncs', async ({
  page,
  context,
  user,
}) => {
  test.setTimeout(120_000);
  const writes = recordLoopWritesWhileOffline(context);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 6 });
  await serviceWorkerReady(page);
  // The song's own list, with the new loop, kept before the page is left (the cache is
  // written a second after a change; see Bugs found in the Unit 11 note).
  await persistedCacheHolds(page, 'Verse');
  // Each screen read once online, so the cache kept for offline has it.
  await page.goto('/');
  await openSongOverview(page, 'Groove 120');
  await expect(overviewItem(page, 'on the go', 'Verse')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('list').getByRole('link', { name: 'Groove 120' })).toBeVisible();
  await persistedCacheHolds(page, 'metronome_volume');
  await persistedCacheHolds(page, 'Verse');

  // A cold start offline, on the songs list, then the song and one tap into practice.
  await writes.goingOffline();
  await page.goto('/');
  await expect(banner(page)).toContainText("You're offline.");
  await openSongOverview(page, 'Groove 120');
  await openPractice(page, 'Verse');
  await expect(page.getByTestId('practice-progress')).toContainText('Bars 5 to 6');

  // Back to the whole song, where the loop panel is.
  await backTo(page, 'Groove 120').click();
  await page.getByRole('link', { name: 'Play whole song' }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });

  // Loops can't be created or deleted offline.
  await openLoopPanel(page);
  await newLoopButton(page).click();
  await expect(saveLoopButton(page)).toBeDisabled();
  await expect(
    loopPanel(page).getByText("You're offline. Loops can be saved once you're back online."),
  ).toBeVisible();
  await loopPanel(page).getByRole('button', { name: 'Cancel' }).click();
  await chooseLoopAction(page, 'Verse', 'Delete');
  await expect(loopPanel(page).getByRole('button', { name: 'Delete loop' })).toBeDisabled();
  await loopPanel(page).getByRole('button', { name: 'Keep it' }).click();

  // Finishing it queues, and its button waits for the write.
  await loopItem(page, 'Verse')
    .getByRole('button', { name: /^Mark finished/ })
    .click();
  const reopen = loopItem(page, 'Verse').getByRole('button', { name: /^Reopen/ });
  await expect(reopen).toHaveAttribute('aria-disabled', 'true');

  // From here on, screens change by the nav links, not page.goto: Chromium's offline
  // emulation can fire `online` in a document being left (navigator.onLine still false),
  // which sends the queued finish from it, unseen by Playwright (13 QA). A real browser
  // fires `online` only once the connection is back.
  // Settings: a change can be made but not saved; sign-out waits for the connection.
  await navLink(page, 'Settings').click();
  await page.getByRole('radio', { name: '2 bars' }).check();
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  await expect(settingsSignOut(page)).toBeDisabled();
  await expect(
    page.getByRole('main').getByText("You can sign out once you're back online."),
  ).toBeVisible();

  // The songs list: no edits or deletes.
  await navLink(page, 'Songs').click();
  await page.getByRole('button', { name: 'Edit Groove 120' }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Delete Groove 120' }).click();
  await expect(page.getByRole('button', { name: 'Delete song' })).toBeDisabled();

  expect(writes.sent).toEqual([]);
  expect((await loopsOf(user))[0]?.status).toBe('active');
  await writes.goingOnline();
  await expect.poll(async () => (await loopsOf(user))[0]?.status).toBe('finished');
  await expect.poll(() => outboxCount(page)).toBe(0);
  await expect(page.getByRole('button', { name: 'Delete song' })).toBeEnabled();
});
