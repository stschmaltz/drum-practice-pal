/// <reference lib="dom" />
/**
 * Locators and steps for the song page's player, shared by player.spec.ts,
 * jam.spec.ts, count-in.spec.ts, drums-only.spec.ts, loops.spec.ts and
 * loop-scroll.spec.ts.
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
export const metronomeButton = (page: Page) =>
  controls(page).getByRole('button', { name: 'Metronome' });
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
  await scoreSettled(page);
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
  await scoreSettled(page);
  const box = await barCursorBox(page);
  const frame = await scoreBox(page);
  const right = { x: box.x + box.width + 20, y: box.y + box.height / 2 };
  if (right.x < frame.x + frame.width - 20) return right;
  return { x: frame.x + 40, y: box.y + box.height * 1.5 };
}

/**
 * Waits until the window, the score box and the bar cursor have stopped
 * moving, so a point measured next is still on the same bar when it is
 * tapped. alphaTab scrolls the box to its cursor once the player is ready
 * (on a phone the box ends 40 to 47 px along, 06 QA), at about the moment
 * Play is enabled; under a full parallel run that can land after a spec has
 * measured a bar and before it taps, and the tap then hits the bar before.
 */
export async function scoreSettled(page: Page): Promise<void> {
  await untilStill(() =>
    viewport(page).evaluate((box) => {
      const cursor = box.querySelector('.at-cursor-bar')?.getBoundingClientRect();
      return JSON.stringify([
        window.scrollX,
        window.scrollY,
        box.scrollLeft,
        box.scrollTop,
        cursor && [cursor.x, cursor.y, cursor.width, cursor.height].map(Math.round),
      ]);
    }),
  );
}

/** The middle of the bar the cursor is on. */
export async function cursorBarPoint(page: Page): Promise<Point> {
  await scoreSettled(page);
  const box = await barCursorBox(page);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Scrolls the score box, and only the box, so the cursor's bar sits near its
 * top left: the cursor's bar and the one after it are then on screen at every
 * size, clear of the loop sheet. (Element.scrollIntoView would move
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

/** Whether the point is inside the box, edges included. */
export const contains = (box: Box, { x, y }: Point) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

/** Whether the two boxes share any area. */
export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

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

/**
 * The controls bar folds while playback runs (12 UX pass): the metronome, the
 * speed and "Show controls" stay; the rest is behind that button. Opens the
 * whole bar if it is folded; does nothing otherwise. Call it before using a
 * control that folds away (Back to start, the drum toggles, the volume, the
 * count-in) while the song may be playing.
 */
export async function showControls(page: Page): Promise<void> {
  const show = controls(page).getByRole('button', { name: 'Show controls' });
  if (await show.isVisible()) await show.click();
}

/** The count-in's segmented controls: how many bars, and (only with a count-in) when. */
export const countInGroup = (page: Page) =>
  controls(page).getByRole('radiogroup', { name: 'Count-in', exact: true });
export const countInModeGroup = (page: Page) =>
  controls(page).getByRole('radiogroup', { name: 'When to count in' });
/** The option on in each: assert with `toHaveValue('2')`, `toHaveValue('every_repeat')`. */
export const checkedCountIn = (page: Page) => countInGroup(page).locator('input:checked');
export const checkedCountInMode = (page: Page) => countInModeGroup(page).locator('input:checked');

const COUNT_IN_LABELS = { 0: 'Off', 1: '1 bar', 2: '2 bars' } as const;
const COUNT_IN_MODE_LABELS = { start: 'At the start', every_repeat: 'Every repeat' } as const;

/** Chooses the count-in's bars in the controls bar, opening the bar first if playback folded it. */
export async function chooseCountIn(page: Page, bars: 0 | 1 | 2): Promise<void> {
  await showControls(page);
  await countInGroup(page)
    .locator('label')
    .filter({ hasText: new RegExp(`^${COUNT_IN_LABELS[bars]}$`) })
    .click();
  await expect(checkedCountIn(page)).toHaveValue(String(bars));
}

/** Chooses when the count-in plays; there must be a count-in for the choice to show. */
export async function chooseCountInMode(
  page: Page,
  mode: keyof typeof COUNT_IN_MODE_LABELS,
): Promise<void> {
  await showControls(page);
  await countInModeGroup(page)
    .locator('label')
    .filter({ hasText: new RegExp(`^${COUNT_IN_MODE_LABELS[mode]}$`) })
    .click();
  await expect(checkedCountInMode(page)).toHaveValue(mode);
}

interface StatusWindow {
  __drumPalPlayer?: { getSnapshot(): { status: string }; subscribe(listener: () => void): void };
  __statuses?: string[];
}

/**
 * Records every status the player goes through from now on, starting with
 * the one it is in, through `window.__drumPalPlayer`. Read it back with
 * `recordedStatuses`: a spec that says playback never stopped asserts on it.
 */
export async function recordStatuses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window as unknown as StatusWindow;
    const player = debug.__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    const statuses = [player.getSnapshot().status];
    debug.__statuses = statuses;
    player.subscribe(() => {
      const { status } = player.getSnapshot();
      if (statuses.at(-1) !== status) statuses.push(status);
    });
  });
}

export const recordedStatuses = (page: Page) =>
  page.evaluate(() => (window as unknown as StatusWindow).__statuses ?? []);
