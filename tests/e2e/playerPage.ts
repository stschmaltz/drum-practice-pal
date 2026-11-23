/// <reference lib="dom" />
/**
 * Locators and steps for the song page's player, shared by player.spec.ts
 * and jam.spec.ts.
 */
import { join } from 'node:path';
import type { Page } from '@playwright/test';
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
