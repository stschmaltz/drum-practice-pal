/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, signIn, test } from './auth';
import { closeLoopPanel, loopSpeed, openLoopPanel, playLoopButton, saveNewLoop } from './loopsPage';
import {
  barNumber,
  beatCursorOnScreen,
  boxOf,
  chooseCountIn,
  controls,
  drumsOnlyButton,
  expectedLayout,
  fixture,
  layoutForWidth,
  muteDrumsButton,
  openFixture,
  openSongPlayer,
  playButton,
  recordedStatuses,
  recordStatuses,
  showControls,
  status,
  viewport,
  visibleBottom,
  windowScrollSettled,
} from './playerPage';
import { navLink, playFor, sessionLogged, shortSessions } from './practicePage';

// Unit 05: the song page's player. Nothing here listens to audio; sound is a Human check.

const admin = createAdminClient();

/** Counts AudioContexts the page creates and reports their states, to see alphaTab let go of audio. */
async function trackAudioContexts(page: Page) {
  await page.addInitScript(() => {
    const created: AudioContext[] = [];
    (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts = created;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        created.push(this);
      }
    };
  });
}

async function audioContextStates(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts.map((c) => c.state),
  );
}

/** Rendered notation width against the scroll box: page layout fits, horizontal overflows. */
async function layoutShown(page: Page): Promise<'page' | 'horizontal'> {
  const { surface, box } = await viewport(page).evaluate((el) => ({
    surface: el.querySelector('.at-surface')?.getBoundingClientRect().width ?? 0,
    box: el.clientWidth,
  }));
  return surface > box + 1 ? 'horizontal' : 'page';
}

