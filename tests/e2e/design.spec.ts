/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  auditScreen,
  controlsWithoutFocusRing,
  faults,
  motionOf,
  NO_FAULTS,
  rowsOf,
  textSpillingOutOf,
} from './designPage';
import { loopItem, loopPanel, openLoopPanel, saveNewLoop } from './loopsPage';
import {
  controls,
  chooseCountIn,
  fixture,
  openFixture,
  openSongOverview,
  playButton,
  viewport,
} from './playerPage';
import {
  backTo,
  navLink,
  openLoopHistory,
  overviewItem,
  playFor,
  visitSummary,
  shortSessions,
} from './practicePage';
import {
  linkField,
  openRecordingsForm,
  playAlong,
  recordingFrame,
  recordingsForm,
  stubServices,
  WATCH_URL,
} from './recordingsPage';

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

async function expectFocusRings(page: Page, screen: string): Promise<string[]> {
  const { reached, missing, throughLabel } = await controlsWithoutFocusRing(page);
  expect(missing, `${screen}: controls Tab reached with no visible focus ring`).toEqual([]);
  expect(reached, `${screen}: controls Tab reached`).toBeGreaterThan(1);
  return throughLabel;
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
  await expect(page.getByText('No songs yet.', { exact: false })).toBeVisible();
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
  test.setTimeout(90_000);
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expectWellDrawn(page, 'song, jam');
  await expectFocusRings(page, 'song, jam');

  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
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

  await backTo(page, 'Groove 120').click();
  await expect(overviewItem(page, 'on the go', 'Verse')).toBeVisible();
  await expectWellDrawn(page, 'song overview');
  await expectFocusRings(page, 'song overview');

  // No practice yet: Stats is one card pointing to Songs (16 QA issue 5).
  await navLink(page, 'Stats').click();
  await expect(page.getByText(/^No practice yet/)).toBeVisible();
  await expectWellDrawn(page, 'stats, no practice');
  await expectFocusRings(page, 'stats, no practice');

  await navLink(page, 'Songs').click();
  await openSongOverview(page, 'Groove 120');
  await page.getByRole('link', { name: 'Practise Verse' }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expectWellDrawn(page, 'practice');
  await expectFocusRings(page, 'practice');

  // A short session, summed up on the song's overview on the way out.
  await playButton(page).click();
  await playFor(page, 3_000);
  await backTo(page, 'Groove 120').click();
  await expect(visitSummary(page)).toContainText('Streak: 1 day');
  await expectWellDrawn(page, 'song overview, practice summary');
  await expectFocusRings(page, 'song overview, practice summary');

  await navLink(page, 'Stats').click();
  await expect(page.getByRole('heading', { name: 'Badges' })).toBeVisible();
  await expectWellDrawn(page, 'stats');
  await expectFocusRings(page, 'stats');

  await navLink(page, 'Songs').click();
  await expect(page.getByRole('main').getByRole('link', { name: 'Groove 120' })).toBeVisible();
  await expectWellDrawn(page, 'library');
  // The upload's file input is sr-only: its ring was judged on the label that shows it.
  expect(await expectFocusRings(page, 'library'), 'library: rings measured on a label').toContain(
    '<label> "Upload a Guitar Pro file"',
  );
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
  // Segmented controls since the 12 UX pass; the mode shows only with a count-in to play.
  await expect(bar.getByRole('radiogroup', { name: 'Count-in', exact: true })).toBeVisible();
  for (const name of ['Off', '1 bar', '2 bars']) {
    await expect(bar.getByRole('radio', { name, exact: true })).toBeAttached();
  }
  await expect(bar.getByRole('radiogroup', { name: 'When to count in' })).toHaveCount(0);
  await expect(playButton(page)).toHaveAccessibleName('Play');
  for (const name of ['Songs', 'Stats', 'Settings']) {
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }),
    ).toBeVisible();
  }
});

/**
 * The boxes of the controls bar's controls on show: a segmented control's
 * option by its label, which is what draws it (the radio is visually hidden).
 */
const controlBoxes = (page: Page) =>
  controls(page)
    .locator('button, input:not([type="radio"]), select, label:has(> input[type="radio"])')
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
    // Back to start, Metronome, Mute drums, Drums only, Mute all, Speed, volume, and the
    // count-in's Off / 1 bar / 2 bars (its mode shows only once a count-in is chosen).
    expect(boxes, `${width} px: controls on show`).toHaveLength(10);
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
        await chooseCountIn(page, 2);
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

