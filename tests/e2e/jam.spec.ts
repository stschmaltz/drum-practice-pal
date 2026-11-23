/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './auth';
import {
  barCursorBox,
  barNumber,
  boxOf,
  expectedLayout,
  openFixture,
  playButton,
  scoreBox,
  scrollScoreToStart,
  speedSlider,
  status,
  untilStill,
  viewport,
  windowScrollSettled,
  type Box,
  type Point,
} from './playerPage';

// Unit 06: jam mode. Song page with a following cursor, tap a bar to seek,
// and speed plus BPM at the current bar in the header.

const bpm = (page: Page) => page.getByTestId('jam-bpm');
const speed = (page: Page) => page.getByTestId('jam-speed');
const jamBar = (page: Page) => page.getByTestId('jam-bar');

const contains = (box: Box, { x, y }: Point) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

async function expectBarCursorOver(page: Page, point: Point) {
  await expect.poll(async () => contains(await barCursorBox(page), point)).toBe(true);
}

/** Taps a point in the window and waits for the status line to leave bar `from`. */
async function tapAndWaitForBar(page: Page, point: Point, from: number): Promise<number> {
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => barNumber(page)).not.toBe(from);
  return barNumber(page);
}

/**
 * A point just inside the bar after the cursor's: to its right, or at the
 * start of the next line when the cursor's bar ends one (bar 1 is wide, with
 * the clef, and fills a line on a tablet).
 */
async function nextBarPoint(page: Page): Promise<Point> {
  const box = await barCursorBox(page);
  const frame = await scoreBox(page);
  const right = { x: box.x + box.width + 20, y: box.y + box.height / 2 };
  if (right.x < frame.x + frame.width - 20) return right;
  return { x: frame.x + 40, y: box.y + box.height * 1.5 };
}

/**
 * Taps the bar after the cursor's and waits for both the status line and the
 * cursor to move there. The cursor's line is first brought to the middle of
 * the box (and its bar to the left edge in horizontal layout), so the next bar
 * or line is on screen.
 */
async function tapNextBar(page: Page): Promise<number> {
  const from = await barNumber(page);
  await viewport(page).evaluate((box) => {
    box
      .querySelector('.at-cursor-bar')
      ?.scrollIntoView({ block: 'center', inline: 'start', behavior: 'instant' });
  });
  const point = await nextBarPoint(page);
  const landed = await tapAndWaitForBar(page, point, from);
  await expectBarCursorOver(page, point);
  return landed;
}

/** The bottom of the visible window: the top of the phone's fixed tab bar, or the window's bottom. */
async function visibleBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const tabBar = Array.from(document.querySelectorAll('nav[aria-label="Main"]'))
      .filter((nav) => getComputedStyle(nav).position === 'fixed')
      .map((nav) => nav.getBoundingClientRect())
      .find((rect) => rect.height > 0);
    return tabBar?.top ?? window.innerHeight;
  });
}

/** Whether the beat cursor is on screen: inside the score box and the visible window. */
async function beatCursorOnScreen(page: Page): Promise<boolean> {
  return viewport(page).evaluate(
    (box, windowBottom) => {
      const cursor = box.querySelector('.at-cursor-beat')?.getBoundingClientRect();
      if (!cursor || cursor.height === 0) return false;
      const frame = box.getBoundingClientRect();
      const top = Math.max(frame.top, 0);
      const bottom = Math.min(frame.bottom, windowBottom);
      const left = Math.max(frame.left, 0);
      const right = Math.min(frame.right, window.innerWidth);
      const midY = cursor.top + cursor.height / 2;
      return cursor.left >= left && cursor.right <= right && midY >= top && midY <= bottom;
    },
    await visibleBottom(page),
  );
}

/** Whether the element is wholly inside the visible window. */
async function onScreen(locator: Locator): Promise<boolean> {
  return locator.evaluate(
    (element, windowBottom) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 0 && rect.top >= 0 && rect.bottom <= windowBottom;
    },
    await visibleBottom(locator.page()),
  );
}

