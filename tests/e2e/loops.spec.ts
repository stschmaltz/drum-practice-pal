/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  activeLoopLine,
  targetField,
  chooseLoopAction,
  closeLoopPanel,
  commit,
  firstBarField,
  highlightBoxes,
  lastBarField,
  playLoopButton,
  loopBpmField,
  loopForm,
  loopItem,
  loopNameField,
  loopPanel,
  loopPanelToggle,
  loopPercentField,
  loopSpeed,
  newLoopButton,
  openLoopPanel,
  savedSpeed,
  saveLoopButton,
  saveNewLoop,
  saveSpeedButton,
  exitLoop,
  expectLooping,
  expectedLoopPanel,
  setSpeed,
  loopSheetHeader,
} from './loopsPage';
import {
  barCursorBox,
  barNumber,
  boxOf,
  contains,
  cursorBarPoint,
  expectedLayout,
  nextBarPoint,
  openFixture,
  playButton,
  recordedStatuses,
  recordStatuses,
  scoreBox,
  scrollScoreToCursor,
  status,
  tapAndWaitForBar,
  viewport,
  windowScrollSettled,
  type Point,
} from './playerPage';

// Unit 08: loops. Saved bar ranges that play on repeat at their saved speed.
// Nothing here listens to audio; these check what the page shows and saves.

const bpm = (page: Page) => page.getByTestId('jam-bpm');
const speed = (page: Page) => page.getByTestId('jam-speed');
const barsHint = (page: Page) => page.getByTestId('loop-bars-hint');

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

/** Reads the current bar every 50 ms for `ms` and gives the bars in the order they came up. */
async function barSequenceFor(page: Page, ms: number): Promise<number[]> {
  const sequence: number[] = [];
  const started = Date.now();
  while (Date.now() - started < ms) {
    const bar = await barNumber(page);
    if (sequence.at(-1) !== bar) sequence.push(bar);
    await page.waitForTimeout(50);
  }
  return sequence;
}

/** Every bar the status line shows over `ms` while the song plays. */
const barsPlayedFor = async (page: Page, ms: number) => new Set(await barSequenceFor(page, ms));

