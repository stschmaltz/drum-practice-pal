/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, test } from './auth';
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
  loopPanel,
  loopPanelToggle,
  loopPercentField,
  loopSpeed,
  openLoopPanel,
  playLoopButton,
  saveLoopButton,
  saveNewLoop,
} from './loopsPage';
import {
  barCursorBox,
  controls,
  expectedLayout,
  openFixture,
  playButton,
  scoreBox,
  scrollScoreToStart,
  speedSlider,
  status,
  viewport,
  type Box,
  type Point,
} from './playerPage';

// Unit 08, QA fix round 1: on a phone "Play loop" closes the sheet, and the score
// box scrolls to the bar a count-in counts into, or a paused loop starts on.
// Nothing here listens to audio; these check where things are on the page, and when.

const countInSelect = (page: Page) =>
  controls(page).getByRole('combobox', { name: 'Count-in', exact: true });
const countInModeSelect = (page: Page) =>
  controls(page).getByRole('combobox', { name: 'When to count in' });

/** Measured positions are whole or half pixels; a bar this close to an edge is inside it. */
const EDGE_PX = 2;

const contains = (box: Box, { x, y }: Point) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

/** Whether all of `inner` is inside `outer`. */
const inside = (outer: Box, inner: Box) =>
  inner.x >= outer.x - EDGE_PX &&
  inner.y >= outer.y - EDGE_PX &&
  inner.x + inner.width <= outer.x + outer.width + EDGE_PX &&
  inner.y + inner.height <= outer.y + outer.height + EDGE_PX;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Just inside the start of a highlight block: a point on the loop's first bar. */
const startOf = (block: Box): Point => ({ x: block.x + 20, y: block.y + block.height / 2 });

/** Whether the bar the cursor is on, all of it, is inside the score box. */
const cursorBarInScoreBox = async (page: Page) =>
  inside(await scoreBox(page), await barCursorBox(page));

/** Whether the start of the highlighted loop is inside the score box. */
async function loopStartInScoreBox(page: Page): Promise<boolean> {
  const [first] = await highlightBoxes(page);
  return first !== undefined && contains(await scoreBox(page), startOf(first));
}

const scoreScroll = (page: Page) =>
  viewport(page).evaluate((box) => ({ left: box.scrollLeft, top: box.scrollTop }));

/** Scrolls the score box, and only the box, as far from the start of the song as it goes. */
const scrollScoreToEnd = (page: Page) =>
  viewport(page).evaluate((box) =>
    box.scrollTo({ left: box.scrollWidth, top: box.scrollHeight, behavior: 'instant' }),
  );

/** One look at the page, taken in a single frame so its boxes belong to the same moment. */
interface Sample {
  status: string;
  /** The count-in beat on show in the player, as "bar.beat"; null before the first. */
  beat: string | null;
  /** Which count-in this was taken in, counting from 1; 0 outside one. */
  countInNumber: number;
  /** Milliseconds since that count-in began. */
  sinceCountIn: number;
  scoreBox: Box;
  /** The first highlighted block: it starts on the loop's first bar. */
  loopStart: Box | null;
  /** The big count-in number. */
  number: Box | null;
  /** Whether the loop panel or the tab bar is drawn over the middle of the number. */
  numberCovered: boolean;
  /** The same for the start of the loop's first bar. */
  loopStartCovered: boolean;
  panel: Box | null;
  /** The phone sheet header's `aria-expanded`. */
  sheetExpanded: string | null;
  /** The window, down to the top of the phone's fixed tab bar. */
  visible: Box;
}

interface RecorderWindow {
  __drumPalPlayer?: {
    getSnapshot(): { status: string; countIn: { bar: number; beat: number } | null };
    subscribe(listener: () => void): void;
  } | null;
  __samples?: Sample[];
}

/**
 * From now on, measures the page each time the player's status or count-in
 * beat changes: once the change has been painted, where the score box, the
 * loop's first bar, the count-in number and the loop panel are. Read by the
 * page itself, so a count-in a second long is measured on every beat.
 */
