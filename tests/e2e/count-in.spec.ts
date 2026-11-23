/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, test } from './auth';
import { controls, openFixture, playButton, status } from './playerPage';

// Unit 07: count-in. Nothing here listens to audio; whether the clicks and the
// downbeat sound right is a Human check. These check what the page shows and when.

const countIn = (page: Page) => page.getByTestId('count-in');
const countInSelect = (page: Page) =>
  controls(page).getByRole('combobox', { name: 'Count-in', exact: true });
const countInModeSelect = (page: Page) =>
  controls(page).getByRole('combobox', { name: 'When to count in' });

interface Recording {
  statuses: string[];
  beats: string[];
}

/** The slice of PlayerService these specs drive through `window.__drumPalPlayer`. */
interface DebugPlayer {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { status: string; countIn: { bar: number; beat: number } | null };
  setRange(range: { startBar: number; endBar: number } | null): void;
  setLooping(looping: boolean): void;
  setSpeed(ratio: number): void;
}

interface DebugWindow {
  __drumPalPlayer?: DebugPlayer | null;
  __recording: Recording;
}

/**
 * Records every status and count-in beat the player goes through, starting
 * with its current status, from the player the app exposes outside production builds (debugPlayer.ts).
 */
async function recordPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window as unknown as DebugWindow;
    const player = debug.__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    // Seeded with where it starts, so an unrelated first change (a position echo) adds nothing.
    const recording: Recording = { statuses: [player.getSnapshot().status], beats: [] };
    debug.__recording = recording;
    player.subscribe(() => {
      const { status, countIn } = player.getSnapshot();
      if (recording.statuses.at(-1) !== status) recording.statuses.push(status);
      const beat = countIn ? `${countIn.bar}.${countIn.beat}` : null;
      if (beat && recording.beats.at(-1) !== beat) recording.beats.push(beat);
    });
  });
}

const recording = (page: Page) =>
  page.evaluate(() => (window as unknown as DebugWindow).__recording);

test('counts one bar in over the score, then plays', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(countInSelect(page)).toHaveValue('0');
  await expect(countInModeSelect(page)).toBeDisabled();

  await countInSelect(page).selectOption('1 bar');
  await recordPlayer(page);
  const started = Date.now();
  await playButton(page).click();

  await expect(countIn(page)).toBeVisible();
  await expect(countIn(page)).toBeInViewport();
  await expect(status(page)).toContainText('Counting in');
  await expect(playButton(page)).toHaveText('Pause');

  // One bar of 4/4 at 120 BPM is two seconds.
  await expect(countIn(page)).toBeHidden({ timeout: 6000 });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeGreaterThan(1800);
  expect(elapsed).toBeLessThan(4000);

  await expect(playButton(page)).toHaveText('Pause');
  expect(await recording(page)).toEqual({
    statuses: ['ready', 'countingIn', 'playing'],
    beats: ['1.1', '1.2', '1.3', '1.4'],
  });
});

test('counts three beats a bar in 3/4, for two bars', async ({ user, page }) => {
  await openFixture(page, user, 'waltz-34', 'Waltz 3-4');
  await countInSelect(page).selectOption('2 bars');
  await recordPlayer(page);
  await playButton(page).click();

  await expect(countIn(page)).toBeVisible();
  await expect(countIn(page)).toBeHidden({ timeout: 8000 });
  expect((await recording(page)).beats).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3']);
});

test('Pause during the count-in calls it off', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('2 bars');
  await recordPlayer(page);
  await playButton(page).click();
  await expect(countIn(page)).toBeVisible();

  await playButton(page).click();
  await expect(countIn(page)).toBeHidden();
  await expect(playButton(page)).toHaveText('Play');

  // Past where the downbeat would have been: nothing started.
  await page.waitForTimeout(4500);
  expect((await recording(page)).statuses).toEqual(['ready', 'countingIn', 'ready']);
});

test('counts in before every repeat of a loop', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('1 bar');
  await countInModeSelect(page).selectOption('Before every loop repeat');
  // The loop UI is Unit 08's; until then a range is set on the player itself.
  // One bar at 200% is a one-second pass with a one-second count-in.
  await page.evaluate(() => {
    const player = (window as unknown as DebugWindow).__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    player.setRange({ startBar: 5, endBar: 5 });
    player.setLooping(true);
    player.setSpeed(2);
  });
  await recordPlayer(page);
  await playButton(page).click();

  await expect
    .poll(async () => (await recording(page)).statuses.join(' '), { timeout: 15_000 })
    .toContain('countingIn playing countingIn playing countingIn playing');

  // Each pass stays on the looped bar and never pauses between count-in and play.
  const { statuses, beats } = await recording(page);
  expect(statuses.slice(1)).not.toContain('ready');
  expect(beats.slice(0, 8)).toEqual(['1.1', '1.2', '1.3', '1.4', '1.1', '1.2', '1.3', '1.4']);
  await expect(status(page)).toContainText('Bar 5 of 16');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});
