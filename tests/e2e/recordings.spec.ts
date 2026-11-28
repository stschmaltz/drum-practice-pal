/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import { boxOf, openSongOverview, playButton, uploadFixture, viewport } from './playerPage';
import { navLink } from './practicePage';
import {
  addRecordingButton,
  EMBED_URL,
  gotoSource,
  lastPlayedOf,
  linkField,
  linksOf,
  openInYouTube,
  openNewSongOverview,
  openRecordingsForm,
  playAlong,
  recordingBar,
  recordingFrame,
  recordingLink,
  recordingNote,
  recordingsForm,
  saveRecordings,
  saveRecordingsButton,
  sourceOption,
  sourceSwitch,
  SPOTIFY_URL,
  STUB_PLAYER_TEXT,
  stubServices,
  tabLink,
  VIDEO_ID,
  WATCH_URL,
} from './recordingsPage';

// Unit 14: a song's recordings. YouTube can't be played on a CI machine, so its
// hosts are answered by a stub page: what is asserted is the frame the app
// builds, that nothing of YouTube's is asked for until a recording is opened,
// the way out, and what a Spotify link does.

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
  await openNewSongOverview(page, user);
  // A song with no links: the tab under Play along, and one quiet way in.
  await expect(playAlong(page).getByRole('link')).toHaveText(['Tab']);
  await expect(addRecordingButton(page)).toBeVisible();

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
  await tabLink(page).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(sourceSwitch(page)).toBeVisible();
  await expect(recordingFrame(page)).toHaveCount(0);
  expect(await page.locator('iframe').count()).toBe(0);
  expect(services.requests).toEqual([]);

  // Two taps from the overview: the song's Original, then Play on the video itself.
  await page.goBack();
  await recordingLink(page, 'Original').click();
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
  const out = openInYouTube(page);
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
  if (size.width >= 1024) expect(Math.round(box.width)).toBe(356);
  else expect(box.height).toBeLessThanOrEqual(Math.max(size.height / 3, 200) + 1);
  // YouTube's terms: a player of at least 200 by 200 px (every width is measured further down).
  expect(box.height).toBeGreaterThanOrEqual(200);
  expect(box.width).toBeGreaterThanOrEqual(200);
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
  await openNewSongOverview(page, user);

  await addRecordingButton(page).click();
  await linkField(page, 'Drumless').fill(
    'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=0123456789abcdef',
  );
  await expect(recordingsForm(page)).toContainText(
    "Spotify track. Opens Spotify, which can't slow a song down: for that, add a YouTube link.",
  );
  await saveRecordingsButton(page).click();
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
  await tabLink(page).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(sourceSwitch(page)).toHaveCount(0);
  await gotoSource(page, 'drumless');
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
  await openNewSongOverview(page, user);
  await addRecordingButton(page).click();

  for (const [text, copy] of [
    ['javascript:alert(document.domain)', 'Only links that start with https:// can be saved.'],
    [`https://youtube.com.evil.test/watch?v=${VIDEO_ID}`, 'That address only looks like YouTube'],
    ['not a link', "That isn't a link."],
  ] as const) {
    await linkField(page, 'Original').fill(text);
    await saveRecordingsButton(page).click();
    await expect(recordingsForm(page).getByRole('alert')).toContainText(copy);
    await expect(linkField(page, 'Original')).toBeFocused();
  }
  expect(await linksOf(user)).toEqual([]);

  await recordingsForm(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(addRecordingButton(page)).toBeFocused();
  await expect(playAlong(page).getByRole('link')).toHaveText(['Tab']);
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
  await recordingLink(page, 'Original').click();
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
    await openNewSongOverview(page, user);
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
    await expect(recordingLink(page, 'Original')).toBeVisible();
    await navLink(page, 'Songs').click();
    await openSongOverview(page, 'Groove 120');
    await tabLink(page).click();
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
    await expect(openInYouTube(page)).toHaveAttribute('href', `${WATCH_URL}&t=90s`);
  });
});