/** Waits until the score box stops scrolling (a swipe's fling has ended). */
const scoreScrollSettled = (page: Page) =>
  untilStill(() => viewport(page).evaluate((box) => `${box.scrollLeft},${box.scrollTop}`));

const scrollWindowToTop = (page: Page) =>
  page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

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
  expect(await tapAndWaitForBar(page, next, 1)).toBe(2);
  await expectBarCursorOver(page, next);

  // A bar further on: scroll the score along (down in page layout, sideways in
  // horizontal) and tap the middle of the box. The cursor goes to the bar tapped.
  await viewport(page).evaluate((box) => {
    box.scrollBy({ left: box.clientWidth * 2, top: box.clientHeight / 2, behavior: 'instant' });
  });
  const frame = await scoreBox(page);
  // Horizontal layout is one line, so stay at the cursor's height there.
  const cursor = await barCursorBox(page);
  const far = {
    x: frame.x + frame.width / 2,
    y: expectedLayout(page) === 'page' ? frame.y + frame.height / 2 : cursor.y + cursor.height / 2,
  };
  const landed = await tapAndWaitForBar(page, far, 2);
  expect(landed).toBeGreaterThan(2);
  await expectBarCursorOver(page, far);

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
  // Play may smooth-scroll the window to the score; measure the bar after it ends, or the tap misses.
  await windowScrollSettled(page);

  const point = await nextBarPoint(page);
  // At 50% a bar lasts 4 s, so the cursor is still on bar 1 here.
  const landed = await tapAndWaitForBar(page, point, 1);
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

test('each tap lands on the bar tapped, through the tempo change, and BPM follows', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  await expect(bpm(page)).toHaveText('120');

  // Bar by bar from 1 to 10, across line ends in page layout: never skips or misses.
  for (let expected = 2; expected <= 10; expected++) {
    expect(await tapNextBar(page)).toBe(expected);
    await expect(bpm(page)).toHaveText(expected < 9 ? '120' : '90');
  }
  await expect(status(page)).toHaveText('Bar 10 of 16');
  // Still paused: a tap moves playback, it doesn't start it.
  await expect(playButton(page)).toHaveText('Play');

  await speedSlider(page).fill('50');
  await expect(bpm(page)).toHaveText('45');

  // Playback starts from the tapped bar at the tapped bar's tempo.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await page.waitForTimeout(500);
  expect(await barNumber(page)).toBe(10);
  await expect(bpm(page)).toHaveText('45');
});

test('a tap outside the bars, on the score margin, does not seek', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  expect(await tapNextBar(page)).toBe(2);

  await scrollScoreToStart(page);
  const frame = await scoreBox(page);
  // The top edge of the score is margin above the first line of music.
  await page.mouse.click(frame.x + frame.width / 2, frame.y + 4);
  await page.waitForTimeout(500);
  await expect(status(page)).toHaveText('Bar 2 of 16');
});

test('a touch tap seeks; a touch swipe scrolls the score without seeking', async ({
  user,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'touch devices only');
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: Point[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

  // A touch tap (no movement) on a bar seeks, the same as a click.
  const next = await nextBarPoint(page);
  await touch('touchStart', [next]);
  await touch('touchEnd', []);
  await expect.poll(() => barNumber(page)).toBe(2);
  await expectBarCursorOver(page, next);

  // Swipe sideways on a phone (one long line), up on a tablet (page layout),
  // starting on a bar. (A tap during the fling that follows only stops it, as
  // on a real phone, so the tap comes first.)
  await scrollScoreToStart(page);
  await scoreScrollSettled(page);
  const frame = await scoreBox(page);
  const cursor = await barCursorBox(page);
  const horizontal = expectedLayout(page) === 'horizontal';
  const start = horizontal
    ? { x: frame.x + frame.width - 30, y: cursor.y + cursor.height / 2 }
    : { x: frame.x + frame.width / 2, y: frame.y + frame.height - 40 };
  const step = horizontal ? { x: -25, y: 0 } : { x: 0, y: -25 };
  await touch('touchStart', [start]);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [{ x: start.x + step.x * i, y: start.y + step.y * i }]);
  }
  await touch('touchEnd', []);

  await expect
    .poll(() => viewport(page).evaluate((box) => box.scrollLeft + box.scrollTop))
    .toBeGreaterThan(50);
  await scoreScrollSettled(page);
  await expect(status(page)).toHaveText('Bar 2 of 16');
});

