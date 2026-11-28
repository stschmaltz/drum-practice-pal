/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test, type E2eUser } from './auth';
import { boxOf, fixture, openSongOverview, playButton, viewport } from './playerPage';
import { navLink } from './practicePage';
import {
  EMBED_URL,
  lastPlayedOf,
  linkField,
  linksOf,
  openRecordingsForm,
  playAlong,
  recordingBar,
  recordingFrame,
  recordingNote,
  recordingsForm,
  saveRecordings,
  sourceOption,
  sourceSwitch,
  SPOTIFY_URL,
  STUB_PLAYER_TEXT,
  stubServices,
  VIDEO_ID,
  WATCH_URL,
} from './recordingsPage';

// Unit 14: a song's recordings. YouTube can't be played on a CI machine, so its
// hosts are answered by a stub page: what is asserted is the frame the app
// builds, that nothing of YouTube's is asked for until a recording is opened,
// the way out, and what a Spotify link does.

async function uploadFixture(page: Page, name: string, title: string): Promise<void> {
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture(name));
  await expect(page.getByRole('status').filter({ hasText: `Added “${title}”.` })).toBeVisible();
}

async function songWithOverviewOpen(page: Page, user: E2eUser): Promise<void> {
  await signIn(page, user, '/');
  await uploadFixture(page, 'groove-120', 'Groove 120');
  await openSongOverview(page, 'Groove 120');
}

const songTitles = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('list')
    .getByRole('listitem')
    .evaluateAll((items) => items.map((item) => item.querySelector('a')?.textContent ?? ''));

