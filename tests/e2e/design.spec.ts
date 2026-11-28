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
import {
  closeLoopPanel,
  loopItem,
  loopPanel,
  loopSheetHeader,
  openLoopPanel,
  saveNewLoop,
} from './loopsPage';
import {
  controls,
  chooseCountIn,
  openFixture,
  openSongOverview,
  playButton,
  viewport,
} from './playerPage';
import {
  addLoopLeftAlone,
  backTo,
  loopsOf,
  navLink,
  nudge,
  openLoopHistory,
  openPractice,
  overviewItem,
  playFor,
  practiceSpeed,
  visitSummary,
  shortSessions,
} from './practicePage';
import {
  addRecordingButton,
  linkField,
  openNewSongOverview,
  openRecordingsForm,
  playAlong,
  recordingFrame,
  recordingLink,
  recordingsForm,
  saveRecordingsButton,
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

  // A second loop practised once, nine days ago: with it the page has every
  // block it can draw (17 QA fix round 1): the lines against the week before,
  // "Not practised lately" and, from a second practice day, Records.
  await addLoopLeftAlone(user, 'Fill', 9);
  await navLink(page, 'Stats').click();
  await expect(page.getByRole('heading', { name: 'Badges' })).toBeVisible();
  // The loop came from outside the page, as from another device: a reload reads it.
  await page.reload();
  await expect(
    page.getByTestId('neglected-loop').getByRole('link', { name: 'Fill' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Records/ })).toBeVisible();
  await expect(page.getByTestId('total-time-change')).toBeVisible();
  await expectWellDrawn(page, 'stats');
  await expectFocusRings(page, 'stats');

  // Unit 17: a loop's chart open under its row, and every badge on show.
  await page.getByRole('button', { name: 'Chart of Verse' }).click();
  await expect(page.getByRole('img', { name: /^Speed of Verse/ })).toBeVisible();
  await page.getByRole('button', { name: 'Show all badges' }).click();
  await expect(page.getByRole('list', { name: 'More badges' })).toBeVisible();
  await expectWellDrawn(page, 'stats, chart and all badges');
  await expectFocusRings(page, 'stats, chart and all badges');

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
  await openNewSongOverview(page, user);
  await expect(addRecordingButton(page)).toBeVisible();
  await expectWellDrawn(page, 'overview, no recordings');
  await expectFocusRings(page, 'overview, no recordings');

  // The form, with a refused link's message, a recognised one, and an other link being added.
  await openRecordingsForm(page, 'Groove 120');
  await linkField(page, 'Original').fill(WATCH_URL);
  await linkField(page, 'Drumless').fill('javascript:alert(1)');
  await recordingsForm(page).getByRole('button', { name: 'Add another link' }).click();
  await saveRecordingsButton(page).click();
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
  await saveRecordingsButton(page).click();
  await expect(recordingsForm(page)).toHaveCount(0);

  await expect(
    playAlong(page).getByRole('link', { name: `Drumless on ${longHost}` }),
  ).toBeVisible();
  await expect(playAlong(page).getByRole('list', { name: 'Other links' })).toBeVisible();
  await expectWellDrawn(page, 'overview, with recordings');
  await expectFocusRings(page, 'overview, with recordings');
  expect(await textSpillingOutOf(playAlong(page)), 'play along').toEqual([]);
  expect((await auditScreen(page)).overflow).toEqual([]);

  await recordingLink(page, 'Original').click();
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

// 20 batch 8 (13.35c, 13.21): a refused "Mark finished" says so under the loop with a
// "Dismiss" beside it, in the loop panel and on the song's page. Each write is held first,
// so the loop is seen in the other list, with focus on it, before the refusal moves it back.
test('a refused status change: its message and Dismiss, in the loop panel and on the song’s page', async ({
  user,
  page,
}) => {
  test.setTimeout(90_000);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await openLoopPanel(page);

  // Refused as a missing grant is: a code, so no retry, and nothing reaches the database.
  const held: (() => void)[] = [];
  await page.route('**/rest/v1/loops*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await new Promise<void>((resolve) => held.push(resolve));
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ code: '42501', message: 'permission denied for table loops' }),
    });
  });
  const refuseWrite = async () => {
    await expect.poll(() => held.length).toBe(1);
    held.shift()?.();
  };

  const finish = loopItem(page, 'Verse').getByRole('button', { name: 'Mark finished Verse' });
  await finish.focus();
  await page.keyboard.press('Enter');
  await expect(loopPanel(page).getByRole('button', { name: 'Reopen Verse' })).toBeFocused();
  await refuseWrite();

  const panelAlert = loopItem(page, 'Verse').getByRole('alert');
  await expect(panelAlert).toContainText("Couldn't mark the loop finished.");
  // Back among the active loops, and focus with it, not on <body>.
  await expect(finish).toBeFocused();
  const panelDismiss = loopItem(page, 'Verse').getByRole('button', { name: /^Dismiss/ });
  await expect(panelDismiss).toBeVisible();
  await expectWellDrawn(page, 'loop panel, refused status change');
  await expectFocusRings(page, 'loop panel, refused status change');

  await panelDismiss.click();
  await expect(panelAlert).toHaveCount(0);
  await expect(panelDismiss).toHaveCount(0);
  await expect(finish).toBeFocused();

  // The song's page: the change is in the loop's More menu, which takes the focus.
  await backTo(page, 'Groove 120').click();
  const row = overviewItem(page, 'on the go', 'Verse');
  const more = row.getByRole('button', { name: 'More actions for Verse' });
  await more.click();
  await page.getByRole('menuitem', { name: 'Mark finished' }).click();
  await expect(
    overviewItem(page, 'mastered', 'Verse').getByRole('button', { name: 'More actions for Verse' }),
  ).toBeFocused();
  await refuseWrite();

  await expect(row.getByRole('alert')).toContainText("Couldn't mark the loop finished.");
  await expect(more).toBeFocused();
  await expectWellDrawn(page, 'song overview, refused status change');
  await expectFocusRings(page, 'song overview, refused status change');

  // Left without dismissing: the message is not there on coming back.
  await navLink(page, 'Settings').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goBack();
  await expect(overviewItem(page, 'on the go', 'Verse')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await loopsOf(user)).map((loop) => loop.status)).toEqual(['active']);
});

