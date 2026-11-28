/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, test } from './auth';
import {
  activeLoopLine,
  playLoopButton,
  loopItem,
  loopNameField,
  loopPanel,
  loopSheetHeader,
  newLoopButton,
  openLoopPanel,
  saveNewLoop,
  exitLoop,
  expectLooping,
} from './loopsPage';
import {
  barNumber,
  chooseCountIn,
  checkedCountIn,
  drumsOnlyButton,
  expectedLayout,
  metronomeButton,
  muteDrumsButton,
  openFixture,
  playButton,
  recordedStatuses,
  recordStatuses,
  showControls,
  status,
} from './playerPage';
import { loopsOf } from './practicePage';

// Unit 10: keyboard shortcuts and page-turner pedals on the song page. A
// pedal is a keyboard to the browser: it sends Page Up and Page Down (or the
// arrow keys), which is what these press.

const speed = (page: Page) => page.getByTestId('jam-speed');

/** Takes focus off whatever was last clicked, as a drummer's hands leave the screen for the kit. */
const focusNothing = (page: Page) =>
  page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

/** Presses M and waits for the Metronome toggle to flip, whichever way it started. */
async function pressMAndSeeMetronomeFlip(page: Page): Promise<void> {
  const was = await metronomeButton(page).getAttribute('aria-pressed');
  await page.keyboard.press('m');
  await expect(metronomeButton(page)).not.toHaveAttribute('aria-pressed', was ?? '');
}

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

  await pressMAndSeeMetronomeFlip(page);

  await page.keyboard.press('d');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'false');

  const countInWas = Number(await checkedCountIn(page).inputValue());
  await page.keyboard.press('c');
  await expect(checkedCountIn(page)).toHaveValue(String((countInWas + 1) % 3));
});

test('a pedal’s Page Up and Page Down, or the arrows, switch loops without stopping playback', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await chooseCountIn(page, 0);
  await saveNewLoop(page, { name: 'Intro', firstBar: 1, lastBar: 2 });
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await focusNothing(page);

  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await recordStatuses(page);

  await page.keyboard.press('PageUp');
  await expectLooping(page, 'Intro');
  await expect.poll(() => barNumber(page)).toBeLessThanOrEqual(2);
  await page.keyboard.press('ArrowRight');
  await expectLooping(page, 'Verse');
  await expect.poll(() => barNumber(page)).toBeGreaterThanOrEqual(5);
  // The last loop: nowhere further to go.
  await page.keyboard.press('PageDown');
  await expectLooping(page, 'Verse');
  await page.keyboard.press('ArrowLeft');
  await expectLooping(page, 'Intro');

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
  await exitLoop(page);
  await focusNothing(page);

  await page.keyboard.press('PageDown');

  await expectLooping(page, 'Verse');
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

test('focus stays in the shortcut list after a click on its heading, and the page behind takes no clicks', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await focusNothing(page);
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  const close = dialog.getByRole('button', { name: 'Close' });
  await expect(close).toBeFocused();

  // Chromium moves its Tab starting point to where the click landed, the heading, with focus on <body>.
  await dialog.getByRole('heading', { name: 'Keyboard shortcuts' }).click();
  const focusInDialog = () =>
    page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
  for (const key of ['Shift+Tab', 'Shift+Tab', 'Tab', 'Tab']) {
    await page.keyboard.press(key);
    expect(await focusInDialog(), `focus after ${key}`).toBe(true);
  }
  await dialog.getByText('Keys do nothing while you type', { exact: false }).click();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();

  // Behind the backdrop the page is inert: Play under it can't be reached by a press either.
  expect(await playButton(page).evaluate((button) => button.closest('[inert]') !== null)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('[inert]') === null)).toBe(true);
  await expect(playButton(page)).toHaveText('Play');
});