test('a YouTube link plays in the play screen over the tab, and nothing of YouTube’s loads before that', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const services = await stubServices(context);
  await songWithOverviewOpen(page, user);
  // A song with no links: the page as it was, and one quiet way in.
  await expect(page.getByRole('link', { name: 'Play whole song' })).toBeVisible();
  await expect(playAlong(page)).toHaveCount(0);

  // Pasted as the YouTube app's share sheet gives it: saved in its normal form.
  await saveRecordings(page, 'Groove 120', {
    Original: `https://youtu.be/${VIDEO_ID}?si=AbCdEf123456`,
  });
  await expect(playAlong(page).getByRole('link')).toHaveText(['Tab', 'Original']);
  await expect
    .poll(() => linksOf(user))
    .toEqual([{ kind: 'original', provider: 'youtube', url: WATCH_URL }]);

  // The overview, the Songs list, Stats, Settings and the tab's own player ask YouTube for nothing.
  await navLink(page, 'Stats').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();
  await navLink(page, 'Settings').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await navLink(page, 'Songs').click();
  await openSongOverview(page, 'Groove 120');
  await playAlong(page).getByRole('link', { name: 'Tab', exact: true }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(sourceSwitch(page)).toBeVisible();
  await expect(recordingFrame(page)).toHaveCount(0);
  expect(await page.locator('iframe').count()).toBe(0);
  expect(services.requests).toEqual([]);

  // Two taps from the overview: the song's Original, then Play on the video itself.
  await page.goBack();
  await playAlong(page).getByRole('link', { name: 'Original' }).click();
  await expect(page).toHaveURL(/\/play\?source=original$/);
  const frame = recordingFrame(page);
  await expect(frame).toHaveAttribute('src', EMBED_URL);
  await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  await expect(frame).toHaveAttribute(
    'allow',
    'accelerometer; encrypted-media; picture-in-picture; fullscreen',
  );
  await expect(frame).toHaveAttribute(
    'title',
    'Original recording of Groove 120 (YouTube video player)',
  );
  // The frame really loaded what its address says, from the (stubbed) no-cookie host.
  const player = page.frameLocator('[data-testid="recording-frame"]');
  await expect(player.getByText(STUB_PLAYER_TEXT)).toBeVisible();
  await expect(player.locator('#at')).toHaveText(EMBED_URL);
  // The recorder works, so the empty list above meant no request; and this is the only one.
  expect(services.requests).toEqual([EMBED_URL]);

  // The way out is always there, since a video that refuses embedding only says so inside the frame.
  const out = page.getByRole('link', { name: /^Open in YouTube/ });
  await expect(out).toHaveAttribute('href', WATCH_URL);
  await expect(out).toHaveAttribute('target', '_blank');
  await expect(out).toHaveAttribute('rel', 'noopener noreferrer');

  // The tab's own player isn't offered as if it worked the video; its notation is under it.
  await expect(playButton(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Player controls' })).toHaveCount(0);
  await expect(page.getByTestId('loop-panel')).toBeHidden();
  await expect(recordingNote(page)).toBeVisible();
  await expect(viewport(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });

  // 16:9, a third of the window's height at most on a phone, a fixed 356 px from 1024 px.
  const size = page.viewportSize()!;
  const box = await boxOf(frame, 'recording frame');
  expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
  if (size.width >= 1024) expect(Math.round(box.width)).toBe(356 - 2);
  else expect(box.height).toBeLessThanOrEqual(Math.max(size.height / 3, 200) + 1);
  // YouTube's terms: a player of at least 200 by 200 px.
  expect(box.height).toBeGreaterThanOrEqual(198);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width);

  // It stays on screen as the page scrolls to the score under it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(async () => {
      const at = await boxOf(frame, 'recording frame');
      return at.y >= 0 && at.y + at.height <= size.height;
    })
    .toBe(true);
  const stuck = await boxOf(frame, 'recording frame');
  // Where the page is long enough to scroll that far, the bar has stuck to the window's top.
  const scrolled = await page.evaluate(() => window.scrollY);
  const bar = await boxOf(recordingBar(page), 'recording bar');
  if (scrolled > 300) expect(bar.y).toBeLessThanOrEqual(1);
  const score = await boxOf(viewport(page), 'score box');
  // The score is read under the video, never behind it.
  if (score.y < size.height) expect(score.y + score.height).toBeGreaterThan(stuck.y + stuck.height);

  // Space is the browser's on a recording: the tab doesn't start under the video.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await sourceOption(page, 'Tab').click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(recordingFrame(page)).toHaveCount(0);
  await expect(playButton(page)).toHaveText(/Play/);
  await expect(playButton(page)).toBeEnabled();
  await expect(page.getByTestId('player-status')).toHaveText(/^Bar 1 of 16$/);

  // Opening the recording counted as playing the song.
  await expect.poll(async () => (await lastPlayedOf(user))['Groove 120']).not.toBeNull();

  // Back leaves the play screen for the overview, not for the source before.
  await sourceOption(page, 'Original').click();
  await expect(recordingFrame(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/songs\/[^/]+$/);
  await expect(playAlong(page)).toBeVisible();
});

test('a Spotify link opens Spotify in a new tab, says it can’t be slowed, and is never a source', async ({
  user,
  page,
  context,
}) => {
  const services = await stubServices(context);
  await songWithOverviewOpen(page, user);

  await page.getByRole('button', { name: 'Add a recording' }).click();
  await linkField(page, 'Drumless').fill(
    'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=0123456789abcdef',
  );
  await expect(recordingsForm(page)).toContainText(
    "Spotify track. Opens Spotify, which can't slow a song down: for that, add a YouTube link.",
  );
  await recordingsForm(page).getByRole('button', { name: 'Save' }).click();
  await expect(recordingsForm(page)).toHaveCount(0);
  await expect
    .poll(() => linksOf(user))
    .toEqual([{ kind: 'drumless', provider: 'spotify', url: SPOTIFY_URL }]);

  const link = playAlong(page).getByRole('link', { name: /^Drumless on Spotify/ });
  await expect(link).toHaveAttribute('href', SPOTIFY_URL);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(services.requests).toEqual([]);

  const opening = context.waitForEvent('page');
  await link.click();
  const spotify = await opening;
  await spotify.waitForLoadState();
  expect(spotify.url()).toBe(SPOTIFY_URL);
  // Opened with no way back into the app's window.
  expect(await spotify.evaluate(() => window.opener)).toBeNull();
  await spotify.close();
  await expect.poll(async () => (await lastPlayedOf(user))['Groove 120']).not.toBeNull();

  // The play screen has no source for it: Spotify never plays in the app.
  await playAlong(page).getByRole('link', { name: 'Tab', exact: true }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(sourceSwitch(page)).toHaveCount(0);
  await page.goto(`${new URL(page.url()).pathname}?source=drumless`);
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/play$/);
  await expect(recordingFrame(page)).toHaveCount(0);
});