test('a song’s recordings: the overview’s buttons and form, and the play screen on a video', async ({
  user,
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await stubServices(context);
  await signIn(page, user, '/');
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Groove 120”.' })).toBeVisible();
  await openSongOverview(page, 'Groove 120');
  await expect(page.getByRole('button', { name: 'Add a recording' })).toBeVisible();
  await expectWellDrawn(page, 'overview, no recordings');
  await expectFocusRings(page, 'overview, no recordings');

  // The form, with a refused link's message, a recognised one, and an other link being added.
  await openRecordingsForm(page, 'Groove 120');
  await linkField(page, 'Original').fill(WATCH_URL);
  await linkField(page, 'Drumless').fill('javascript:alert(1)');
  await recordingsForm(page).getByRole('button', { name: 'Add another link' }).click();
  await recordingsForm(page).getByRole('button', { name: 'Save' }).click();
  await expect(recordingsForm(page).getByRole('alert')).toBeVisible();
  await expectWellDrawn(page, 'recordings form');
  await expectFocusRings(page, 'recordings form');

  // A host and an address as long as they come, with nowhere to break.
  const longHost = `${'drumlessons'.repeat(5)}.example.com`;
  const longUrl = `https://example.com/${'cover'.repeat(380)}`;
  await linkField(page, 'Drumless').fill(`https://${longHost}/drumless`);
  await linkField(page, 'Other link 1').fill(longUrl);
  await expect(recordingsForm(page)).toContainText(`Link to ${longHost}.`);
  expect(await textSpillingOutOf(recordingsForm(page)), 'recordings form').toEqual([]);
  await recordingsForm(page).getByRole('button', { name: 'Save' }).click();
  await expect(recordingsForm(page)).toHaveCount(0);

  await expect(
    playAlong(page).getByRole('link', { name: `Drumless on ${longHost}` }),
  ).toBeVisible();
  await expect(playAlong(page).getByRole('list', { name: 'Other links' })).toBeVisible();
  await expectWellDrawn(page, 'overview, with recordings');
  await expectFocusRings(page, 'overview, with recordings');
  expect(await textSpillingOutOf(playAlong(page)), 'play along').toEqual([]);
  expect((await auditScreen(page)).overflow).toEqual([]);

  await playAlong(page).getByRole('link', { name: 'Original', exact: true }).click();
  await expect(recordingFrame(page)).toBeVisible();
  await expect(viewport(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });
  await expectWellDrawn(page, 'play screen, on a recording');
  const throughLabel = await expectFocusRings(page, 'play screen, on a recording');
  // The source switch's radios are hidden inside their labels, which draw the ring.
  expect(throughLabel.join(' ')).toContain('Original');
});

test('a long unbroken loop name wraps inside the loop panel and on the home page', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  // 100 characters, the longest name the database takes (LOOP_NAME_MAX_LENGTH),
  // with nowhere to break: wider than any panel.
  const name = 'Paradiddle'.repeat(10);
  await saveNewLoop(page, { name, firstBar: 1, lastBar: 2 });
  await openLoopPanel(page);
  const item = loopItem(page, name);
  await expect(item).toBeVisible();
  expect(await textSpillingOutOf(item), 'loop item').toEqual([]);
  expect(await textSpillingOutOf(loopPanel(page)), 'loop panel').toEqual([]);
  const sidewaysScrollers = await loopPanel(page).evaluate((panel) =>
    [panel, ...Array.from(panel.querySelectorAll('*'))]
      // Screen-reader-only text is a clipped 1 px box by design.
      .filter((el) => {
        if (el.closest('.sr-only')) return false;
        const { overflowX, textOverflow } = getComputedStyle(el);
        return (
          el.scrollWidth > el.clientWidth + 1 &&
          overflowX !== 'visible' &&
          textOverflow !== 'ellipsis'
        );
      })
      .map(
        (el) =>
          `<${el.tagName.toLowerCase()} class="${el.className}"> ${el.scrollWidth} in ${el.clientWidth}`,
      ),
  );
  expect(sidewaysScrollers, 'nothing in the panel scrolls sideways').toEqual([]);
  expect((await auditScreen(page)).overflow).toEqual([]);
  // Not vacuous: the name is on show, on more than one line.
  const lines = await item
    .getByRole('paragraph')
    .filter({ hasText: name })
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    });
  expect(lines, 'the name wraps').toBeGreaterThan(1);

  await backTo(page, 'Groove 120').click();
  const row = overviewItem(page, 'on the go', name);
  await expect(row).toBeVisible();
  expect(await textSpillingOutOf(row), 'overview row').toEqual([]);
  expect((await auditScreen(page)).overflow).toEqual([]);
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

