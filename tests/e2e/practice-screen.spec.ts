/// <reference lib="dom" />
import type { Page, Route } from '@playwright/test';
import { expect, test } from './auth';
import { persistedCacheHolds } from './deviceCache';
import { saveNewLoop } from './loopsPage';
import {
  barNumber,
  cursorBarPoint,
  openFixture,
  playButton,
  recordedStatuses,
  recordStatuses,
  scoreSettled,
  status,
  viewport,
} from './playerPage';
import { backTo, loopsOf, openPractice, practiceSpeed } from './practicePage';

// Unit 16, from Shane's first try: the practice screen draws its loop alone until "Show whole
// song", a new loop is saved from the whole song without leaving the screen, and the speed is
// set by 1 BPM, a typed BPM or a typed percent.

// One button, named for what a press shows next.
const wholeSong = (page: Page) =>
  page.getByRole('button', { name: /^Show (whole song|the loop)$/ });
const saveSheet = (page: Page) => page.getByTestId('save-as-loop');

/** The drawn score's area: a few bars against the whole song, at any layout. */
const drawnArea = (page: Page) =>
  viewport(page)
    .locator('.at-surface')
    .evaluate((surface) => {
      const rect = surface.getBoundingClientRect();
      return rect.width * rect.height;
    });

async function openMiddleLoop(page: Page, user: Parameters<typeof openFixture>[1]) {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Middle', firstBar: 7, lastBar: 8 });
  await backTo(page, 'Groove 120').click();
  await openPractice(page, 'Middle');
  await scoreSettled(page);
}

// Copilot review on #33: "Back to <the loop>" carries the loop's name, which can be one word of
// 100 characters; the button ran past the sheet's edge on a phone and was cut off.
test('after a save, "Back to" a loop with a very long name stays inside the sheet', async ({
  page,
  user,
}) => {
  const longName = 'W'.repeat(100);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: longName, firstBar: 7, lastBar: 8 });
  await backTo(page, 'Groove 120').click();
  await openPractice(page, longName);
  await scoreSettled(page);

  await wholeSong(page).click();
  await saveSheet(page).getByLabel('First bar').fill('3');
  await saveSheet(page).getByLabel('Last bar').fill('4');
  await saveSheet(page).getByLabel('Name').fill('Early');
  await saveSheet(page).getByRole('button', { name: 'Save as loop' }).click();

  const back = saveSheet(page).getByRole('button', { name: `Back to ${longName}` });
  await expect(back).toBeVisible();
  const sheet = await saveSheet(page).boundingBox();
  const button = await back.boundingBox();
  if (!sheet || !button) throw new Error('the sheet or its Back button has no box');
  expect(button.x).toBeGreaterThanOrEqual(sheet.x);
  expect(button.x + button.width).toBeLessThanOrEqual(sheet.x + sheet.width);
  // Nothing scrolls sideways: not the page, and not the sheet.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await saveSheet(page).evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});

test('the header is one band, shot at each size', async ({ page, user }, testInfo) => {
  await openMiddleLoop(page, user);
  await expect(practiceSpeed(page)).toHaveText('100%');
  await page.screenshot({
    path: `docs/units/14-shots/practice-header-${testInfo.project.name}.png`,
    animations: 'disabled',
  });
  // The score starts right under the band: nothing between them.
  const band = await page.getByTestId('practice-bar').boundingBox();
  const score = await viewport(page).boundingBox();
  expect(band && score && score.y - (band.y + band.height)).toBeLessThanOrEqual(24);
});