test('a link that isn’t one is refused with fixed copy, and nothing is saved', async ({
  user,
  page,
  context,
}) => {
  await stubServices(context);
  await songWithOverviewOpen(page, user);
  await page.getByRole('button', { name: 'Add a recording' }).click();

  for (const [text, copy] of [
    ['javascript:alert(document.domain)', 'Only links that start with https:// can be saved.'],
    [`https://youtube.com.evil.test/watch?v=${VIDEO_ID}`, 'That address only looks like YouTube'],
    ['not a link', "That isn't a link."],
  ] as const) {
    await linkField(page, 'Original').fill(text);
    await recordingsForm(page).getByRole('button', { name: 'Save' }).click();
    await expect(recordingsForm(page).getByRole('alert')).toContainText(copy);
    await expect(linkField(page, 'Original')).toBeFocused();
  }
  expect(await linksOf(user)).toEqual([]);

  await recordingsForm(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Add a recording' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Play whole song' })).toBeVisible();
});

test('the Songs list’s recently practised order follows a recording being opened', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await stubServices(context);
  await signIn(page, user, '/');
  await uploadFixture(page, 'groove-120', 'Groove 120');
  await uploadFixture(page, 'waltz-34', 'Waltz 3-4');
  // Neither practised nor played: the newer upload first.
  await expect.poll(() => songTitles(page)).toEqual(['Waltz 3-4', 'Groove 120']);

  await openSongOverview(page, 'Groove 120');
  await saveRecordings(page, 'Groove 120', { Original: WATCH_URL });
  await playAlong(page).getByRole('link', { name: 'Original' }).click();
  await expect(recordingFrame(page)).toBeVisible();
  await expect.poll(async () => (await lastPlayedOf(user))['Groove 120']).not.toBeNull();
  expect((await lastPlayedOf(user))['Waltz 3-4']).toBeNull();

  await navLink(page, 'Songs').click();
  await expect.poll(() => songTitles(page)).toEqual(['Groove 120', 'Waltz 3-4']);
  // And after a reload, from the server's rows.
  await page.reload();
  await expect.poll(() => songTitles(page)).toEqual(['Groove 120', 'Waltz 3-4']);
  // By date added, playing a recording changes nothing.
  await page.goto('/?sort=added');
  await expect.poll(() => songTitles(page)).toEqual(['Waltz 3-4', 'Groove 120']);
});

// 14 Test from here on.

/** Anything of YouTube's, Spotify's or Google's, in text: an address in built files. */
const SERVICE_NAME = /youtube|youtu\.be|ytimg|googlevideo|spotify|scdn\.co|doubleclick/i;

