/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, test } from './auth';
import { barNumber, openFixture, playButton, speedSlider, status, viewport } from './playerPage';

// Unit 06: jam mode. Song page with a following cursor, tap a bar to seek,
// and speed plus BPM at the current bar in the header.

const bpm = (page: Page) => page.getByTestId('jam-bpm');
const speed = (page: Page) => page.getByTestId('jam-speed');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** alphaTab's bar cursor: the highlighted box over the current bar. */
async function barCursorBox(page: Page): Promise<Box> {
  const box = await viewport(page).locator('.at-cursor-bar').boundingBox();
  if (!box || box.width < 2) throw new Error('No bar cursor');
  return box;
}

const contains = (box: Box, x: number, y: number) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

/** Taps a point in the window and waits for the status line to leave `from`. */
async function tapAndWaitForBar(page: Page, x: number, y: number, from: number): Promise<number> {
  await page.mouse.click(x, y);
  await expect.poll(() => barNumber(page)).not.toBe(from);
  return barNumber(page);
}

/**
 * A point just inside the bar after the cursor's: to its right, or at the
 * start of the next line when the cursor's bar ends one (bar 1 is wide, with
 * the clef, and fills a line on a tablet).
 */
async function nextBarPoint(page: Page) {
  const box = await barCursorBox(page);
  const frame = await viewport(page).boundingBox();
  if (!frame) throw new Error('No score box');
  const right = { x: box.x + box.width + 20, y: box.y + box.height / 2 };
  if (right.x < frame.x + frame.width - 20) return right;
  return { x: frame.x + 40, y: box.y + box.height * 1.5 };
}

/**
 * Whether the beat cursor is on screen: inside the score box and the window,
 * above the phone's fixed tab bar.
 */
async function beatCursorOnScreen(page: Page): Promise<boolean> {
  return viewport(page).evaluate((box) => {
    const cursor = box.querySelector('.at-cursor-beat')?.getBoundingClientRect();
    if (!cursor || cursor.height === 0) return false;
    const tabBar = Array.from(document.querySelectorAll('nav[aria-label="Main"]'))
      .filter((nav) => getComputedStyle(nav).position === 'fixed')
      .map((nav) => nav.getBoundingClientRect())
      .find((rect) => rect.height > 0);
    const frame = box.getBoundingClientRect();
    const top = Math.max(frame.top, 0);
    const bottom = Math.min(frame.bottom, tabBar?.top ?? window.innerHeight);
    const left = Math.max(frame.left, 0);
    const right = Math.min(frame.right, window.innerWidth);
    const midY = cursor.top + cursor.height / 2;
    return cursor.left >= left && cursor.right <= right && midY >= top && midY <= bottom;
  });
}

test('the header shows speed and the BPM it gives at the current bar', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(speed(page)).toHaveText('100%');
  await expect(bpm(page)).toHaveText('120');

  await speedSlider(page).fill('75');
  await expect(speed(page)).toHaveText('75%');
  await expect(bpm(page)).toHaveText('90');
});

test('tapping a bar moves playback and the cursor to that bar', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(status(page)).toHaveText('Bar 1 of 16');

  // The neighbouring bar: lands exactly on the bar under the tap.
  const next = await nextBarPoint(page);
  expect(await tapAndWaitForBar(page, next.x, next.y, 1)).toBe(2);
  await expect.poll(async () => contains(await barCursorBox(page), next.x, next.y)).toBe(true);

  // A bar further on: scroll the score along (down in page layout, sideways in
  // horizontal) and tap the middle of the box. The cursor goes to the bar tapped.
  await viewport(page).evaluate((box) => {
    box.scrollBy({ left: box.clientWidth * 2, top: box.clientHeight / 2, behavior: 'instant' });
  });
  const frame = await viewport(page).boundingBox();
  if (!frame) throw new Error('No score box');
  // Horizontal layout is one line, so stay at the cursor's height there.
  const cursor = await barCursorBox(page);
  const pageLayout = (page.viewportSize()?.width ?? 0) >= 768;
  const far = {
    x: frame.x + frame.width / 2,
    y: pageLayout ? frame.y + frame.height / 2 : cursor.y + cursor.height / 2,
  };
  const landed = await tapAndWaitForBar(page, far.x, far.y, 2);
  expect(landed).toBeGreaterThan(2);
  await expect.poll(async () => contains(await barCursorBox(page), far.x, far.y)).toBe(true);

  // Playback starts from the tapped bar, not from bar 1.
  const tappedBar = await barNumber(page);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await page.waitForTimeout(300);
  expect(await barNumber(page)).toBeGreaterThanOrEqual(tappedBar);
});

test('tapping a bar while playing seeks there and keeps playing', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await speedSlider(page).fill('50');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');

  const point = await nextBarPoint(page);
  // At 50% a bar lasts 4 s, so the cursor is still on bar 1 here.
  const landed = await tapAndWaitForBar(page, point.x, point.y, 1);
  expect(landed).toBe(2);
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBe(3);
});

test('the cursor stays on screen through a tempo change, and BPM follows it', async ({
  user,
  page,
}) => {
  test.setTimeout(90_000);
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  await speedSlider(page).fill('200');
  await expect(bpm(page)).toHaveText('240');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');

  // Sample until the song ends. alphaTab scrolls smoothly, so allow the cursor
  // to be off screen briefly while a scroll runs, but never for a full second.
  const bpmsSeen = new Set<string>();
  let lastBar = 1;
  let offScreenSince: number | null = null;
  let longestOffScreen = 0;
  const started = Date.now();
  while ((await playButton(page).textContent()) === 'Pause' && Date.now() - started < 40_000) {
    bpmsSeen.add((await bpm(page).textContent()) ?? '');
    lastBar = Math.max(lastBar, await barNumber(page));
    const now = Date.now();
    if (await beatCursorOnScreen(page)) {
      offScreenSince = null;
    } else {
      offScreenSince ??= now;
      longestOffScreen = Math.max(longestOffScreen, now - offScreenSince);
    }
    await page.waitForTimeout(150);
  }

  // The end of the song rewinds to bar 1, so check how far it got while playing.
  expect(lastBar).toBeGreaterThanOrEqual(15);
  expect([...bpmsSeen]).toEqual(expect.arrayContaining(['240', '180']));
  expect(longestOffScreen).toBeLessThan(1000);
});

test('every song opens at 100%', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await speedSlider(page).fill('150');
  await expect(speed(page)).toHaveText('150%');

  await page.reload();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(speed(page)).toHaveText('100%');
  await expect(speedSlider(page)).toHaveValue('100');
});
