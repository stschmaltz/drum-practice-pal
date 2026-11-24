/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, test } from './auth';
import {
  activeLoopLine,
  loopNameField,
  newLoopButton,
  openLoopPanel,
  playLoopButton,
  saveNewLoop,
} from './loopsPage';
import {
  barNumber,
  countInSelect,
  drumsOnlyButton,
  expectedLayout,
  muteDrumsButton,
  openFixture,
  playButton,
  recordedStatuses,
  recordStatuses,
  status,
} from './playerPage';

// Unit 10: keyboard shortcuts and page-turner pedals on the song page. A
// pedal is a keyboard to the browser: it sends Page Up and Page Down (or the
// arrow keys), which is what these press.

const speed = (page: Page) => page.getByTestId('jam-speed');
const metronomeButton = (page: Page) =>
  page.getByRole('region', { name: 'Player controls' }).getByRole('button', { name: 'Metronome' });

/** Takes focus off whatever was last clicked, as a drummer's hands leave the screen for the kit. */
const focusNothing = (page: Page) =>
  page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

test('Space plays and pauses; the arrows, M, D, S and C work the controls', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'multi-track', 'Multi Track');
  await focusNothing(page);

  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Play');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(speed(page)).toHaveText('110%');
  await page.keyboard.press('ArrowDown');
  await expect(speed(page)).toHaveText('105%');

  const metronomeWas = await metronomeButton(page).getAttribute('aria-pressed');
  await page.keyboard.press('m');
  await expect(metronomeButton(page)).not.toHaveAttribute('aria-pressed', metronomeWas ?? '');

  await page.keyboard.press('d');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'false');

  const countInWas = Number(await countInSelect(page).inputValue());
  await page.keyboard.press('c');
  await expect(countInSelect(page)).toHaveValue(String((countInWas + 1) % 3));
});

test('a pedal’s Page Up and Page Down, or the arrows, switch loops without stopping playback', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('0');
  await saveNewLoop(page, { name: 'Intro', firstBar: 1, lastBar: 2 });
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await focusNothing(page);

  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await recordStatuses(page);

  await page.keyboard.press('PageUp');
  await expect(activeLoopLine(page)).toContainText('Looping Intro');
  await expect.poll(() => barNumber(page)).toBeLessThanOrEqual(2);
  await page.keyboard.press('ArrowRight');
  await expect(activeLoopLine(page)).toContainText('Looping Verse');
  await expect.poll(() => barNumber(page)).toBeGreaterThanOrEqual(5);
  // The last loop: nowhere further to go.
  await page.keyboard.press('PageDown');
  await expect(activeLoopLine(page)).toContainText('Looping Verse');
  await page.keyboard.press('ArrowLeft');
  await expect(activeLoopLine(page)).toContainText('Looping Intro');

  await expect(playButton(page)).toHaveText('Pause');
  expect(await recordedStatuses(page)).toEqual(['playing']);
  // The recorder does hear a change when there is one.
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Play');
  expect((await recordedStatuses(page)).length).toBeGreaterThan(1);
});

test('paused, a pedal sets the next loop up without playing it', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await page.getByRole('button', { name: 'Exit loop' }).click();
  await focusNothing(page);

  await page.keyboard.press('PageDown');

  await expect(activeLoopLine(page)).toContainText('Looping Verse');
  await expect(status(page)).toHaveText('Bar 5 of 16');
  await expect(playButton(page)).toHaveText('Play');
});

test('with no loops, the right and left arrows step a bar', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await focusNothing(page);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(status(page)).toHaveText('Bar 3 of 16');
  await page.keyboard.press('ArrowLeft');
  await expect(status(page)).toHaveText('Bar 2 of 16');
});

test('? lists the shortcuts and Escape closes the list; keys typed in a field stay in it', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await focusNothing(page);

  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  // Space presses Close rather than playing.
  await page.keyboard.press('Space');
  await expect(dialog).toHaveCount(0);
  await expect(playButton(page)).toHaveText('Play');
  await page.keyboard.press('?');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await openLoopPanel(page);
  await newLoopButton(page).click();
  await loopNameField(page).pressSequentially('Dms c ?');
  await expect(loopNameField(page)).toHaveValue('Dms c ?');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(playButton(page)).toHaveText('Play');
  await expect(dialog).toHaveCount(0);
});

test('Space after clicking Play loop pauses, rather than pressing the focused Restart loop', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('0');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await openLoopPanel(page);
  await playLoopButton(page, 'Verse').click();
  await expect(playButton(page)).toHaveText('Pause');
  await recordStatuses(page);
  // Clicked, the button keeps focus in Chromium. On a phone the press closes the sheet it is in.
  if (expectedLayout(page) === 'page') {
    await expect(page.getByRole('button', { name: 'Restart loop Verse' })).toBeFocused();
  }

  await page.keyboard.press('Space');

  await expect(playButton(page)).toHaveText('Play');
  // Paused once and left so: Restart loop would have played again.
  await page.waitForTimeout(500);
  expect(await recordedStatuses(page)).toEqual(['playing', 'ready']);
});