async function recordGeometry(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window as unknown as RecorderWindow;
    const player = debug.__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    const samples: Sample[] = [];
    debug.__samples = samples;

    const boxOf = (element: Element | null | undefined): Box | null => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const covered = (x: number, y: number) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[data-testid="loop-panel"], nav[aria-label="Main"]') != null;
    const state = () => {
      const { status, countIn } = player.getSnapshot();
      return { status, beat: countIn ? `${countIn.bar}.${countIn.beat}` : null };
    };
    const key = ({ status, beat }: { status: string; beat: string | null }) => `${status} ${beat}`;

    let countInNumber = 0;
    let countInBegan = 0;
    let last = state();

    const measure = (taken: { status: string; beat: string | null }) => {
      // Something else has happened since: this frame no longer shows what was to be measured.
      if (key(state()) !== key(taken)) return;
      const score = boxOf(document.querySelector('[data-testid="score-viewport"]'));
      if (!score) return;
      const panelElement = document.querySelector('[data-testid="loop-panel"]');
      const loopStart = boxOf(document.querySelector('.bar-highlight > div'));
      const number = boxOf(document.querySelector('[data-testid="count-in-beat"]'));
      const tabBar = Array.from(document.querySelectorAll('nav[aria-label="Main"]'))
        .filter((nav) => getComputedStyle(nav).position === 'fixed')
        .map((nav) => nav.getBoundingClientRect())
        .find((rect) => rect.height > 0);
      samples.push({
        ...taken,
        countInNumber: taken.status === 'countingIn' ? countInNumber : 0,
        sinceCountIn: performance.now() - countInBegan,
        scoreBox: score,
        loopStart,
        number,
        numberCovered: number
          ? covered(number.x + number.width / 2, number.y + number.height / 2)
          : false,
        loopStartCovered: loopStart
          ? covered(loopStart.x + 20, loopStart.y + loopStart.height / 2)
          : false,
        panel: boxOf(panelElement),
        sheetExpanded:
          panelElement?.querySelector('button[aria-controls]')?.getAttribute('aria-expanded') ??
          null,
        visible: {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: tabBar?.top ?? window.innerHeight,
        },
      });
    };

    player.subscribe(() => {
      const now = state();
      if (key(now) === key(last)) return;
      if (now.status === 'countingIn' && last.status !== 'countingIn') {
        countInNumber += 1;
        countInBegan = performance.now();
      }
      last = now;
      // Two frames on: React has rendered the change and the browser has laid it out.
      requestAnimationFrame(() => requestAnimationFrame(() => measure(now)));
    });
  });
}

const samples = (page: Page) =>
  page.evaluate(() => (window as unknown as RecorderWindow).__samples ?? []);

/** The beats a count-in of `bars` bars of 4/4 shows, as the recorder names them. */
const beatsOf = (bars: number) =>
  Array.from({ length: bars * 4 }, (_, index) => `${Math.floor(index / 4) + 1}.${(index % 4) + 1}`);

/** Play's smooth scroll of the window to the score is over by now; boxes are where they stay. */
const WINDOW_SETTLED_MS = 1000;

