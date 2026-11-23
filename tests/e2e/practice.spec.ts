/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, signIn, test, type E2eUser } from './auth';
import {
  activeLoopLine,
  commit,
  loopItem,
  loopPanel,
  loopPercentField,
  openLoopPanel,
  playLoopButton,
  saveNewLoop,
  saveSpeedButton,
} from './loopsPage';
import { openFixture, playButton, status } from './playerPage';

// Unit 09: practice sessions and progress. Loop play time is logged, a loop
// has a history, a loop at its target asks "Mark finished?", and the home page
// lists what is on the go and what is finished.

const admin = createAdminClient();

const sessionLogged = (page: Page) => page.getByTestId('session-logged');
/** The bottom tabs on a phone, the sidebar from 768 px; only one is on show. */
const navLink = (page: Page, name: 'On the go' | 'Library') =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
const speed = (page: Page) => page.getByTestId('jam-speed');
const homeTab = (page: Page, name: 'On the go' | 'Finished') =>
  page.getByRole('group', { name: 'Loops to show' }).getByRole('button', { name });
/**
 * The home page's list of the tab on show. By its name, never just "the list
 * in main": the song page's loop panel is a list in main too, and is still
 * there for a moment after a nav link is pressed.
 */
const homeList = (page: Page) =>
  page.getByRole('main').getByRole('list', { name: /^(On the go|Finished)$/ });
const homeItem = (page: Page, name: string) =>
  homeList(page).getByRole('listitem').filter({ hasText: name });

/** The user's logged sessions, read with the service role. */
async function sessionsOf(user: E2eUser) {
  const { data, error } = await admin
    .from('practice_sessions')
    .select('id, loop_id, started_at, duration_seconds, speed_ratio, repeats')
    .eq('user_id', user.id)
    .order('started_at');
  if (error) throw error;
  return data;
}

async function loopsOf(user: E2eUser) {
  const { data, error } = await admin
    .from('loops')
    .select('id, name, status, finished_at, last_practiced_at')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
}

/**
 * Lowers the play time a session needs (30 s in the app) for this page, so a
 * spec about what happens after a session needn't play for half a minute.
 * `window.__drumPalMinSessionSeconds` is read in dev and the e2e build only.
 */
async function shortSessions(page: Page, seconds: number): Promise<void> {
  await page.addInitScript((min) => {
    (window as unknown as { __drumPalMinSessionSeconds: number }).__drumPalMinSessionSeconds = min;
  }, seconds);
}

/** Plays until the page has been in `playing` for `ms`, then pauses. Returns the ms it played. */
async function playFor(page: Page, ms: number): Promise<number> {
  await expect(playButton(page)).toHaveText('Pause');
  await expect(status(page)).not.toContainText('Counting in');
  const started = Date.now();
  await page.waitForTimeout(ms);
  await playButton(page).click();
  const played = Date.now() - started;
  await expect(playButton(page)).toHaveText('Play');
  return played;
}

