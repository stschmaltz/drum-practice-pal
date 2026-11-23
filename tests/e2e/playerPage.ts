/// <reference lib="dom" />
/**
 * Locators and steps for the song page's player, shared by player.spec.ts,
 * jam.spec.ts, count-in.spec.ts, drums-only.spec.ts and loops.spec.ts.
 */
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, signIn, type E2eUser } from './auth';

/** Mirrors layout.ts: page layout from this width, horizontal below. */
const PAGE_LAYOUT_MIN_WIDTH = 768;

/** The layout the app should pick at this width (layout.ts). */
export function layoutForWidth(width: number): 'page' | 'horizontal' {
  return width >= PAGE_LAYOUT_MIN_WIDTH ? 'page' : 'horizontal';
}

/** The layout the app should pick at the page's current viewport. */
export const expectedLayout = (page: Page) => layoutForWidth(page.viewportSize()?.width ?? 0);

export const fixture = (name: string) =>
  join(process.cwd(), 'tests', 'fixtures', 'gp', `${name}.gp`);

export const controls = (page: Page) => page.getByRole('region', { name: 'Player controls' });
// Not inside the controls region: the song page keeps Play/Pause in a sticky bar.
export const playButton = (page: Page) => page.getByRole('button', { name: /^(Play|Pause)$/ });
export const muteDrumsButton = (page: Page) =>
  controls(page).getByRole('button', { name: 'Mute drums' });
export const drumsOnlyButton = (page: Page) =>
  controls(page).getByRole('button', { name: 'Drums only' });
export const speedSlider = (page: Page) => controls(page).getByRole('slider', { name: 'Speed' });
export const status = (page: Page) => page.getByTestId('player-status');
export const viewport = (page: Page) => page.getByTestId('score-viewport');

/** Uploads a fixture through the library and opens its song page. */
export async function openFixture(page: Page, user: E2eUser, name: string, title: string) {
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

export async function barNumber(page: Page): Promise<number> {
  const text = (await status(page).textContent()) ?? '';
  const match = /Bar (\d+) of/.exec(text);
  if (!match?.[1]) throw new Error(`No bar in "${text}"`);
  return Number(match[1]);
}

export interface Point {
  x: number;
  y: number;
}

export interface Box extends Point {
  width: number;
  height: number;
}

export async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No ${what}`);
  return box;
}

export const scoreBox = (page: Page) => boxOf(viewport(page), 'score box');

/** alphaTab's bar cursor: the highlighted box over the current bar. */
export async function barCursorBox(page: Page): Promise<Box> {
  const box = await viewport(page).locator('.at-cursor-bar').boundingBox();
  if (!box || box.width < 2) throw new Error('No bar cursor');
  return box;
}

/** Taps a point in the window and waits for the status line to leave bar `from`. */
export async function tapAndWaitForBar(page: Page, point: Point, from: number): Promise<number> {
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => barNumber(page)).not.toBe(from);
  return barNumber(page);
}

/**
 * A point just inside the bar after the cursor's: to its right, or at the
 * start of the next line when the cursor's bar ends one (bar 1 is wide, with
 * the clef, and fills a line on a tablet).
 */
export async function nextBarPoint(page: Page): Promise<Point> {
  const box = await barCursorBox(page);
  const frame = await scoreBox(page);
  const right = { x: box.x + box.width + 20, y: box.y + box.height / 2 };
  if (right.x < frame.x + frame.width - 20) return right;
  return { x: frame.x + 40, y: box.y + box.height * 1.5 };
}

/** The middle of the bar the cursor is on. */
export async function cursorBarPoint(page: Page): Promise<Point> {
  const box = await barCursorBox(page);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Scrolls the score box, and only the box, so the cursor's bar sits near its
 * top left: the cursor's bar and the one after it are then on screen at every
 * size, clear of the phone's loop sheet. (Element.scrollIntoView would move
 * the window as well.)
 */
export async function scrollScoreToCursor(page: Page): Promise<void> {
  await viewport(page).evaluate((box) => {
    const cursor = box.querySelector('.at-cursor-bar')?.getBoundingClientRect();
    if (!cursor) throw new Error('No bar cursor');
    const frame = box.getBoundingClientRect();
    box.scrollBy({
      left: cursor.left - frame.left - 24,
      top: cursor.top - frame.top - 24,
      behavior: 'instant',
    });
  });
}

/** Polls `read` until it gives the same value twice running, and returns that value. */
export async function untilStill<T>(read: () => Promise<T>): Promise<T> {
  const reads: T[] = [];
  await expect
    .poll(async () => {
      reads.push(await read());
      return reads.length > 1 && reads.at(-1) === reads.at(-2);
    })
    .toBe(true);
  return reads.at(-1) as T;
}

/** Waits until the window stops scrolling (Play's smooth scroll has ended); returns `scrollY`. */
export const windowScrollSettled = (page: Page) =>
  untilStill(() => page.evaluate(() => window.scrollY));

export const scrollScoreToStart = (page: Page) =>
  viewport(page).evaluate((box) => box.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