/** How far the page scrolls sideways; 0 or less means it fits. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('opens a song in the player with notation in the layout for the width', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(status(page)).toHaveText('Bar 1 of 16');
  await expect(playButton(page)).toHaveText('Play');

  expect(await layoutShown(page)).toBe(expectedLayout(page));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The inputs themselves, not just their row, must be 44 px tall to be easy to grab.
  for (const name of ['Speed', 'Metronome volume']) {
    const box = await controls(page).getByRole('slider', { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }
});

test('speed, metronome and drum mute change live without restarting playback', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const speed = controls(page).getByRole('slider', { name: 'Speed' });
  await speed.fill('200');
  await expect(controls(page).getByText('200%')).toBeVisible();

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const before = await barNumber(page);

  await speed.fill('150');
  const metronome = controls(page).getByRole('button', { name: 'Metronome' });
  const pressedBefore = await metronome.getAttribute('aria-pressed');
  await metronome.click();
  await expect(metronome).not.toHaveAttribute('aria-pressed', pressedBefore ?? '');
  // The volume and the drum mute fold away while playing; "Show controls" brings them.
  await showControls(page);
  await controls(page).getByRole('slider', { name: 'Metronome volume' }).fill('30');
  const mute = muteDrumsButton(page);
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');

  // Still playing and still moving forward: a restart would have gone back to bar 1.
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(before);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await controls(page).getByRole('button', { name: 'Back to start' }).click();
  await expect(status(page)).toHaveText('Bar 1 of 16');
});

test('starts with the metronome and drum mute from settings', async ({ user, page }) => {
  const { error } = await admin
    .from('user_settings')
    .update({ metronome_on: false, metronome_volume: 0.4, drums_muted_default: true })
    .eq('user_id', user.id);
  if (error) throw error;

  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(controls(page).getByRole('button', { name: 'Metronome' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(controls(page).getByRole('slider', { name: 'Metronome volume' })).toHaveValue('40');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(controls(page).getByRole('slider', { name: 'Speed' })).toHaveValue('100');
});

test('a song without drums disables drum mute', async ({ user, page }) => {
  await openFixture(page, user, 'no-drums', 'No Drums');
  await expect(muteDrumsButton(page)).toBeDisabled();
});

test('a song without drums disables drums only, with the reason', async ({ user, page }) => {
  await openFixture(page, user, 'no-drums', 'No Drums');
  const drumsOnly = drumsOnlyButton(page);
  await expect(drumsOnly).toBeDisabled();
  await expect(drumsOnly).toHaveAccessibleDescription('This song has no drum track');
});

// Unit 07. Which tracks sound is a Human check; this covers the toggle and that nothing restarts.
test('drums only and mute drums exclude each other and change live on a multi-track song', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'multi-track', 'Multi Track');
  const mute = muteDrumsButton(page);
  const drumsOnly = drumsOnlyButton(page);
  await expect(drumsOnly).toBeEnabled();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'false');

  // Beside Mute drums on the same row, so the bar is no taller for it, and a full touch target.
  const muteBox = await boxOf(mute, 'Mute drums button');
  const onlyBox = await boxOf(drumsOnly, 'Drums only button');
  expect(onlyBox.y).toBe(muteBox.y);
  expect(onlyBox.x).toBeGreaterThan(muteBox.x);
  expect(onlyBox.height).toBeGreaterThanOrEqual(44);

  // At full speed: eight bars at 100 BPM leave time for every step before the song ends.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  let before = await barNumber(page);

  // Playing folds the controls bar; the drum toggles are behind "Show controls".
  await showControls(page);
  await drumsOnly.click();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'true');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'false');
  await drumsOnly.click();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'true');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  // Still playing and still moving forward: a restart would have gone back to bar 1.
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(before);

  before = await barNumber(page);
  await drumsOnly.click();
  await expect(drumsOnly).toHaveAttribute('aria-pressed', 'false');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(before);
});

test('leaving the song page mid-play releases the player', async ({ user, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await trackAudioContexts(page);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Songs' })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();

  await expect.poll(() => audioContextStates(page)).not.toContain('running');
  expect(await audioContextStates(page)).not.toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a damaged file in Storage shows the score error, not a stray score', async ({
  user,
  page,
}) => {
  await signIn(page, user, '/library');
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Groove 120”.' })).toBeVisible();
  const { data: song, error } = await admin
    .from('songs')
    .select('id, file_path')
    .eq('user_id', user.id)
    .single();
  if (error) throw error;
  // Bytes alphaTab's alphaTex fallback would happily read as a one-bar score.
  const junk = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
  const replaced = await admin.storage
    .from('gp-files')
    .upload(song.file_path, junk, { upsert: true, contentType: 'application/octet-stream' });
  if (replaced.error) throw replaced.error;

  await page.goto(`/songs/${song.id}/play`);

  await expect(page.getByRole('alert')).toHaveText(
    "This song couldn't be shown or played. Try reloading, or upload the file again.",
  );
  await expect(playButton(page)).toBeDisabled();
});

test('an unknown song id shows not found', async ({ user, page }) => {
  await signIn(page, user, '/songs/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { level: 1, name: 'Song not found' })).toBeVisible();
});

test('pause and play resume from the same bar, not the start', async ({ user, page }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await controls(page).getByRole('slider', { name: 'Speed' }).fill('200');
  await playButton(page).click();
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  const pausedAt = await barNumber(page);
  expect(pausedAt).toBeGreaterThanOrEqual(3);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(pausedAt);
});

test('crossing the layout breakpoint mid-play relayouts and keeps playing', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const start = page.viewportSize();
  if (!start) throw new Error('No viewport');
  const startLayout = layoutForWidth(start.width);
  await expect.poll(() => layoutShown(page)).toBe(startLayout);

  await controls(page).getByRole('slider', { name: 'Speed' }).fill('200');
  await playButton(page).click();
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  // Narrowing within page layout must not leave the old score width pushing the page sideways.
  if (start.width > 900) {
    await page.setViewportSize({ width: 900, height: start.height });
    await expect.poll(() => horizontalOverflow(page), { timeout: 10_000 }).toBeLessThanOrEqual(0);
  }

  const otherWidth = startLayout === 'page' ? 390 : 1024;
  await page.setViewportSize({ width: otherWidth, height: start.height });
  await expect
    .poll(() => layoutShown(page), { timeout: 10_000 })
    .toBe(startLayout === 'page' ? 'horizontal' : 'page');

  const afterResize = await barNumber(page);
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(afterResize);
});

// 12 UX pass, item 1: the score gets the screen while playing.
test('the controls fold to a strip under the sticky bar while playing, without touching playback', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const bar = controls(page);
  const fullHeight = (await boxOf(bar, 'controls')).height;
  await recordStatuses(page);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  const show = bar.getByRole('button', { name: 'Show controls' });
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(bar.getByRole('button', { name: 'Metronome' })).toBeVisible();
  await expect(bar.getByRole('slider', { name: 'Speed' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Mute drums' })).toHaveCount(0);
  const strip = await boxOf(bar, 'folded controls');
  expect(strip.height).toBeLessThan(fullHeight / 2);

  // It sticks right under the sticky bar when the page scrolls.
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  const jamBar = await boxOf(page.getByTestId('jam-bar'), 'sticky bar');
  await expect
    .poll(async () => Math.round((await boxOf(bar, 'folded controls')).y))
    .toBe(Math.round(jamBar.y + jamBar.height));

  // The keys for what folded away still work: D mutes the drums, seen once the bar is out.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('d');
  await show.click();
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.getByRole('button', { name: 'Hide controls' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(bar.getByRole('button', { name: /^(Show|Hide) controls$/ })).toHaveCount(0);
  await expect(muteDrumsButton(page)).toBeVisible();
  // Playing then paused, nothing in between: folding never stopped or reloaded anything.
  expect(await recordedStatuses(page)).toEqual(['ready', 'playing', 'ready']);
});

// 12 QA after the UX pass, issue 2: on the short groove-120 page there is no room to scroll
// back what the fold takes away (on a phone with the sheet closed the page doesn't scroll at
// all), so the page holds that room under the controls while folded. From the top of the page,
// with the loop panel closed and open, with the page as it is (which turns Chromium's scroll
// anchoring off since 12 QA fix round 2) and with anchoring forced off by a stylesheet as
// well, neither Play nor Pause moves the score.
test('on a short page Play and Pause leave the score where it is, from the top, panel open or closed', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  const scoreTop = () => viewport(page).evaluate((box) => box.getBoundingClientRect().top);
  const anchoringOff = 'html, body, main { overflow-anchor: none !important; }';

  for (const anchoring of ['on', 'off'] as const) {
    if (anchoring === 'off') await page.addStyleTag({ content: anchoringOff });
    for (const panel of ['closed', 'open'] as const) {
      const what = `${panel} panel, scroll anchoring ${anchoring}`;
      if (panel === 'open') await openLoopPanel(page);
      else await closeLoopPanel(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await windowScrollSettled(page);
      const paused = await scoreTop();

      await playButton(page).click();
      await expect(playButton(page)).toHaveText('Pause');
      await expect(controls(page).getByRole('button', { name: 'Show controls' })).toBeVisible();
      await windowScrollSettled(page);
      const playing = await scoreTop();
      if ((await page.evaluate(() => window.scrollY)) === 0) {
        // Nothing scrolled (on a phone the page can't): the fold alone mustn't move the score.
        expect(Math.abs(playing - paused), `${what}: Play`).toBeLessThanOrEqual(1);
      } else {
        // Play brought a score that wasn't all on show into the window (Unit 06), clear of the
        // sticky bar and the strip: that move is Play's, not the fold's.
        const strip = await boxOf(controls(page), 'folded controls');
        expect(playing, `${what}: Play shows the score`).toBeGreaterThanOrEqual(
          strip.y + strip.height - 1,
        );
      }

      await playButton(page).click();
      await expect(playButton(page)).toHaveText('Play');
      await expect(muteDrumsButton(page)).toBeVisible();
      await windowScrollSettled(page);
      expect(Math.abs((await scoreTop()) - playing), `${what}: Pause`).toBeLessThanOrEqual(1);
      // Nothing held once unfolded: the page is its own height again.
      await expect(
        page.getByTestId('controls-slot'),
        `${what}: no room kept while paused`,
      ).toHaveCSS('margin-bottom', '0px');
    }
  }
});

/** The player's status, read through `window.__drumPalPlayer` (dev and e2e builds only). */
const playerStatus = (page: Page) =>
  page.evaluate(() => {
    const player = (
      window as unknown as { __drumPalPlayer?: { getSnapshot(): { status: string } } }
    ).__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    return player.getSnapshot().status;
  });

