/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, test } from './auth';
import { saveNewLoop } from './loopsPage';
import { cursorBarPoint, openFixture, scoreSettled, status, viewport } from './playerPage';
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

  // The whole song stays for another loop; the note's button opens the one just saved.
  await expect(saveSheet(page).getByTestId('loop-saved-note')).toContainText('Saved “Early”.');
  await expect(page.getByRole('heading', { level: 1, name: 'Middle' })).toBeVisible();
  await saveSheet(page).getByRole('button', { name: 'Practise it' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Early' })).toBeVisible();
  await expect(page).toHaveURL(/\/songs\/[^/]+\/loops\/[^/]+$/);
  await expect(saveSheet(page)).toHaveCount(0);
  await expect(wholeSong(page)).toHaveAccessibleName('Show whole song');
  expect((await loopsOf(user)).map((loop) => loop.name).sort()).toEqual(['Early', 'Middle']);
  await expect.poll(() => drawnArea(page)).toBeLessThan(loopArea * 2);
  await expect(status(page)).toContainText('Bar 3 of 16');
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
