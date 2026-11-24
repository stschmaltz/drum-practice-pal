/// <reference lib="dom" />
/**
 * Locators and steps for the song page's loop panel (Unit 08), shared by
 * loops.spec.ts, loop-scroll.spec.ts and count-in.spec.ts. The panel is a
 * bottom sheet below 1024 px (a phone, a tablet in portrait) and a column
 * beside the score from there up; these steps work on both.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './auth';
import { viewport, type Box } from './playerPage';

export const loopPanel = (page: Page) => page.getByTestId('loop-panel');
export const loopForm = (page: Page) => loopPanel(page).getByRole('form');
export const firstBarField = (page: Page) => loopForm(page).getByLabel('First bar');
export const lastBarField = (page: Page) => loopForm(page).getByLabel('Last bar');
export const loopNameField = (page: Page) => loopForm(page).getByLabel('Name');
export const targetField = (page: Page) => loopForm(page).getByLabel(/Target speed/);
export const saveLoopButton = (page: Page) =>
  loopForm(page).getByRole('button', { name: 'Save loop' });
export const newLoopButton = (page: Page) =>
  loopPanel(page).getByRole('button', { name: 'New loop' });
export const activeLoopLine = (page: Page) => page.getByTestId('active-loop');
export const loopSpeed = (page: Page) => loopPanel(page).getByRole('group', { name: 'Loop speed' });
export const loopPercentField = (page: Page) => loopSpeed(page).getByLabel('Speed %');
export const loopBpmField = (page: Page) => loopSpeed(page).getByLabel('BPM');
export const saveSpeedButton = (page: Page) =>
  loopSpeed(page).getByRole('button', { name: 'Save speed' });
export const savedSpeed = (page: Page) => loopPanel(page).getByTestId('loop-saved-speed');

/** One saved loop's entry in the panel's list. */
export const loopItem = (page: Page, name: string) =>
  loopPanel(page).getByRole('listitem').filter({ hasText: name });

/** The loop's Play button, which reads "Restart loop" while that loop is the one playing. */
export const playLoopButton = (page: Page, name: string) =>
  loopItem(page, name).getByRole('button', { name: new RegExp(`^(Play|Restart) loop ${name}$`) });

/**
 * Mirrors loopPanelLayout.ts: the loop panel is a column from this width, a
 * sheet below. Apart from the player's 768 px layout breakpoint
 * (`expectedLayout`): a tablet in portrait has page layout and the sheet.
 */
const LOOP_COLUMN_MIN_WIDTH = 1024;

/** Where the app should draw the loop panel at the page's current viewport. */
export const expectedLoopPanel = (page: Page): 'sheet' | 'column' =>
  (page.viewportSize()?.width ?? 0) >= LOOP_COLUMN_MIN_WIDTH ? 'column' : 'sheet';

/** The sheet's header, which opens and closes it. Hidden from 1024 px. */
const sheetHeader = (page: Page) => loopPanel(page).locator('button[aria-controls]');

/** The column's toggle beside the status line. Hidden below 1024 px. */
const columnToggle = (page: Page) => page.getByRole('button', { name: /^(Show|Hide) loops$/ });

/**
 * Whatever opens and closes the panel at this width, the one toggle on show
 * there; its `aria-expanded` says whether the panel is open.
 */
export const loopPanelToggle = (page: Page) =>
  expectedLoopPanel(page) === 'sheet' ? sheetHeader(page) : columnToggle(page);

/** Opens the loop panel if it is closed: the sheet below 1024 px, the column from there. */
export async function openLoopPanel(page: Page): Promise<void> {
  const toggle = loopPanelToggle(page);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

export async function closeLoopPanel(page: Page): Promise<void> {
  const toggle = loopPanelToggle(page);
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
}

export interface NewLoop {
  name: string;
  firstBar: number;
  lastBar: number;
  /** Whole percent; left empty when not given. */
  target?: number;
}

/**
 * Saves a new loop by typing its bars, at the speed playing now. The saved
 * loop becomes the one the player repeats. Picking bars on the score is
 * loops.spec.ts's subject.
 */
export async function saveNewLoop(page: Page, loop: NewLoop): Promise<void> {
  await openLoopPanel(page);
  await newLoopButton(page).click();
  await firstBarField(page).fill(String(loop.firstBar));
  await lastBarField(page).fill(String(loop.lastBar));
  await loopNameField(page).fill(loop.name);
  if (loop.target !== undefined) await targetField(page).fill(String(loop.target));
  await saveLoopButton(page).click();
  await expect(loopForm(page)).toHaveCount(0);
  await expect(activeLoopLine(page)).toContainText(loop.name);
}

/** The highlighted blocks over the score, one per line of music the range touches. */
export async function highlightBoxes(page: Page): Promise<Box[]> {
  return viewport(page)
    .locator('.bar-highlight > div')
    .evaluateAll((blocks) =>
      blocks.map((block) => {
        const rect = block.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
}

/** Types into a field that commits on Enter (the loop speed fields). */
export async function commit(field: Locator, text: string): Promise<void> {
  await field.fill(text);
  await field.press('Enter');
}

/** Sets the playing loop's speed to a whole percent and saves it as the loop's speed, opening the panel first. */
export async function saveLoopSpeed(page: Page, percent: number): Promise<void> {
  await openLoopPanel(page);
  await commit(loopPercentField(page), String(percent));
  await saveSpeedButton(page).click();
  await expect(saveSpeedButton(page)).toBeDisabled();
}