test('a minute of loop practice is logged as one session with its speed and duration', async ({
  page,
  user,
}) => {
  test.setTimeout(150_000);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Bars five to six', firstBar: 5, lastBar: 6 });
  await openLoopPanel(page);
  await commit(loopPercentField(page), '85');
  await saveSpeedButton(page).click();
  await expect(saveSpeedButton(page)).toBeDisabled();

  await playLoopButton(page, 'Bars five to six').click();
  const playedMs = await playFor(page, 60_000);

  await expect(sessionLogged(page)).toContainText(/Practice logged: 1 min( \d+ s)? of Bars five/);
  await expect(sessionLogged(page)).toContainText('at 85%');
  await expect.poll(async () => (await sessionsOf(user)).length).toBe(1);
  const [session] = await sessionsOf(user);
  const [loop] = await loopsOf(user);
  expect(session).toMatchObject({ loop_id: loop!.id, speed_ratio: 0.85 });
  // Play time only: within a second and a half of what the test waited through.
  expect(Math.abs(session!.duration_seconds - playedMs / 1000)).toBeLessThanOrEqual(1.5);
  // Bars 5 to 6 at 85% of 120 BPM take about 4.7 s a pass.
  expect(session!.repeats).toBeGreaterThanOrEqual(10);
  expect(session!.repeats).toBeLessThanOrEqual(14);
  expect(Math.abs(Date.parse(session!.started_at) - (Date.now() - playedMs))).toBeLessThan(5_000);
  expect(loop!.last_practiced_at).not.toBeNull();

  // The loop's history shows it, and the home page says it was practiced today.
  await openLoopPanel(page);
  await loopItem(page, 'Bars five to six')
    .getByRole('button', { name: /^History/ })
    .click();
  const history = loopPanel(page).getByRole('region', { name: 'History of Bars five to six' });
  await expect(history.getByTestId('loop-history-summary')).toContainText('1 session');
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await expect(history.getByRole('listitem')).toContainText(
    /Today, .* · 1 min.* · 85% \(102 BPM\)/,
  );

  // A second stop logs nothing more.
  await page.waitForTimeout(1_000);
  expect(await sessionsOf(user)).toHaveLength(1);
});

test('a short go is not logged, and jam mode never is', async ({ page, user }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Short', firstBar: 1, lastBar: 2 });

  await playButton(page).click();
  await playFor(page, 3_000);
  await activeLoopLine(page).getByRole('button', { name: 'Exit loop' }).click();
  await playButton(page).click();
  await playFor(page, 3_000);

  // Three seconds do count once the minimum is lowered (the specs below), so this
  // is the 30-second rule and not a tracker that wasn't listening.
  await expect(sessionLogged(page)).toHaveCount(0);
  expect(await sessionsOf(user)).toEqual([]);
});

