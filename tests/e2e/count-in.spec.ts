/// <reference lib="dom" />
import type { JSHandle, Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import { closeLoopPanel, saveNewLoop } from './loopsPage';
import {
  barCursorBox,
  barNumber,
  boxOf,
  controls,
  openFixture,
  playButton,
  scoreBox,
  scrollScoreToStart,
  speedSlider,
  status,
  windowScrollSettled,
} from './playerPage';

// Unit 07: count-in. Nothing here listens to audio; whether the clicks and the
// downbeat sound right is a Human check. These check what the page shows and when.

const countIn = (page: Page) => page.getByTestId('count-in');
const countInBeat = (page: Page) => page.getByTestId('count-in-beat');
const countInBar = (page: Page) => page.getByTestId('count-in-bar');
const countInSelect = (page: Page) =>
  controls(page).getByRole('combobox', { name: 'Count-in', exact: true });
const countInModeSelect = (page: Page) =>
  controls(page).getByRole('combobox', { name: 'When to count in' });

interface Recording {
  statuses: string[];
  beats: string[];
}

/** When each status began and each count-in beat showed, in page milliseconds. */
interface Timing {
  statuses: { status: string; at: number }[];
  beats: { beat: string; at: number }[];
}

/** The slice of PlayerService these specs drive through `window.__drumPalPlayer`. */
interface DebugPlayer {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { status: string; countIn: { bar: number; beat: number } | null };
  seekToBar(barNumber: number): boolean;
}

interface DebugWindow {
  __drumPalPlayer?: DebugPlayer | null;
  __recording: Recording;
  __timing: Timing;
  __shownBeats: string[];
}

/** The mounted player, which the app exposes outside production builds (debugPlayer.ts). */
function debugPlayer(page: Page): Promise<JSHandle<DebugPlayer>> {
  return page.evaluateHandle(() => {
    const player = (window as unknown as DebugWindow).__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    return player;
  });
}

/**
 * Records every status and count-in beat the player goes through, starting
 * with its current status.
 */
async function recordPlayer(page: Page): Promise<void> {
  const handle = await debugPlayer(page);
  await handle.evaluate((player) => {
    const debug = window as unknown as DebugWindow;
    // Seeded with where it starts, so an unrelated first change (a position echo) adds nothing.
    const recording: Recording = { statuses: [player.getSnapshot().status], beats: [] };
    debug.__recording = recording;
    const timing: Timing = { statuses: [], beats: [] };
    debug.__timing = timing;
    let lastBeat: string | null = null;
    player.subscribe(() => {
      const { status, countIn } = player.getSnapshot();
      if (recording.statuses.at(-1) !== status) {
        recording.statuses.push(status);
        timing.statuses.push({ status, at: performance.now() });
      }
      const beat = countIn ? `${countIn.bar}.${countIn.beat}` : null;
      if (beat && recording.beats.at(-1) !== beat) recording.beats.push(beat);
      if (beat !== lastBeat) {
        lastBeat = beat;
        if (beat) timing.beats.push({ beat, at: performance.now() });
      }
    });
  });
}

const recording = (page: Page) =>
  page.evaluate(() => (window as unknown as DebugWindow).__recording);

const timing = (page: Page) => page.evaluate(() => (window as unknown as DebugWindow).__timing);

/** Records every number the on-screen counter shows, from the page itself rather than the player. */
async function recordShownBeats(page: Page): Promise<void> {
  await page.evaluate(() => {
    const shown: string[] = [];
    (window as unknown as DebugWindow).__shownBeats = shown;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="count-in-beat"]')?.textContent?.trim();
      if (text && shown.at(-1) !== text) shown.push(text);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

const shownBeats = (page: Page) =>
  page.evaluate(() => (window as unknown as DebugWindow).__shownBeats);

/** Moves playback to a bar on the player itself; tapping bars is jam.spec.ts's subject. */
async function seekToBar(page: Page, bar: number): Promise<void> {
  const handle = await debugPlayer(page);
  await handle.evaluate((player, barNumber) => {
    player.seekToBar(barNumber);
  }, bar);
  await expect(status(page)).toContainText(`Bar ${bar} of`);
}

/**
 * Loops bar 5 at 200%: a one-second pass with a one-second count-in. Saved
 * through the loop panel (Unit 08), which leaves the new loop as the one the
 * player repeats; the panel is then closed, so the page is as these specs found it.
 */
async function loopBarFiveAtDoubleSpeed(page: Page): Promise<void> {
  await speedSlider(page).fill('200');
  await saveNewLoop(page, { name: 'Bar five', firstBar: 5, lastBar: 5 });
  await closeLoopPanel(page);
  await expect(status(page)).toHaveText('Bar 5 of 16');
}

/** How the most recent count-in ran, in milliseconds, for one of `beatCount` beats. */
async function lastCountIn(page: Page, beatCount: number) {
  const { beats, statuses } = await timing(page);
  const last = beats.slice(-beatCount);
  const first = last[0];
  const playing = statuses.filter((entry) => entry.status === 'playing').at(-1);
  if (!first || !playing || last.length < beatCount) throw new Error('No finished count-in');
  const gaps = last.slice(1).map((beat, index) => beat.at - (last[index]?.at ?? 0));
  // The median, so one late timer doesn't decide it.
  const beatMs = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  return { beatMs, lengthMs: playing.at - first.at };
}

const countInsIn = (statuses: string[]) => statuses.filter((entry) => entry === 'countingIn');

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
  await loopBarFiveAtDoubleSpeed(page);
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

  // Every count-in, the repeats' included, runs its full bar (four beats of 250 ms)
  // before playback is reported: the loop comes back in on the downbeat, not early.
  const stamped = (await timing(page)).statuses;
  const countInLengths = stamped.flatMap((entry, index) => {
    const next = stamped[index + 1];
    return entry.status === 'countingIn' && next?.status === 'playing' ? [next.at - entry.at] : [];
  });
  expect(countInLengths.length).toBeGreaterThanOrEqual(3);
  for (const length of countInLengths) {
    expect(length).toBeGreaterThan(950);
    expect(length).toBeLessThan(2500);
  }

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('with the count-in off, Play starts straight away with no counter', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(countInSelect(page)).toHaveValue('0');
  await recordPlayer(page);
  await recordShownBeats(page);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(1);

  expect(await recording(page)).toEqual({ statuses: ['ready', 'playing'], beats: [] });
  expect(await shownBeats(page)).toEqual([]);
  await expect(countIn(page)).toBeHidden();
  await expect(status(page)).not.toContainText('Counting in');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('the counter is big, sits over the score on screen and shows each beat', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('2 bars');
  // Slow enough to measure the counter while a number is up.
  await speedSlider(page).fill('50');
  await recordShownBeats(page);
  await playButton(page).click();

  await expect(countInBeat(page)).toHaveText('1');
  await expect(countInBar(page)).toHaveText('Bar 1 of 2');
  await expect(countInBeat(page)).toBeInViewport({ ratio: 1 });

  // Readable from the throne: the number is a large share of the window at every size.
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport size');
  const fontPx = await countInBeat(page).evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  expect(fontPx).toBeGreaterThanOrEqual(Math.min(size.width, size.height) * 0.35);
  expect(fontPx).toBeGreaterThanOrEqual(130);

  // It covers the score box and nothing else: Pause stays reachable.
  // Play scrolls the window to the score; two boxes read mid-scroll would differ by the scroll.
  await windowScrollSettled(page);
  const counter = await boxOf(countIn(page), 'counter');
  const score = await scoreBox(page);
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(counter[side] - score[side])).toBeLessThan(2);
  }
  await expect(playButton(page)).toBeInViewport({ ratio: 1 });

  // Two bars at 60 BPM: eight seconds.
  await expect(countInBar(page)).toHaveText('Bar 2 of 2', { timeout: 8000 });
  await expect(countIn(page)).toBeHidden({ timeout: 12_000 });
  expect(await shownBeats(page)).toEqual(['1', '2', '3', '4', '1', '2', '3', '4']);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('the count-in follows the speed, and the tempo after a tempo change', async ({
  user,
  page,
}) => {
  test.setTimeout(60_000);
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  await countInSelect(page).selectOption('1 bar');
  await recordPlayer(page);

  /** Plays through one count-in, pauses once playback starts, and returns how the count-in ran. */
  const countInOnce = async () => {
    await playButton(page).click();
    await expect(countIn(page)).toBeVisible();
    await expect(countIn(page)).toBeHidden({ timeout: 15_000 });
    await expect(playButton(page)).toHaveText('Pause');
    const startedAtBar = await barNumber(page);
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
    return { ...(await lastCountIn(page, 4)), startedAtBar };
  };

  /** Within 15% of the beat: the counter runs on timers, the clicks on the audio clock. */
  const expectBeat = (run: { beatMs: number; lengthMs: number }, beatMs: number) => {
    expect(run.beatMs).toBeGreaterThan(beatMs * 0.85);
    expect(run.beatMs).toBeLessThan(beatMs * 1.15);
    // Playback follows the fourth beat by one more beat: never early, and not much late.
    expect(run.lengthMs).toBeGreaterThan(beatMs * 4 - 100);
    expect(run.lengthMs).toBeLessThan(beatMs * 4 + 1000);
  };

  // Bar 1 is at 120 BPM: half a second a beat.
  const fromBar1 = await countInOnce();
  expectBeat(fromBar1, 500);
  expect(fromBar1.startedAtBar).toBe(1);

  // Bar 9 is at 90 BPM: two thirds of a second.
  await seekToBar(page, 9);
  const fromBar9 = await countInOnce();
  expectBeat(fromBar9, 60_000 / 90);
  expect(fromBar9.startedAtBar).toBe(9);

  // 90 BPM at 50% is 45 BPM.
  await seekToBar(page, 9);
  await speedSlider(page).fill('50');
  const halfSpeed = await countInOnce();
  expectBeat(halfSpeed, 60_000 / 45);
  expect(halfSpeed.startedAtBar).toBe(9);

  // The fastest speed, back before the change: 120 BPM at 200% is 240 BPM.
  await seekToBar(page, 2);
  await speedSlider(page).fill('200');
  expectBeat(await countInOnce(), 250);

  expect(countInsIn((await recording(page)).statuses)).toHaveLength(4);
});

test('tapping a bar during the count-in starts the count again for that bar', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');

  // Where bar 1 is inside the score box, from alphaTab's bar cursor while it is on bar 1.
  await scrollScoreToStart(page);
  const cursorBox = await barCursorBox(page);
  const boxBefore = await scoreBox(page);
  const bar1 = {
    x: cursorBox.x + cursorBox.width / 2 - boxBefore.x,
    y: cursorBox.y + cursorBox.height / 2 - boxBefore.y,
  };

  await seekToBar(page, 4);
  await countInSelect(page).selectOption('2 bars');
  // Two bars at 60 BPM: eight seconds to tap in.
  await speedSlider(page).fill('50');
  await recordPlayer(page);
  await playButton(page).click();
  await expect(countInBeat(page)).toHaveText('2', { timeout: 5000 });

  // Play scrolled the window to the score; measure once that has stopped.
  await windowScrollSettled(page);
  await scrollScoreToStart(page);
  const box = await scoreBox(page);
  // The counter lies over the score but must not take the tap.
  await page.mouse.click(box.x + bar1.x, box.y + bar1.y);

  await expect(status(page)).toHaveText('Bar 1 of 16 · Counting in…');
  await expect(countIn(page)).toBeVisible();
  await expect(playButton(page)).toHaveText('Pause');
  // The count started over from beat one, without dropping out of the count-in.
  await expect
    .poll(async () => (await recording(page)).beats.join(' '), { timeout: 8000 })
    .toMatch(/^1\.1 1\.2 .*1\.1 1\.2/);
  expect((await recording(page)).statuses).toEqual(['ready', 'countingIn']);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(countIn(page)).toBeHidden();
  await expect(status(page)).toHaveText('Bar 1 of 16');
});

test('start only counts a loop in once; switching the mode mid-loop takes effect without stopping', async ({
  user,
  page,
}) => {
  test.setTimeout(60_000);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('1 bar');
  await expect(countInModeSelect(page)).toHaveValue('start');
  await loopBarFiveAtDoubleSpeed(page);
  await recordPlayer(page);
  await playButton(page).click();
  await expect(countIn(page)).toBeVisible();
  await expect(countIn(page)).toBeHidden({ timeout: 6000 });

  // Several one-second passes later it has looped round with no second count-in.
  await page.waitForTimeout(4500);
  expect((await recording(page)).statuses).toEqual(['ready', 'countingIn', 'playing']);
  await expect(status(page)).toHaveText('Bar 5 of 16');
  await expect(playButton(page)).toHaveText('Pause');

  // Mid-loop: from the next pass on, every repeat is counted in. Nothing pauses or stops.
  await countInModeSelect(page).selectOption('Before every loop repeat');
  await expect(playButton(page)).toHaveText('Pause');
  await expect
    .poll(async () => (await recording(page)).statuses.join(' '), { timeout: 15_000 })
    .toContain('playing countingIn playing countingIn playing');
  expect((await recording(page)).statuses.slice(1)).not.toContain('ready');

  // And back: once it is playing again the loop wraps round with no more count-ins.
  await countInModeSelect(page).selectOption('At the start only');
  // Longer than a count-in that was already under way when the mode changed.
  await page.waitForTimeout(1500);
  await expect.poll(async () => (await recording(page)).statuses.at(-1)).toBe('playing');
  const countInsSoFar = countInsIn((await recording(page)).statuses).length;
  await page.waitForTimeout(4500);
  const after = await recording(page);
  expect(countInsIn(after.statuses)).toHaveLength(countInsSoFar);
  expect(after.statuses.slice(1)).not.toContain('ready');
  await expect(status(page)).toHaveText('Bar 5 of 16');
  await expect(playButton(page)).toHaveText('Pause');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('count-in defaults come from Settings; a change in the controls bar is for the open song only', async ({
  user,
  page,
}) => {
  await signIn(page, user, '/settings');
  await page.getByRole('radio', { name: '2 bars' }).check();
  await page.getByRole('radio', { name: 'Before every loop repeat' }).check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await openFixture(page, user, 'waltz-34', 'Waltz 3-4');
  await expect(countInSelect(page)).toHaveValue('2');
  await expect(countInModeSelect(page)).toHaveValue('every_repeat');
  await expect(countInModeSelect(page)).toBeEnabled();

  // The saved default is what Play uses: two bars.
  await recordPlayer(page);
  await playButton(page).click();
  await expect(countInBar(page)).toHaveText('Bar 1 of 2');
  await playButton(page).click();
  await expect(countIn(page)).toBeHidden();

  // Override for this song: one bar of 3/4.
  await countInSelect(page).selectOption('1 bar');
  await countInModeSelect(page).selectOption('At the start only');
  await playButton(page).click();
  await expect(countIn(page)).toBeVisible();
  // A one-bar count-in has no "Bar 1 of 2" line.
  await expect(countInBar(page)).toHaveCount(0);
  await expect(countIn(page)).toBeHidden({ timeout: 8000 });
  await expect(playButton(page)).toHaveText('Pause');
  const { beats } = await timing(page);
  expect(beats.slice(-3).map((entry) => entry.beat)).toEqual(['1.1', '1.2', '1.3']);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');

  // Opening the song again starts from the saved defaults, not the override.
  await page.reload();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(countInSelect(page)).toHaveValue('2');
  await expect(countInModeSelect(page)).toHaveValue('every_repeat');

  // And the saved settings themselves were never touched.
  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: '2 bars' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Before every loop repeat' })).toBeChecked();
});