test('offline, the recording buttons are off and a press goes nowhere; on a recording the video gives way to a note', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const services = await stubServices(context);
  await openNewSongOverview(page, user);
  await saveRecordings(page, 'Groove 120', { Original: WATCH_URL, Drumless: SPOTIFY_URL });
  const original = recordingLink(page, 'Original');
  const spotify = playAlong(page).getByRole('link', { name: /^Drumless on Spotify/ });
  await expect(original).toBeVisible();
  const overview = page.url();

  await context.setOffline(true);
  await expect(original).toHaveAttribute('aria-disabled', 'true');
  await expect(spotify).toHaveAttribute('aria-disabled', 'true');
  await expect(playAlong(page)).toContainText("You're offline. Recordings need a connection");
  await expect(tabLink(page)).not.toHaveAttribute('aria-disabled', 'true');
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
  // The way out is locked like the overview's: it would only open a page that can't load.
  await expect(openInYouTube(page)).toHaveAttribute('aria-disabled', 'true');
  const pagesOnRecording = context.pages().length;
  await openInYouTube(page).click({ force: true });
  await page.waitForTimeout(300);
  expect(context.pages()).toHaveLength(pagesOnRecording);
  // The score under it is still there to read, and the tab one press away.
  await expect(viewport(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });
  await expect(sourceOption(page, 'Tab')).toBeVisible();

  await context.setOffline(false);
  await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
  await expect(openInYouTube(page)).not.toHaveAttribute('aria-disabled', 'true');
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
  await openNewSongOverview(page, user);
  const second = await context.newPage();
  try {
    await second.goto(page.url());
    await expect(addRecordingButton(second)).toBeVisible();

    await saveRecordings(page, 'Groove 120', { Original: WATCH_URL });
    // A while later the tab comes to the front: the app reads its lists again.
    const comesToFront = async (tab: Page) => {
      await tab.clock.fastForward(31_000);
      await tab.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    };
    // Until then it shows what it last read.
    await expect(addRecordingButton(second)).toBeVisible();
    await comesToFront(second);
    await expect(playAlong(second).getByRole('link')).toHaveText(['Tab', 'Original']);
    await expect(addRecordingButton(second)).toHaveCount(0);

    // Its form shows the link the first tab saved, and changing it there writes the same row.
    await openRecordingsForm(second, 'Groove 120');
    await expect(linkField(second, 'Original')).toHaveValue(WATCH_URL);
    await linkField(second, 'Original').fill(SPOTIFY_URL);
    await saveRecordingsButton(second).click();
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
  await openNewSongOverview(page, user);
  await saveRecordings(page, 'Groove 120', {
    Original: WATCH_URL,
    Drumless: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  });
  await recordingLink(page, 'Original').click();
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
  await gotoSource(page, 'bogus');
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(recordingFrame(page)).toHaveCount(0);
  await expect(sourceSwitch(page)).toBeVisible();
});

// 14 QA fix round 1 from here on.

/** The widths QA measured the player at, a tablet, a laptop, and a phone on its side. */
const FRAME_SIZES = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
];

test('the YouTube frame is at least 200 px wide and tall at every width, and a phone on its side keeps half its window for the score', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await stubServices(context);
  await openNewSongOverview(page, user);
  await saveRecordings(page, 'Groove 120', { Original: WATCH_URL });
  await recordingLink(page, 'Original').click();
  const frame = recordingFrame(page);
  await expect(frame).toBeVisible();
  await expect(viewport(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });

  for (const size of FRAME_SIZES) {
    const at = `${size.width}x${size.height}`;
    await page.setViewportSize(size);
    // The frame element itself, not the box round it: its border is outside what YouTube draws in.
    await expect
      .poll(async () => (await boxOf(frame, 'recording frame')).width, { message: at })
      .toBeLessThanOrEqual(size.width);
    const box = await boxOf(frame, `recording frame at ${at}`);
    expect(box.width, `width at ${at}`).toBeGreaterThanOrEqual(200);
    expect(box.height, `height at ${at}`).toBeGreaterThanOrEqual(200);
    // 16:9 where the width allows it; on a narrower phone the box is taller instead.
    if ((box.width * 9) / 16 >= 200) expect(box.width / box.height, at).toBeCloseTo(16 / 9, 1);
    else expect(box.height, at).toBeLessThan(201);
    expect(box.x, at).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, at).toBeLessThanOrEqual(size.width);
    // Nothing is pushed off the side by the frame's minimum width.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      `sideways scroll at ${at}`,
    ).toBeLessThanOrEqual(0);
    // The same frame throughout: turning the phone doesn't start the video again.
    await expect(frame).toHaveAttribute('src', EMBED_URL);
  }

  // The last size is a phone on its side (QA issue 3): the bar is the 200 px frame with the
  // note and the way out beside it, about half the window, and the score has the rest.
  const size = FRAME_SIZES.at(-1)!;
  const bar = await boxOf(recordingBar(page), 'recording bar');
  expect(bar.height).toBeLessThanOrEqual(size.height * 0.56);
  const video = await boxOf(frame, 'recording frame');
  for (const beside of [recordingNote(page), openInYouTube(page)]) {
    const box = await boxOf(beside, 'beside the video');
    expect(box.y).toBeLessThan(video.y + video.height);
    expect(box.y + box.height).toBeGreaterThan(video.y);
    // Beside it, never over it.
    expect(box.x + box.width <= video.x + 1 || box.x >= video.x + video.width - 1).toBe(true);
  }
  // Scrolled so the score starts right under the stuck bar, as someone reading along has it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await boxOf(recordingBar(page), 'bar')).y).toBeLessThanOrEqual(1);
  const stuck = await boxOf(recordingBar(page), 'recording bar');
  const hidden = stuck.y + stuck.height - (await boxOf(viewport(page), 'score box')).y;
  await page.evaluate((by) => window.scrollBy(0, -by), hidden);
  const score = await boxOf(viewport(page), 'score box');
  expect(Math.abs(score.y - (stuck.y + stuck.height))).toBeLessThan(2);
  const scoreOnShow = Math.min(score.y + score.height, size.height) - (stuck.y + stuck.height);
  expect(scoreOnShow).toBeGreaterThanOrEqual(size.height * 0.4);
});

