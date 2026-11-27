/// <reference lib="dom" />
/**
 * Locators and steps for the song page's loop panel (Unit 08), shared by
 * loops.spec.ts, loop-scroll.spec.ts and count-in.spec.ts. The panel is a
 * sheet over the score at every size (full width below 1024 px, the
 * bottom-right corner from there), opened and closed by its header.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './auth';
import { speedSlider, viewport, type Box } from './playerPage';

export const loopPanel = (page: Page) => page.getByTestId('loop-panel');
export const loopForm = (page: Page) => loopPanel(page).getByRole('form');
export const firstBarField = (page: Page) => loopForm(page).getByLabel('First bar');
export const lastBarField = (page: Page) => loopForm(page).getByLabel('Last bar');
export const loopNameField = (page: Page) => loopForm(page).getByLabel('Name');
export const saveLoopButton = (page: Page) =>
  loopForm(page).getByRole('button', { name: 'Save loop' });
export const newLoopButton = (page: Page) =>
  loopPanel(page).getByRole('button', { name: 'New loop' });
export const activeLoopLine = (page: Page) => page.getByTestId('active-loop');
export const loopSpeed = (page: Page) => loopPanel(page).getByRole('group', { name: 'Loop speed' });
export const loopPercentField = (page: Page) => loopSpeed(page).getByLabel('Speed %');
export const loopBpmField = (page: Page) => loopSpeed(page).getByLabel('BPM');

/** One saved loop's entry in the panel's list. */
export const loopItem = (page: Page, name: string) =>
  loopPanel(page).getByRole('listitem').filter({ hasText: name });

/** The loop's Play button, which reads "Restart loop" while that loop is the one playing. */
export const playLoopButton = (page: Page, name: string) =>
  loopItem(page, name).getByRole('button', { name: new RegExp(`^(Play|Restart) loop ${name}$`) });

/**
 * The sheet's header, which opens and closes it. The panel's own child, so an
 * open "More" button inside it, which also carries `aria-controls`, isn't
 * matched too (Copilot review on #18).
 */
export const loopSheetHeader = (page: Page) =>
  loopPanel(page).locator(':scope > button[aria-controls]');

/** What opens and closes the panel; its `aria-expanded` says whether it is open. */
export const loopPanelToggle = loopSheetHeader;

/** Opens the loop panel if it is closed. */
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

/**
 * Sets the playing loop's speed to a whole percent, opening the panel first.
 * The loop saves it by itself; this waits until the loop's line shows it.
 */
export async function saveLoopSpeed(page: Page, percent: number): Promise<void> {
  await openLoopPanel(page);
  await commit(loopPercentField(page), String(percent));
  await expect(activeLoopLine(page)).toContainText(` · ${percent}%`);
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
