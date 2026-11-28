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
