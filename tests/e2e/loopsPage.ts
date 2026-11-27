/// <reference lib="dom" />
/**
 * Locators and steps for the song page's loop panel (Unit 08), shared by
 * loops.spec.ts, loop-scroll.spec.ts and count-in.spec.ts. The panel is a
 * bottom sheet below 1024 px (a phone, a tablet in portrait) and a column
 * beside the score from there up; these steps work on both.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './auth';
import { speedSlider, viewport, type Box } from './playerPage';

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
 * The app's query is 64rem; in px only at Playwright's default 16 px font
 * size, so a spec that changes the font size can't use these steps.
 */
const LOOP_COLUMN_MIN_WIDTH = 1024;

/** Where the app should draw the loop panel at the page's current viewport. */
export const expectedLoopPanel = (page: Page): 'sheet' | 'column' =>
  (page.viewportSize()?.width ?? 0) >= LOOP_COLUMN_MIN_WIDTH ? 'column' : 'sheet';

/**
 * The sheet's header, which opens and closes it. Hidden from 1024 px. The
 * panel's own child, so an open "More" button inside it, which also carries
 * `aria-controls`, isn't matched too (Copilot review on #18).
 */
export const loopSheetHeader = (page: Page) =>
  loopPanel(page).locator(':scope > button[aria-controls]');

/** The column's toggle beside the status line. Hidden below 1024 px. */
const columnToggle = (page: Page) => page.getByRole('button', { name: /^(Show|Hide) loops$/ });

/**
 * Whatever opens and closes the panel at this width, the one toggle on show
 * there; its `aria-expanded` says whether the panel is open.
 */
export const loopPanelToggle = (page: Page) =>
  expectedLoopPanel(page) === 'sheet' ? loopSheetHeader(page) : columnToggle(page);

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
  await fillLoopForm(page, loop);
  await expect(loopForm(page)).toHaveCount(0);
  await expect(activeLoopLine(page)).toContainText(loop.name);
}

/** Types a new loop into the open loop form and saves it. */
export async function fillLoopForm(page: Page, loop: NewLoop): Promise<void> {
  await firstBarField(page).fill(String(loop.firstBar));
  await lastBarField(page).fill(String(loop.lastBar));
  await loopNameField(page).fill(loop.name);
  if (loop.target !== undefined) await targetField(page).fill(String(loop.target));
  await saveLoopButton(page).click();
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

/**
 * "Exit loop", in the playing loop's item in the panel (12 UX pass: there is
 * no line above the score any more). Opens the panel first (on a phone or a
 * tablet in portrait "Play loop" has closed the sheet) and closes it again after.
 */
export async function exitLoop(page: Page): Promise<void> {
  const wasOpen = (await loopPanelToggle(page).getAttribute('aria-expanded')) === 'true';
  await openLoopPanel(page);
  await activeLoopLine(page).getByRole('button', { name: 'Exit loop' }).click();
  await expect(activeLoopLine(page)).toHaveCount(0);
  // As it was: a sheet left open would lie over the score the spec goes on to tap.
  if (!wasOpen) await closeLoopPanel(page);
}

/** A loop's Edit, Show / Hide history or Delete, which live in its "More" menu. */
export async function chooseLoopAction(
  page: Page,
  name: string,
  action: 'Edit' | 'History' | 'Delete',
): Promise<void> {
  await openLoopPanel(page);
  await loopItem(page, name)
    .getByRole('button', { name: `More actions for ${name}` })
    .click();
  await loopPanel(page)
    .getByRole('menuitem', { name: action === 'History' ? /history$/ : action })
    .click();
}

/**
 * Sets the speed playing now, in whole percent: with the controls bar's
 * slider in jam mode, with the loop's own Speed % while a loop plays (the
 * slider gives way to it then). Leaves the loop panel as it found it.
 */
export async function setSpeed(page: Page, percent: number): Promise<void> {
  const slider = speedSlider(page);
  if (await slider.isVisible()) {
    await slider.fill(String(percent));
    return;
  }
  const toggle = loopPanelToggle(page);
  const wasOpen = (await toggle.getAttribute('aria-expanded')) === 'true';
  await openLoopPanel(page);
  await commit(loopPercentField(page), String(percent));
  await expect(loopPercentField(page)).toHaveValue(String(percent));
  if (!wasOpen) await closeLoopPanel(page);
}

/**
 * The playing loop is this one (12 UX pass: marked in its own item, where its
 * name and "Bars 9 to 12 · …" line are). Works with the sheet closed.
 */
export async function expectLooping(page: Page, name: string, bars?: string): Promise<void> {
  // The item's first paragraph is the name (the buttons' hidden " Verse" would match by text).
  await expect(activeLoopLine(page).locator('p').first()).toHaveText(name);
  if (bars !== undefined) await expect(activeLoopLine(page)).toContainText(`${bars} ·`);
}