// 20 batch 8, Test. Holds each write of a loop's status, then refuses it as a missing grant
// is refused (a code, so no retry). Any other write of a loop (a speed saving itself) goes
// through. The returned function lets the one held write be refused.
async function refuseStatusWrites(page: Page): Promise<() => Promise<void>> {
  const held: (() => void)[] = [];
  await page.route('**/rest/v1/loops*', async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH' || !(request.postData() ?? '').includes('"status"')) {
      return route.fallback();
    }
    await new Promise<void>((resolve) => held.push(resolve));
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ code: '42501', message: 'permission denied for table loops' }),
    });
  });
  return async () => {
    await expect.poll(() => held.length).toBe(1);
    const refused = page.waitForResponse(
      (response) => response.status() === 403 && response.request().method() === 'PATCH',
    );
    held.shift()?.();
    await refused;
  };
}

/** Where focus is: never `<body>` after any of this batch's changes. */
const focusIsOnAControl = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active !== null && active !== document.body && active.isConnected;
  });

/**
 * A refusal's message and its "Dismiss", drawn inside `container`: nothing spills, Dismiss
 * is a 44 px target that lies inside the container, and the two don't overlap.
 */
async function expectRefusalDrawnIn(container: Locator, where: string): Promise<void> {
  const alert = container.getByRole('alert');
  const dismiss = container.getByRole('button', { name: /^Dismiss/ });
  await expect(alert, where).toBeVisible();
  await expect(dismiss, where).toBeVisible();
  expect(await textSpillingOutOf(container), `${where}: text spilling`).toEqual([]);
  const [outer, message, button] = await Promise.all([
    container.boundingBox(),
    alert.boundingBox(),
    dismiss.boundingBox(),
  ]);
  if (!outer || !message || !button) throw new Error(`${where}: nothing to measure`);
  expect(button.height, `${where}: Dismiss's height`).toBeGreaterThanOrEqual(44);
  expect(button.width, `${where}: Dismiss's width`).toBeGreaterThanOrEqual(44);
  expect(button.x, `${where}: Dismiss's left edge`).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(button.x + button.width, `${where}: Dismiss's right edge`).toBeLessThanOrEqual(
    outer.x + outer.width + 0.5,
  );
  expect(message.x + message.width, `${where}: the message's right edge`).toBeLessThanOrEqual(
    outer.x + outer.width + 0.5,
  );
  // Side by side or wrapped under: either way one doesn't lie over the other.
  const apart =
    button.x >= message.x + message.width - 0.5 || button.y >= message.y + message.height - 0.5;
  expect(apart, `${where}: Dismiss lies over the message`).toBe(true);
}