// 12 QA after the QA fix round, issue 2: with a count-in on, Chromium's scroll anchoring
// scrolled the window up at Pause as the room went, and the page then scrolled up by the same
// again, so the score moved 109 px (tablet) and 117 px (desktop). A Pause in the count-in and
// a Pause once playing, from the top of the short page, with the browser's anchoring as it is.
test('on a short page with a count-in on, Pause leaves the score where it is, counting in or playing', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await closeLoopPanel(page);
  await chooseCountIn(page, 2);
  const scoreTop = () => viewport(page).evaluate((box) => box.getBoundingClientRect().top);

  for (const pauseWhile of ['countingIn', 'playing'] as const) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await windowScrollSettled(page);
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
    await expect.poll(() => playerStatus(page), { timeout: 10_000 }).toBe(pauseWhile);
    await windowScrollSettled(page);
    const playing = await scoreTop();

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
    await expect(muteDrumsButton(page)).toBeVisible();
    await windowScrollSettled(page);
    expect(Math.abs((await scoreTop()) - playing), `Pause while ${pauseWhile}`).toBeLessThanOrEqual(
      1,
    );
    await expect(page.getByTestId('controls-slot')).toHaveCSS('margin-bottom', '0px');
  }
});

// 12 QA after the QA fix round, issue 3: the bar unfolded while playing (Show controls) is
// taller than when paused, so on a phone the room held at Hide controls was more than the
// paused bar took back, and the difference stayed under the paused controls.
// 12 QA after QA fix round 2, issue 1: in phone landscape the window sits near the page's end
// after Show controls, so Hide controls is above the window and a press on it is preceded by a
// scroll to it. Its scroll event reaches the page a frame later, after the press, so the score
// was put back where it was before that scroll: off the window, and the beat cursor with it.
for (const size of [null, { name: 'landscape phone', width: 844, height: 390 }]) {
  test(`Show controls, Hide controls and Pause leave no room under the controls, and the beat cursor on screen${size ? ` (${size.name})` : ''}`, async ({
    user,
    page,
  }, testInfo) => {
    test.skip(size !== null && testInfo.project.name !== 'phone', 'phone project only');
    if (size) await page.setViewportSize({ width: size.width, height: size.height });
    await openFixture(page, user, 'groove-120', 'Groove 120');
    await closeLoopPanel(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await windowScrollSettled(page);
    const slot = page.getByTestId('controls-slot');

    for (let run = 0; run < 2; run++) {
      await playButton(page).click();
      await expect(playButton(page)).toHaveText('Pause');
      await windowScrollSettled(page);
      await showControls(page);
      await windowScrollSettled(page);
      // A plain click: Playwright scrolls the button into view and presses it in one go.
      await controls(page).getByRole('button', { name: 'Hide controls' }).click();
      await expect(controls(page).getByRole('button', { name: 'Show controls' })).toBeVisible();
      await windowScrollSettled(page);
      await expect
        .poll(() => beatCursorOnScreen(page), { message: `run ${run}: beat cursor after Hide` })
        .toBe(true);
      await playButton(page).click();
      await expect(playButton(page)).toHaveText('Play');
      await expect(muteDrumsButton(page)).toBeVisible();
      await expect(slot, `run ${run}`).toHaveCSS('margin-bottom', '0px');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await windowScrollSettled(page);
    }
  });
}

// 12 UX pass, Test: the fold changes the bar's height above the score; the score itself must
// not move on screen, or a bar tapped just after Pause is not the bar that was under the finger.
// Chromium's scroll anchoring often keeps it still by itself; Safari has none, so it is turned
// off here and the page's own correction (useStaysOnScreen) is what is tested.
test('Pause and Play leave the score where it is on screen, with no scroll anchoring to help', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  // A page long enough to scroll by what the bar gives back. A short page can't be (see the
  // handoff note's Bugs found: the score moves down at Pause there).
  await page.addStyleTag({
    content:
      'html, body, main { overflow-anchor: none !important; } main::after { content: ""; display: block; height: 150vh; }',
  });
  const scoreTop = () => viewport(page).evaluate((box) => box.getBoundingClientRect().top);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(controls(page).getByRole('button', { name: 'Show controls' })).toBeVisible();
  // Play brings the score into the window (a smooth scroll); measure once that has ended.
  await windowScrollSettled(page);
  // The user scrolls a little while playing; that is where the score is now.
  await page.evaluate(() => window.scrollBy({ top: 60, behavior: 'instant' }));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await windowScrollSettled(page);
  const strip = (await boxOf(controls(page), 'folded controls')).height;
  const playing = await scoreTop();

  // Pause grows the bar above the score by what folding took away.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(muteDrumsButton(page)).toBeVisible();
  expect((await boxOf(controls(page), 'controls')).height - strip).toBeGreaterThan(40);
  expect(Math.abs((await scoreTop()) - playing)).toBeLessThanOrEqual(1);

  // Show controls holds for one run; the next Play folds the bar again.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await showControls(page);
  await expect(controls(page).getByRole('button', { name: 'Hide controls' })).toBeVisible();
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(controls(page).getByRole('button', { name: 'Show controls' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(muteDrumsButton(page)).toHaveCount(0);
});

/** The browser's scroll anchoring on html and body, as computed. */
const anchoringOf = (page: Page) =>
  page.evaluate(() => [
    getComputedStyle(document.documentElement).overflowAnchor,
    getComputedStyle(document.body).overflowAnchor,
  ]);

// 12 Test after QA fix round 2: the song page turns scroll anchoring off while it is up. Left
// while playing, with room held under the folded controls, the next page has its anchoring
// back; a second visit turns it off again, and Play and Pause there still hold no room after.
test('scroll anchoring is off only on the song page, left while playing and opened again', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await closeLoopPanel(page);
  expect(await anchoringOf(page)).toEqual(['none', 'none']);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await windowScrollSettled(page);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(controls(page).getByRole('button', { name: 'Show controls' })).toBeVisible();

  for (let visit = 0; visit < 2; visit++) {
    await navLink(page, 'Songs').click();
    const song = page.getByRole('list').getByRole('link', { name: 'Groove 120' });
    await expect(song).toBeVisible();
    expect(await anchoringOf(page), `visit ${visit}: library`).toEqual(['auto', 'auto']);

    await openSongPlayer(page, 'Groove 120');
    await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
    expect(await anchoringOf(page), `visit ${visit}: song again`).toEqual(['none', 'none']);
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
    await expect(page.getByTestId('controls-slot'), `visit ${visit}`).toHaveCSS(
      'margin-bottom',
      '0px',
    );
    // Playing again as it is left, for the next visit.
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
  }
});

// 12 Test after QA fix round 2: "Practice logged" appears above the score once the log is
// answered, after the Pause. Nothing scrolls or holds room for it, and the next Play and
// Pause keep the score where it is with the notice there.
test('after the session notice appears, Play and Pause still leave the score where it is', async ({
  user,
  page,
}) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Verse', firstBar: 1, lastBar: 4 });
  const scoreTop = () => viewport(page).evaluate((box) => box.getBoundingClientRect().top);

  await playLoopButton(page, 'Verse').click();
  await playFor(page, 3_000);
  await expect(sessionLogged(page)).toContainText('of Verse');
  await windowScrollSettled(page);
  await expect(page.getByTestId('controls-slot')).toHaveCSS('margin-bottom', '0px');

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await windowScrollSettled(page);
  await closeLoopPanel(page);
  for (let run = 0; run < 2; run++) {
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
    await expect(controls(page).getByRole('button', { name: 'Show controls' })).toBeVisible();
    await windowScrollSettled(page);
    const playing = await scoreTop();
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
    await expect(muteDrumsButton(page)).toBeVisible();
    await windowScrollSettled(page);
    expect(Math.abs((await scoreTop()) - playing), `run ${run}: Pause`).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('controls-slot'), `run ${run}`).toHaveCSS('margin-bottom', '0px');
    await expect(sessionLogged(page)).toBeVisible();
  }
});