for (const bars of [1, 2]) {
  // 08 QA issue 1, through the whole count-in: every beat, not one moment of it.
  test(`Play loop with a ${bars}-bar count-in: on every beat the number is in the clear and the loop’s first bar is in the score box`, async ({
    user,
    page,
  }) => {
    test.setTimeout(60_000);
    await openFixture(page, user, 'groove-120', 'Groove 120');
    // Half speed: a beat lasts a second, so each one is on show long enough to measure.
    await speedSlider(page).fill('50');
    await saveNewLoop(page, { name: 'Late fill', firstBar: 13, lastBar: 14 });
    await countInSelect(page).selectOption(bars === 1 ? '1 bar' : '2 bars');

    // Back to the top of the song, with the score on bar 1.
    await activeLoopLine(page).getByRole('button', { name: 'Exit loop' }).click();
    await page.getByRole('button', { name: 'Back to start' }).click();
    await expect(status(page)).toHaveText('Bar 1 of 16');
    await scrollScoreToStart(page);
    const scrollBefore = await scoreScroll(page);

    await openLoopPanel(page);
    await recordGeometry(page);
    await playLoopButton(page, 'Late fill').click();
    await expect(status(page)).toHaveText('Bar 13 of 16 · Counting in…');

    // All of the loop's first bar is in the score box while it counts, and the box did scroll.
    await expect.poll(() => cursorBarInScoreBox(page)).toBe(true);
    expect(await loopStartInScoreBox(page)).toBe(true);
    expect(await scoreScroll(page)).not.toEqual(scrollBefore);
    await expect(status(page)).toContainText('Counting in');

    // The panel: closed on a phone, with the loop's name on its header; left open beside the score.
    if (expectedLayout(page) === 'horizontal') {
      await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(loopPanel(page)).toContainText('Loop: Late fill');
    } else {
      await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', 'true');
      await expect(loopSpeed(page)).toBeVisible();
    }

    // Let the count-in run out, then read what the page looked like on each beat of it.
    await expect(status(page)).not.toContainText('Counting in', { timeout: 15_000 });
    await expect(playButton(page)).toHaveText('Pause');
    await expect(status(page)).toContainText(/Bar 1[34] of 16/);
    const counted = (await samples(page)).filter((sample) => sample.status === 'countingIn');
    const onBeats = counted.filter((sample) => sample.beat !== null);
    expect(onBeats.map((sample) => sample.beat)).toEqual(beatsOf(bars));

    for (const sample of counted) {
      const at = `count-in beat ${sample.beat ?? '(before the first)'}`;
      // From the first frame of the count-in, not only on the downbeat.
      expect(sample.loopStart, at).not.toBeNull();
      expect(contains(sample.scoreBox, startOf(sample.loopStart!)), at).toBe(true);
      if (expectedLayout(page) === 'horizontal') expect(sample.sheetExpanded, at).toBe('false');
    }
    for (const sample of onBeats) {
      const at = `count-in beat ${sample.beat}`;
      expect(sample.number, at).not.toBeNull();
      // The number is over the score, whatever else is going on.
      expect(overlaps(sample.scoreBox, sample.number!), at).toBe(true);
    }
    const settled = onBeats.filter((sample) => sample.sinceCountIn >= WINDOW_SETTLED_MS);
    // Every beat but the first of each count-in comes a second or more after it began.
    expect(settled.length).toBeGreaterThanOrEqual(bars * 4 - 1);
    for (const sample of settled) {
      const at = `count-in beat ${sample.beat}`;
      // All of the number is in the window, above the tab bar, with no panel over it.
      expect(inside(sample.visible, sample.number!), at).toBe(true);
      expect(sample.numberCovered, at).toBe(false);
      expect(sample.panel !== null && overlaps(sample.panel, sample.number!), at).toBe(false);
      // And the loop's first bar can be read: in the window, with nothing over it.
      expect(contains(sample.visible, startOf(sample.loopStart!)), at).toBe(true);
      expect(sample.loopStartCovered, at).toBe(false);
    }

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
  });
}

interface StatusWindow {
  __drumPalPlayer?: { getSnapshot(): { status: string }; subscribe(listener: () => void): void };
  __statuses?: string[];
}

/** Records every status the player goes through from now on, starting with the one it is in. */
async function recordStatuses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window as unknown as StatusWindow;
    const player = debug.__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    const statuses = [player.getSnapshot().status];
    debug.__statuses = statuses;
    player.subscribe(() => {
      const { status } = player.getSnapshot();
      if (statuses.at(-1) !== status) statuses.push(status);
    });
  });
}

const recordedStatuses = (page: Page) =>
  page.evaluate(() => (window as unknown as StatusWindow).__statuses ?? []);

