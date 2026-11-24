/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  auditScreen,
  controlsWithoutFocusRing,
  faults,
  motionOf,
  NO_FAULTS,
  rowsOf,
} from './designPage';
import { loopItem, loopPanel, openLoopPanel, saveNewLoop } from './loopsPage';
import { controls, countInSelect, openFixture, playButton, viewport } from './playerPage';
import { homeItem, navLink, openLoopHistory } from './practicePage';

// Unit 12: what the visual design promises, measured on every screen at the
// phone, tablet and desktop sizes. Behaviour is the other specs' subject; they
// passing unchanged is the "no change to behaviour" half of the acceptance.

/** Audits the screen on show and expects nothing at fault, naming what it audited. */
async function expectWellDrawn(page: Page, screen: string): Promise<void> {
  const audit = await auditScreen(page);
  expect(faults(audit), screen).toEqual(NO_FAULTS);
  // Not vacuous: the screen had controls and text to measure.
  expect(audit.counted.targets, `${screen}: controls audited`).toBeGreaterThan(0);
  expect(audit.counted.texts, `${screen}: texts audited`).toBeGreaterThan(0);
}

async function expectFocusRings(page: Page, screen: string): Promise<void> {
  const { reached, missing } = await controlsWithoutFocusRing(page);
  expect(missing, `${screen}: controls Tab reached with no visible focus ring`).toEqual([]);
  expect(reached, `${screen}: controls Tab reached`).toBeGreaterThan(1);
}

const focusNothing = (page: Page) =>
  page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

const shortcutDialog = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });

test('the login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeVisible();
  await expectWellDrawn(page, 'login');
  await expectFocusRings(page, 'login');
});

test('the home page, settings and a missing page, before any song', async ({ user, page }) => {
  await signIn(page, user, '/');
  await expect(page.getByRole('link', { name: /library/i }).last()).toBeVisible();
  await expect(page.getByText(/Loading/)).toHaveCount(0);
  await expectWellDrawn(page, 'home, empty');
  await expectFocusRings(page, 'home, empty');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expectWellDrawn(page, 'settings');
  await expectFocusRings(page, 'settings');

  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expectWellDrawn(page, 'not found');
});

test('the library, the song page with its loops, and the home page with a loop', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expectWellDrawn(page, 'song, jam');
  await expectFocusRings(page, 'song, jam');

  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8, target: 110 });
  await openLoopPanel(page);
  await expect(loopItem(page, 'Verse')).toBeVisible();
  await expectWellDrawn(page, 'song, loop panel');
  await expectFocusRings(page, 'song, loop panel');

  await openLoopHistory(page, 'Verse');
  await expect(loopPanel(page).getByText(/^No practice logged yet/)).toBeVisible();
  await expectWellDrawn(page, 'song, loop history');

  await focusNothing(page);
  await page.keyboard.press('?');
  await expect(shortcutDialog(page)).toBeVisible();
  await expectWellDrawn(page, 'shortcut overlay');
  await page.keyboard.press('Escape');
  await expect(shortcutDialog(page)).toHaveCount(0);

  await navLink(page, 'On the go').click();
  await expect(homeItem(page, 'Verse')).toBeVisible();
  await expectWellDrawn(page, 'home, a loop');
  await expectFocusRings(page, 'home, a loop');

  await navLink(page, 'Library').click();
  await expect(page.getByRole('main').getByRole('link', { name: 'Groove 120' })).toBeVisible();
  await expectWellDrawn(page, 'library');
  await expectFocusRings(page, 'library');
});

test('icons are hidden from screen readers and every control keeps its words', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'multi-track', 'Multi Track');
  const audit = await auditScreen(page);
  // The page draws icons (so the check has something to check) and none of them is spoken.
  expect(audit.counted.icons).toBeGreaterThan(5);
  expect(audit.spokenIcons).toEqual([]);
  expect(audit.unnamedControls).toEqual([]);

  // The names the earlier units' specs find them by, exactly: no icon adds to or replaces one.
  const bar = controls(page);
  for (const name of ['Back to start', 'Metronome', 'Mute drums', 'Drums only']) {
    await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(bar.getByRole('slider', { name: 'Speed', exact: true })).toBeVisible();
  // Its words are screen-reader only on a phone; the name is the same at every size.
  await expect(bar.getByRole('slider', { name: 'Metronome volume', exact: true })).toBeVisible();
  await expect(bar.getByRole('combobox', { name: 'Count-in', exact: true })).toBeVisible();
  await expect(bar.getByRole('combobox', { name: 'When to count in', exact: true })).toBeVisible();
  await expect(playButton(page)).toHaveAccessibleName('Play');
  for (const name of ['On the go', 'Library', 'Settings']) {
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }),
    ).toBeVisible();
  }
});

/** The boxes of the controls bar's controls on show. */
const controlBoxes = (page: Page) =>
  controls(page)
    .locator('button, input, select')
    .evaluateAll((els) =>
      els
        .filter((el) => el.checkVisibility())
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { y: rect.y, height: rect.height, left: rect.left, right: rect.right };
        }),
    );

