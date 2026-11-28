/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import { textSpillingOutOf } from './designPage';
import { boxOf, openSongOverview, playButton, uploadFixture, viewport } from './playerPage';
import { highlightBoxes } from './loopsPage';
import { navLink } from './practicePage';
import {
  addRecordingButton,
  barOneOf,
  EMBED_URL,
  followSamples,
  followThrough,
  gotoSource,
  lastPlayedOf,
  lineUp,
  lineUpButton,
  lineUpField,
  lineUpMessage,
  onShowIn,
  readableView,
  recordFollow,
  scoreLaidOut,
  setBarOne,
  markedBars,
  markedBox,
  linkField,
  linksOf,
  openInYouTube,
  openLinedVideo,
  openNewSongOverview,
  openRecordingsForm,
  openVideo,
  PLAYER_API_URL,
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
  videoStub,
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
  // The recorder works, so the empty list above meant no request; and this is the only frame,
  // with the one script that reads the video's clock (Unit 19) asked for with it, not before.
  expect(services.frames()).toEqual([EMBED_URL]);
  await expect.poll(() => services.scripts()).toEqual([PLAYER_API_URL]);

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
    expect(services.frames()).toEqual([`${EMBED_URL}&start=90`]);
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
  expect(services.frames()).toEqual([EMBED_URL]);
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
  await expect.poll(() => services.frames(), { timeout: 10_000 }).toEqual([EMBED_URL, EMBED_URL]);
  // The player's script was asked for once: the page keeps it across the frame's going and coming back.
  expect(services.scripts()).toEqual([PLAYER_API_URL]);
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
  // way out and the line-up beside it (19 QA issue 2: the note is under the bar there, the
  // room beside the video being the line-up's), about half the window, and the score has the rest.
  const size = FRAME_SIZES.at(-1)!;
  const bar = await boxOf(recordingBar(page), 'recording bar');
  expect(bar.height).toBeLessThanOrEqual(size.height * 0.56);
  const video = await boxOf(frame, 'recording frame');
  expect((await boxOf(recordingNote(page), 'note')).y).toBeGreaterThanOrEqual(
    bar.y + bar.height - 1,
  );
  for (const beside of [openInYouTube(page), lineUp(page)]) {
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
    // One row, whatever the fonts: in CI the three wrapped to a second line at 390 px and
    // everything under them dropped. Below 640 px the row is three columns that can't wrap.
    const tops = await playAlong(cold)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
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

// Unit 19: the tab follows the video. The stub player has a clock of its own and
// speaks the player's protocol (recordingsPage.ts), so these cover the frame's
// parameters, one following pass, the keys and the tap, and the saved line-up
// on a second device. Whether a real recording stays in step is for ears at the kit.
test.describe('the tab follows the video (Unit 19)', () => {
  /** Groove 120: sixteen 4/4 bars of two seconds. */
  const BAR_SECONDS = 2;

  /** Whether the one marked bar is all in the part of the window the score is read in. */
  const markedOnShow = async (page: Page) => {
    const bar = await boxOf(recordingBar(page), 'recording bar');
    const tabs = await page.locator('[data-bottom-tabs]').boundingBox();
    const height = page.viewportSize()!.height;
    const shown = { top: bar.y + bar.height, bottom: tabs && tabs.height > 0 ? tabs.y : height };
    const boxes = await highlightBoxes(page);
    const box = boxes[0];
    return (
      boxes.length === 1 &&
      box !== undefined &&
      onShowIn({ top: box.y, bottom: box.y + box.height }, shown)
    );
  };

  /**
   * Turns the phone: the marked bar is brought back on show, and is still there once the
   * score has been drawn for the new width and anything that scrolls after a drawing has.
   */
  const turnTo = async (page: Page, size: { width: number; height: number }, bar: number) => {
    await page.setViewportSize(size);
    const at = `${size.width}x${size.height}`;
    await expect
      .poll(() => markedOnShow(page), { message: `bar ${bar} on show at ${at}` })
      .toBe(true);
    expect(await markedBars(page)).toEqual([bar, bar]);
    await page.waitForTimeout(1_000);
    expect(await markedOnShow(page), `bar ${bar} still on show at ${at}`).toBe(true);
    expect(await markedBars(page)).toEqual([bar, bar]);
  };

  test('lining up once marks the bar the video is on and keeps it on show, through pause, seek and speed', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const services = await stubServices(context);
    await openVideo(page, user);
    const video = videoStub(page);

    // The frame carries what the player needs to answer this page and no other, and the
    // one script was asked for with it.
    const src = new URL((await recordingFrame(page).getAttribute('src'))!);
    expect(src.hostname).toBe('www.youtube-nocookie.com');
    expect(Object.fromEntries(src.searchParams)).toEqual({
      playsinline: '1',
      rel: '0',
      enablejsapi: '1',
      origin: new URL(page.url()).origin,
    });
    await expect.poll(() => services.scripts()).toEqual([PLAYER_API_URL]);
    expect(services.frames()).toEqual([EMBED_URL]);

    // Not lined up: the prompt, its button off until the video plays, and no bar marked.
    await expect(lineUpMessage(page)).toHaveText('Line the tab up: when bar 1 starts, press');
    await expect(lineUpButton(page, 'Bar 1 starts now')).toHaveAttribute('aria-disabled', 'true');
    expect(await markedBars(page)).toBeNull();
    expect(await barOneOf(user)).toEqual({ original: null });

    // Space can't start a video nobody has tapped: it says so, and nothing plays.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(lineUpMessage(page)).toContainText('Press Play on the video once.');
    expect(await video.playing()).toBe(false);

    // The tap on the video, then the press as bar 1 comes in, three seconds into it.
    await video.tapPlay();
    await video.seek(3);
    await expect(lineUpButton(page, 'Bar 1 starts now')).not.toHaveAttribute('aria-disabled');
    // Where things are in the page, whatever the window has scrolled to: following may
    // scroll the window to bar 1, and the bar under the video then sticks to its top.
    const layout = async () => {
      const scrollY = await page.evaluate(() => window.scrollY);
      const score = await boxOf(viewport(page), 'score');
      const bar = await boxOf(recordingBar(page), 'recording bar');
      return {
        scoreTop: Math.round(score.y + scrollY),
        scoreLeft: score.x,
        scoreWidth: score.width,
        barHeight: bar.height,
        barWidth: bar.width,
      };
    };
    const before = await layout();
    await lineUpButton(page, 'Bar 1 starts now').click();

    // Saved with the link: the video's time at the press, to the millisecond.
    await expect.poll(async () => (await barOneOf(user)).original).not.toBeNull();
    const barOne = (await barOneOf(user)).original!;
    expect(barOne).toBeGreaterThanOrEqual(3);
    expect(barOne).toBeLessThan(3 + BAR_SECONDS);
    await expect(lineUpButton(page, 'Tab later')).toBeVisible();
    await expect(lineUpButton(page, 'Follow')).toHaveAttribute('aria-pressed', 'true');
    await expect(lineUpButton(page, 'Line up again')).toBeFocused();
    await expect(lineUpMessage(page)).toContainText('Bar 1 at 0:0');
    // The prompt gave way to the nudges and nothing on the page moved.
    expect(await layout()).toEqual(before);

    // It follows by itself, a bar every two seconds of the video's own clock.
    await expect.poll(() => markedBars(page)).toEqual([1, 1]);
    await expect.poll(() => markedBars(page), { timeout: 10_000 }).toEqual([2, 2]);
    await expect.poll(() => markedBars(page), { timeout: 10_000 }).toEqual([3, 3]);
    // The tab's own player was never started for it.
    await expect(playButton(page)).toHaveCount(0);

    // A pause in the video's own controls: the mark stays where the song stopped.
    await video.pause();
    const paused = await markedBars(page);
    await page.waitForTimeout(BAR_SECONDS * 1000 + 300);
    expect(await markedBars(page)).toEqual(paused);

    // A seek in the video, still paused: the mark goes there, and the bar is brought on show.
    await video.seek(barOne + 12 * BAR_SECONDS + 0.5);
    await expect.poll(() => markedBars(page)).toEqual([13, 13]);
    const view = await readableView(page);
    await expect
      .poll(async () => {
        const box = await markedBox(page);
        return box.y >= view.top - 1 && box.y + box.height <= view.bottom + 1;
      })
      .toBe(true);

    // YouTube's speed at 2x: the same clock, just faster. Bar 14 comes within about a second.
    await video.setRate(2);
    await video.play();
    await expect.poll(() => markedBars(page), { timeout: 5_000 }).toEqual([14, 14]);

    // Space pauses and plays the video, wherever focus is outside a field.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect.poll(() => video.playing()).toBe(false);
    await page.keyboard.press('Space');
    await expect.poll(() => video.playing()).toBe(true);
    await video.pause();
    await video.setRate(1);

    // Past the tab's end nothing is marked; back before bar 1, nothing either.
    await video.seek(barOne + 16 * BAR_SECONDS + 1);
    await expect.poll(() => markedBars(page)).toBeNull();
    await video.seek(Math.max(0, barOne - 1));
    await expect.poll(() => markedBars(page)).toBeNull();
  });

  test('a tap on a bar moves the video there, the nudges are saved, and a second device follows with no setup', async ({
    user,
    page,
    context,
    browser,
  }) => {
    test.setTimeout(150_000);
    await stubServices(context);
    await openVideo(page, user);
    const video = videoStub(page);
    await video.tapPlay();
    await video.seek(5);
    await lineUpButton(page, 'Bar 1 starts now').click();
    await expect.poll(async () => (await barOneOf(user)).original).not.toBeNull();
    const barOne = (await barOneOf(user)).original!;
    await video.pause();

    // With Follow off the page stays put, so a point measured on the score stays that bar's.
    await lineUpButton(page, 'Follow').click();
    await expect(lineUpButton(page, 'Follow')).toHaveAttribute('aria-pressed', 'false');
    await video.seek(barOne + BAR_SECONDS + 0.5);
    await expect.poll(() => markedBars(page)).toEqual([2, 2]);
    const second = await markedBox(page);
    // A bar that takes a tap looks like one, with the tab's own cursor still not drawn.
    expect(
      await viewport(page)
        .locator('.at-surface')
        .evaluate((surface) => getComputedStyle(surface).cursor),
    ).toBe('pointer');
    await video.seek(barOne + 0.5);
    await expect.poll(() => markedBars(page)).toEqual([1, 1]);

    await page.mouse.click(second.x + second.width / 2, second.y + second.height / 2);
    await expect.poll(() => markedBars(page)).toEqual([2, 2]);
    // The app shows the seek at once; the video itself hears it a message later.
    await expect.poll(() => video.time()).toBeCloseTo(barOne + BAR_SECONDS, 1);
    // Still paused: a tap moves the video, it doesn't start it.
    expect(await video.playing()).toBe(false);

    // The tab running ahead: "Tab later" twice, each a quarter of a second, saved.
    await lineUpButton(page, 'Tab later').click();
    await lineUpButton(page, 'Tab later').click();
    await expect.poll(async () => (await barOneOf(user)).original).toBeCloseTo(barOne + 0.5, 3);
    await lineUpButton(page, 'Tab earlier').click();
    await expect.poll(async () => (await barOneOf(user)).original).toBeCloseTo(barOne + 0.25, 3);
    const lined = barOne + 0.25;
    const label = await lineUpMessage(page).textContent();

    // Another device, nothing cached: the line-up is the link's, so Play on the video is all it takes.
    const otherContext = await browser.newContext();
    try {
      await stubServices(otherContext);
      const other = await otherContext.newPage();
      await signIn(other, user, new URL(page.url()).pathname);
      await gotoSource(other, 'original');
      await expect(recordingFrame(other)).toHaveAttribute('src', EMBED_URL);
      await expect(viewport(other).locator('svg').first()).toBeVisible({ timeout: 20_000 });
      await expect(lineUpMessage(other)).toHaveText(label!);
      await expect(lineUpButton(other, 'Bar 1 starts now')).toHaveCount(0);
      expect(await markedBars(other)).toBeNull();

      const otherVideo = videoStub(other);
      await otherVideo.tapPlay();
      await otherVideo.seek(lined + 4 * BAR_SECONDS + 0.2);
      await expect.poll(() => markedBars(other)).toEqual([5, 5]);
      await expect.poll(() => markedBars(other), { timeout: 10_000 }).toEqual([6, 6]);
    } finally {
      await otherContext.close();
    }
  });

  test('a link that isn’t lined up plays as before: no bar marked, a tap and Space change nothing saved', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await stubServices(context);
    await openVideo(page, user);
    const video = videoStub(page);
    await video.tapPlay();
    await video.seek(9);
    // The video is heard by the app (the line-up could be pressed), and still nothing is marked.
    await expect(lineUpButton(page, 'Bar 1 starts now')).not.toHaveAttribute('aria-disabled');
    await page.waitForTimeout(1000);
    expect(await markedBars(page)).toBeNull();
    expect(await highlightBoxes(page)).toEqual([]);

    const score = await boxOf(viewport(page), 'score');
    const before = await video.time();
    await page.mouse.click(score.x + score.width / 2, score.y + 60);
    await page.waitForTimeout(400);
    // No seek: the clock only moved on with the time that passed.
    expect((await video.time()) - before).toBeLessThan(2);
    expect(await barOneOf(user)).toEqual({ original: null });
    expect(
      await viewport(page)
        .locator('.at-surface')
        .evaluate((surface) => getComputedStyle(surface).cursor),
    ).toBe('default');
  });

  // 19 Test. The repeats fixture plays bars 3 and 4 twice: ten playthroughs of two seconds.
  test('a tab with a repeat is followed in the order its bars are played; a tap goes to the pass the video is in; the reader’s own scroll and Follow off are left alone', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await stubServices(context);
    await signIn(page, user, '/');
    await uploadFixture(page, 'repeats', 'Repeats');
    await openSongOverview(page, 'Repeats');
    await saveRecordings(page, 'Repeats', { Original: WATCH_URL });
    await recordingLink(page, 'Original').click();
    await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
    await expect(viewport(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });

    const video = videoStub(page);
    await video.tapPlay();
    await video.seek(3);
    await lineUpButton(page, 'Bar 1 starts now').click();
    await expect.poll(async () => (await barOneOf(user)).original).not.toBeNull();
    const barOne = (await barOneOf(user)).original!;
    await video.pause();

    const PLAY_ORDER = [1, 2, 3, 4, 3, 4, 5, 6, 7, 8];
    /** Half a second into the playthrough at `position` of the play order. */
    const at = (position: number) => barOne + position * BAR_SECONDS + 0.5;
    const onShow = async () => {
      const view = await readableView(page);
      const box = await markedBox(page);
      return box.y >= view.top - 1 && box.y + box.height <= view.bottom + 1;
    };
    const scrolledTo = () =>
      page.evaluate(() => {
        const box = document.querySelector('[data-testid="score-viewport"]')!;
        return { window: window.scrollY, boxTop: box.scrollTop, boxLeft: box.scrollLeft };
      });

    // Through the repeat: bar 3 comes again after bar 4, and is brought back on show.
    for (const [position, bar] of PLAY_ORDER.entries()) {
      await video.seek(at(position));
      await expect
        .poll(() => markedBars(page), { message: `position ${position}` })
        .toEqual([bar, bar]);
      await expect.poll(onShow, { message: `bar ${bar} on show` }).toBe(true);
    }

    // A tap on bar 3 from its second pass goes to the second pass; from the song's start, to the first.
    await video.seek(at(4));
    await expect.poll(() => markedBars(page)).toEqual([3, 3]);
    await expect.poll(onShow).toBe(true);
    // Follow off, so the page stays put between measuring the bar and tapping it.
    await lineUpButton(page, 'Follow').click();
    await expect(lineUpButton(page, 'Follow')).toHaveAttribute('aria-pressed', 'false');
    const third = await markedBox(page);
    const tapThird = () => page.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
    await video.seek(at(5));
    await expect.poll(() => markedBars(page)).toEqual([4, 4]);
    await tapThird();
    await expect.poll(() => video.time()).toBeCloseTo(barOne + 4 * BAR_SECONDS, 1);
    await expect.poll(() => markedBars(page)).toEqual([3, 3]);
    await video.seek(at(0));
    await expect.poll(() => markedBars(page)).toEqual([1, 1]);
    await tapThird();
    await expect.poll(() => video.time()).toBeCloseTo(barOne + 2 * BAR_SECONDS, 1);
    expect(await video.playing()).toBe(false);

    // Follow on again: the last bar is brought on show.
    await lineUpButton(page, 'Follow').click();
    await video.seek(at(9));
    await expect.poll(() => markedBars(page)).toEqual([8, 8]);
    await expect.poll(onShow).toBe(true);
    const followed = await scrolledTo();
    // A phone's page has scrolled to get there (one bar a line under the video).
    if (page.viewportSize()!.width < 768) expect(followed.window).toBeGreaterThan(0);

    // The reader scrolls back to the top by hand: inside the bar being played, nothing pulls it back.
    await page.evaluate(() => window.scrollTo(0, 0));
    await video.seek(at(9) + 0.7);
    await page.waitForTimeout(800);
    expect(await markedBars(page)).toEqual([8, 8]);
    expect((await scrolledTo()).window).toBe(0);
    // The next bar the video goes to is followed again.
    await video.seek(at(8));
    await expect.poll(() => markedBars(page)).toEqual([7, 7]);
    await expect.poll(onShow).toBe(true);

    // Follow off: the mark goes to bar 1 and neither the page nor the score box moves.
    await lineUpButton(page, 'Follow').click();
    await expect(lineUpButton(page, 'Follow')).toHaveAttribute('aria-pressed', 'false');
    const still = await scrolledTo();
    await video.seek(at(0));
    await expect.poll(() => markedBars(page)).toEqual([1, 1]);
    await page.waitForTimeout(500);
    expect(await scrolledTo()).toEqual(still);
    // On a phone bar 1 is far above the window by now: the check above had something to refuse.
    if (page.viewportSize()!.width < 768) expect(await onShow()).toBe(false);
    await lineUpButton(page, 'Follow').click();
    await expect.poll(onShow).toBe(true);
  });

  // 19 QA fix round 1 from here to the end of the block.

  test('the page turns a line early: whenever the mark changes, the bar played next is on show under it too', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await stubServices(context);
    await openLinedVideo(page, user, 1);
    const samples = await followThrough(page);
    for (const { bar, marked, next, view } of samples) {
      expect(onShowIn(marked, view), `bar ${bar} is on show when it is marked`).toBe(true);
      // The tab's last bar has nothing after it.
      if (bar < 16) expect(onShowIn(next, view), `the bar after ${bar} is on show too`).toBe(true);
    }
  });

  test('a phone on its side: the score is on show from bar 1 of a fresh load, and after a turn of the phone', async ({
    user,
    page,
    context,
  }) => {
    test.skip(test.info().project.name !== 'phone', 'about a phone turned sideways');
    test.setTimeout(150_000);
    await stubServices(context);
    await openVideo(page, user);
    await page.setViewportSize({ width: 844, height: 390 });
    await setBarOne(user, 'original', 1);
    await page.reload();
    await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
    await scoreLaidOut(page);
    await expect(lineUpMessage(page)).toContainText('Bar 1 at');
    await page.evaluate(() => window.scrollTo(0, 0));
    // The fresh load QA saw: the score box starts below the window's foot.
    expect((await boxOf(viewport(page), 'score box')).y).toBeGreaterThan(390);

    const samples = await followThrough(page, 6);
    for (const { bar, marked, view } of samples) {
      expect(onShowIn(marked, view), `bar ${bar} is on show when it is marked`).toBe(true);
    }

    // Paused in bar 6. Turned upright, and back: the bar is brought back on show each time,
    // with nothing playing to bring it (19 QA issue 7).
    for (const size of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await turnTo(page, size, 6);
    }
  });

  // 19 QA (after fix round 1), issue 1. A frame after every drawing alphaTab scrolls its box
  // to its own cursor, whenever that cursor's line is somewhere new: the tab's own cursor,
  // which is hidden under a recording and says nothing about where the song is. Here it was
  // left on bar 9 (the tab played that far before the recording was opened), so every turn of
  // the phone moves its line, and that scroll landed over the follow's.
  test('a turn of the phone keeps the bar the video is on on show, wherever the tab’s own cursor was left, paused and playing', async ({
    user,
    page,
    context,
  }) => {
    test.skip(test.info().project.name !== 'phone', 'about a phone turned sideways');
    test.setTimeout(150_000);
    await stubServices(context);
    await openLinedVideo(page, user, 1);
    const leaveTabCursorOnBar9 = () =>
      expect
        .poll(
          () =>
            page.evaluate(() =>
              (
                window as unknown as { __drumPalPlayer: { seekToBar(bar: number): boolean } }
              ).__drumPalPlayer.seekToBar(9),
            ),
          { timeout: 20_000, message: 'the tab’s sounds are in, so its cursor can be moved' },
        )
        .toBe(true);
    await leaveTabCursorOnBar9();
    await followThrough(page, 4);

    // Paused in bar 4: nothing plays on to put it right.
    await turnTo(page, { width: 844, height: 390 }, 4);
    await turnTo(page, { width: 390, height: 844 }, 4);
    await turnTo(page, { width: 844, height: 390 }, 4);

    // And playing, loaded upright again: slowly, so the bar outlasts the turn.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
    await scoreLaidOut(page);
    await leaveTabCursorOnBar9();
    const video = videoStub(page);
    await video.tapPlay();
    await video.setRate(0.25);
    // Bar 3 is the video from 5 to 7 s: eight seconds of it at a quarter speed.
    await video.seek(5.1);
    await expect.poll(() => markedBars(page)).toEqual([3, 3]);
    await turnTo(page, { width: 844, height: 390 }, 3);
    expect(await video.playing()).toBe(true);
  });

  test('a video already playing when YouTube’s script arrives is followed, with no pause and play', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await stubServices(context);
    await openVideo(page, user);
    await setBarOne(user, 'original', 1);
    // A slow connection: the script is held until the video has been playing for a while.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let asked = 0;
    await context.route(PLAYER_API_URL, async (route) => {
      asked++;
      await held;
      await route.fallback();
    });
    await page.reload();
    await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
    await scoreLaidOut(page);
    await expect(lineUpMessage(page)).toContainText('Bar 1 at');
    const video = videoStub(page);
    await video.tapPlay();
    await video.seek(5.2);
    await page.waitForTimeout(600);
    // The script was asked for and hasn't come: nothing is marked yet.
    expect(asked).toBe(1);
    expect(await markedBars(page)).toBeNull();
    expect(await video.playing()).toBe(true);

    release();
    // Bar 3 is the video from 5 to 7 s; the mark comes without anything being pressed.
    await expect.poll(() => markedBars(page)).not.toBeNull();
    expect(await video.playing()).toBe(true);
    await expect.poll(() => markedBars(page), { timeout: 10_000 }).toEqual([4, 4]);

    // Space works it at once, with no "press Play on the video once".
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect.poll(() => video.playing()).toBe(false);
    await expect(lineUpMessage(page)).toContainText('Bar 1 at');
    // And so does lining up again, on the paused clock (19 QA issue 9).
    await lineUpButton(page, 'Line up again').click();
    await expect(lineUpButton(page, 'Bar 1 starts now')).not.toHaveAttribute('aria-disabled');
    const at = await video.time();
    await lineUpButton(page, 'Bar 1 starts now').click();
    await expect.poll(async () => (await barOneOf(user)).original).toBeCloseTo(at, 1);
    await expect.poll(() => markedBars(page)).toEqual([1, 1]);
  });

  test('“Bar 1 starts now” before the video has been played says why, and a failed save moves nothing', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await stubServices(context);
    await openVideo(page, user);
    const video = videoStub(page);
    await expect(lineUpButton(page, 'Bar 1 starts now')).toHaveAttribute('aria-disabled', 'true');
    // Forced: Playwright waits for a control marked off to come on. A finger doesn't.
    await lineUpButton(page, 'Bar 1 starts now').click({ force: true });
    await expect(lineUpMessage(page)).toHaveText('Press Play on the video first.');
    await expect(page.getByTestId('line-up-announcement')).toContainText(
      'Press Play on the video first.',
    );
    expect(await barOneOf(user)).toEqual({ original: null });

    await video.tapPlay();
    await video.seek(3);
    await video.pause();
    await expect(lineUpMessage(page)).toHaveText('Line the tab up: when bar 1 starts, press');
    await lineUpButton(page, 'Bar 1 starts now').click();
    await expect.poll(async () => (await barOneOf(user)).original).toBeCloseTo(3, 1);
    await expect(lineUpButton(page, 'Tab later')).toBeVisible();

    // Where things are in the page, at a phone's width and at the narrowest (19 QA issue 10).
    const place = async () => {
      const scrollY = await page.evaluate(() => window.scrollY);
      const score = await boxOf(viewport(page), 'score');
      const bar = await boxOf(recordingBar(page), 'recording bar');
      const block = await boxOf(lineUp(page), 'line-up');
      return { scoreTop: Math.round(score.y + scrollY), bar: bar.height, lineUp: block.height };
    };
    // The last is the narrowest phone with the reader's text a quarter larger: there the
    // words are more lines than their row holds, which is what the fixed rows are for (at
    // the plain sizes they happen to fit, and would pass on rows that grow).
    const sizes: { width: number; text?: string }[] =
      test.info().project.name === 'phone'
        ? [{ width: 390 }, { width: 320 }, { width: 320, text: '125%' }]
        : [{ width: page.viewportSize()!.width }];
    for (const { width, text } of sizes) {
      await page.setViewportSize({ width, height: page.viewportSize()!.height });
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, text ?? '');
      await expect(lineUpMessage(page)).toContainText('Bar 1 at');
      const before = await place();
      const saved = (await barOneOf(user)).original;
      await page.route('**/rest/v1/song_links*', (route) =>
        route.request().method() === 'PATCH' ? route.abort() : route.fallback(),
      );
      await lineUpButton(page, 'Tab later').click();
      await expect(lineUp(page).getByRole('alert')).toContainText('Couldn’t save the line-up.');
      await page.unroute('**/rest/v1/song_links*');
      expect(await place(), `a failed save at ${width} px ${text ?? ''}`).toEqual(before);
      // Every control is still its own 44 px, and the words stay off the buttons under them.
      const alert = await boxOf(lineUp(page).getByRole('alert'), 'alert');
      const nudge = await boxOf(lineUpButton(page, 'Tab earlier'), 'Tab earlier');
      expect(alert.y + alert.height).toBeLessThanOrEqual(nudge.y + 1);
      expect(nudge.height).toBeGreaterThanOrEqual(44);
      expect((await barOneOf(user)).original).toBe(saved);
      // The next save takes the words away again, and nothing moves then either.
      await lineUpButton(page, 'Tab later').click();
      await expect(lineUp(page).getByRole('alert')).toHaveCount(0);
      expect(await place(), `after the next save at ${width} px ${text ?? ''}`).toEqual(before);
    }
  });

  for (const size of [
    { name: 'a phone on its side', width: 844, height: 390 },
    { name: 'a 320 px phone', width: 320, height: 700 },
  ]) {
    test(`${size.name}: every control of the line-up is on screen and takes a tap in every state, and nothing moves between them`, async ({
      user,
      page,
      context,
    }) => {
      test.skip(test.info().project.name !== 'phone', 'about a phone');
      test.setTimeout(150_000);
      await stubServices(context);
      await openVideo(page, user);
      await page.setViewportSize({ width: size.width, height: size.height });
      const video = videoStub(page);

      /** Where the page is, whatever the window has scrolled to. */
      const place = async () => {
        const scrollY = await page.evaluate(() => window.scrollY);
        const score = await boxOf(viewport(page), 'score');
        const bar = await boxOf(recordingBar(page), 'recording bar');
        return { scoreTop: Math.round(score.y + scrollY), bar: Math.round(bar.height) };
      };
      /**
       * Every button and field of the line-up: what is wrong with each, if anything. A control
       * must lie inside the window's width, clear of the video's frame, be 44 px tall, and be
       * what a tap at its middle lands on.
       */
      const faults = (state: string) =>
        lineUp(page).evaluate((block, label) => {
          // The line-up is in a sticky bar: bring it on screen as someone about to tap it would.
          block.scrollIntoView({ block: 'nearest' });
          const frame = document
            .querySelector('[data-testid="recording-frame"]')!
            .getBoundingClientRect();
          const found: string[] = [];
          const controls = Array.from(block.querySelectorAll<HTMLElement>('button, input'));
          if (controls.length === 0) found.push(`${label}: no controls`);
          for (const control of controls) {
            const name = control.textContent || control.getAttribute('aria-label') || '?';
            const box = control.getBoundingClientRect();
            if (box.left < 0 || box.right > window.innerWidth + 0.5) {
              found.push(`${label}: “${name}” is off the side (${box.left} to ${box.right})`);
            }
            if (box.top < 0 || box.bottom > window.innerHeight + 0.5) {
              found.push(`${label}: “${name}” is off the window (${box.top} to ${box.bottom})`);
            }
            if (box.height < 43.5) found.push(`${label}: “${name}” is ${box.height} px tall`);
            const overFrame =
              box.left < frame.right - 0.5 &&
              box.right > frame.left + 0.5 &&
              box.top < frame.bottom - 0.5 &&
              box.bottom > frame.top + 0.5;
            if (overFrame) found.push(`${label}: “${name}” is under the video`);
            const hit = document.elementFromPoint(
              box.left + box.width / 2,
              box.top + box.height / 2,
            );
            if (!hit || !control.contains(hit)) {
              found.push(`${label}: a tap on “${name}” lands on ${hit?.tagName ?? 'nothing'}`);
            }
          }
          if (document.documentElement.scrollWidth > window.innerWidth) {
            found.push(`${label}: the page scrolls sideways`);
          }
          return found;
        }, state);
      const places: Record<string, { scoreTop: number; bar: number }> = {};
      const check = async (state: string) => {
        expect(await faults(state)).toEqual([]);
        expect(await textSpillingOutOf(lineUp(page)), `${state}: text out of its box`).toEqual([]);
        places[state] = await place();
      };

      await check('the prompt');
      await lineUpButton(page, 'Type a time').click();
      await expect(lineUpField(page)).toBeFocused();
      await check('typing');
      // The field and the Save row are as far apart as any two rows (19 QA issue 15).
      const field = await boxOf(lineUpField(page), 'field');
      const save = await boxOf(lineUpButton(page, 'Save'), 'Save');
      const rowGap = save.y - (field.y + field.height);
      expect(rowGap).toBeGreaterThanOrEqual(4);
      await lineUpField(page).fill('soon');
      await lineUpButton(page, 'Save').click();
      await expect(lineUp(page).getByRole('alert')).toBeVisible();
      await check('a refused time');
      await lineUpField(page).fill('1h2m3s');
      await lineUpButton(page, 'Save').click();
      await expect(lineUpMessage(page)).toContainText('Bar 1 at 1:02:03.00');
      await check('lined up, a long time');
      const nudge = await boxOf(lineUpButton(page, 'Tab earlier'), 'Tab earlier');
      const message = await boxOf(lineUpMessage(page), 'message');
      expect(nudge.y - (message.y + message.height)).toBeCloseTo(rowGap, 0);

      await lineUpButton(page, 'Line up again').click();
      await expect(lineUpButton(page, 'Cancel')).toBeVisible();
      await check('lining up again');
      // Cancel takes the tap, and the nudges are back.
      await lineUpButton(page, 'Cancel').tap();
      await expect(lineUpButton(page, 'Tab later')).toBeVisible();
      await lineUpButton(page, 'Line up again').click();
      await lineUpButton(page, 'Type a time').click();
      await check('typing over a saved time');
      await lineUpField(page).fill('1');
      await lineUpField(page).press('Enter');
      await expect(lineUpMessage(page)).toContainText('Bar 1 at 0:01.00');

      // The note about the first tap, the longest of the messages.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('Space');
      await expect(lineUpMessage(page)).toContainText('Press Play on the video once.');
      await check('the first-tap note');

      const first = Object.values(places)[0]!;
      for (const [state, at] of Object.entries(places)) {
        expect(at, `the page at “${state}”`).toEqual(first);
      }

      // And from a fresh load the first bar is clear of the video's bar and the tab bar (QA 8).
      await page.reload();
      await scoreLaidOut(page);
      await expect(lineUpMessage(page)).toContainText('Bar 1 at');
      await page.evaluate(() => window.scrollTo(0, 0));
      await recordFollow(page);
      await videoStub(page).tapPlay();
      await expect.poll(() => markedBars(page), { timeout: 10_000 }).toEqual([1, 1]);
      await video.pause();
      const [bar1] = await followSamples(page);
      expect(bar1!.bar).toBe(1);
      expect(onShowIn(bar1!.marked, bar1!.view), 'bar 1 on show on a fresh load').toBe(true);
    });
  }

  test('a song with only a Spotify link asks YouTube for nothing on its play screen and has no line-up; Space plays its tab', async ({
    user,
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const services = await stubServices(context);
    await openNewSongOverview(page, user);
    await addRecordingButton(page).click();
    await linkField(page, 'Drumless').fill(SPOTIFY_URL);
    await saveRecordingsButton(page).click();
    await expect(recordingsForm(page)).toHaveCount(0);

    await tabLink(page).click();
    await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
    await expect(sourceSwitch(page)).toHaveCount(0);
    await expect(lineUp(page)).toHaveCount(0);
    expect(await page.locator('iframe').count()).toBe(0);
    expect(await markedBars(page)).toBeNull();
    // Space is the tab's own key here, as it always was.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(playButton(page)).toHaveText(/Pause/);
    await page.keyboard.press('Space');
    await expect(playButton(page)).toHaveText(/Play/);
    // Not the player's script, not a frame, nothing: neither YouTube's hosts nor Spotify's.
    expect(services.requests).toEqual([]);

    // The recorder hears a request when there is one: a YouTube Original, opened.
    await page.goBack();
    await saveRecordings(page, 'Groove 120', { Original: WATCH_URL });
    await recordingLink(page, 'Original').click();
    await expect(recordingFrame(page)).toHaveAttribute('src', EMBED_URL);
    await expect.poll(() => services.scripts()).toEqual([PLAYER_API_URL]);
    expect(services.frames()).toEqual([EMBED_URL]);
    await expect(lineUp(page)).toBeVisible();
  });
});