test('the build asks YouTube and Spotify for nothing ahead of time: no preload in the document, nothing of theirs in the precache', async ({
  request,
}) => {
  // The document every screen starts from: scripts, styles and preloads from this origin only.
  const html = await (await request.get('/')).text();
  const addresses = [...html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"]*)"/g)].map(
    ([, address]) => address ?? '',
  );
  expect(addresses.length).toBeGreaterThan(2);
  for (const address of addresses) expect(address, address).toMatch(/^\/(?!\/)/);
  expect(html).not.toMatch(/rel="[^"]*(preconnect|dns-prefetch)/i);
  expect(html).not.toMatch(/<iframe/i);
  expect(html).not.toMatch(SERVICE_NAME);

  // The service worker: what it fetches when it installs is its precache list, all of it this
  // origin's own files, and it has no route that fetches anything else later.
  const worker = await (await request.get('/sw.js')).text();
  const precached = [...worker.matchAll(/url:\s*"([^"]+)"/g)].map(([, url]) => url ?? '');
  // The list was found: the page and a soundfont are in it.
  expect(precached).toContain('index.html');
  expect(precached.some((url) => url.endsWith('.sf2'))).toBe(true);
  for (const url of precached) expect(url, url).not.toMatch(/^[a-z][a-z0-9+.-]*:|^\/\//i);
  expect(precached.filter((url) => SERVICE_NAME.test(url))).toEqual([]);
  expect(worker).not.toMatch(/registerRoute\((?!new\s+\w+\.NavigationRoute|new\s+\w+\()/);
  expect(worker).not.toMatch(/https?:\/\/(?!localhost|127\.0\.0\.1)/);
});

test.describe('with the service worker in charge of the page', () => {
  test.use({ serviceWorkers: 'allow' });

  test('nothing of YouTube’s is asked for until a recording is opened, and then the frame still loads', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const services = await stubServices(context);
    await songWithOverviewOpen(page, user);
    // A link with a start time, as the share sheet's "Start at" writes it.
    await saveRecordings(page, 'Groove 120', {
      Original: `https://youtu.be/${VIDEO_ID}?si=AbCdEf123456&t=1m30s`,
    });
    await expect
      .poll(() => linksOf(user))
      .toEqual([{ kind: 'original', provider: 'youtube', url: `${WATCH_URL}&t=90s` }]);

    // The worker installs (its whole precache is fetched), and the next load is its client.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await expect(playAlong(page).getByRole('link', { name: 'Original' })).toBeVisible();
    await navLink(page, 'Songs').click();
    await openSongOverview(page, 'Groove 120');
    await playAlong(page).getByRole('link', { name: 'Tab', exact: true }).click();
    await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
    expect(await page.locator('iframe').count()).toBe(0);
    expect(services.requests).toEqual([]);

    await sourceOption(page, 'Original').click();
    const frame = recordingFrame(page);
    await expect(frame).toHaveAttribute('src', `${EMBED_URL}&start=90`);
    const player = page.frameLocator('[data-testid="recording-frame"]');
    await expect(player.getByText(STUB_PLAYER_TEXT)).toBeVisible();
    await expect(player.locator('#at')).toHaveText(`${EMBED_URL}&start=90`);
    // The recorder sees the frame, so the empty list above meant no request.
    expect(services.requests).toEqual([`${EMBED_URL}&start=90`]);
    // The way out starts at the same place.
    await expect(page.getByRole('link', { name: /^Open in YouTube/ })).toHaveAttribute(
      'href',
      `${WATCH_URL}&t=90s`,
    );
  });
});

test('offline, the recording buttons are off and a press goes nowhere; on a recording the video gives way to a note', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const services = await stubServices(context);
  await songWithOverviewOpen(page, user);
  await saveRecordings(page, 'Groove 120', { Original: WATCH_URL, Drumless: SPOTIFY_URL });
  const original = playAlong(page).getByRole('link', { name: 'Original' });
  const spotify = playAlong(page).getByRole('link', { name: /^Drumless on Spotify/ });
  await expect(original).toBeVisible();
  const overview = page.url();

  await context.setOffline(true);
  await expect(original).toHaveAttribute('aria-disabled', 'true');
  await expect(spotify).toHaveAttribute('aria-disabled', 'true');
  await expect(playAlong(page)).toContainText("You're offline. Recordings need a connection");
  await expect(playAlong(page).getByRole('link', { name: 'Tab', exact: true })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // The presses arrive (the links are there and take a click) and do nothing: no new screen,
  // no new tab, no request.
  const pagesBefore = context.pages().length;
  // (Forced: Playwright itself won't click what says it is disabled; a finger will.)
  await original.click({ force: true });
  await spotify.click({ force: true });
  await page.waitForTimeout(300);
  expect(page.url()).toBe(overview);
  expect(context.pages()).toHaveLength(pagesBefore);
  expect(services.requests).toEqual([]);
  expect((await lastPlayedOf(user))['Groove 120']).toBeNull();

  // Back online the same button opens the video.
  await context.setOffline(false);
  await expect(original).not.toHaveAttribute('aria-disabled', 'true');
  await original.click();
  await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
  expect(services.requests).toEqual([EMBED_URL]);
  // The tab under it has loaded (its file is on the device from here on).
  await expect(viewport(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });

  // The connection goes while the video is up: the frame is taken away, not left on an error page.
  await context.setOffline(true);
  await expect(page.getByText("You're offline. The video needs a connection.")).toBeVisible();
  await expect(recordingFrame(page)).toHaveCount(0);
  expect(await page.locator('iframe').count()).toBe(0);
  // The score under it is still there to read, and the tab one press away.
  await expect(viewport(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });
  await expect(sourceOption(page, 'Tab')).toBeVisible();

  await context.setOffline(false);
  await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
  await expect.poll(() => services.requests, { timeout: 10_000 }).toEqual([EMBED_URL, EMBED_URL]);
});