test('the controls bar fits a phone in three rows, and spills nowhere at 320 px', async ({
  user,
  page,
}) => {
  test.skip(test.info().project.name !== 'phone', 'about phone widths');
  await openFixture(page, user, 'groove-120', 'Groove 120');

  // An iPhone, an iPhone mini or SE, a common Android width, and the narrowest
  // phone, where the volume may wrap under the speed but nothing may spill.
  for (const width of [390, 375, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const region = await controls(page).boundingBox();
    if (!region) throw new Error('No controls bar');
    const boxes = await controlBoxes(page);
    // Back to start, Metronome, Mute drums, Drums only, Speed, volume, Count-in, mode.
    expect(boxes, `${width} px: controls on show`).toHaveLength(8);
    if (width >= 360) {
      expect(rowsOf(boxes), `${width} px: rows of ${JSON.stringify(boxes)}`).toBeLessThanOrEqual(3);
    }
    // Nothing spills out of the bar sideways (06 QA: the volume readout at 320 px).
    for (const box of boxes) {
      expect(box.left, `${width} px`).toBeGreaterThanOrEqual(region.x - 0.5);
      expect(box.right, `${width} px`).toBeLessThanOrEqual(region.x + region.width + 0.5);
    }
    const audit = await auditScreen(page);
    expect(audit.overflow, `${width} px`).toEqual([]);
    expect(audit.smallTargets, `${width} px`).toEqual([]);
  }
});

test.describe('reduced motion', () => {
  // The shortcut overlay fades in, the count-in number pops on each beat, and
  // controls change colour over 150 ms. Under "reduce motion" none of it moves
  // (WCAG 2.3.3); without it, each does, which is what proves the check bites.
  for (const reduced of [false, true]) {
    test(
      reduced ? 'nothing moves with reduce motion on' : 'small motion with it off',
      async ({ user, page }) => {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        await openFixture(page, user, 'groove-120', 'Groove 120');

        const button = controls(page).getByRole('button', { name: 'Metronome' });
        const buttonMotion = await motionOf(button);
        if (reduced) expect(buttonMotion.transitionSeconds).toBeLessThan(0.001);
        else expect(buttonMotion.transitionSeconds).toBeCloseTo(0.15);

        await focusNothing(page);
        await page.keyboard.press('?');
        const backdrop = shortcutDialog(page).locator('..');
        await expect(shortcutDialog(page)).toBeVisible();
        const fade = await motionOf(backdrop);
        if (reduced) {
          expect(fade.animationName === 'none' || fade.animationSeconds < 0.001).toBe(true);
        } else {
          expect(fade).toMatchObject({ animationName: 'fade-in', animationSeconds: 0.15 });
        }
        await page.keyboard.press('Escape');
        await expect(shortcutDialog(page)).toHaveCount(0);

        // Two bars at 120 BPM: four seconds of count-in to read the number's motion in.
        await countInSelect(page).selectOption({ label: '2 bars' });
        await playButton(page).click();
        const beat = page.getByTestId('count-in-beat');
        await expect(beat).toHaveText(/\d/);
        const pop = await motionOf(beat);
        if (reduced) {
          expect(pop.animationName === 'none' || pop.animationSeconds < 0.001).toBe(true);
        } else {
          expect(pop).toMatchObject({ animationName: 'beat-pop', animationSeconds: 0.16 });
        }

        // alphaTab's beat cursor is timing, not decoration: it glides across each beat
        // with an inline transition as long as the beat. Cut to nothing, it would jump
        // to the end of the beat as the beat starts and point a beat ahead throughout.
        const beatCursor = viewport(page).locator('.at-cursor-beat');
        await expect
          .poll(async () => (await motionOf(beatCursor)).transitionSeconds, { timeout: 10_000 })
          .toBeGreaterThan(0.05);
        await playButton(page).click();
        await expect(playButton(page)).toHaveText('Play');
      },
    );
  }
});

test('the shortcut overlay opens with its title on screen on a landscape phone', async ({
  user,
  page,
}) => {
  test.skip(test.info().project.name !== 'phone', 'about a phone turned sideways');
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await page.setViewportSize({ width: 844, height: 390 });

  await focusNothing(page);
  await page.keyboard.press('?');
  const dialog = shortcutDialog(page);
  await expect(dialog).toBeVisible();
  // Focus is on Close, and the dialog hasn't scrolled its title away to show it (10 QA issue 2).
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(dialog.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInViewport({
    ratio: 1,
  });
  await expect(dialog.getByRole('term').first()).toBeInViewport();
  // The rest is a scroll away inside the dialog, not off the page.
  expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('the loop sheet and panel keep 44 px targets with a loop playing', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Fill', firstBar: 1, lastBar: 2 });
  // The saved loop is the one set up; Play starts it.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await openLoopPanel(page);
  await expect(loopPanel(page).getByRole('group', { name: 'Loop speed' })).toBeVisible();
  await expectWellDrawn(page, 'song, loop playing');
  await playButton(page).click();
});