// QA issue 1: Play used to scroll the readout and Pause off the top of a phone.
for (const size of [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
]) {
  test(`on a ${size.name} phone, Pause, the readout and the cursor stay on screen while playing`, async ({
    user,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone sizes only');
    await page.setViewportSize({ width: size.width, height: size.height });
    await openFixture(page, user, 'groove-120', 'Groove 120');
    // From the top of the page, as when the song has just opened.
    await scrollWindowToTop(page);

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
    // Play scrolls the score box into view (smoothly). Neither size fits the
    // header, controls and score, so the window did scroll.
    expect(await windowScrollSettled(page)).toBeGreaterThan(0);

    for (let sample = 0; sample < 12; sample++) {
      await page.waitForTimeout(250);
      expect(await onScreen(playButton(page))).toBe(true);
      expect(await onScreen(bpm(page))).toBe(true);
      expect(await onScreen(speed(page))).toBe(true);
      expect(await beatCursorOnScreen(page)).toBe(true);
    }
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
  });
}

// Fix round 1: the sticky bar must never sit over the score, swallow a tap
// meant for a bar, or pass its own taps through to the score.
for (const size of [null, { name: 'landscape phone', width: 844, height: 390 }]) {
  test(`with the page scrolled to the end while playing, a tap on the bar just below the sticky bar seeks${size ? ` (${size.name})` : ''}`, async ({
    user,
    page,
  }, testInfo) => {
    test.skip(size !== null && testInfo.project.name !== 'phone', 'phone project only');
    if (size) await page.setViewportSize({ width: size.width, height: size.height });
    await openFixture(page, user, 'groove-120', 'Groove 120');
    await scrollWindowToTop(page);
    // At 50% a bar lasts 4 s, so the cursor is still on bar 1 for the taps.
    await speedSlider(page).fill('50');
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
    await windowScrollSettled(page);
    // As far down as the page goes: the score at its closest to the sticky bar.
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await windowScrollSettled(page);

    const bar = await boxOf(jamBar(page), 'sticky bar');
    const frame = await scoreBox(page);
    const cursor = await barCursorBox(page);
    const barBottom = bar.y + bar.height;
    expect(frame.y).toBeGreaterThanOrEqual(barBottom);
    expect(cursor.y).toBeGreaterThanOrEqual(barBottom);
    expect(await beatCursorOnScreen(page)).toBe(true);

    // A tap on the sticky bar's readout is the bar's: no seek, playback goes on.
    const readout = await boxOf(bpm(page), 'BPM readout');
    await page.mouse.click(readout.x + readout.width / 2, readout.y + readout.height / 2);
    await page.waitForTimeout(500);
    await expect(status(page)).toHaveText('Bar 1 of 16');
    await expect(playButton(page)).toHaveText('Pause');

    // The next bar, on the score's top line, right under the sticky bar.
    const next = await nextBarPoint(page);
    expect(next.y).toBeGreaterThan(barBottom);
    // Exactly the bar tapped. (While playing, alphaTab then scrolls its line into view.)
    expect(await tapAndWaitForBar(page, next, 1)).toBe(2);
    await expect(playButton(page)).toHaveText('Pause');
    expect(await onScreen(playButton(page))).toBe(true);
    expect(await onScreen(bpm(page))).toBe(true);
  });
}

test('Play/Pause in the sticky bar works from the keyboard', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await playButton(page).focus();
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await expect(playButton(page)).toBeFocused();
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(1);

  await page.keyboard.press('Enter');
  await expect(playButton(page)).toHaveText('Play');
  await expect(playButton(page)).toBeFocused();
  // Paused means paused: the bar stays put.
  const pausedAt = await barNumber(page);
  await page.waitForTimeout(1000);
  expect(await barNumber(page)).toBe(pausedAt);

  // Next in tab order: the rest of the controls.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back to start' })).toBeFocused();
});
