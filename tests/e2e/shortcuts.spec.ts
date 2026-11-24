/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, test } from './auth';
import {
  activeLoopLine,
  loopItem,
  loopNameField,
  loopPanel,
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
import { loopsOf } from './practicePage';

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

test('with a loop playing, the speed keys, M, D, S and C work it and playback never stops', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'multi-track', 'Multi Track');
  await countInSelect(page).selectOption('0');
  await saveNewLoop(page, { name: 'Verse', firstBar: 2, lastBar: 3 });
  await focusNothing(page);
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await recordStatuses(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(speed(page)).toHaveText('90%');
  const metronomeWas = await metronomeButton(page).getAttribute('aria-pressed');
  await page.keyboard.press('m');
  await expect(metronomeButton(page)).not.toHaveAttribute('aria-pressed', metronomeWas ?? '');
  await page.keyboard.press('s');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('d');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('c');
  await expect(countInSelect(page)).toHaveValue('1');

  // Still the loop, at the speed the keys set, and never stopped on the way.
  await expect(activeLoopLine(page)).toContainText('Looping Verse');
  await expect.poll(() => barNumber(page)).toBeGreaterThanOrEqual(2);
  expect(await barNumber(page)).toBeLessThanOrEqual(3);
  await expect(playButton(page)).toHaveText('Pause');
  expect(await recordedStatuses(page)).toEqual(['playing']);
});

test('the Shortcuts button opens the list from 768 px; on a phone it is ? alone', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const shortcutsButton = page.getByRole('button', { name: 'Shortcuts' });
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });

  if (expectedLayout(page) === 'horizontal') {
    await expect(shortcutsButton).toBeHidden();
    return;
  }
  await shortcutsButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Previous or next loop', { exact: false })).toBeVisible();
  // A click outside it closes it, and focus goes back to the button.
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(shortcutsButton).toBeFocused();
});

test('while the loop form is open, the loop keys do nothing and the others still work', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await page.getByRole('button', { name: 'Exit loop' }).click();
  await openLoopPanel(page);
  await newLoopButton(page).click();
  // The form has the focus, not one of its fields.
  await expect(loopNameField(page)).not.toBeFocused();
  const barBefore = await status(page).textContent();

  await page.keyboard.press('PageDown');
  await page.keyboard.press('ArrowRight');
  // The keys arrived: M, pressed the same way, works.
  const metronomeWas = await metronomeButton(page).getAttribute('aria-pressed');
  await page.keyboard.press('m');
  await expect(metronomeButton(page)).not.toHaveAttribute('aria-pressed', metronomeWas ?? '');

  await expect(activeLoopLine(page)).toHaveCount(0);
  await expect(status(page)).toHaveText(barBefore ?? '');
});

test('Mark finished and Reopen keep focus on the loop while the write is on its way', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await saveNewLoop(page, { name: 'Chorus', firstBar: 9, lastBar: 12 });
  await page.getByRole('button', { name: 'Exit loop' }).click();
  await openLoopPanel(page);

  // Each status write is held until let go: the loop's new button renders while it is pending.
  const held: (() => void)[] = [];
  await page.route('**/rest/v1/loops*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await new Promise<void>((resolve) => held.push(resolve));
    await route.continue();
  });
  const releaseWrite = async () => {
    await expect.poll(() => held.length).toBe(1);
    held.shift()?.();
  };

  await loopItem(page, 'Verse').getByRole('button', { name: 'Mark finished Verse' }).focus();
  await page.keyboard.press('Enter');
  const reopen = loopPanel(page).getByRole('button', { name: 'Reopen Verse' });
  await expect(reopen).toBeFocused();
  await expect(reopen).toHaveAttribute('aria-disabled', 'true');
  await releaseWrite();
  await expect(reopen).not.toHaveAttribute('aria-disabled');
  await expect(reopen).toBeFocused();
  await expect
    .poll(async () => (await loopsOf(user)).map((loop) => loop.status))
    .toContain('finished');

  await page.keyboard.press('Enter');
  const finish = loopPanel(page).getByRole('button', { name: 'Mark finished Verse' });
  await expect(finish).toBeFocused();
  await releaseWrite();
  await expect(finish).not.toHaveAttribute('aria-disabled');
  await expect(finish).toBeFocused();
  await expect
    .poll(async () => (await loopsOf(user)).map((loop) => loop.status))
    .toEqual(['active', 'active']);
});