test('hitting the target asks "Mark finished?", and finish and reopen move the loop between tabs', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Fill', firstBar: 3, lastBar: 4, target: 90 });
  await openLoopPanel(page);
  await commit(loopPercentField(page), '80');
  await saveSpeedButton(page).click();
  await expect(saveSpeedButton(page)).toBeDisabled();
  const prompt = loopPanel(page).getByTestId('finish-prompt');
  await expect(prompt).toHaveCount(0);

  // Practice it, so it has a history to keep.
  await playLoopButton(page, 'Fill').click();
  await playFor(page, 3_000);
  await expect(sessionLogged(page)).toContainText('of Fill at 80%');

  // Reaching the target asks; it does not finish the loop.
  await openLoopPanel(page);
  await commit(loopPercentField(page), '90');
  await expect(prompt).toHaveCount(0);
  await saveSpeedButton(page).click();
  await expect(prompt).toContainText("You've reached your target of 90%");
  expect((await loopsOf(user))[0]?.status).toBe('active');

  await prompt.getByRole('button', { name: 'Mark finished' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(loopPanel(page).getByRole('region', { name: 'Finished loops' })).toContainText(
    'Fill',
  );
  await expect.poll(async () => (await loopsOf(user))[0]?.status).toBe('finished');

  // Home: nothing on the go, the loop under Finished with its song and speeds.
  await navLink(page, 'On the go').click();
  await expect(homeTab(page, 'On the go')).toContainText('On the go (0)');
  await expect(page.getByText(/Nothing on the go/)).toBeVisible();
  await homeTab(page, 'Finished').click();
  const finished = homeItem(page, 'Fill');
  await expect(finished).toContainText('Groove 120');
  await expect(finished).toContainText('Bars 3 to 4 · 90% · target 90%');
  await expect(finished).toContainText('Last practiced today · finished today');

  await finished.getByRole('button', { name: 'Reopen Fill' }).click();
  await expect(page.getByText(/No finished loops yet/)).toBeVisible();
  await homeTab(page, 'On the go').click();
  await expect(homeItem(page, 'Fill')).toContainText('Last practiced today');
  await expect
    .poll(async () => (await loopsOf(user))[0])
    .toMatchObject({
      status: 'active',
      finished_at: null,
    });
  // The history was kept through both.
  expect(await sessionsOf(user)).toHaveLength(1);

  // The tab survives a reload, from the address.
  await homeTab(page, 'Finished').click();
  await page.reload();
  await expect(homeTab(page, 'Finished')).toHaveAttribute('aria-pressed', 'true');
});

test('the home page lists loops by last practiced and opens a loop ready to play in one tap', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  await saveNewLoop(page, { name: 'First saved', firstBar: 1, lastBar: 2 });
  await saveNewLoop(page, { name: 'Late one', firstBar: 9, lastBar: 10, target: 100 });
  await openLoopPanel(page);
  await commit(loopPercentField(page), '70');
  await saveSpeedButton(page).click();
  await expect(saveSpeedButton(page)).toBeDisabled();
  await playLoopButton(page, 'Late one').click();
  await playFor(page, 3_000);
  await expect(sessionLogged(page)).toContainText('of Late one at 70%');

  await navLink(page, 'On the go').click();

  // The practiced loop leads; the one never practiced follows.
  await expect(homeList(page).getByRole('listitem')).toHaveCount(2);
  const names = await homeList(page)
    .getByRole('listitem')
    .evaluateAll((items) => items.map((item) => item.querySelector('p')?.textContent));
  expect(names).toEqual(['Late one', 'First saved']);
  await expect(homeItem(page, 'Late one')).toContainText('Bars 9 to 10 · 70% · target 100%');
  await expect(homeItem(page, 'Late one')).toContainText('Last practiced today');
  await expect(homeItem(page, 'First saved')).toContainText('Not practiced yet');

  await homeItem(page, 'Late one').getByRole('link', { name: 'Practice Late one' }).click();

  // The song opens on the loop at its saved speed: one tap in, then Play.
  await expect(page.getByRole('heading', { level: 1, name: 'Tempo Change' })).toBeVisible();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(activeLoopLine(page)).toContainText('Looping Late one · Bars 9 to 10');
  await expect(speed(page)).toHaveText('70%');
  // 90 BPM from bar 9, at 70%.
  await expect(page.getByTestId('jam-bpm')).toHaveText('63');
  await expect(status(page)).toContainText('Bar 9 of 16');
  await expect(playButton(page)).toHaveText('Play');

  await playButton(page).click();
  await playFor(page, 3_000);
  await expect.poll(async () => (await sessionsOf(user)).length).toBe(2);
  expect((await sessionsOf(user)).every((session) => session.speed_ratio === 0.7)).toBe(true);
});

test('leaving the page mid-practice still logs the session, once', async ({ page, user }) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Leaving', firstBar: 1, lastBar: 2 });
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await page.waitForTimeout(3_500);

  // A full navigation away while playing: pagehide, and a request that must outlive the page.
  await page.goto('about:blank');

  await expect.poll(async () => (await sessionsOf(user)).length, { timeout: 10_000 }).toBe(1);
  const [session] = await sessionsOf(user);
  expect(session!.duration_seconds).toBeGreaterThanOrEqual(3);
  expect(session!.duration_seconds).toBeLessThanOrEqual(8);
  expect(session!.speed_ratio).toBe(1);
  await page.waitForTimeout(1_000);
  expect(await sessionsOf(user)).toHaveLength(1);

  // The same through the app's own navigation, where the page lives on.
  await signIn(page, user, '/');
  await page.getByRole('link', { name: 'Practice Leaving' }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(activeLoopLine(page)).toContainText('Leaving');
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await page.waitForTimeout(3_500);
  await navLink(page, 'Library').click();

  await expect.poll(async () => (await sessionsOf(user)).length, { timeout: 10_000 }).toBe(2);
});