// The narrowest phone: the message is three short sentences and Dismiss wraps under it.
test('at 320 px a refused status change’s message and Dismiss fit the loop sheet and the song’s row, and Dismiss leaves focus on a control', async ({
  user,
  page,
}) => {
  test.skip(test.info().project.name !== 'phone', 'about phone widths');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 640 });
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await openLoopPanel(page);
  const refuse = await refuseStatusWrites(page);

  const item = loopItem(page, 'Verse');
  const finish = item.getByRole('button', { name: 'Mark finished Verse' });
  await finish.focus();
  await page.keyboard.press('Enter');
  await expect(loopPanel(page).getByRole('button', { name: 'Reopen Verse' })).toBeFocused();
  await refuse();
  await expect(item.getByRole('alert')).toContainText("Couldn't mark the loop finished.");
  await expect(finish).toBeFocused();
  await expectRefusalDrawnIn(item, 'loop sheet at 320 px');
  await expectWellDrawn(page, 'loop sheet at 320 px, refused status change');

  // Dismiss by keyboard: it goes with the message, and focus is on the loop's button.
  await item.getByRole('button', { name: /^Dismiss/ }).focus();
  await page.keyboard.press('Enter');
  await expect(item.getByRole('alert')).toHaveCount(0);
  await expect(finish).toBeFocused();

  // Refused while the sheet is closed: its buttons are hidden, and focus stays on the
  // header that closed it. The message is there when the sheet is opened.
  await finish.press('Enter');
  await expect(loopPanel(page).getByRole('button', { name: 'Reopen Verse' })).toBeFocused();
  const header = loopSheetHeader(page);
  await closeLoopPanel(page);
  await expect(header).toBeFocused();
  await refuse();
  // A frame or two for the page to draw the refusal it was just given.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await expect(header).toBeFocused();
  await openLoopPanel(page);
  await expect(item.getByRole('alert')).toContainText("Couldn't mark the loop finished.");
  await expect(header).toBeFocused();
  await item.getByRole('button', { name: /^Dismiss/ }).click();
  await expect(item.getByRole('alert')).toHaveCount(0);
  expect(await focusIsOnAControl(page)).toBe(true);

  // The song's page: the row is the page's width, the message under the loop's line.
  await backTo(page, 'Groove 120').click();
  const row = overviewItem(page, 'on the go', 'Verse');
  const more = row.getByRole('button', { name: 'More actions for Verse' });
  await more.click();
  await page.getByRole('menuitem', { name: 'Mark finished' }).click();
  await expect(
    overviewItem(page, 'mastered', 'Verse').getByRole('button', { name: 'More actions for Verse' }),
  ).toBeFocused();
  await refuse();
  await expect(row.getByRole('alert')).toContainText("Couldn't mark the loop finished.");
  await expect(more).toBeFocused();
  await expectRefusalDrawnIn(row, 'song overview at 320 px');
  await expectWellDrawn(page, 'song overview at 320 px, refused status change');

  await row.getByRole('button', { name: /^Dismiss/ }).click();
  await expect(row.getByRole('alert')).toHaveCount(0);
  await expect(row.getByRole('button', { name: /^Dismiss/ })).toHaveCount(0);
  await expect(more).toBeFocused();
  expect((await loopsOf(user)).map((loop) => loop.status)).toEqual(['active']);
});

