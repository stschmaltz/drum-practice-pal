/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, signIn, test } from './auth';
import {
  barNumber,
  boxOf,
  controls,
  drumsOnlyButton,
  expectedLayout,
  fixture,
  layoutForWidth,
  muteDrumsButton,
  openFixture,
  playButton,
  recordedStatuses,
  recordStatuses,
  showControls,
  status,
  viewport,
} from './playerPage';

// Unit 05: the song page's player. Nothing here listens to audio; sound is a Human check.

const admin = createAdminClient();

/** Counts AudioContexts the page creates and reports their states, to see alphaTab let go of audio. */
async function trackAudioContexts(page: Page) {
  await page.addInitScript(() => {
    const created: AudioContext[] = [];
    (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts = created;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        created.push(this);
      }
    };
  });
}

async function audioContextStates(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts.map((c) => c.state),
  );
}

/** Rendered notation width against the scroll box: page layout fits, horizontal overflows. */
async function layoutShown(page: Page): Promise<'page' | 'horizontal'> {
  const { surface, box } = await viewport(page).evaluate((el) => ({
    surface: el.querySelector('.at-surface')?.getBoundingClientRect().width ?? 0,
    box: el.clientWidth,
  }));
  return surface > box + 1 ? 'horizontal' : 'page';
}