test('a second tab sees a link saved in the first at its next read, and its form edits that link', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await stubServices(context);
  // Each tab's clock can be moved on: a list read in the last half minute isn't read again.
  await context.clock.install();
  await songWithOverviewOpen(page, user);
  const second = await context.newPage();
  try {
    await second.goto(page.url());
    await expect(second.getByRole('button', { name: 'Add a recording' })).toBeVisible();

    await saveRecordings(page, 'Groove 120', { Original: WATCH_URL });
    // A while later the tab comes to the front: the app reads its lists again.
    const comesToFront = async (tab: Page) => {
      await tab.clock.fastForward(31_000);
      await tab.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    };
    // Until then it shows what it last read.
    await expect(second.getByRole('button', { name: 'Add a recording' })).toBeVisible();
    await comesToFront(second);
    await expect(playAlong(second).getByRole('link')).toHaveText(['Tab', 'Original']);
    await expect(second.getByRole('button', { name: 'Add a recording' })).toHaveCount(0);

    // Its form shows the link the first tab saved, and changing it there writes the same row.
    await openRecordingsForm(second, 'Groove 120');
    await expect(linkField(second, 'Original')).toHaveValue(WATCH_URL);
    await linkField(second, 'Original').fill(SPOTIFY_URL);
    await recordingsForm(second).getByRole('button', { name: 'Save' }).click();
    await expect(recordingsForm(second)).toHaveCount(0);
    await expect
      .poll(() => linksOf(user))
      .toEqual([{ kind: 'original', provider: 'spotify', url: SPOTIFY_URL }]);

    await comesToFront(page);
    await expect(playAlong(page).getByRole('link', { name: /^Original on Spotify/ })).toBeVisible();
    await expect(playAlong(page).getByRole('link')).toHaveCount(2);
  } finally {
    await second.close();
  }
});

test('Back and Forward step between the song and its recording, never through the sources', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await stubServices(context);
  await songWithOverviewOpen(page, user);
  await saveRecordings(page, 'Groove 120', {
    Original: WATCH_URL,
    Drumless: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  });
  await playAlong(page).getByRole('link', { name: 'Original' }).click();
  await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
  await sourceOption(page, 'Drumless').click();
  await expect(recordingFrame(page)).toHaveAttribute('src', /\/embed\/aaaaaaaaaaa\?/);
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page).toHaveURL(/\/play\?source=drumless$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/songs\/[^/]+$/);
  await expect(playAlong(page)).toBeVisible();
  await page.goForward();
  // The source the screen was left on, not the one it was opened with.
  await expect(page).toHaveURL(/\/play\?source=drumless$/);
  await expect(recordingFrame(page)).toHaveAttribute('src', /\/embed\/aaaaaaaaaaa\?/);
  await expect(playButton(page)).toHaveCount(0);

  // A source the song has no video for, typed into the address: the tab, and the address says so.
  await page.goto(`${new URL(page.url()).pathname}?source=bogus`);
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(recordingFrame(page)).toHaveCount(0);
  await expect(sourceSwitch(page)).toBeVisible();
});
