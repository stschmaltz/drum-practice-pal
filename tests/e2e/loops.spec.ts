/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  activeLoopLine,
  closeLoopPanel,
  commit,
  firstBarField,
  highlightBoxes,
  lastBarField,
  loopBpmField,
  loopForm,
  loopItem,
  loopNameField,
  loopPanel,
  loopPercentField,
  loopSpeed,
  newLoopButton,
  openLoopPanel,
  playLoopButton,
  savedSpeed,
  saveLoopButton,
  saveNewLoop,
  saveSpeedButton,
  targetField,
} from './loopsPage';
import {
  barCursorBox,
  barNumber,
  boxOf,
  cursorBarPoint,
  expectedLayout,
  nextBarPoint,
  openFixture,
  playButton,
  scoreBox,
  scrollScoreToCursor,
  speedSlider,
  status,
  tapAndWaitForBar,
  viewport,
  windowScrollSettled,
  type Box,
  type Point,
} from './playerPage';

// Unit 08: loops. Saved bar ranges that play on repeat at their saved speed.
// Nothing here listens to audio; these check what the page shows and saves.

const bpm = (page: Page) => page.getByTestId('jam-bpm');
const speed = (page: Page) => page.getByTestId('jam-speed');
const barsHint = (page: Page) => page.getByTestId('loop-bars-hint');

const contains = (box: Box, { x, y }: Point) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

/** Whether some highlighted block covers the point. */
async function highlighted(page: Page, point: Point): Promise<boolean> {
  return (await highlightBoxes(page)).some((box) => contains(box, point));
}

/**
 * Moves playback to bar 2 by tapping it (jam mode), and leaves the score box
 * scrolled so bars 2 and 3 are both in reach. Returns nothing: the cursor now
 * marks bar 2, which is how these specs find a bar on screen.
 */
async function putCursorOnBar2(page: Page): Promise<void> {
  const bar2 = await nextBarPoint(page);
  expect(await tapAndWaitForBar(page, bar2, 1)).toBe(2);
  // The status line moves first; alphaTab's cursor follows a moment later.
  await expect.poll(async () => contains(await barCursorBox(page), bar2)).toBe(true);
  await scrollScoreToCursor(page);
}

/** Samples the current bar for `ms` while the song plays. */
async function barsPlayedFor(page: Page, ms: number): Promise<Set<number>> {
  const seen = new Set<number>();
  const started = Date.now();
  while (Date.now() - started < ms) {
    seen.add(await barNumber(page));
    await page.waitForTimeout(100);
  }
  return seen;
}

test('tap the first bar, then the last: the bars are highlighted and saved as a loop', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await putCursorOnBar2(page);

  await openLoopPanel(page);
  await newLoopButton(page).click();
  await expect(barsHint(page)).toContainText('Tap the first bar');
  // Opening the form brings the score up under the sticky bar; measure once that has stopped.
  await windowScrollSettled(page);
  await scrollScoreToCursor(page);
  expect(await highlightBoxes(page)).toEqual([]);

  // First tap: bar 2 alone, highlighted, and the form asks for the other end.
  const bar2 = await cursorBarPoint(page);
  const bar3 = await nextBarPoint(page);
  await page.mouse.click(bar2.x, bar2.y);
  await expect(firstBarField(page)).toHaveValue('2');
  await expect(lastBarField(page)).toHaveValue('2');
  await expect(barsHint(page)).toContainText('Now tap the last bar');
  await expect.poll(() => highlighted(page, bar2)).toBe(true);
  expect(await highlighted(page, bar3)).toBe(false);

  // Second tap: the range, highlighted from the first bar to the last.
  await page.mouse.click(bar3.x, bar3.y);
  await expect(lastBarField(page)).toHaveValue('3');
  await expect(firstBarField(page)).toHaveValue('2');
  await expect.poll(() => highlighted(page, bar3)).toBe(true);
  expect(await highlighted(page, bar2)).toBe(true);

  // Picking bars never seeks: playback is still on bar 2, paused.
  await expect(status(page)).toHaveText('Bar 2 of 16');
  await expect(playButton(page)).toHaveText('Play');

  await loopNameField(page).fill('Tapped fill');
  await saveLoopButton(page).click();
  await expect(loopForm(page)).toHaveCount(0);
  await expect(loopItem(page, 'Tapped fill')).toContainText('Bars 2 to 3 · 100% (120 BPM)');

  // The new loop is the one the player repeats, still highlighted.
  await expect(activeLoopLine(page)).toContainText('Tapped fill');
  await expect(activeLoopLine(page)).toContainText('Bars 2 to 3');
  expect((await highlightBoxes(page)).length).toBeGreaterThan(0);

  // A tap seeks again now that the form is closed.
  await page.reload();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await openLoopPanel(page);
  await expect(loopItem(page, 'Tapped fill')).toContainText('Bars 2 to 3');
});