/** How far the page scrolls sideways; 0 or less means it fits. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('opens a song in the player with notation in the layout for the width', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(status(page)).toHaveText('Bar 1 of 16');
  await expect(playButton(page)).toHaveText('Play');

  expect(await layoutShown(page)).toBe(expectedLayout(page));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The inputs themselves, not just their row, must be 44 px tall to be easy to grab.
  for (const name of ['Speed', 'Metronome volume']) {
    const box = await controls(page).getByRole('slider', { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }
});

test('speed, metronome and drum mute change live without restarting playback', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const speed = controls(page).getByRole('slider', { name: 'Speed' });
  await speed.fill('200');
  await expect(controls(page).getByText('200%')).toBeVisible();

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const before = await barNumber(page);

  await speed.fill('150');
  const metronome = controls(page).getByRole('button', { name: 'Metronome' });
  const pressedBefore = await metronome.getAttribute('aria-pressed');
  await metronome.click();
  await expect(metronome).not.toHaveAttribute('aria-pressed', pressedBefore ?? '');
  // The volume and the drum mute fold away while playing; "Show controls" brings them.
  await showControls(page);
  await controls(page).getByRole('slider', { name: 'Metronome volume' }).fill('30');
  const mute = muteDrumsButton(page);
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');

  // Still playing and still moving forward: a restart would have gone back to bar 1.
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(before);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await controls(page).getByRole('button', { name: 'Back to start' }).click();
  await expect(status(page)).toHaveText('Bar 1 of 16');
});

test('starts with the metronome and drum mute from settings', async ({ user, page }) => {
  const { error } = await admin
    .from('user_settings')
    .update({ metronome_on: false, metronome_volume: 0.4, drums_muted_default: true })
    .eq('user_id', user.id);
  if (error) throw error;

  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(controls(page).getByRole('button', { name: 'Metronome' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(controls(page).getByRole('slider', { name: 'Metronome volume' })).toHaveValue('40');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(controls(page).getByRole('slider', { name: 'Speed' })).toHaveValue('100');
});

test('a song without drums disables drum mute', async ({ user, page }) => {
  await openFixture(page, user, 'no-drums', 'No Drums');
  await expect(muteDrumsButton(page)).toBeDisabled();
});

test('a song without drums disables drums only, with the reason', async ({ user, page }) => {
  await openFixture(page, user, 'no-drums', 'No Drums');
  const drumsOnly = drumsOnlyButton(page);
  await expect(drumsOnly).toBeDisabled();
  await expect(drumsOnly).toHaveAccessibleDescription('This song has no drum track');
});

// Unit 07. Which tracks sound is a Human check; this covers the toggle and that nothing restarts.
test('drums only and mute drums exclude each other and change live on a multi-track song', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'multi-track', 'Multi Track');
  const mute = muteDrumsButton(page);
  const drumsOnly = drumsOnlyButton(page);
  await expect(drumsOnly).toBeEnabled();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'false');

  // Beside Mute drums on the same row, so the bar is no taller for it, and a full touch target.
  const muteBox = await boxOf(mute, 'Mute drums button');
  const onlyBox = await boxOf(drumsOnly, 'Drums only button');
  expect(onlyBox.y).toBe(muteBox.y);
  expect(onlyBox.x).toBeGreaterThan(muteBox.x);
  expect(onlyBox.height).toBeGreaterThanOrEqual(44);

  // At full speed: eight bars at 100 BPM leave time for every step before the song ends.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  let before = await barNumber(page);

  // Playing folds the controls bar; the drum toggles are behind "Show controls".
  await showControls(page);
  await drumsOnly.click();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'true');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'false');
  await drumsOnly.click();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'true');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  // Still playing and still moving forward: a restart would have gone back to bar 1.
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(before);

  before = await barNumber(page);
  await drumsOnly.click();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'false');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(before);
});

test('leaving the song page mid-play releases the player', async ({ user, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await trackAudioContexts(page);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Library' })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();

  await expect.poll(() => audioContextStates(page)).not.toContain('running');
  expect(await audioContextStates(page)).not.toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a damaged file in Storage shows the score error, not a stray score', async ({
  user,
  page,
}) => {
  await signIn(page, user, '/library');
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Groove 120”.' })).toBeVisible();
  const { data: song, error } = await admin
    .from('songs')
    .select('id, file_path')
    .eq('user_id', user.id)
    .single();
  if (error) throw error;
  // Bytes alphaTab's alphaTex fallback would happily read as a one-bar score.
  const junk = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
  const replaced = await admin.storage
    .from('gp-files')
    .upload(song.file_path, junk, { upsert: true, contentType: 'application/octet-stream' });
  if (replaced.error) throw replaced.error;

  await page.goto(`/songs/${song.id}`);

  await expect(page.getByRole('alert')).toHaveText(
    "This song couldn't be shown or played. Try reloading, or upload the file again.",
  );
  await expect(playButton(page)).toBeDisabled();
});

test('an unknown song id shows not found', async ({ user, page }) => {
  await signIn(page, user, '/songs/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { level: 1, name: 'Song not found' })).toBeVisible();
});

test('pause and play resume from the same bar, not the start', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await controls(page).getByRole('slider', { name: 'Speed' }).fill('200');
  await playButton(page).click();
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  const pausedAt = await barNumber(page);
  expect(pausedAt).toBeGreaterThanOrEqual(3);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(pausedAt);
});

test('crossing the layout breakpoint mid-play relayouts and keeps playing', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const start = page.viewportSize();
  if (!start) throw new Error('No viewport');
  const startLayout = layoutForWidth(start.width);
  await expect.poll(() => layoutShown(page)).toBe(startLayout);

  await controls(page).getByRole('slider', { name: 'Speed' }).fill('200');
  await playButton(page).click();
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  // Narrowing within page layout must not leave the old score width pushing the page sideways.
  if (start.width > 900) {
    await page.setViewportSize({ width: 900, height: start.height });
    await expect.poll(() => horizontalOverflow(page), { timeout: 10_000 }).toBeLessThanOrEqual(0);
  }

  const otherWidth = startLayout === 'page' ? 390 : 1024;
  await page.setViewportSize({ width: otherWidth, height: start.height });
  await expect
    .poll(() => layoutShown(page), { timeout: 10_000 })
    .toBe(startLayout === 'page' ? 'horizontal' : 'page');

  const afterResize = await barNumber(page);
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(afterResize);
});

// 12 UX pass, item 1: the score gets the screen while playing.
test('the controls fold to a strip under the sticky bar while playing, without touching playback', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const bar = controls(page);
  const fullHeight = (await boxOf(bar, 'controls')).height;
  await recordStatuses(page);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  const show = bar.getByRole('button', { name: 'Show controls' });
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(bar.getByRole('button', { name: 'Metronome' })).toBeVisible();
  await expect(bar.getByRole('slider', { name: 'Speed' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Mute drums' })).toHaveCount(0);
  const strip = await boxOf(bar, 'folded controls');
  expect(strip.height).toBeLessThan(fullHeight / 2);

  // It sticks right under the sticky bar when the page scrolls.
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  const jamBar = await boxOf(page.getByTestId('jam-bar'), 'sticky bar');
  await expect
    .poll(async () => Math.round((await boxOf(bar, 'folded controls')).y))
    .toBe(Math.round(jamBar.y + jamBar.height));

  // The keys for what folded away still work: D mutes the drums, seen once the bar is out.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('d');
  await show.click();
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.getByRole('button', { name: 'Hide controls' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(bar.getByRole('button', { name: /^(Show|Hide) controls$/ })).toHaveCount(0);
  await expect(muteDrumsButton(page)).toBeVisible();
  // Playing then paused, nothing in between: folding never stopped or reloaded anything.
  expect(await recordedStatuses(page)).toEqual(['ready', 'playing', 'ready']);
});