/** A tap as the device makes it: a finger on the phone and tablet projects, a mouse click on desktop. */
async function tapScore(page: Page, point: Point, touch: boolean): Promise<void> {
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

/** Taps the bar after the cursor's (jam mode) and waits for the cursor to get there. */
async function seekToNextBar(page: Page): Promise<number> {
  const from = await barNumber(page);
  await scrollScoreToCursor(page);
  const next = await nextBarPoint(page);
  const landed = await tapAndWaitForBar(page, next, from);
  await expect.poll(async () => contains(await barCursorBox(page), next)).toBe(true);
  return landed;
}

/** The bar and the big BPM readout, read in one go so they belong to the same moment. */
const barAndBpm = (page: Page) =>
  page.evaluate(() => {
    const text = (testId: string) =>
      document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '';
    const bar = /Bar (\d+) of/.exec(text('player-status'))?.[1];
    return { bar: Number(bar), bpm: text('jam-bpm') };
  });

interface TapWindow {
  __drumPalPlayer?: {
    on(event: 'barTapped', handler: (tap: { barNumber: number }) => void): () => void;
  };
  __taps?: number[];
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

  // Saved, not just shown: it is there after a reload.
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
    // Below 1024 px the press closed the sheet, to show the score; the speed fields are inside it.
    await openLoopPanel(other);
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
  await setSpeed(page, 80);
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
  await openLoopPanel(page);
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
  await chooseLoopAction(page, 'Outro', 'Edit');
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
  await expectLooping(page, 'Last chorus', 'Bars 9 to 12');
  await expect(status(page)).toHaveText('Bar 9 of 16');

  // What can't be saved says why, and saves nothing.
  await chooseLoopAction(page, 'Intro', 'Edit');
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
  await chooseLoopAction(page, 'Intro', 'Delete');
  const confirm = loopPanel(page).getByRole('group', { name: 'Delete Intro' });
  await expect(confirm).toContainText('practice history is deleted too');
  await confirm.getByRole('button', { name: 'Keep it' }).click();
  await expect(loopItem(page, 'Intro')).toBeVisible();

  // Deleting the loop that is playing goes back to the whole song.
  await chooseLoopAction(page, 'Last chorus', 'Delete');
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
  await setSpeed(page, 200);
  await saveNewLoop(page, { name: 'One bar', firstBar: 5, lastBar: 5 });
  await closeLoopPanel(page);

  // A one-bar loop: playback never leaves bar 5.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  expect([...(await barsPlayedFor(page, 3000))]).toEqual([5]);

  // From the keyboard (12 Test after the QA fix round): Exit loop goes with the loop's playing
  // state, and focus lands on that loop's Play loop, not on the page.
  await openLoopPanel(page);
  await activeLoopLine(page).getByRole('button', { name: 'Exit loop' }).focus();
  await page.keyboard.press('Enter');
  await expect(activeLoopLine(page)).toHaveCount(0);
  await expect(loopItem(page, 'One bar').getByRole('button', { name: /^Play loop/ })).toBeFocused();
  await closeLoopPanel(page);
  await expect(playButton(page)).toHaveText('Pause');
  // Free of the range, the song plays on past bar 5.
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(6);
  expect(await highlightBoxes(page)).toEqual([]);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('a tap on a bar outside the playing loop moves nothing, paused or playing', async ({
  user,
  page,
}, testInfo) => {
  const touch = testInfo.project.use.hasTouch === true;
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Bar two', firstBar: 2, lastBar: 2 });
  await expect(status(page)).toHaveText('Bar 2 of 16');
  // Only the sheet is in the way of the score; the side column stays as it is.
  if (expectedLoopPanel(page) === 'sheet') await closeLoopPanel(page);
  await expect.poll(async () => (await barCursorBox(page)).width).toBeGreaterThan(2);
  await scrollScoreToCursor(page);
  const bar3 = await nextBarPoint(page);
  // Every bar the service hears tapped, so "nothing moved" can't pass on a tap that missed.
  await page.evaluate(() => {
    const debug = window as unknown as TapWindow;
    if (!debug.__drumPalPlayer) throw new Error('No player on window.__drumPalPlayer');
    const taps: number[] = [];
    debug.__taps = taps;
    debug.__drumPalPlayer.on('barTapped', ({ barNumber }) => taps.push(barNumber));
  });
  const tappedBars = () => page.evaluate(() => (window as unknown as TapWindow).__taps ?? []);

  // Paused: alphaTab would report bar 3 for a seek it then clamps back into the loop.
  await tapScore(page, bar3, touch);
  await expect.poll(tappedBars).toEqual([3]);
  await page.waitForTimeout(700);
  await expect(status(page)).toHaveText('Bar 2 of 16');

  // Playing: the readout stays in the loop and goes on following it. Play folds the
  // controls above the score, which moves it up, so bar 3 is found again.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await tapScore(page, await nextBarPoint(page), touch);
  await expect.poll(tappedBars).toEqual([3, 3]);
  expect([...(await barsPlayedFor(page, 2500))]).toEqual([2]);
  await expect(playButton(page)).toHaveText('Pause');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');

  // Out of the loop the bar after the cursor's, found the same way, is one a tap seeks to.
  // (Measured again: Pause unfolded the controls above the score.)
  await exitLoop(page);
  await expect(activeLoopLine(page)).toHaveCount(0);
  await expect(status(page)).toHaveText('Bar 2 of 16');
  await scrollScoreToCursor(page);
  await tapScore(page, await nextBarPoint(page), touch);
  await expect(status(page)).toHaveText('Bar 3 of 16');
});

test('in a song with a repeat, a loop inside the repeat plays just its bars', async ({
  user,
  page,
}) => {
  // Bars 3 and 4 of this fixture play twice; a loop over them is one playthrough.
  await openFixture(page, user, 'repeats', 'Repeats');
  await expect(status(page)).toHaveText('Bar 1 of 8');
  await setSpeed(page, 200);
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
  await exitLoop(page);
  // Only the sheet is in the way of the score; closing the side column
  // would lay the score out again while the tap point is being measured.
  if (expectedLoopPanel(page) === 'sheet') await closeLoopPanel(page);
  const from = await barNumber(page);
  await scrollScoreToCursor(page);
  const landed = await tapAndWaitForBar(page, await nextBarPoint(page), from);
  expect(landed).toBe(from + 1);
});

test('the loop panel is a bottom sheet on a phone and a tablet in portrait, and a side column from 1024 px', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const sheetHeader = loopSheetHeader(page);
  const columnToggle = page.getByRole('button', { name: /^(Show|Hide) loops$/ });
  const sheet = expectedLoopPanel(page) === 'sheet';
  // One toggle on show at each width, the one the shared steps use.
  await expect(sheet ? columnToggle : sheetHeader).toBeHidden();
  await expect(sheet ? sheetHeader : columnToggle).toBeVisible();
  // The sheet starts closed, so the score opens with nothing over it; the column starts open.
  await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', sheet ? 'false' : 'true');

  await openLoopPanel(page);
  await expect(newLoopButton(page)).toBeVisible();
  const panel = await boxOf(loopPanel(page), 'loop panel');
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport size');

  if (sheet) {
    const tabBar = page.locator('nav[aria-label="Main"]:visible');
    if (expectedLayout(page) === 'horizontal') {
      // A phone: full width, sitting on the tab bar.
      const tabBarBox = await boxOf(tabBar, 'tab bar');
      expect(panel.x).toBe(0);
      expect(panel.width).toBe(size.width);
      expect(Math.abs(panel.y + panel.height - tabBarBox.y)).toBeLessThanOrEqual(2);
    } else {
      // A tablet in portrait: no tab bar, so on the foot of the window, and as wide as the
      // score above it, to the right of the sidebar rather than under it.
      const sidebar = await boxOf(page.locator('aside:has(nav[aria-label="Main"])'), 'sidebar');
      const score = await scoreBox(page);
      expect(panel.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
      expect(Math.abs(panel.x - score.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(panel.width - score.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(panel.y + panel.height - size.height)).toBeLessThanOrEqual(2);
      // The score has the content column's whole width, with no column beside it.
      expect(score.width).toBeGreaterThan((size.width - sidebar.width) * 0.85);
    }
    // Short enough to leave the score in reach.
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

test('on a tablet in portrait the score fits two bars a line', async ({ user, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet', 'the gutter at md is what this measures');
  await openFixture(page, user, 'groove-120', 'Groove 120');
  // Bars 2 to 15: bar 1 has the clef, time and tempo and sits alone, as can the last bar.
  await saveNewLoop(page, { name: 'Middle', firstBar: 2, lastBar: 15 });
  await closeLoopPanel(page);
  // One highlight block per line of music the loop touches: 14 bars, two a line.
  await expect
    .poll(async () => new Set((await highlightBoxes(page)).map((box) => Math.round(box.y))).size)
    .toBe(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(
    0,
  );
});

test('a loop across the tempo change opens on another device with BPM from its first bar, and keeps it past the change', async ({
  user,
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  // Bars 7 and 8 are at 120 in the file, bars 9 and 10 at 90.
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  await saveNewLoop(page, { name: 'Across the change', firstBar: 7, lastBar: 10, target: 110 });
  await expect(status(page)).toHaveText('Bar 7 of 16');
  await expect(bpm(page)).toHaveText('120');

  // 85 of bar 7's 120 is 70.8333%.
  await commit(loopBpmField(page), '85');
  await expect(loopPercentField(page)).toHaveValue('71');
  await saveSpeedButton(page).click();
  await expect(savedSpeed(page)).toHaveText('Saved: 71% (85 BPM)');
  const songPath = new URL(page.url()).pathname;

  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await signIn(other, user, songPath);
    await expect(playButton(other)).toBeEnabled({ timeout: 20_000 });
    await openLoopPanel(other);
    // Speed and target both in the BPM of the loop's first bar.
    await expect(loopItem(other, 'Across the change')).toContainText(
      'Bars 7 to 10 · 71% (85 BPM) · target 110% (132 BPM)',
    );

    await playLoopButton(other, 'Across the change').click();
    await expect(playButton(other)).toHaveText('Pause');
    await openLoopPanel(other);
    await expectLooping(other, 'Across the change', 'Bars 7 to 10');
    await expect(speed(other)).toHaveText('71%');
    await expect(bpm(other)).toHaveText('85');
    await expect(loopBpmField(other)).toHaveValue('85');

    // Faster, to get past the change soon: 200% of 120.
    await commit(loopPercentField(other), '200');
    await expect(bpm(other)).toHaveText('240');
    // In bars 9 and 10 the file is at 90, and jam mode would read 180. The loop's BPM stays 240.
    await expect
      .poll(
        async () => {
          const now = await barAndBpm(other);
          return now.bar >= 9 ? now.bpm : 'not there yet';
        },
        { timeout: 15_000, intervals: [100] },
      )
      .toBe('240');
    await expect(loopBpmField(other)).toHaveValue('240');
    const bars = await barsPlayedFor(other, 6000);
    expect([...bars].sort((a, b) => a - b)).toEqual([7, 8, 9, 10]);

    // Out of the loop it is jam mode again: BPM follows the bar playing.
    await exitLoop(other);
    await expect
      .poll(
        async () => {
          const now = await barAndBpm(other);
          return now.bar >= 11 ? now.bpm : 'not there yet';
        },
        { timeout: 15_000, intervals: [100] },
      )
      .toBe('180');
    await expect(playButton(other)).toHaveText('Pause');
    await playButton(other).click();
    await expect(playButton(other)).toHaveText('Play');
  } finally {
    await context.close();
  }
});

test('the last bar can be tapped first, a third tap starts over, and taps seek again once the form is closed', async ({
  user,
  page,
}, testInfo) => {
  const touch = testInfo.project.use.hasTouch === true;
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await putCursorOnBar2(page);
  await openLoopPanel(page);
  await newLoopButton(page).click();
  await windowScrollSettled(page);
  await scrollScoreToCursor(page);
  const bar2 = await cursorBarPoint(page);
  const bar3 = await nextBarPoint(page);

  // The later bar first, then the earlier one: the range still comes out in order.
  await tapScore(page, bar3, touch);
  await expect(firstBarField(page)).toHaveValue('3');
  await expect(lastBarField(page)).toHaveValue('3');
  await tapScore(page, bar2, touch);
  await expect(firstBarField(page)).toHaveValue('2');
  await expect(lastBarField(page)).toHaveValue('3');
  await expect(barsHint(page)).toContainText('Tap a bar to start again');
  await expect.poll(() => highlighted(page, bar2)).toBe(true);
  expect(await highlighted(page, bar3)).toBe(true);

  // A third tap starts a new selection from that bar; the same bar again makes a one-bar loop.
  await tapScore(page, bar3, touch);
  await expect(firstBarField(page)).toHaveValue('3');
  await expect(lastBarField(page)).toHaveValue('3');
  await expect(barsHint(page)).toContainText('Now tap the last bar');
  await expect.poll(() => highlighted(page, bar2)).toBe(false);
  await tapScore(page, bar3, touch);
  await expect(firstBarField(page)).toHaveValue('3');
  await expect(lastBarField(page)).toHaveValue('3');
  await expect(barsHint(page)).toContainText('Tap a bar to start again');

  // Four taps, and playback has not moved.
  await expect(status(page)).toHaveText('Bar 2 of 16');
  await expect(playButton(page)).toHaveText('Play');

  // Closed without saving: nothing is highlighted or saved, and a tap is a seek again.
  await loopForm(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(loopForm(page)).toHaveCount(0);
  expect(await highlightBoxes(page)).toEqual([]);
  await expect(loopPanel(page).getByRole('listitem')).toHaveCount(0);
  await scrollScoreToCursor(page);
  const next = await nextBarPoint(page);
  await tapScore(page, next, touch);
  await expect(status(page)).toHaveText('Bar 3 of 16');
  await expect(loopForm(page)).toHaveCount(0);
});

test('while a loop is being edited taps pick its new bars; saving moves the loop there', async ({
  user,
  page,
}, testInfo) => {
  const touch = testInfo.project.use.hasTouch === true;
  await openFixture(page, user, 'groove-120', 'Groove 120');
  // Saving the loop moves playback, and the cursor, to its first bar.
  await saveNewLoop(page, { name: 'Late', firstBar: 9, lastBar: 12 });
  await exitLoop(page);
  await expect(status(page)).toHaveText('Bar 9 of 16');

  await openLoopPanel(page);
  await chooseLoopAction(page, 'Late', 'Edit');
  await expect(firstBarField(page)).toHaveValue('9');
  await expect(lastBarField(page)).toHaveValue('12');
  await windowScrollSettled(page);
  // The cursor is on bar 9 now; the two bars tapped are 9 and 10, wherever they are laid out.
  await expect.poll(async () => (await barCursorBox(page)).width).toBeGreaterThan(2);
  await scrollScoreToCursor(page);
  const bar9 = await cursorBarPoint(page);
  const bar10 = await nextBarPoint(page);

  // Tapping the bar after first, then the cursor's: a new selection replaces the saved 9 to 12.
  await tapScore(page, bar10, touch);
  await expect(firstBarField(page)).toHaveValue('10');
  await expect(lastBarField(page)).toHaveValue('10');
  await tapScore(page, bar9, touch);
  await expect(firstBarField(page)).toHaveValue('9');
  await expect(lastBarField(page)).toHaveValue('10');
  // The name wasn't touched and is still the saved one.
  await expect(loopNameField(page)).toHaveValue('Late');
  await expect(status(page)).toHaveText('Bar 9 of 16');

  await saveLoopButton(page).click();
  await expect(loopForm(page)).toHaveCount(0);
  await expect(loopItem(page, 'Late')).toContainText('Bars 9 to 10 · 100% (120 BPM)');
  // It wasn't the loop playing, so nothing is looping after the edit.
  await expect(activeLoopLine(page)).toHaveCount(0);
  expect(await highlightBoxes(page)).toEqual([]);
});

test('the highlight stays on the loop’s bars when the score is laid out again', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Bars two and three', firstBar: 2, lastBar: 3 });
  await closeLoopPanel(page);
  await expect(status(page)).toHaveText('Bar 2 of 16');

  /** The highlight covers the cursor's bar (bar 2, where the loop starts) and the bar after it. */
  const coversTheLoop = async () => {
    const boxes = await highlightBoxes(page);
    const cursor = await barCursorBox(page);
    const middle = { x: cursor.x + cursor.width / 2, y: cursor.y + cursor.height / 2 };
    return boxes.some((box) => contains(box, middle));
  };
  await expect.poll(coversTheLoop).toBe(true);
  const before = await highlightBoxes(page);

  // Across the 768 px breakpoint, so alphaTab switches between page and horizontal layout.
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport size');
  const wasPage = expectedLayout(page) === 'page';
  await page.setViewportSize(wasPage ? { width: 600, height: 900 } : { width: 900, height: 700 });
  expect(expectedLayout(page)).toBe(wasPage ? 'horizontal' : 'page');

  // Drawn again from the new layout's bounds, not left where it was.
  await expect.poll(async () => (await highlightBoxes(page)).length).toBeGreaterThan(0);
  await expect
    .poll(async () => JSON.stringify(await highlightBoxes(page)) !== JSON.stringify(before))
    .toBe(true);
  await expect.poll(coversTheLoop).toBe(true);
  await expect(activeLoopLine(page)).toContainText('Bars 2 to 3');

  // And back again.
  await page.setViewportSize(size);
  await expect.poll(coversTheLoop).toBe(true);
});

test('switching, editing and deleting the playing loop never stop playback', async ({
  user,
  page,
}) => {
  test.setTimeout(60_000);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'First', firstBar: 1, lastBar: 2 });
  await saveNewLoop(page, { name: 'Second', firstBar: 5, lastBar: 6 });

  await playLoopButton(page, 'First').click();
  await expect(playButton(page)).toHaveText('Pause');
  // Below 1024 px the press that starts playback closes the sheet; one that switches loops doesn't.
  await openLoopPanel(page);
  await expect.poll(async () => (await barAndBpm(page)).bar).toBeLessThanOrEqual(2);
  await recordStatuses(page);
  // The loop's speed fields are live: no restart for a new speed.
  await commit(loopPercentField(page), '200');
  await expect(bpm(page)).toHaveText('240');

  // Another loop, mid-play: its bars at its saved speed.
  await playLoopButton(page, 'Second').click();
  await expectLooping(page, 'Second', 'Bars 5 to 6');
  await expect(speed(page)).toHaveText('100%');
  await commit(loopPercentField(page), '200');
  expect([...(await barsPlayedFor(page, 3000))].sort((a, b) => a - b)).toEqual([5, 6]);

  // Its bars edited while it plays: the loop moves there.
  await chooseLoopAction(page, 'Second', 'Edit');
  await firstBarField(page).fill('9');
  await lastBarField(page).fill('10');
  await saveLoopButton(page).click();
  await expectLooping(page, 'Second', 'Bars 9 to 10');
  await expect.poll(() => barNumber(page)).toBeGreaterThanOrEqual(9);
  expect([...(await barsPlayedFor(page, 3000))].sort((a, b) => a - b)).toEqual([9, 10]);

  // Deleted while it plays: the song carries on past its last bar.
  await chooseLoopAction(page, 'Second', 'Delete');
  await loopPanel(page)
    .getByRole('group', { name: 'Delete Second' })
    .getByRole('button', { name: 'Delete loop' })
    .click();
  await expect(activeLoopLine(page)).toHaveCount(0);
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(10);

  // Through all of it the player was only ever playing.
  await expect(playButton(page)).toHaveText('Pause');
  expect(await recordedStatuses(page)).toEqual(['playing']);
  // The recorder does hear a change when there is one.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  expect((await recordedStatuses(page)).length).toBeGreaterThan(1);
});

test('in a song with a repeat, taps seek by bar number and a loop out of the repeat plays it as written', async ({
  user,
  page,
}) => {
  test.setTimeout(90_000);
  await openFixture(page, user, 'repeats', 'Repeats');
  await expect(status(page)).toHaveText('Bar 1 of 8');

  // Tap to seek, bar by bar, through the repeated bars and out the other side.
  expect(await seekToNextBar(page)).toBe(2);
  expect(await seekToNextBar(page)).toBe(3);
  expect(await seekToNextBar(page)).toBe(4);
  expect(await seekToNextBar(page)).toBe(5);

  // Played straight through from the top, the current bar revisits 3 and 4.
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(status(page)).toHaveText('Bar 1 of 8');
  await setSpeed(page, 200);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  // Ten bars at 240 BPM are ten seconds.
  const through = await barSequenceFor(page, 8500);
  expect(through.slice(0, 8)).toEqual([1, 2, 3, 4, 3, 4, 5, 6]);
  if ((await playButton(page).textContent()) === 'Pause') await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');

  // A loop from inside the repeat to the bar after it: 3, 4, 3, 4, 5, and round again.
  await saveNewLoop(page, { name: 'Out of the repeat', firstBar: 3, lastBar: 5 });
  await expect(status(page)).toHaveText('Bar 3 of 8');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  // One pass is five seconds at 200%.
  const looped = await barSequenceFor(page, 11_500);
  expect(new Set(looped)).toEqual(new Set([3, 4, 5]));
  expect(looped.join(' ')).toContain('3 4 3 4 5 3 4 3 4 5');
  await expect(status(page)).toContainText(/Bar [345] of 8/);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('a finger dragged across the score scrolls it: it picks no bars and never seeks', async ({
  user,
  page,
}, testInfo) => {
  test.skip(testInfo.project.use.hasTouch !== true, 'touch only; the mouse drag has its own test');
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await putCursorOnBar2(page);
  const touches = await page.context().newCDPSession(page);
  const scrolled = () =>
    viewport(page).evaluate((box) => box.scrollLeft + box.scrollTop + window.scrollY);

  /** A pan from the bar after the cursor's: leftwards in the horizontal layout, upwards in the page layout. */
  async function swipeFromNextBar(): Promise<void> {
    const from = await nextBarPoint(page);
    const sideways = expectedLayout(page) === 'horizontal';
    const at = (step: number) => ({
      x: Math.round(from.x - (sideways ? step * 15 : 0)),
      y: Math.round(from.y - (sideways ? 0 : step * 15)),
    });
    await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] });
    for (let step = 1; step <= 10; step++) {
      await touches.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [at(step)],
      });
      await page.waitForTimeout(16);
    }
    await touches.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  // Jam mode: the pan moves the score (or the page), and playback stays on bar 2.
  const before = await scrolled();
  await swipeFromNextBar();
  await expect.poll(scrolled).not.toBe(before);
  await page.waitForTimeout(400);
  await expect(status(page)).toHaveText('Bar 2 of 16');
  await expect(loopForm(page)).toHaveCount(0);

  // With the loop form open: still a scroll, and no bars are picked.
  await openLoopPanel(page);
  await newLoopButton(page).click();
  await windowScrollSettled(page);
  await scrollScoreToCursor(page);
  const beforeSecond = await scrolled();
  await swipeFromNextBar();
  await expect.poll(scrolled).not.toBe(beforeSecond);
  await page.waitForTimeout(400);
  await expect(firstBarField(page)).toHaveValue('');
  await expect(lastBarField(page)).toHaveValue('');
  expect(await highlightBoxes(page)).toEqual([]);
  await expect(status(page)).toHaveText('Bar 2 of 16');
});

// 12 UX pass, items 2, 3 and 9: the playing loop shown once, its speed reached from the
// controls bar, and the item's less-used actions in a keyboard-driven "More" menu.
test('a loop item’s More menu works from the keyboard and hands focus back', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await openLoopPanel(page);
  const more = loopItem(page, 'Verse').getByRole('button', { name: 'More actions for Verse' });
  await expect(more).toHaveAttribute('aria-haspopup', 'menu');

  await more.focus();
  await page.keyboard.press('ArrowDown');
  const menu = loopPanel(page).getByRole('menu', { name: 'Actions for Verse' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
  // The arrows move in the menu and the speed shortcut leaves them alone.
  const speedBefore = await page.getByTestId('jam-speed').textContent();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Show history' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await expect(page.getByTestId('jam-speed')).toHaveText(speedBefore ?? '');

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  // Enter on Show history opens it inline; focus is back on More.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(loopItem(page, 'Verse').getByText(/No practice logged yet/)).toBeVisible();
  await expect(more).toBeFocused();

  // A press outside closes it without choosing anything.
  await more.click();
  await expect(menu).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu).toHaveCount(0);
  await expect(loopForm(page)).toHaveCount(0);
});

test('while a loop plays its speed is set in its own item, which the controls bar’s Loop speed opens', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const bar = page.getByRole('region', { name: 'Player controls' });
  await expect(bar.getByRole('slider', { name: 'Speed' })).toBeVisible();
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await openLoopPanel(page);
  await playLoopButton(page, 'Verse').click();
  await expect(playButton(page)).toHaveText('Pause');

  // One active loop on the page, in its item; no line about it above the score.
  await expect(activeLoopLine(page)).toHaveCount(1);
  await expect(page.getByText(/^Looping /)).toHaveCount(0);
  // The slider has given way to the loop's own control (in the folded strip too).
  await expect(bar.getByRole('slider', { name: 'Speed' })).toHaveCount(0);
  await bar.getByRole('button', { name: /^Loop speed \d+%$/ }).click();
  await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(loopSpeed(page)).toBeFocused();
  await expect(loopSpeed(page)).toBeInViewport();
  // Nothing to save: "Save speed" is drawn off (no fill, a dashed edge), not as a faded orange.
  await expect(saveSpeedButton(page)).toBeDisabled();
  await expect(saveSpeedButton(page)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(saveSpeedButton(page)).toHaveCSS('border-top-style', 'dashed');
  await expect(saveSpeedButton(page)).toHaveCSS('opacity', '1');

  await exitLoop(page);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(bar.getByRole('slider', { name: 'Speed' })).toBeVisible();
});