test('draws the loop alone; from the whole song a tap picks bars and Save as loop opens the new loop', async ({
  page,
  user,
}, testInfo) => {
  await openMiddleLoop(page, user);
  const loopArea = await drawnArea(page);
  await expect(status(page)).toContainText('Bar 7 of 16');

  await wholeSong(page).click();
  await expect(wholeSong(page)).toHaveAccessibleName('Show the loop');
  await expect.poll(() => drawnArea(page)).toBeGreaterThan(loopArea * 2);
  await expect(saveSheet(page)).toBeVisible();
  await page.screenshot({
    path: `docs/units/14-shots/practice-whole-song-${testInfo.project.name}.png`,
    animations: 'disabled',
  });

  // A tap on the cursor's bar picks it, and moves nothing.
  const point = await cursorBarPoint(page);
  await page.mouse.click(point.x, point.y);
  await expect(saveSheet(page).getByLabel('First bar')).toHaveValue('7');
  await expect(status(page)).toContainText('Bar 7 of 16');

  await saveSheet(page).getByLabel('First bar').fill('3');
  await saveSheet(page).getByLabel('Last bar').fill('4');
  await saveSheet(page).getByLabel('Name').fill('Early');
  await saveSheet(page).getByRole('button', { name: 'Save as loop' }).click();

  // The sheet asks whether to practise the loop now or make another, the whole song still on
  // show; "Make another loop" brings the empty form back, and "now" opens the one just saved.
  const saved = saveSheet(page).getByRole('group', { name: 'Saved “Early”' });
  await expect(saved).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Middle' })).toBeVisible();
  await saved.getByRole('button', { name: 'Make another loop' }).click();
  await expect(saveSheet(page).getByLabel('Name')).toHaveValue('');
  await saveSheet(page).getByLabel('First bar').fill('9');
  await saveSheet(page).getByLabel('Last bar').fill('10');
  await saveSheet(page).getByLabel('Name').fill('Late');
  await saveSheet(page).getByRole('button', { name: 'Save as loop' }).click();
  const savedLate = saveSheet(page).getByRole('group', { name: 'Saved “Late”' });
  await expect(savedLate).toBeVisible();
  await expect(savedLate.getByRole('button', { name: 'Back to Middle' })).toBeVisible();
  // The three choices fit the sheet at every size, side by side or wrapped.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await savedLate.getByRole('button', { name: 'Practise it now' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Late' })).toBeVisible();
  await expect(page).toHaveURL(/\/songs\/[^/]+\/loops\/[^/]+$/);
  await expect(saveSheet(page)).toHaveCount(0);
  await expect(wholeSong(page)).toHaveAccessibleName('Show whole song');
  expect((await loopsOf(user)).map((loop) => loop.name).sort()).toEqual([
    'Early',
    'Late',
    'Middle',
  ]);
  await expect.poll(() => drawnArea(page)).toBeLessThan(loopArea * 2);
  await expect(status(page)).toContainText('Bar 9 of 16');
});

test('the speed is set by 1 BPM, a typed BPM and a typed percent, each saved as made', async ({
  page,
  user,
}) => {
  await openMiddleLoop(page, user);
  const savedRatio = async () =>
    (await loopsOf(user)).find((loop) => loop.name === 'Middle')?.speed_ratio;

  await page.getByRole('button', { name: 'Faster by 1 BPM' }).click();
  await expect(page.getByTestId('practice-bpm')).toHaveText('121 BPM');
  await expect.poll(savedRatio).toBeCloseTo(121 / 120, 5);

  await page.getByRole('button', { name: 'Type a BPM, now 121' }).click();
  await page.getByRole('textbox', { name: 'BPM' }).fill('90');
  await page.keyboard.press('Enter');
  await expect(practiceSpeed(page)).toHaveText('75%');
  await expect.poll(savedRatio).toBe(0.75);

  await page.getByRole('button', { name: 'Type a speed, now 75%' }).click();
  await page.getByRole('textbox', { name: 'Speed %' }).fill('62');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('practice-bpm')).toHaveText('74 BPM');
  await expect.poll(savedRatio).toBe(0.62);
});

// Unit 20, 13.06: the practice screen waited for a fresh read of the song's loops before it
// opened its loop, and Play is off until the loop is open, so a connection that never answered
// kept Play off for as long as the read took to give up. The device already has the loop.
test('on a connection that never answers the loops read, Play is on about 2 seconds after the screen opens', async ({
  page,
  user,
}) => {
  await openMiddleLoop(page, user);
  // The list is kept on the device a second after it changes. A reload restores it as stale,
  // so the screen reads it again, as it does on a visit more than 30 seconds after the last.
  await persistedCacheHolds(page, 'Middle');

  // From here no read of the loops is ever answered (writes go through).
  const held: Route[] = [];
  let answering = false;
  await page.route(/\/rest\/v1\/loops\?/, (route) => {
    if (answering || route.request().method() !== 'GET') return route.fallback();
    held.push(route);
  });
  try {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Middle' })).toBeVisible();
    const named = Date.now();
    // The wait is 2 seconds from the screen naming the loop. Before the cap this never came.
    await expect(playButton(page)).toBeEnabled({ timeout: 6000 });
    const waited = Date.now() - named;
    // The read really is hanging, or this passes on a read that simply answered.
    expect(held.length).toBeGreaterThan(0);
    expect(waited).toBeLessThan(4000);

    // The loop is open, not the whole song: its bars, its range.
    await expect(status(page)).toContainText('Bar 7 of 16');
    await recordStatuses(page);
    await playButton(page).click();
    await expect(playButton(page)).toHaveAccessibleName('Pause');
    // Three seconds at 120 BPM is a bar and a half: past the loop's end, were there no range.
    await page.waitForTimeout(3000);
    expect([7, 8]).toContain(await barNumber(page));

    // The answers come after all: nothing is opened again, and playback carries on.
    const answered = page.waitForResponse(
      (response) =>
        /\/rest\/v1\/loops\?/.test(response.url()) && response.request().method() === 'GET',
    );
    answering = true;
    await Promise.all(held.map((route) => route.continue()));
    await answered;
    await page.waitForTimeout(1000);
    await expect(playButton(page)).toHaveAccessibleName('Pause');
    expect([7, 8]).toContain(await barNumber(page));
    expect(await recordedStatuses(page)).toEqual(['ready', 'playing']);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});