/**
 * Where a loop's open "More" menu lies outside the window, the loop panel or
 * any ancestor that clips it, as text for the failure; empty when all of it shows.
 */
function menuOutside(menu: Locator): Promise<string[]> {
  return menu.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const panel = el.closest('[data-testid="loop-panel"]');
    const boxes: {
      box: DOMRect | { left: number; top: number; right: number; bottom: number };
      what: string;
    }[] = [
      {
        box: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
        what: 'window',
      },
    ];
    if (panel) boxes.push({ box: panel.getBoundingClientRect(), what: 'loop panel' });
    for (let up = el.parentElement; up; up = up.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(up);
      if (overflowX !== 'visible' || overflowY !== 'visible') {
        boxes.push({
          box: up.getBoundingClientRect(),
          what: `<${up.tagName.toLowerCase()}>`,
        });
      }
    }
    return boxes
      .filter(
        ({ box }) =>
          rect.left < box.left - 0.5 ||
          rect.top < box.top - 0.5 ||
          rect.right > box.right + 0.5 ||
          rect.bottom > box.bottom + 0.5,
      )
      .map(
        ({ box, what }) =>
          `${what}: menu ${Math.round(rect.left)}..${Math.round(rect.right)} x ${Math.round(rect.top)}..${Math.round(rect.bottom)} in ${Math.round(box.left)}..${Math.round(box.right)} x ${Math.round(box.top)}..${Math.round(box.bottom)}`,
      );
  });
}

// 12 QA after the UX pass, issue 1: a loop's "More" menu hung off the panel's left edge
// wherever More started its row (a phone's active loops, the column's finished ones).
test('a loop’s More menu opens inside the loop panel, for active and finished loops', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Fill', firstBar: 3, lastBar: 4 });
  await loopItem(page, 'Fill')
    .getByRole('button', { name: /^Mark finished/ })
    .click();
  await expect(
    loopPanel(page)
      .getByRole('region', { name: 'Finished loops' })
      .getByRole('listitem')
      .filter({ hasText: 'Fill' }),
  ).toBeVisible();
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await saveNewLoop(page, { name: 'Chorus', firstBar: 9, lastBar: 12 });

  // Chorus is the loop set up (Now looping), Verse an active loop beside it, Fill finished.
  for (const name of ['Chorus', 'Verse', 'Fill']) {
    await openLoopPanel(page);
    const more = loopItem(page, name).getByRole('button', { name: `More actions for ${name}` });
    await more.click();
    const menu = loopPanel(page).getByRole('menu', { name: `Actions for ${name}` });
    await expect(menu).toBeVisible();
    // Inside the panel's box and every box that clips it, the window included: all of it shows.
    await expect
      .poll(() => menuOutside(menu), { message: `${name}'s menu lies outside` })
      .toEqual([]);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
  }
});

// 12 Test after the QA fix round: the narrowest phone, where finished loops' buttons wrap too.
test('at 320 px a loop’s More menu opens inside the sheet, active and finished', async ({
  user,
  page,
}) => {
  test.skip(test.info().project.name !== 'phone', 'about phone widths');
  await page.setViewportSize({ width: 320, height: 640 });
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Fill', firstBar: 3, lastBar: 4 });
  await loopItem(page, 'Fill')
    .getByRole('button', { name: /^Mark finished/ })
    .click();
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });

  for (const name of ['Verse', 'Fill']) {
    await openLoopPanel(page);
    await loopItem(page, name)
      .getByRole('button', { name: `More actions for ${name}` })
      .click();
    const menu = loopPanel(page).getByRole('menu', { name: `Actions for ${name}` });
    await expect(menu).toBeVisible();
    await expect
      .poll(() => menuOutside(menu), { message: `${name}'s menu lies outside` })
      .toEqual([]);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }
});