// 20 batch 8, Review (Test's bug 2): the practice band's speed and Play were about 334 px wide
// side by side, so a 320 px phone's page panned sideways with the row cut at both edges. Under
// 360 px the two sit closer and the pill's ends are narrower; from 360 px nothing changed.
// The row's width is its text's, so it differs by font: on CI it was 335 px, and a switch at
// 334 px (the width measured locally) left a 334 px window a pixel too narrow there. The
// widths between (334, 344, 359) are asserted to fit, whichever fonts drew them.
test('the practice screen fits a 320 px phone, and its speed and Play row is as it was from 360 px', async ({
  user,
  page,
}) => {
  test.skip(test.info().project.name !== 'phone', 'about phone widths');
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await backTo(page, 'Groove 120').click();
  await openPractice(page, 'Verse');
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });

  /** The row's box and gap, the "−5%" end's width, and how wide the page is. */
  const measure = () =>
    page.evaluate(() => {
      const slower = document.querySelector('button[aria-label="Slower by 5%"]');
      const row = slower?.closest('[role="group"]')?.parentElement;
      if (!slower || !row) return null;
      const box = row.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        gap: getComputedStyle(row).columnGap,
        endWidth: slower.getBoundingClientRect().width,
        pageWidth: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
      };
    });

  for (const width of [320, 328, 334, 344, 359]) {
    await page.setViewportSize({ width, height: 640 });
    const narrow = await measure();
    if (!narrow) throw new Error('no speed and Play row to measure');
    expect(narrow.pageWidth, `the page's width in a ${width} px window`).toBe(width);
    expect(narrow.left, `the row's left edge at ${width} px`).toBeGreaterThanOrEqual(0);
    expect(narrow.right, `the row's right edge at ${width} px`).toBeLessThanOrEqual(width);
    // Still a touch target.
    expect(narrow.endWidth, `the −5% end at ${width} px`).toBeGreaterThanOrEqual(44);
    await expectWellDrawn(page, `practice at ${width} px`);
  }

  // From 360 px up it is as it was: the wider gap and ends, the page no wider.
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const wide = await measure();
    expect(wide, `at ${width} px`).toMatchObject({
      gap: '16px',
      endWidth: 56,
      pageWidth: width,
    });
  }
});

// The third place a loop's status is changed: the practice screen's "Mark finished?" prompt.
test('a refused Mark finished from the practice screen’s prompt: the prompt is back with the message and Dismiss, and focus is never on <body>', async ({
  user,
  page,
}) => {
  test.setTimeout(90_000);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 5, lastBar: 8 });
  await backTo(page, 'Groove 120').click();
  await openPractice(page, 'Verse');
  // Worked back up to full speed, which is what the prompt asks about.
  await nudge(page, 'Slower').click();
  await expect(practiceSpeed(page)).toContainText('95%');
  await nudge(page, 'Faster').click();
  await expect(practiceSpeed(page)).toContainText('100%');
  const prompt = page.getByTestId('finish-prompt');
  await expect(prompt).toBeVisible();
  const refuse = await refuseStatusWrites(page);

  const finish = prompt.getByRole('button', { name: 'Mark finished' });
  await finish.focus();
  await page.keyboard.press('Enter');
  // The loop is finished, for now: the prompt goes and focus goes on to Play.
  await expect(prompt).toHaveCount(0);
  await expect(playButton(page)).toBeFocused();
  await refuse();

  await expect(prompt).toContainText("Couldn't mark the loop finished.");
  expect(await focusIsOnAControl(page)).toBe(true);
  await expect(playButton(page)).toBeFocused();
  await expectRefusalDrawnIn(prompt, 'practice prompt');
  await expectWellDrawn(page, 'practice screen, refused Mark finished');
  await expectFocusRings(page, 'practice screen, refused Mark finished');
  if (test.info().project.name === 'phone') {
    // The narrowest phone: the prompt, and the page with it (the band's speed and Play
    // fit 320 px since 20 batch 8 Review; the test below is about that row).
    await page.setViewportSize({ width: 320, height: 640 });
    await expectRefusalDrawnIn(prompt, 'practice prompt at 320 px');
    await expectWellDrawn(page, 'practice screen at 320 px, refused Mark finished');
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await prompt.getByRole('button', { name: /^Dismiss/ }).click();
  await expect(prompt.getByRole('alert')).toHaveCount(0);
  await expect(prompt.getByRole('button', { name: /^Dismiss/ })).toHaveCount(0);
  await expect(finish).toBeFocused();
  expect((await loopsOf(user)).map((loop) => loop.status)).toEqual(['active']);

  // Refused once more and left as it is: not said again under the loop on the song's page.
  await page.keyboard.press('Enter');
  await expect(prompt).toHaveCount(0);
  await refuse();
  await expect(prompt.getByRole('alert')).toBeVisible();
  await backTo(page, 'Groove 120').click();
  await expect(overviewItem(page, 'on the go', 'Verse')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Dismiss/ })).toHaveCount(0);
  await expect(page.getByText(/Couldn't (mark the loop finished|reopen the loop)/)).toHaveCount(0);
});