test('a mouse drag across bars picks them for a new loop, and never seeks', async ({
  user,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'a mouse drag; touch drags scroll the score');
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await putCursorOnBar2(page);
  const bar2 = await cursorBarPoint(page);
  const bar3 = await nextBarPoint(page);

  await page.mouse.move(bar2.x, bar2.y);
  await page.mouse.down();
  await page.mouse.move((bar2.x + bar3.x) / 2, (bar2.y + bar3.y) / 2, { steps: 5 });
  await page.mouse.move(bar3.x, bar3.y, { steps: 5 });
  // Shown while the button is still down, before anything opens.
  await expect.poll(() => highlighted(page, bar3)).toBe(true);
  await page.mouse.up();

  await expect(loopForm(page)).toBeVisible();
  await expect(firstBarField(page)).toHaveValue('2');
  await expect(lastBarField(page)).toHaveValue('3');
  // The click that ends a drag is not a tap: playback stayed on bar 2.
  await expect(status(page)).toHaveText('Bar 2 of 16');

  // Right to left gives the same range the right way round.
  await page.mouse.move(bar3.x, bar3.y);
  await page.mouse.down();
  await page.mouse.move(bar2.x, bar2.y, { steps: 8 });
  await page.mouse.up();
  await expect(firstBarField(page)).toHaveValue('2');
  await expect(lastBarField(page)).toHaveValue('3');

  await loopForm(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(loopForm(page)).toHaveCount(0);
  expect(await highlightBoxes(page)).toEqual([]);

  // A drag in jam mode that stays inside one bar is neither a loop nor a seek.
  await page.mouse.move(bar3.x, bar3.y);
  await page.mouse.down();
  await page.mouse.move(bar3.x + 30, bar3.y + 4, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(loopForm(page)).toHaveCount(0);
  await expect(status(page)).toHaveText('Bar 2 of 16');
});

test('a saved loop opens on another device at the same range and speed, with BPM from its first bar', async ({
  user,
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  // Bars 9 to 12 are after the tempo change: 90 BPM, not the song's opening 120.
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  await saveNewLoop(page, { name: 'After the change', firstBar: 9, lastBar: 12, target: 100 });
  await expect(status(page)).toHaveText('Bar 9 of 16');
  await expect(bpm(page)).toHaveText('90');

  // A typed BPM: 77 of 90 is 85.5556%, shown as 86%.
  await commit(loopBpmField(page), '77');
  await expect(loopPercentField(page)).toHaveValue('86');
  await expect(speed(page)).toHaveText('86%');
  await expect(bpm(page)).toHaveText('77');
  await expect(savedSpeed(page)).toHaveText('Saved: 100% (90 BPM)');
  await saveSpeedButton(page).click();
  await expect(savedSpeed(page)).toHaveText('Saved: 86% (77 BPM)');
  await expect(saveSpeedButton(page)).toBeDisabled();
  const songUrl = page.url();

  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await signIn(other, user, new URL(songUrl).pathname);
    await expect(playButton(other)).toBeEnabled({ timeout: 20_000 });
    // Every song opens in jam mode at 100%, at the song's first tempo.
    await expect(speed(other)).toHaveText('100%');
    await expect(bpm(other)).toHaveText('120');

    await openLoopPanel(other);
    await expect(loopItem(other, 'After the change')).toContainText(
      'Bars 9 to 12 · 86% (77 BPM) · target 100% (90 BPM)',
    );
    await playLoopButton(other, 'After the change').click();

    // The same range, the same speed, and the BPM the first device typed.
    await expect(playButton(other)).toHaveText('Pause');
    await expect(activeLoopLine(other)).toContainText('Bars 9 to 12');
    await expect(speed(other)).toHaveText('86%');
    await expect(bpm(other)).toHaveText('77');
    await expect(loopBpmField(other)).toHaveValue('77');
    await expect(loopPercentField(other)).toHaveValue('86');

    // It repeats those bars and no others. One pass is about 12.5 s at 77 BPM,
    // so speed it up to see the wrap: bars 9 to 12 at 200% take 5.3 s.
    await commit(loopPercentField(other), '200');
    await expect(bpm(other)).toHaveText('180');
    const bars = await barsPlayedFor(other, 8000);
    expect([...bars].sort((a, b) => a - b)).toEqual([9, 10, 11, 12]);
    await expect(playButton(other)).toHaveText('Pause');

    await playButton(other).click();
    await expect(playButton(other)).toHaveText('Play');
  } finally {
    await context.close();
  }
});

test('the loop speed shows % and BPM, each editable, with nudges; Save speed keeps it', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await speedSlider(page).fill('80');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  // A new loop saves at the speed playing now.
  await expect(savedSpeed(page)).toHaveText('Saved: 80% (96 BPM)');
  await expect(loopPercentField(page)).toHaveValue('80');
  await expect(loopBpmField(page)).toHaveValue('96');
  await expect(saveSpeedButton(page)).toBeDisabled();

  // Percent, then BPM follows.
  await commit(loopPercentField(page), '50');
  await expect(loopBpmField(page)).toHaveValue('60');
  await expect(speed(page)).toHaveText('50%');
  await expect(bpm(page)).toHaveText('60');

  // BPM, then percent follows: 85 of 120 is 70.83%.
  await commit(loopBpmField(page), '85');
  await expect(loopPercentField(page)).toHaveValue('71');
  await expect(bpm(page)).toHaveText('85');

  // Nudges move in whole percent from the percent on show.
  await loopSpeed(page).getByRole('button', { name: 'Faster by 1%' }).click();
  await expect(loopPercentField(page)).toHaveValue('72');
  await loopSpeed(page).getByRole('button', { name: 'Faster by 5%' }).click();
  await expect(loopPercentField(page)).toHaveValue('77');
  await loopSpeed(page).getByRole('button', { name: 'Slower by 1%' }).click();
  await loopSpeed(page).getByRole('button', { name: 'Slower by 5%' }).click();
  await expect(loopPercentField(page)).toHaveValue('71');
  await expect(loopBpmField(page)).toHaveValue('85');

  // Nonsense is ignored, and the bounds hold.
  await commit(loopBpmField(page), 'fast');
  await expect(loopBpmField(page)).toHaveValue('85');
  await commit(loopPercentField(page), '900');
  await expect(loopPercentField(page)).toHaveValue('200');

  // Until Save speed, the loop keeps its old speed.
  await commit(loopBpmField(page), '85');
  await expect(savedSpeed(page)).toHaveText('Saved: 80% (96 BPM)');
  await saveSpeedButton(page).click();
  await expect(savedSpeed(page)).toHaveText('Saved: 71% (85 BPM)');

  // Reopened, the loop plays at the BPM that was typed, not a rounded percent's.
  await page.reload();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(speed(page)).toHaveText('100%');
  await openLoopPanel(page);
  await playLoopButton(page, 'Verse').click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(loopBpmField(page)).toHaveValue('85');
  await expect(bpm(page)).toHaveText('85');
  await expect(status(page)).toContainText(/Bar [5-8] of 16/);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('edit a loop’s name, bars and target; delete it after confirming', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Intro', firstBar: 1, lastBar: 4 });
  await saveNewLoop(page, { name: 'Outro', firstBar: 13, lastBar: 16, target: 120 });
  await expect(loopItem(page, 'Outro')).toContainText('target 120% (144 BPM)');
  await expect(activeLoopLine(page)).toContainText('Outro');

  // Edit the loop that is playing: its new bars take over at once.
  await loopItem(page, 'Outro').getByRole('button', { name: 'Edit Outro' }).click();
  await expect(loopNameField(page)).toHaveValue('Outro');
  await expect(firstBarField(page)).toHaveValue('13');
  await expect(targetField(page)).toHaveValue('120');
  await loopNameField(page).fill('  Last chorus  ');
  await firstBarField(page).fill('9');
  await lastBarField(page).fill('12');
  await targetField(page).fill('');
  await saveLoopButton(page).click();
  await expect(loopForm(page)).toHaveCount(0);
  await expect(loopItem(page, 'Last chorus')).toContainText('Bars 9 to 12 · 100% (120 BPM)');
  await expect(loopItem(page, 'Last chorus')).not.toContainText('target');
  await expect(loopItem(page, 'Outro')).toHaveCount(0);
  await expect(activeLoopLine(page)).toContainText('Last chorus · Bars 9 to 12');
  await expect(status(page)).toHaveText('Bar 9 of 16');

  // What can't be saved says why, and saves nothing.
  await loopItem(page, 'Intro').getByRole('button', { name: 'Edit Intro' }).click();
  await loopNameField(page).fill('   ');
  await lastBarField(page).fill('17');
  await targetField(page).fill('500');
  await saveLoopButton(page).click();
  await expect(loopForm(page)).toContainText('Give the loop a name.');
  await expect(loopForm(page)).toContainText('Bars go from 1 to 16 in this song.');
  await expect(loopForm(page)).toContainText('Enter a target from 25 to 200%');
  await loopForm(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(loopItem(page, 'Intro')).toContainText('Bars 1 to 4');

  // Delete asks first, in the item, and Keep it backs out.
  await loopItem(page, 'Intro').getByRole('button', { name: 'Delete Intro' }).click();
  const confirm = loopPanel(page).getByRole('group', { name: 'Delete Intro' });
  await expect(confirm).toContainText('practice history is deleted too');
  await confirm.getByRole('button', { name: 'Keep it' }).click();
  await expect(loopItem(page, 'Intro')).toBeVisible();

  // Deleting the loop that is playing goes back to the whole song.
  await loopItem(page, 'Last chorus').getByRole('button', { name: 'Delete Last chorus' }).click();
  await loopPanel(page)
    .getByRole('group', { name: 'Delete Last chorus' })
    .getByRole('button', { name: 'Delete loop' })
    .click();
  await expect(loopItem(page, 'Last chorus')).toHaveCount(0);
  await expect(activeLoopLine(page)).toHaveCount(0);
  expect(await highlightBoxes(page)).toEqual([]);

  // Both changes are saved, not just shown.
  await page.reload();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await openLoopPanel(page);
  await expect(loopItem(page, 'Intro')).toContainText('Bars 1 to 4');
  await expect(loopPanel(page).getByRole('listitem')).toHaveCount(1);
});

test('Exit loop goes back to the whole song without stopping playback', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await speedSlider(page).fill('200');
  await saveNewLoop(page, { name: 'One bar', firstBar: 5, lastBar: 5 });
  await closeLoopPanel(page);

  // A one-bar loop: playback never leaves bar 5.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  expect([...(await barsPlayedFor(page, 3000))]).toEqual([5]);

  await activeLoopLine(page).getByRole('button', { name: 'Exit loop' }).click();
  await expect(activeLoopLine(page)).toHaveCount(0);
  await expect(playButton(page)).toHaveText('Pause');
  // Free of the range, the song plays on past bar 5.
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(6);
  expect(await highlightBoxes(page)).toEqual([]);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('in a song with a repeat, a loop inside the repeat plays just its bars', async ({
  user,
  page,
}) => {
  // Bars 3 and 4 of this fixture play twice; a loop over them is one playthrough.
  await openFixture(page, user, 'repeats', 'Repeats');
  await expect(status(page)).toHaveText('Bar 1 of 8');
  await speedSlider(page).fill('200');
  await saveNewLoop(page, { name: 'Repeated bars', firstBar: 3, lastBar: 4 });
  await expect(status(page)).toHaveText('Bar 3 of 8');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  // Two bars at 240 BPM are two seconds a pass: several passes, only bars 3 and 4.
  const bars = await barsPlayedFor(page, 6000);
  expect([...bars].sort((a, b) => a - b)).toEqual([3, 4]);

  // Out of the loop, a tap on the bar after the cursor's seeks to that bar's number.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await activeLoopLine(page).getByRole('button', { name: 'Exit loop' }).click();
  // Only the phone's sheet is in the way of the score; closing the side panel
  // would lay the score out again while the tap point is being measured.
  if (expectedLayout(page) === 'horizontal') await closeLoopPanel(page);
  const from = await barNumber(page);
  await scrollScoreToCursor(page);
  const landed = await tapAndWaitForBar(page, await nextBarPoint(page), from);
  expect(landed).toBe(from + 1);
});

test('the loop panel is a bottom sheet on a phone and a side panel from a tablet up', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await openLoopPanel(page);
  await expect(newLoopButton(page)).toBeVisible();
  const panel = await boxOf(loopPanel(page), 'loop panel');
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport size');

  if (expectedLayout(page) === 'horizontal') {
    // Full width, sitting on the tab bar, and short enough to leave the score in reach.
    const tabBar = await boxOf(page.locator('nav[aria-label="Main"]:visible'), 'tab bar');
    expect(panel.x).toBe(0);
    expect(panel.width).toBe(size.width);
    expect(Math.abs(panel.y + panel.height - tabBar.y)).toBeLessThanOrEqual(2);
    expect(panel.height).toBeLessThan(size.height * 0.6);

    // Closed, only its header is left, and the page behind is clear of it.
    await closeLoopPanel(page);
    expect((await boxOf(loopPanel(page), 'closed sheet')).height).toBeLessThan(60);
    await expect(newLoopButton(page)).toBeHidden();
  } else {
    // Beside the score, to its right, not over it.
    const score = await scoreBox(page);
    expect(panel.x).toBeGreaterThanOrEqual(score.x + score.width);
    expect(panel.x + panel.width).toBeLessThanOrEqual(size.width);

    // Closed, the score gets the width back.
    await closeLoopPanel(page);
    await expect(loopPanel(page)).toBeHidden();
    await expect.poll(async () => (await scoreBox(page)).width).toBeGreaterThan(score.width);
    await expect(viewport(page).locator('svg').first()).toBeVisible();
  }
});