/** How the score box is laid out: one line that scrolls sideways, or lines down the page. */
const scoreShape = (page: Page) =>
  viewport(page).evaluate((box) => ({
    scrollsSideways: box.scrollWidth > box.clientWidth + 1,
    height: box.getBoundingClientRect().height,
  }));

test('under a recording a phone draws the score as a page that scrolls with the window, and Tab puts its one line back', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await stubServices(context);
  await openNewSongOverview(page, user);
  await saveRecordings(page, 'Groove 120', { Original: WATCH_URL });
  await tabLink(page).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  const size = page.viewportSize()!;
  const phone = size.width < 768;
  const onTab = await scoreShape(page);
  // The tab's own player: one line scrolled sideways on a phone, a page from 768 px.
  expect(onTab.scrollsSideways).toBe(phone);
  // The tab's cursor is drawn on its bar and beat (so "hidden" below is said of something there).
  const cursors = [
    viewport(page).locator('.at-cursor-bar'),
    viewport(page).locator('.at-cursor-beat'),
  ];
  for (const cursor of cursors) {
    await expect(cursor).toHaveCount(1);
    await expect(cursor).toHaveCSS('visibility', 'visible');
  }
  const surface = viewport(page).locator('.at-surface');
  await expect(surface).toHaveCSS('cursor', 'pointer');

  await sourceOption(page, 'Original').click();
  await expect(recordingFrame(page)).toBeVisible();
  // Under the video the tab's cursor isn't drawn: standing still, it reads as a playhead
  // (QA after fix round 1, issue 1). Still there, so alphaTab places it as before. And a bar
  // that takes no tap doesn't look tappable.
  for (const cursor of cursors) {
    await expect(cursor).toHaveCount(1);
    await expect(cursor).toHaveCSS('visibility', 'hidden');
  }
  await expect(surface).toHaveCSS('cursor', 'default');
  await expect.poll(async () => (await scoreShape(page)).scrollsSideways).toBe(false);
  if (phone) {
    // Lines wrap down the page: the box is as tall as the whole song and scrolls with the window.
    await expect.poll(async () => (await scoreShape(page)).height).toBeGreaterThan(size.height);
    const box = viewport(page);
    expect(await box.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    // The video stays put above it while the window scrolls down the score.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(async () => (await boxOf(recordingBar(page), 'bar')).y)
      .toBeLessThanOrEqual(1);
    const video = await boxOf(recordingFrame(page), 'recording frame');
    expect(video.y).toBeGreaterThanOrEqual(0);
    expect(video.y + video.height).toBeLessThan(size.height / 2);
    const score = await boxOf(box, 'score box');
    expect(score.y + score.height).toBeGreaterThan(video.y + video.height + 200);
  }

  // Back on Tab the layout for the width is back, and the player was never loaded again:
  // Play is there at once, where it was.
  await page.evaluate(() => window.scrollTo(0, 0));
  await sourceOption(page, 'Tab').click();
  await expect(playButton(page)).toBeEnabled();
  await expect(page.getByTestId('player-status')).toHaveText(/^Bar 1 of 16$/);
  await expect.poll(async () => (await scoreShape(page)).scrollsSideways).toBe(phone);
  if (phone) {
    await expect.poll(async () => (await scoreShape(page)).height).toBeLessThan(onTab.height + 20);
  }
  // And its cursor is drawn again, on the bar it was at.
  for (const cursor of cursors) await expect(cursor).toHaveCSS('visibility', 'visible');
  await expect(surface).toHaveCSS('cursor', 'pointer');
});

