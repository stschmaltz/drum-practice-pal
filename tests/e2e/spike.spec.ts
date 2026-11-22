/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// Unit 01: /spike loads a fixture, renders notation and exposes every player control.
// Nothing here listens to audio; sound quality is a Human check (docs/units/01-spike.md).

const PAGE_LAYOUT_MIN_WIDTH = 768;

function header(page: Page) {
  return page.getByTestId('now-playing');
}

function playButton(page: Page) {
  return page.getByRole('region', { name: 'Controls' }).getByRole('button', {
    name: /^(Play|Pause)$/,
  });
}

function stat(page: Page, name: string) {
  return page
    .getByRole('region', { name: 'Diagnostics' })
    .locator('dt', { hasText: name })
    .locator('xpath=following-sibling::dd[1]');
}

function eventLog(page: Page) {
  return page.getByRole('list', { name: 'Event log' });
}

function viewport(page: Page) {
  return page.getByTestId('score-viewport');
}

/** Width of the rendered notation surface and of the scroll container around it. */
async function scoreWidths(page: Page) {
  return viewport(page).evaluate((el) => ({
    surface: el.querySelector('.at-surface')?.getBoundingClientRect().width ?? 0,
    viewport: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
}

async function openSpike(page: Page) {
  await page.goto('/spike');
  await expect(header(page)).toContainText('Groove 120 · bar 1 of 16');
  // Enabled once the soundfont is in and the synth reports ready.
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  // alphaTab lazy-renders partials as they scroll into view; on a phone the score sits below the controls.
  await viewport(page).scrollIntoViewIfNeeded();
  await expect(viewport(page).locator('svg').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openSpike(page);
});

test('loads the default fixture and renders drum notation', async ({ page }) => {
  await expect(playButton(page)).toHaveText('Play');
  await expect(stat(page, 'Tracks')).not.toHaveText('-');
  await expect(stat(page, 'Drum track index')).toHaveText('0');
  await expect(stat(page, 'Soundfont')).toContainText('/soundfont/sonivox.sf2');
  await expect(eventLog(page)).toContainText('score loaded: Groove 120, 16 bars');
});

test('uses horizontal layout below 768 px and page layout from 768 px up', async ({
  page,
  viewport: size,
}) => {
  const width = size?.width ?? 0;
  const expected = width >= PAGE_LAYOUT_MIN_WIDTH ? 'page' : 'horizontal';
  await expect(page.getByRole('combobox', { name: 'Layout' })).toContainText(
    `auto (${expected} at ${width}px)`,
  );

  const widths = await scoreWidths(page);
  if (expected === 'horizontal') {
    // One long system that scrolls inside the score viewport.
    expect(widths.surface).toBeGreaterThan(widths.viewport * 2);
    expect(widths.scrollWidth).toBeGreaterThan(widths.viewport);
  } else {
    // Systems wrap to the viewport width.
    expect(widths.surface).toBeLessThanOrEqual(widths.viewport + 1);
    expect(widths.scrollWidth).toBeLessThanOrEqual(widths.viewport + 1);
  }

  // The score's own scroll never leaks into a page-level horizontal scroll.
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(0);
});

test('layout select switches between page and horizontal', async ({ page }) => {
  const layout = page.getByRole('combobox', { name: 'Layout' });

  await layout.selectOption('horizontal');
  await expect
    .poll(async () => {
      const w = await scoreWidths(page);
      return w.surface > w.viewport * 2;
    })
    .toBe(true);

  await layout.selectOption('page');
  await expect
    .poll(async () => {
      const w = await scoreWidths(page);
      return w.surface > 0 && w.surface <= w.viewport + 1;
    })
    .toBe(true);

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(0);
});

test('play, pause and stop change the transport state', async ({ page }) => {
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(eventLog(page)).toContainText('state: playing');
  await expect(stat(page, 'Start latency')).toContainText(/state \d+ ms/);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(eventLog(page)).toContainText('state: paused');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(eventLog(page)).toContainText('(stopped)');
});

test('speed spans 25% to 200% and BPM follows', async ({ page }) => {
  const speed = page.getByRole('slider', { name: 'Speed' });
  await expect(speed).toHaveAttribute('min', '25');
  await expect(speed).toHaveAttribute('max', '200');

  await speed.fill('25');
  await expect(header(page)).toContainText('25% · 30 BPM');
  await speed.fill('200');
  await expect(header(page)).toContainText('200% · 240 BPM');
  await speed.fill('100');
  await expect(header(page)).toContainText('100% · 120 BPM');
});

test('loop range sets the expected pass length', async ({ page }) => {
  const loop = page.getByRole('checkbox', { name: 'Loop bars' });
  const start = page.getByRole('spinbutton', { name: 'Start bar' });
  const end = page.getByRole('spinbutton', { name: 'End bar' });

  await expect(start).toHaveValue('5');
  await expect(end).toHaveValue('8');
  await expect(stat(page, 'Loop wraps')).toHaveText('-');

  await loop.check();
  // Bars 5 to 8 of a 4/4 groove at 120 BPM: 4 x 2 s.
  await expect(stat(page, 'Loop wraps')).toHaveText('expected 8000 ms');

  await page.getByRole('slider', { name: 'Speed' }).fill('50');
  await expect(stat(page, 'Loop wraps')).toHaveText('expected 16000 ms');
  await page.getByRole('slider', { name: 'Speed' }).fill('100');

  await end.fill('5');
  await expect(stat(page, 'Loop wraps')).toHaveText('expected 2000 ms');

  await loop.uncheck();
  await expect(stat(page, 'Loop wraps')).toHaveText('-');
});

test('loop range never reverses: raising the start bar pushes the end bar along', async ({
  page,
}) => {
  const start = page.getByRole('spinbutton', { name: 'Start bar' });
  const end = page.getByRole('spinbutton', { name: 'End bar' });
  await page.getByRole('checkbox', { name: 'Loop bars' }).check();

  await start.fill('10');
  await expect(end).toHaveValue('10');
  await expect(stat(page, 'Loop wraps')).toHaveText('expected 2000 ms');

  // Typing an end bar below the start bar clamps to the start bar.
  await end.fill('3');
  await expect(end).toHaveValue('10');
  await expect(stat(page, 'Loop wraps')).toHaveText('expected 2000 ms');

  // Bar numbers are clamped to the song length.
  await start.fill('99');
  await expect(start).toHaveValue('16');
  await expect(end).toHaveValue('16');
  await expect(stat(page, 'Loop wraps')).toHaveText('expected 2000 ms');
});

test('looping playback reports a loop pass', async ({ page }) => {
  test.slow();
  await page.getByRole('slider', { name: 'Speed' }).fill('200');
  await page.getByRole('spinbutton', { name: 'End bar' }).fill('5');
  await page.getByRole('checkbox', { name: 'Loop bars' }).check();
  // One bar at 200% is 1 s.
  await expect(stat(page, 'Loop wraps')).toHaveText('expected 1000 ms');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(eventLog(page)).toContainText('loop wrapped', { timeout: 15_000 });
  await expect(playButton(page)).toHaveText('Pause');
});

test('speed, drum mute and metronome change live without restarting playback', async ({ page }) => {
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  const stateLines = () =>
    eventLog(page)
      .getByText(/state: /)
      .count();
  const before = await stateLines();

  await page.getByRole('slider', { name: 'Speed' }).fill('50');
  await expect(header(page)).toContainText('50% · 60 BPM');

  const mute = page.getByRole('checkbox', { name: /^Mute drums/ });
  await mute.check();
  await expect(mute).toBeChecked();

  const metronome = page.getByRole('checkbox', { name: 'Metronome' });
  await metronome.check();
  await expect(metronome).toBeChecked();
  await page.getByRole('slider', { name: 'Metronome volume' }).fill('0.5');

  await mute.uncheck();
  await metronome.uncheck();
  await expect(mute).not.toBeChecked();
  await expect(metronome).not.toBeChecked();

  // Give alphaTab time to emit a state change if any of these had restarted it.
  await page.waitForTimeout(500);
  await expect(playButton(page)).toHaveText('Pause');
  expect(await stateLines()).toBe(before);
});

test('switching soundfont loads the new font; a missing candidate is reported', async ({
  page,
}) => {
  const soundFont = page.getByRole('combobox', { name: 'Soundfont' });

  await soundFont.selectOption('/soundfont/sonivox.sf3');
  await expect(stat(page, 'Soundfont')).toContainText('/soundfont/sonivox.sf3');
  await expect(stat(page, 'Soundfont')).toContainText(/load \d+ ms/);
  await expect(playButton(page)).toBeEnabled();

  await soundFont.selectOption('/sf-candidates/GeneralUser-GS.sf2');
  await expect(eventLog(page)).toContainText(
    'Soundfont not found at /sf-candidates/GeneralUser-GS.sf2',
  );
});

test('custom soundfont path only accepts same-origin .sf2/.sf3 paths', async ({ page }) => {
  const path = page.getByRole('textbox', { name: 'Soundfont path' });
  const load = page.getByRole('button', { name: 'Load' });

  await path.fill('https://example.com/evil.sf2');
  await expect(load).toBeDisabled();
  await path.fill('/soundfont/sonivox.sf3');
  await expect(load).toBeEnabled();
});

test('switching fixture loads it; multi-track can render every track', async ({ page }) => {
  await page
    .getByRole('combobox', { name: 'Fixture' })
    .selectOption({ label: 'Multi-track (drums, bass, guitar)' });
  await expect(header(page)).toContainText('Multi Track');
  await expect(eventLog(page)).toContainText('score loaded: Multi Track');

  await expect(stat(page, 'Tracks')).toContainText(',');
  const surfaceHeight = () =>
    viewport(page).evaluate(
      (el) => el.querySelector('.at-surface')?.getBoundingClientRect().height ?? 0,
    );
  await expect.poll(surfaceHeight).toBeGreaterThan(0);
  const drumsOnly = await surfaceHeight();

  // Bass and guitar staves add height on top of the drum staff.
  await page.getByRole('checkbox', { name: 'Render all tracks' }).check();
  await expect.poll(surfaceHeight).toBeGreaterThan(drumsOnly * 1.5);

  await page.getByRole('combobox', { name: 'Fixture' }).selectOption({ label: 'Waltz (3/4)' });
  await expect(header(page)).toContainText('Waltz 3-4');
});