test('the panel after Play loop: closed on a phone and open from 768 px; reopened it has the playing loop and its speed, and switching or restarting leaves it open', async ({
  user,
  page,
}) => {
  test.setTimeout(60_000);
  const isSheet = expectedLayout(page) === 'horizontal';
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await speedSlider(page).fill('80');
  await saveNewLoop(page, { name: 'First', firstBar: 1, lastBar: 2 });
  await speedSlider(page).fill('100');
  await saveNewLoop(page, { name: 'Second', firstBar: 5, lastBar: 6 });
  await openLoopPanel(page);

  // The press that starts playback.
  await playLoopButton(page, 'First').click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', isSheet ? 'false' : 'true');
  if (isSheet) {
    // Closed, the sheet is only its header, which names the loop.
    await expect(loopPanel(page)).toContainText('Loop: First');
    await expect(loopSpeed(page)).toBeHidden();
    await expect.poll(async () => (await loopPanel(page).boundingBox())?.height).toBeLessThan(60);
  }
  await expect(activeLoopLine(page)).toContainText('First · Bars 1 to 2');

  // Opened again while it plays: the playing loop and its speed control, at its saved speed.
  await recordStatuses(page);
  await openLoopPanel(page);
  await expect(loopPanel(page).getByRole('region', { name: 'Practicing First' })).toBeVisible();
  await expect(loopSpeed(page)).toBeVisible();
  await expect(loopPercentField(page)).toHaveValue('80');
  await expect(loopBpmField(page)).toHaveValue('96');
  // The sheet comes back scrolled to the list item that was pressed, with the speed control
  // above it (see "Bugs found" in the handoff note): it is there to scroll to and to use.
  await loopPercentField(page).scrollIntoViewIfNeeded();
  await expect(loopPercentField(page)).toBeInViewport({ ratio: 1 });
  await commit(loopPercentField(page), '90');
  await expect(loopBpmField(page)).toHaveValue('108');

  // Another loop, then a restart, while playing: no count-in follows, so the panel stays.
  await playLoopButton(page, 'Second').click();
  await expect(activeLoopLine(page)).toContainText('Second · Bars 5 to 6');
  await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(loopPanel(page).getByRole('region', { name: 'Practicing Second' })).toBeVisible();
  await expect(loopPercentField(page)).toHaveValue('100');
  await expect(loopPanel(page).getByRole('button', { name: 'Restart loop Second' })).toBeVisible();
  await playLoopButton(page, 'Second').click();
  await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(loopSpeed(page)).toBeVisible();
  await expect(status(page)).toContainText(/Bar [56] of 16/);

  // None of it stopped playback.
  await expect(playButton(page)).toHaveText('Pause');
  expect(await recordedStatuses(page)).toEqual(['playing']);

  // Paused, the same button starts playback again, and on a phone that closes the sheet again.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await playLoopButton(page, 'Second').click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(loopPanelToggle(page)).toHaveAttribute('aria-expanded', isSheet ? 'false' : 'true');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

for (const width of [767, 768]) {
  test(`at ${width} px wide, Play loop ${width < 768 ? 'closes the sheet' : 'leaves the side panel open'}`, async ({
    user,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one browser is enough for the breakpoint');
    await page.setViewportSize({ width, height: 900 });
    await openFixture(page, user, 'groove-120', 'Groove 120');
    await saveNewLoop(page, { name: 'Edge', firstBar: 3, lastBar: 4 });
    await openLoopPanel(page);

    await playLoopButton(page, 'Edge').click();

    await expect(playButton(page)).toHaveText('Pause');
    await expect(loopPanelToggle(page)).toHaveAttribute(
      'aria-expanded',
      width < 768 ? 'false' : 'true',
    );
    if (width < 768) await expect(loopSpeed(page)).toBeHidden();
    else await expect(loopSpeed(page)).toBeVisible();

    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Play');
  });
}

test('with a count-in before every repeat, each repeat’s count-in has the loop’s first bar back in the score box', async ({
  user,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  // Long enough at each size that playing to the loop's end scrolls its first bar out of the
  // box: two bars side by side on a phone, lines down the page on the others.
  const lastBar = { phone: 6, tablet: 12, desktop: 12 }[testInfo.project.name];
  if (!lastBar) throw new Error(`No loop for project ${testInfo.project.name}`);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('1 bar');
  await countInModeSelect(page).selectOption('Before every loop repeat');
  // A bar, and the count-in, last a second.
  await speedSlider(page).fill('200');
  await saveNewLoop(page, { name: 'Round', firstBar: 5, lastBar });
  if (expectedLayout(page) === 'horizontal') await closeLoopPanel(page);
  await expect(status(page)).toHaveText('Bar 5 of 16');
  await recordGeometry(page);
  await recordStatuses(page);

  await playButton(page).click();
  await expect
    .poll(async () => (await recordedStatuses(page)).join(' '), { timeout: 60_000 })
    .toContain('countingIn playing countingIn playing countingIn playing');
  const statuses = await recordedStatuses(page);
  const all = await samples(page);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');

  // Unit 07's behaviour is as it was: count in, play, count in, play, and never a stop between.
  expect(statuses.slice(1)).not.toContain('ready');

  const counted = all.filter((sample) => sample.status === 'countingIn');
  const countIns = new Set(counted.map((sample) => sample.countInNumber));
  expect(countIns.size).toBeGreaterThanOrEqual(3);
  for (const countInNumber of countIns) {
    const ofThisOne = counted.filter((sample) => sample.countInNumber === countInNumber);
    // Its first frame and its beats: at least the status change and three of the four beats.
    expect(ofThisOne.length, `count-in ${countInNumber}`).toBeGreaterThanOrEqual(4);
    for (const sample of ofThisOne) {
      const at = `count-in ${countInNumber}, beat ${sample.beat ?? '(before the first)'}`;
      expect(sample.loopStart, at).not.toBeNull();
      expect(contains(sample.scoreBox, startOf(sample.loopStart!)), at).toBe(true);
    }
  }
});

/**
 * Whether a count-in is on and whether the start of the highlighted loop is in
 * the score box, both read in the same instant.
 */
const loopStartDuringCountIn = (page: Page) =>
  page.evaluate(() => {
    const statusText = document.querySelector('[data-testid="player-status"]')?.textContent ?? '';
    const frame = document.querySelector('[data-testid="score-viewport"]')?.getBoundingClientRect();
    const first = document.querySelector('.bar-highlight > div')?.getBoundingClientRect();
    if (!frame || !first) return 'nothing to measure';
    if (!statusText.includes('Counting in')) return 'not counting in';
    const x = first.x + 20;
    const y = first.y + first.height / 2;
    const inBox = x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom;
    return `counting in, first bar ${inBox ? 'in' : 'out of'} the box`;
  });

test('with a count-in before every repeat, the score box is scrolled back at the wrap, not left at the loop’s end', async ({
  user,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const lastBar = { phone: 6, tablet: 12, desktop: 12 }[testInfo.project.name];
  if (!lastBar) throw new Error(`No loop for project ${testInfo.project.name}`);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('2 bars');
  await countInModeSelect(page).selectOption('Before every loop repeat');
  await speedSlider(page).fill('200');
  await saveNewLoop(page, { name: 'Round', firstBar: 5, lastBar });
  if (expectedLayout(page) === 'horizontal') await closeLoopPanel(page);
  await recordStatuses(page);
  await playButton(page).click();

  // On the loop's last bar the box has followed the cursor away from the first bar.
  await expect(status(page)).toHaveText(`Bar ${lastBar} of 16`, { timeout: 30_000 });
  await expect.poll(() => loopStartInScoreBox(page)).toBe(false);

  // The repeat's count-in (two seconds here) has the first bar back from its start: read ten
  // times over its first second, with the status and the boxes taken in the same instant, so
  // a scroll that only came once playback started again would not count.
  await expect(status(page)).toHaveText('Bar 5 of 16 · Counting in…', { timeout: 10_000 });
  const reads: string[] = [];
  for (let read = 0; read < 10; read++) {
    reads.push(await loopStartDuringCountIn(page));
    await page.waitForTimeout(100);
  }
  const during = reads.filter((read) => read.startsWith('counting in'));
  expect(during.length).toBeGreaterThanOrEqual(5);
  expect([...new Set(during)]).toEqual(['counting in, first bar in the box']);
  expect((await recordedStatuses(page)).join(' ')).toContain('countingIn playing countingIn');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
});

test('Play with a count-in after the score was scrolled away brings the bar it counts into back', async ({
  user,
  page,
}) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('2 bars');
  // Eight seconds of count-in.
  await speedSlider(page).fill('50');
  await expect(status(page)).toHaveText('Bar 1 of 16');

  // The user reads ahead to the end of the song; bar 1, where playback is, is out of the box.
  await scrollScoreToEnd(page);
  await expect.poll(() => cursorBarInScoreBox(page)).toBe(false);
  const scrolledAway = await scoreScroll(page);

  await playButton(page).click();
  await expect(status(page)).toHaveText('Bar 1 of 16 · Counting in…');
  await expect.poll(() => cursorBarInScoreBox(page)).toBe(true);
  expect(await scoreScroll(page)).not.toEqual(scrolledAway);
  // It came back during the count-in, not with the downbeat.
  await expect(page.getByTestId('count-in-beat')).toBeVisible();
  await expect(status(page)).toContainText('Counting in');
  await expect(playButton(page)).toHaveText('Pause');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect(status(page)).toHaveText('Bar 1 of 16');
});

interface SeekWindow {
  __drumPalPlayer?: { seekToBar(barNumber: number): boolean } | null;
}

/** Moves playback to a bar on the player itself, which never scrolls the score. */
async function seekWithoutTapping(page: Page, bar: number): Promise<void> {
  await page.evaluate((barNumber) => {
    const player = (window as unknown as SeekWindow).__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    player.seekToBar(barNumber);
  }, bar);
  await expect(status(page)).toHaveText(`Bar ${bar} of 16`);
}

test('a tap on a bar that is only partly on show seeks there and the score does not move under the finger', async ({
  user,
  page,
}, testInfo) => {
  const touch = testInfo.project.use.hasTouch === true;
  const sideways = expectedLayout(page) === 'horizontal';
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(status(page)).toHaveText('Bar 1 of 16');

  // Where bar 2 is: the cursor shows it. Then back to bar 1, with the score where it was.
  const bar1 = await barCursorBox(page);
  await seekWithoutTapping(page, 2);
  await expect
    .poll(async () => {
      const cursor = await barCursorBox(page);
      return cursor.x !== bar1.x || cursor.y !== bar1.y;
    })
    .toBe(true);
  const bar2 = await barCursorBox(page);
  await seekWithoutTapping(page, 1);
  await expect.poll(async () => (await barCursorBox(page)).x).toBe(bar1.x);

  // Scroll the box so half of bar 2 is cut off: by the right edge in the phone's one
  // line, by the top edge in the page layout.
  const frame = await scoreBox(page);
  const before = await scoreScroll(page);
  await viewport(page).evaluate(
    (box, by) => box.scrollBy({ ...by, behavior: 'instant' }),
    sideways
      ? { left: bar2.x + bar2.width / 2 - (frame.x + frame.width), top: 0 }
      : { left: 0, top: bar2.y + bar2.height / 2 - frame.y },
  );
  const scrolled = await scoreScroll(page);
  const shownBar2: Box = {
    ...bar2,
    x: bar2.x - (scrolled.left - before.left),
    y: bar2.y - (scrolled.top - before.top),
  };
  // Half of it is outside the box now.
  expect(inside(frame, shownBar2)).toBe(false);
  const visiblePart: Point = sideways
    ? { x: frame.x + frame.width - bar2.width / 4, y: bar2.y + bar2.height / 2 }
    : { x: shownBar2.x + bar2.width / 2, y: frame.y + bar2.height / 4 };
  expect(contains(shownBar2, visiblePart)).toBe(true);
  expect(contains(frame, visiblePart)).toBe(true);
  // Nothing fixed (the sticky bar, the tab bar) is over the point about to be tapped.
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[data-testid="score-viewport"]') != null,
      visiblePart,
    ),
  ).toBe(true);
  const windowBefore = await page.evaluate(() => window.scrollY);

  if (touch) await page.touchscreen.tap(visiblePart.x, visiblePart.y);
  else await page.mouse.click(visiblePart.x, visiblePart.y);

  // It is a seek to the bar tapped, and the cursor is under the finger.
  await expect(status(page)).toHaveText('Bar 2 of 16');
  await expect.poll(async () => contains(await barCursorBox(page), visiblePart)).toBe(true);
  // Long enough for any scroll to have started and ended.
  await page.waitForTimeout(500);
  expect(await scoreScroll(page)).toEqual(scrolled);
  expect(await page.evaluate(() => window.scrollY)).toBe(windowBefore);
  // Still half out of the box: it was not pulled to the start of it.
  expect(await cursorBarInScoreBox(page)).toBe(false);
  await expect(playButton(page)).toHaveText('Play');
});

test('paused: a loop saved from typed bars, another one, and its bars edited each scroll the score to the loop’s first bar', async ({
  user,
  page,
}) => {
  test.setTimeout(60_000);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await scrollScoreToStart(page);
  const atStart = await scoreScroll(page);

  /** The loop's first bar, all of it, is in the score box, under the start of the highlight. */
  async function expectLoopStartOnShow(bar: number): Promise<void> {
    await expect(status(page)).toHaveText(`Bar ${bar} of 16`);
    await expect.poll(() => cursorBarInScoreBox(page)).toBe(true);
    await expect.poll(() => loopStartInScoreBox(page)).toBe(true);
    const [first] = await highlightBoxes(page);
    if (!first) throw new Error('No highlight');
    expect(contains(await barCursorBox(page), startOf(first))).toBe(true);
    // Showing a bar starts nothing.
    await expect(playButton(page)).toHaveText('Play');
  }

  // Far from the cursor: QA's case, where the highlight was 1,400 px off to the right.
  await saveNewLoop(page, { name: 'Late', firstBar: 13, lastBar: 14 });
  await expectLoopStartOnShow(13);
  expect(await scoreScroll(page)).not.toEqual(atStart);

  // The song's last bar: there is no room to bring it to the start of the box, and it still shows.
  await saveNewLoop(page, { name: 'Last bar', firstBar: 16, lastBar: 16 });
  await expectLoopStartOnShow(16);

  // And back to the top.
  await saveNewLoop(page, { name: 'Early', firstBar: 1, lastBar: 2 });
  await expectLoopStartOnShow(1);

  // The paused loop's bars, edited: the score goes to its new first bar.
  await loopItem(page, 'Early').getByRole('button', { name: 'Edit Early' }).click();
  await firstBarField(page).fill('9');
  await lastBarField(page).fill('10');
  await saveLoopButton(page).click();
  await expect(loopForm(page)).toHaveCount(0);
  await expect(activeLoopLine(page)).toContainText('Early · Bars 9 to 10');
  await expectLoopStartOnShow(9);

  // A bar already on show is left where it is: choosing its neighbour moves nothing.
  const settled = await scoreScroll(page);
  await loopItem(page, 'Early').getByRole('button', { name: 'Edit Early' }).click();
  await lastBarField(page).fill('9');
  await saveLoopButton(page).click();
  await expect(activeLoopLine(page)).toContainText('Early · Bar 9');
  await page.waitForTimeout(300);
  expect(await scoreScroll(page)).toEqual(settled);
});