// 12 Test after QA fix round 3: the checklist's interleavings for the fold's render-time read
// and for Hide controls bringing the score back. Each at the project's size, and on the phone
// project in landscape too, where Hide controls sits above the window after Show controls.
const foldSizes = [null, { name: 'landscape phone', width: 844, height: 390 }] as const;

/** Opens groove-120 at the size, panel closed, the window at the top. */
async function openForFold(
  page: Page,
  user: Parameters<typeof openFixture>[1],
  size: (typeof foldSizes)[number],
) {
  if (size) await page.setViewportSize({ width: size.width, height: size.height });
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await closeLoopPanel(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await windowScrollSettled(page);
}

/** As far down as the page goes: where a user scrolls to read the score with the bar out. */
async function scrollToPageEnd(page: Page) {
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  );
  await windowScrollSettled(page);
}

for (const size of foldSizes) {
  const sized = size ? ` (${size.name})` : '';

  test(`Show controls and Hide controls by keyboard: Hide brings the beat cursor on screen, and Pause leaves no room${sized}`, async ({
    user,
    page,
  }, testInfo) => {
    test.skip(size !== null && testInfo.project.name !== 'phone', 'phone project only');
    await openForFold(page, user, size);
    const toggle = controls(page).getByRole('button', { name: /^(Show|Hide) controls$/ });

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
    await windowScrollSettled(page);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAccessibleName('Hide controls');
    await expect(toggle).toBeFocused();
    await windowScrollSettled(page);

    await scrollToPageEnd(page);
    // Focus first (the browser scrolls the button into view), then the key, as a keyboard does.
    await page.evaluate(() => document.body.focus());
    await toggle.focus();
    await windowScrollSettled(page);
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAccessibleName('Show controls');
    await windowScrollSettled(page);
    await expect
      .poll(() => beatCursorOnScreen(page), { message: 'beat cursor after Hide' })
      .toBe(true);
    await expect(playButton(page)).toHaveText('Pause');

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
    await expect(muteDrumsButton(page)).toBeVisible();
    await expect(page.getByTestId('controls-slot')).toHaveCSS('margin-bottom', '0px');
  });

  test(`Hide controls during a count-in brings the count-in number on screen, and the count-in carries on${sized}`, async ({
    user,
    page,
  }, testInfo) => {
    test.skip(size !== null && testInfo.project.name !== 'phone', 'phone project only');
    await openForFold(page, user, size);
    await chooseCountIn(page, 2);
    await recordStatuses(page);
    const counter = page.getByTestId('count-in');

    await playButton(page).click();
    await expect(counter).toBeVisible();
    await showControls(page);
    await scrollToPageEnd(page);
    await controls(page).getByRole('button', { name: 'Hide controls' }).click();
    await expect(controls(page).getByRole('button', { name: 'Show controls' })).toBeVisible();
    await windowScrollSettled(page);
    // Read in one go, in the page: still counting in, and the number inside the visible window.
    const seen = await counter.evaluate(
      (element, windowBottom) => {
        const box = element.getBoundingClientRect();
        const player = (
          window as unknown as { __drumPalPlayer: { getSnapshot(): { status: string } } }
        ).__drumPalPlayer;
        return {
          status: player.getSnapshot().status,
          onScreen: box.height > 0 && box.top >= 0 && box.bottom <= windowBottom,
        };
      },
      await visibleBottom(page),
    );
    expect(seen).toEqual({ status: 'countingIn', onScreen: true });

    await expect(playButton(page)).toHaveText('Pause');
    await expect.poll(() => recordedStatuses(page), { timeout: 10_000 }).toContain('playing');
    // From the count-in into playback without a stop: Show and Hide touched nothing of it.
    expect(await recordedStatuses(page)).toEqual(['ready', 'countingIn', 'playing']);
    await playButton(page).click();
    await expect(page.getByTestId('controls-slot')).toHaveCSS('margin-bottom', '0px');
  });

  test(`the folded strip's Loop speed leaves the bar folded, and the Pause after it leaves the score where it is${sized}`, async ({
    user,
    page,
  }, testInfo) => {
    test.skip(size !== null && testInfo.project.name !== 'phone', 'phone project only');
    if (size) await page.setViewportSize({ width: size.width, height: size.height });
    await openFixture(page, user, 'groove-120', 'Groove 120');
    await saveNewLoop(page, { name: 'Verse', firstBar: 1, lastBar: 4 });
    const scoreTop = () => viewport(page).evaluate((box) => box.getBoundingClientRect().top);

    await playLoopButton(page, 'Verse').click();
    await expect(playButton(page)).toHaveText('Pause');
    await windowScrollSettled(page);
    await controls(page)
      .getByRole('button', { name: /^Loop speed \d+%$/ })
      .click();
    await expect(loopSpeed(page)).toBeFocused();
    await expect(controls(page).getByRole('button', { name: 'Show controls' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await windowScrollSettled(page);
    const playing = await scoreTop();

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
    await expect(muteDrumsButton(page)).toBeVisible();
    await windowScrollSettled(page);
    expect(Math.abs((await scoreTop()) - playing)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('controls-slot')).toHaveCSS('margin-bottom', '0px');
  });
}

// 12 Test after QA fix round 3: Play brings a score that isn't all on show into the window with
// a smooth scroll; a Pause pressed while it runs must leave the score where it then is. It
// doesn't: the unfold's instant scroll doesn't end Chromium's smooth scroll, which finishes its
// remaining distance in the next frame (the score moves up 64 px on a laptop, 66 on a tablet, 3
// on a phone), before this fix as after it. docs/units/12-visual-design.md, Test (after QA fix
// round 3), Bugs found; Unit 13's Carried forward. Remove the fixme once that is fixed.
test.fixme('a Pause while Play is still bringing the score on screen leaves the score where it is', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await closeLoopPanel(page);
  // Room above the song, so the score starts below the window and Play has far to scroll it.
  await page.addStyleTag({
    content: 'main::before { content: ""; display: block; height: 100vh; }',
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await windowScrollSettled(page);
  // Play and Pause stay in the sticky bar, which sticks only once the window has scrolled to it.
  await playButton(page).scrollIntoViewIfNeeded();
  await windowScrollSettled(page);
  // Not all on show, so Play's scroll into view ('nearest') has somewhere to go.
  expect(
    await viewport(page).evaluate((box) => box.getBoundingClientRect().bottom),
  ).toBeGreaterThan((await visibleBottom(page)) + 100);

  await playButton(page).click();
  // In the page: wait for the smooth scroll to be under way, press Pause, then follow the score.
  const after = await page.evaluate(async () => {
    const box = document.querySelector('[data-testid="score-viewport"]')!;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const start = window.scrollY;
    for (let i = 0; i < 120 && window.scrollY - start < 20; i++) await frame();
    const button = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Pause',
    );
    const scrolledAtPause = window.scrollY - start;
    // Where the score is as Pause is pressed, then on every frame after it.
    const tops = [box.getBoundingClientRect().top];
    button?.click();
    for (let i = 0; i < 60; i++) {
      tops.push(box.getBoundingClientRect().top);
      await frame();
    }
    return { scrolledAtPause, paused: !!button, tops };
  });
  expect(after.paused, 'Pause was pressed').toBe(true);
  expect(after.scrolledAtPause, 'the smooth scroll was under way at the Pause').toBeGreaterThan(0);
  await expect(playButton(page)).toHaveText('Play');
  const moved = Math.max(...after.tops) - Math.min(...after.tops);
  expect(moved, `score tops after the Pause: ${after.tops.join(', ')}`).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('controls-slot')).toHaveCSS('margin-bottom', '0px');
});