for (const by of ['a click', 'Enter'] as const) {
  // 20 batch 4, 13.28a: the press closes the sheet the button is in, and focus was left on
  // the hidden button (so on <body>, and a keyboard user began again from the top of the page).
  test(`Play loop by ${by} closes the sheet and hands focus to its header: Space then pauses without opening it, and Tab goes on from there`, async ({
    user,
    page,
  }, testInfo) => {
    await openFixture(page, user, 'groove-120', 'Groove 120');
    await chooseCountIn(page, 0);
    await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
    await openLoopPanel(page);
    if (by === 'Enter') {
      await playLoopButton(page, 'Verse').focus();
      await page.keyboard.press('Enter');
    } else {
      await playLoopButton(page, 'Verse').click();
    }
    await expect(playButton(page)).toHaveText('Pause');
    await expect(loopSheetHeader(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(loopSheetHeader(page)).toBeFocused();
    await recordStatuses(page);

    // Space is play/pause wherever focus is: on the header it must not also press it.
    await page.keyboard.press('Space');

    await expect(playButton(page)).toHaveText('Play');
    // Paused once and left so, with the sheet still closed and focus where it was.
    await page.waitForTimeout(500);
    expect(await recordedStatuses(page)).toEqual(['playing', 'ready']);
    await expect(loopSheetHeader(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(loopSheetHeader(page)).toBeFocused();

    // Tab goes on from the header, past the closed sheet's hidden controls: to the tab bar on
    // a phone; from 768 px the header is the page's last stop and Tab leaves the page.
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => ({
      inSheet: document.activeElement?.closest('[data-testid="loop-panel"]') != null,
      inTabBar: document.activeElement?.closest('nav[aria-label="Main"]') != null,
      onBody: document.activeElement === document.body,
    }));
    expect(next.inSheet).toBe(false);
    if (testInfo.project.name === 'phone') expect(next.inTabBar).toBe(true);
    else expect(next.onBody).toBe(true);
    // And back: the header is one stop from there, not a walk from the top of the page.
    await page.keyboard.press('Shift+Tab');
    await expect(loopSheetHeader(page)).toBeFocused();

    // Enter on it is the way back in, to the loop that was played.
    await page.keyboard.press('Enter');
    await expect(loopSheetHeader(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(playLoopButton(page, 'Verse')).toBeVisible();
  });
}

test('with a loop playing, the speed keys, M, D, S and C work it and playback never stops', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'multi-track', 'Multi Track');
  await chooseCountIn(page, 0);
  await saveNewLoop(page, { name: 'Verse', firstBar: 2, lastBar: 3 });
  await focusNothing(page);
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await recordStatuses(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(speed(page)).toHaveText('90%');
  await pressMAndSeeMetronomeFlip(page);
  // The keys act on the player; the drum toggles and the count-in, folded away while playing,
  // are brought out to read what the keys did.
  await showControls(page);
  await page.keyboard.press('s');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('d');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('c');
  await expect(checkedCountIn(page)).toHaveValue('1');

  // Still the loop, at the speed the keys set, and never stopped on the way.
  await expectLooping(page, 'Verse');
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
  await exitLoop(page);
  await openLoopPanel(page);
  await newLoopButton(page).click();
  // The form has the focus, not one of its fields.
  await expect(loopNameField(page)).not.toBeFocused();
  const barBefore = await status(page).textContent();

  await page.keyboard.press('PageDown');
  await page.keyboard.press('ArrowRight');
  // The keys arrived: M, pressed the same way, works.
  await pressMAndSeeMetronomeFlip(page);

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
  await exitLoop(page);
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
  // Locked as assistive tech and the eye see it (dimmed by `buttonBase`), not only by attribute.
  await expect(reopen).toBeDisabled();
  await expect(reopen).toHaveCSS('opacity', '0.5');
  // Enter on it sends nothing: a second PATCH would be held too, and the next release counts them.
  await page.keyboard.press('Enter');
  await releaseWrite();
  await expect(reopen).not.toHaveAttribute('aria-disabled');
  await expect(reopen).toBeEnabled();
  await expect(reopen).toHaveCSS('opacity', '1');
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

/** This device's single-letter shortcuts switch in Settings, on a page of its own. */
const letterShortcutsToggle = (page: Page) =>
  page.getByRole('checkbox', { name: 'Single-letter shortcuts' });

test('with single-letter shortcuts off in Settings, M, D, S, C and ? do nothing; Space and the arrows still work', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'multi-track', 'Multi Track');
  const songUrl = page.url();

  await page.goto('/settings');
  await expect(letterShortcutsToggle(page)).toBeChecked();
  await letterShortcutsToggle(page).uncheck();
  await expect(letterShortcutsToggle(page)).not.toBeChecked();

  await page.goto(songUrl);
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await focusNothing(page);
  const metronomeWas = await metronomeButton(page).getAttribute('aria-pressed');
  const countInWas = await checkedCountIn(page).inputValue();

  for (const key of ['m', 'd', 's', 'c', 'Shift+?']) await page.keyboard.press(key);
  // The keys did reach the page: one that isn't a single character, pressed after them, acts.
  await page.keyboard.press('ArrowUp');
  await expect(speed(page)).toHaveText('105%');
  await expect(metronomeButton(page)).toHaveAttribute('aria-pressed', metronomeWas ?? '');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(checkedCountIn(page)).toHaveValue(countInWas);
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);

  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Play');

  // Turned back on in another tab, with the song page left open: the next press acts, no reload.
  const settingsTab = await page.context().newPage();
  try {
    await settingsTab.goto('/settings');
    await letterShortcutsToggle(settingsTab).check();
    await expect(letterShortcutsToggle(settingsTab)).toBeChecked();
  } finally {
    await settingsTab.close();
  }
  await page.bringToFront();
  await focusNothing(page);
  await pressMAndSeeMetronomeFlip(page);
});

// 12 UX pass, Test: the count-in is a group of radios, which keep their arrows.
test('on a focused count-in choice the arrows move the choice, and Space still plays and pauses', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await chooseCountIn(page, 0);
  await expect(checkedCountIn(page)).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(checkedCountIn(page)).toHaveValue('1');
  await expect(checkedCountIn(page)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(checkedCountIn(page)).toHaveValue('0');
  // The arrows went to the radios, not to the speed.
  await page.keyboard.press('ArrowUp');
  await expect(checkedCountIn(page)).toHaveValue('2');
  await expect(speed(page)).toHaveText('100%');

  await chooseCountIn(page, 0);
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Play');
  await expect(checkedCountIn(page)).toHaveValue('0');
});
