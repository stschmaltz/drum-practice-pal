/// <reference lib="dom" />
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, signIn, test, type E2eUser } from './auth';

// Unit 05: the song page's player. Nothing here listens to audio; sound is a Human check.

const admin = createAdminClient();
const PAGE_LAYOUT_MIN_WIDTH = 768;
const fixture = (name: string) => join(process.cwd(), 'tests', 'fixtures', 'gp', `${name}.gp`);

const controls = (page: Page) => page.getByRole('region', { name: 'Player controls' });
const playButton = (page: Page) => controls(page).getByRole('button', { name: /^(Play|Pause)$/ });
const status = (page: Page) => page.getByTestId('player-status');
const viewport = (page: Page) => page.getByTestId('score-viewport');

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

/** Uploads a fixture through the library and opens its song page. */
async function openFixture(page: Page, user: E2eUser, name: string, title: string) {
  await signIn(page, user, '/library');
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture(name));
  await expect(page.getByRole('status').filter({ hasText: `Added “${title}”.` })).toBeVisible();
  await page.getByRole('list').getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  // Enabled once the score, MIDI and soundfont are all in.
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await viewport(page).scrollIntoViewIfNeeded();
  await expect(viewport(page).locator('svg').first()).toBeVisible();
}

async function barNumber(page: Page): Promise<number> {
  const text = (await status(page).textContent()) ?? '';
  const match = /Bar (\d+) of/.exec(text);
  if (!match?.[1]) throw new Error(`No bar in "${text}"`);
  return Number(match[1]);
}

/** The layout the app should pick at this width (layout.ts). */
function layoutForWidth(width: number): 'page' | 'horizontal' {
  return width >= PAGE_LAYOUT_MIN_WIDTH ? 'page' : 'horizontal';
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

  expect(await layoutShown(page)).toBe(layoutForWidth(page.viewportSize()?.width ?? 0));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
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
  await controls(page).getByRole('slider', { name: 'Metronome volume' }).fill('30');
  const mute = controls(page).getByRole('button', { name: 'Mute drums' });
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
  await expect(controls(page).getByRole('button', { name: 'Mute drums' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(controls(page).getByRole('slider', { name: 'Speed' })).toHaveValue('100');
});

test('a song without drums disables drum mute', async ({ user, page }) => {
  await openFixture(page, user, 'no-drums', 'No Drums');
  await expect(controls(page).getByRole('button', { name: 'Mute drums' })).toBeDisabled();
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
