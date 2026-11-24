/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  activeLoopLine,
  commit,
  loopPanel,
  loopPercentField,
  openLoopPanel,
  playLoopButton,
  saveLoopSpeed,
  saveNewLoop,
  saveSpeedButton,
} from './loopsPage';
import {
  countInModeSelect,
  countInSelect,
  openFixture,
  playButton,
  recordedStatuses,
  recordStatuses,
  status,
} from './playerPage';
import {
  homeItem,
  homeList,
  homeTab,
  loopsOf,
  navLink,
  openLoopHistory,
  playFor,
  playOn,
  recordSentSessions,
  sentSessions,
  sessionCount,
  sessionLogged,
  sessionsOf,
  setPageVisibility,
  shortSessions,
} from './practicePage';

// Unit 09: practice sessions and progress. Loop play time is logged, a loop
// has a history, a loop at its target asks "Mark finished?", and the home page
// lists what is on the go and what is finished.

const speed = (page: Page) => page.getByTestId('jam-speed');

test('a minute of loop practice is logged as one session with its speed and duration', async ({
  page,
  user,
}) => {
  test.setTimeout(150_000);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Bars five to six', firstBar: 5, lastBar: 6 });
  await saveLoopSpeed(page, 85);

  await playLoopButton(page, 'Bars five to six').click();
  const playedMs = await playFor(page, 60_000);

  await expect(sessionLogged(page)).toContainText(/Practice logged: 1 min( \d+ s)? of Bars five/);
  await expect(sessionLogged(page)).toContainText('at 85%');
  await sessionCount(user).toBe(1);
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
  const history = await openLoopHistory(page, 'Bars five to six');
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
  await saveLoopSpeed(page, 80);
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
  await saveLoopSpeed(page, 70);
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
  await sessionCount(user).toBe(2);
  expect((await sessionsOf(user)).every((session) => session.speed_ratio === 0.7)).toBe(true);
});

test('leaving the page mid-practice still logs the session, once', async ({ page, user }) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Leaving', firstBar: 1, lastBar: 2 });
  await playOn(page, 3_500);

  // A full navigation away while playing: pagehide, and a request that must outlive the page.
  await page.goto('about:blank');

  await sessionCount(user, { timeout: 10_000 }).toBe(1);
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
  await playOn(page, 3_500);
  await navLink(page, 'Library').click();

  await sessionCount(user, { timeout: 10_000 }).toBe(2);
});

test('a session whose answer is lost is sent again by itself and logged once', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await recordSentSessions(page);
  // The first insert reaches the database, and its answer never reaches the page.
  let lost = 0;
  await page.route('**/rest/v1/practice_sessions*', async (route) => {
    if (route.request().method() !== 'POST' || lost > 0) return route.continue();
    lost += 1;
    await route.fetch();
    await route.abort('connectionfailed');
  });
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Flaky', firstBar: 1, lastBar: 2 });

  await playButton(page).click();
  await playFor(page, 3_000);

  // A dropped connection is not a refusal (Unit 11): the log is retried, with no
  // "Couldn't save" on the way, and the retry finds the row already there.
  await expect(sessionLogged(page)).toContainText('of Flaky at 100%', { timeout: 10_000 });
  expect(lost).toBe(1);
  await expect(
    page.getByRole('alert').filter({ hasText: /Couldn.t save your last practice/ }),
  ).toHaveCount(0);
  const sent = await sentSessions(page);
  expect(sent.length).toBeGreaterThanOrEqual(2);
  expect(new Set(sent.map((session) => session.id)).size).toBe(1);
  const sessions = await sessionsOf(user);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]!.id).toBe(sent[0]!.id);

  // And the loop's history lists it once.
  const history = await openLoopHistory(page, 'Flaky');
  await expect(history.getByTestId('loop-history-summary')).toContainText('1 session');
  await expect(history.getByRole('listitem')).toHaveCount(1);
});

test('a hidden page logs with keepalive, counts none of the hidden time, and starts again when it is back', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await recordSentSessions(page);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Pocket', firstBar: 1, lastBar: 2 });
  await playOn(page, 3_500);

  // The phone is locked: the page is hidden while the player still says "playing".
  await setPageVisibility(page, 'hidden');

  await sessionCount(user, { timeout: 10_000 }).toBe(1);
  const [first] = await sessionsOf(user);
  expect(first!.duration_seconds).toBeGreaterThanOrEqual(3);
  expect(first!.duration_seconds).toBeLessThanOrEqual(6);
  expect(await sentSessions(page)).toEqual([{ id: first!.id, keepalive: true }]);

  // Five seconds in the pocket, still "playing".
  await page.waitForTimeout(5_000);
  await expect(playButton(page)).toHaveText('Pause');
  expect(await sessionsOf(user)).toHaveLength(1);
  await setPageVisibility(page, 'visible');
  // The page lived to hear the answer.
  await expect(sessionLogged(page)).toContainText('of Pocket');

  const backMs = await playFor(page, 3_000);

  await sessionCount(user, { timeout: 10_000 }).toBe(2);
  const second = (await sessionsOf(user)).find((session) => session.id !== first!.id);
  // Only the time since it came back: with the pocket time it would be 8 s or more.
  expect(Math.abs(second!.duration_seconds - backMs / 1000)).toBeLessThanOrEqual(1.5);
  expect(Date.parse(second!.started_at)).toBeGreaterThan(
    Date.parse(first!.started_at) + (first!.duration_seconds + 4) * 1000,
  );
  // On a page that is on show the app's own request is used, where a failure can be shown.
  expect((await sentSessions(page)).at(-1)).toEqual({ id: second!.id, keepalive: false });
});

test('with a count-in before every repeat, a sitting is one session of play time alone', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await countInSelect(page).selectOption('1 bar');
  await countInModeSelect(page).selectOption('Before every loop repeat');
  // Two bars at 120 BPM: 4 s a pass, with a 2 s count-in before each.
  await saveNewLoop(page, { name: 'Counted', firstBar: 1, lastBar: 2 });
  await recordStatuses(page);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  const started = Date.now();
  // Until the third pass is playing: two whole passes and three count-ins are behind.
  await expect
    .poll(async () => (await recordedStatuses(page)).join(' '), { timeout: 30_000 })
    .toContain('countingIn playing countingIn playing countingIn playing');
  await page.waitForTimeout(1_000);
  await playButton(page).click();
  const wallSeconds = (Date.now() - started) / 1000;
  await expect(playButton(page)).toHaveText('Play');

  await expect(sessionLogged(page)).toContainText('of Counted');
  await sessionCount(user).toBe(1);
  // Each pass ends in a stop of the engine; none of them ended the session.
  await page.waitForTimeout(1_000);
  const sessions = await sessionsOf(user);
  expect(sessions).toHaveLength(1);
  const [session] = sessions;
  expect(session!.repeats).toBe(2);
  // Two passes and a second of the third, about 9 s; the three count-ins, about 6 s, are left out.
  expect(session!.duration_seconds).toBeGreaterThanOrEqual(7);
  expect(session!.duration_seconds).toBeLessThanOrEqual(wallSeconds - 4);
});