test('nothing on the overview moves when the links arrive on a cold load', async ({
  user,
  page,
  context,
  browser,
}) => {
  test.setTimeout(90_000);
  await stubServices(context);
  await openNewSongOverview(page, user);
  await saveRecordings(page, 'Groove 120', {
    Original: WATCH_URL,
    Drumless: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  });
  const overview = new URL(page.url()).pathname;

  // A second device has nothing cached: the page is drawn before its links are read.
  const other = await browser.newContext({ viewport: page.viewportSize() });
  try {
    const cold = await other.newPage();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let asked = 0;
    await other.route(/\/rest\/v1\/song_links\?/, async (route) => {
      asked += 1;
      await held;
      await route.continue();
    });
    await signIn(cold, user, overview);
    await expect(cold.getByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
    await expect(cold.getByText(/^No loops yet\./)).toBeVisible();
    // The read is on its way and held: the recordings aren't known yet.
    await expect.poll(() => asked).toBeGreaterThan(0);
    await expect(playAlong(cold).getByRole('link')).toHaveText(['Tab']);

    const drawn = {
      heading: cold.getByRole('heading', { name: 'Play along' }),
      tab: tabLink(cold),
      newLoop: cold.getByRole('link', { name: 'New loop' }),
      loops: cold.getByText(/^No loops yet\./),
    };
    const places = async () =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(drawn).map(async ([name, locator]) => {
            const box = await boxOf(locator, name);
            return [name, { x: Math.round(box.x), y: Math.round(box.y) }] as const;
          }),
        ),
      );
    const before = await places();

    release();
    await expect(playAlong(cold).getByRole('link')).toHaveText(['Tab', 'Original', 'Drumless']);
    expect(await places()).toEqual(before);
  } finally {
    await other.close();
  }
});

test('the form: Remove stays on its field’s row, a paste with words keeps its link, and a mouse lands in the first empty field', async ({
  user,
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  await stubServices(context);
  await openNewSongOverview(page, user);
  await addRecordingButton(page).click();
  // A mouse or trackpad: ready for the paste. A touch screen: the form, so no keyboard comes up.
  if (testInfo.project.name === 'desktop') await expect(linkField(page, 'Original')).toBeFocused();
  else await expect(recordingsForm(page)).toBeFocused();

  // As a share sheet copies it: the title, then the link.
  await linkField(page, 'Original').fill(
    `Never Gonna Give You Up https://youtu.be/${VIDEO_ID}?si=AbCdEf123456`,
  );
  await expect(linkField(page, 'Original')).toHaveValue(
    `https://youtu.be/${VIDEO_ID}?si=AbCdEf123456`,
  );
  await recordingsForm(page).getByRole('button', { name: 'Add another link' }).click();
  await linkField(page, 'Other link 1').fill(`https://youtu.be/${VIDEO_ID}`);
  await expect(recordingsForm(page)).toContainText('YouTube video. Opens in YouTube.');
  await saveRecordingsButton(page).click();
  await expect(recordingsForm(page)).toHaveCount(0);
  await expect
    .poll(() => linksOf(user))
    .toEqual([
      { kind: 'original', provider: 'youtube', url: WATCH_URL },
      { kind: 'other', provider: 'youtube', url: WATCH_URL },
    ]);

  // Each saved link's Remove is on the row of its field, the line about the link under both.
  await openRecordingsForm(page, 'Groove 120');
  for (const name of ['Original', 'Other link 1'] as const) {
    const field = linkField(page, name);
    const input = await boxOf(field, `${name} field`);
    const remove = await boxOf(
      recordingsForm(page).getByRole('button', { name: `Remove ${name}` }),
      `Remove ${name}`,
    );
    expect(Math.abs(remove.y + remove.height / 2 - (input.y + input.height / 2))).toBeLessThan(2);
    expect(remove.x).toBeGreaterThanOrEqual(input.x + input.width);
    expect(remove.width).toBeGreaterThanOrEqual(44);
    expect(remove.height).toBeGreaterThanOrEqual(44);
    const noteId = await field.getAttribute('aria-describedby');
    const note = await boxOf(page.locator(`[id="${noteId}"]`), `${name} note`);
    expect(note.y).toBeGreaterThanOrEqual(
      Math.max(input.y + input.height, remove.y + remove.height) - 1,
    );
  }
});
