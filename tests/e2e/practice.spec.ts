/// <reference lib="dom" />
import { expect, signIn, test } from './auth';
import {
  commit,
  playLoopButton,
  loopPanel,
  loopPercentField,
  openLoopPanel,
  saveLoopSpeed,
  saveNewLoop,
  exitLoop,
} from './loopsPage';
import {
  boxOf,
  chooseCountIn,
  chooseCountInMode,
  openFixture,
  playButton,
  recordedStatuses,
  recordStatuses,
  scoreBox,
  scoreSettled,
  status,
  viewport,
  windowScrollSettled,
} from './playerPage';
import {
  backTo,
  loopsOf,
  navLink,
  nudge,
  openLoopHistory,
  openPractice,
  overviewItem,
  overviewList,
  practiceSpeed,
  playFor,
  playOn,
  recordSentSessions,
  sentSessions,
  practiceProgress,
  sessionCompleteLeftovers,
  sessionCount,
  sessionLogged,
  sessionsOf,
  setPageVisibility,
  shortSessions,
  visitSummary,
} from './practicePage';

// Unit 09: practice sessions and progress. Loop play time is logged, a loop
// has a history, a loop at full speed asks "Mark finished?", and a song's
// overview lists what is on the go and what is mastered (Unit 16).

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
  await expect(history.getByTestId('loop-history-summary')).toContainText('1 day');
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await expect(history.getByRole('listitem')).toContainText(/^Today · 1 min.* · 85% \(102 BPM\)/);

  // A second stop logs nothing more.
  await page.waitForTimeout(1_000);
  expect(await sessionsOf(user)).toHaveLength(1);
});

test('a short go is not logged, and jam mode never is', async ({ page, user }) => {
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Short', firstBar: 1, lastBar: 2 });

  await playButton(page).click();
  await playFor(page, 3_000);
  await exitLoop(page);
  await playButton(page).click();
  await playFor(page, 3_000);

  // Three seconds do count once the minimum is lowered (the specs below), so this
  // is the 30-second rule and not a tracker that wasn't listening.
  await expect(sessionLogged(page)).toHaveCount(0);
  expect(await sessionsOf(user)).toEqual([]);
});

test('reaching full speed asks "Mark finished?", and finish and reopen move the loop between the song lists', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Fill', firstBar: 3, lastBar: 4 });
  await saveLoopSpeed(page, 80);
  const prompt = loopPanel(page).getByTestId('finish-prompt');
  await expect(prompt).toHaveCount(0);

  // Practice it, so it has a history to keep.
  await playLoopButton(page, 'Fill').click();
  await playFor(page, 3_000);
  await expect(sessionLogged(page)).toContainText('of Fill at 80%');

  // Under full speed nothing asks; reaching it asks, and does not finish the loop.
  await openLoopPanel(page);
  await commit(loopPercentField(page), '95');
  await expect.poll(async () => (await loopsOf(user))[0]?.speed_ratio).toBe(0.95);
  await expect(prompt).toHaveCount(0);
  await commit(loopPercentField(page), '100');
  await expect(prompt).toContainText("You're playing it at full speed");
  expect((await loopsOf(user))[0]?.status).toBe('active');

  await prompt.getByRole('button', { name: 'Mark finished' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(loopPanel(page).getByRole('region', { name: 'Finished loops' })).toContainText(
    'Fill',
  );
  await expect.poll(async () => (await loopsOf(user))[0]?.status).toBe('finished');

  // The song's overview: nothing on the go, the loop mastered with its speed.
  await backTo(page, 'Groove 120').click();
  await expect(page.getByTestId('song-facts')).toContainText('1 of 1 mastered');
  await expect(overviewList(page, 'on the go')).toHaveCount(0);
  const finished = overviewItem(page, 'mastered', 'Fill');
  await expect(finished).toContainText('Bars 3 to 4 · 100%');
  await expect(finished).toContainText('Last practised today');

  await finished.getByRole('button', { name: 'More actions for Fill' }).click();
  await page.getByRole('menuitem', { name: 'Reopen' }).click();
  await expect(overviewItem(page, 'on the go', 'Fill')).toContainText('Last practised today');
  await expect(overviewList(page, 'mastered')).toHaveCount(0);
  await expect
    .poll(async () => (await loopsOf(user))[0])
    .toMatchObject({
      status: 'active',
      finished_at: null,
    });
  // The history was kept through both.
  expect(await sessionsOf(user)).toHaveLength(1);
});

test('a song lists its loops by last practised and opens one on its practice screen in one tap', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  await saveNewLoop(page, { name: 'First saved', firstBar: 1, lastBar: 2 });
  await saveNewLoop(page, { name: 'Late one', firstBar: 9, lastBar: 10 });
  await saveLoopSpeed(page, 70);
  await playLoopButton(page, 'Late one').click();
  await playFor(page, 3_000);
  await expect(sessionLogged(page)).toContainText('of Late one at 70%');

  await backTo(page, 'Tempo Change').click();

  // The practised loop leads; the one never practised follows.
  const onTheGo = overviewList(page, 'on the go');
  await expect(onTheGo.getByRole('listitem')).toHaveCount(2);
  const names = await onTheGo
    .getByRole('listitem')
    .evaluateAll((items) => items.map((item) => item.querySelector('p')?.textContent));
  expect(names).toEqual(['Late one', 'First saved']);
  await expect(overviewItem(page, 'on the go', 'Late one')).toContainText('Bars 9 to 10 · 70%');
  await expect(overviewItem(page, 'on the go', 'Late one')).toContainText('Last practised today');

  // Its practice screen opens on the loop at its saved speed: one tap in, then Play.
  await openPractice(page, 'Late one');
  await expect(practiceSpeed(page)).toHaveText('70%');
  // 90 BPM from bar 9, at 70%.
  await expect(page.getByRole('group', { name: 'Loop speed' })).toContainText('63 BPM');
  await expect(page.getByTestId('practice-to-full-speed')).toHaveText('30% to full speed');
  await expect(status(page)).toContainText('Bar 9 of 16');
  await expect(playButton(page)).toHaveText('Play');

  await playButton(page).click();
  await playFor(page, 3_000);
  await sessionCount(user).toBe(2);
  expect((await sessionsOf(user)).every((session) => session.speed_ratio === 0.7)).toBe(true);
});

// 16 QA issue 7: at 844 x 390 the practice bar took 157 px of the 390 while playing. In a short
// window it is one row, its buttons still 44 px or more.
test('on a phone on its side the practice bar is one row and leaves the score most of the height', async ({
  page,
  user,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'a phone turned on its side');
  await page.setViewportSize({ width: 844, height: 390 });
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Sideways', firstBar: 1, lastBar: 2 });
  await backTo(page, 'Groove 120').click();
  await openPractice(page, 'Sideways');

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  const bar = page.getByTestId('practice-bar');
  await windowScrollSettled(page);
  const { height } = await boxOf(bar, 'practice bar');
  expect(height).toBeLessThanOrEqual(90);
  for (const button of await bar.getByRole('button').all()) {
    const box = await boxOf(button, 'practice bar button');
    const name = (await button.getAttribute('aria-label')) ?? (await button.innerText());
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
  }
  // The speed's words on full speed are still there for a screen reader.
  await expect(page.getByTestId('practice-to-full-speed')).toHaveText('Full speed');
  await playButton(page).click();
});

// The Session complete sheet came up at every pause (Shane, 2026-11-27: "buggy and annoying").
// A pause that logs a session now shows nothing, moves nothing, and leaves focus on Play;
// the header's time carries on from one session into the next.
test('a pause shows nothing and the score stays put', async ({ page, user }) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Still', firstBar: 1, lastBar: 2 });
  await backTo(page, 'Groove 120').click();
  await openPractice(page, 'Still');
  await viewport(page).scrollIntoViewIfNeeded();

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await page.waitForTimeout(3_000);
  await scoreSettled(page);
  const before = await scoreBox(page);
  await playButton(page).click();

  // The session is in the database: this is the moment the sheet used to appear.
  await sessionCount(user).toBe(1);
  await windowScrollSettled(page);
  await expect(sessionCompleteLeftovers(page)).toHaveCount(0);
  await expect(sessionLogged(page)).toHaveCount(0);
  await expect(visitSummary(page)).toHaveCount(0);
  await expect(playButton(page)).toBeFocused();
  expect(await scoreBox(page)).toEqual(before);
  await expect(practiceProgress(page)).toContainText(/0:0[3-5]/);

  // A second session: the time counts the whole sitting, not from the last pause.
  await playButton(page).click();
  await playFor(page, 3_000);
  await sessionCount(user).toBe(2);
  await expect(practiceProgress(page)).toContainText(/0:0[6-9]|0:1\d/);
  await expect(sessionCompleteLeftovers(page)).toHaveCount(0);
});

test('going back to the song sums the sitting up once, with its session in the database', async ({
  page,
  user,
}) => {
  await shortSessions(page, 2);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await saveNewLoop(page, { name: 'Fill', firstBar: 3, lastBar: 4 });
  await saveNewLoop(page, { name: 'Other', firstBar: 7, lastBar: 8 });
  await backTo(page, 'Groove 120').click();
  await openPractice(page, 'Fill');

  // Opened at 100%, left at 90%.
  for (let i = 0; i < 2; i++) await nudge(page, 'Slower').click();
  await expect(practiceSpeed(page)).toHaveText('90%');
  await playButton(page).click();
  await playFor(page, 3_000);
  await sessionCount(user).toBe(1);

  await backTo(page, 'Groove 120').click();
  const summary = visitSummary(page);
  await expect(summary).toBeVisible();
  await expect(summary.getByRole('listitem')).toHaveText([/^Fill: [3-6] s, 100% → 90%$/]);
  await expect(summary).toContainText('Streak: 1 day');
  // What it says is what was logged.
  const [session] = await sessionsOf(user);
  expect(session?.speed_ratio).toBe(0.9);
  expect(session?.duration_seconds).toBeGreaterThanOrEqual(3);
  const fill = (await loopsOf(user)).find((loop) => loop.name === 'Fill');
  expect(session?.loop_id).toBe(fill?.id);

  // Filling in the streak moved nothing: the loops are where a tap would find them.
  await expect(overviewItem(page, 'on the go', 'Fill')).toBeVisible();

  // Dismiss takes it away, and focus goes to New loop.
  await summary.getByRole('button', { name: 'Dismiss practice summary' }).click();
  await expect(summary).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New loop' })).toBeFocused();

  // A loop opened and left without practice says nothing.
  await openPractice(page, 'Other');
  await backTo(page, 'Groove 120').click();
  await expect(overviewList(page, 'on the go')).toBeVisible();
  await expect(visitSummary(page)).toHaveCount(0);

  // Shown once: practise again, see it, leave the overview and come back.
  await openPractice(page, 'Other');
  await playButton(page).click();
  await playFor(page, 3_000);
  await sessionCount(user).toBe(2);
  await backTo(page, 'Groove 120').click();
  await expect(visitSummary(page).getByRole('listitem')).toHaveText([/^Other: [3-6] s, 100%$/]);
  await backTo(page, 'Songs').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
  await page.goBack();
  await expect(overviewList(page, 'on the go')).toBeVisible();
  await expect(visitSummary(page)).toHaveCount(0);
});

test('Back and Forward walk the three levels; a loop key and an old ?loop= link replace their entry', async ({
  page,
  user,
}) => {
  await openFixture(page, user, 'tempo-change', 'Tempo Change');
  const songId = /\/songs\/([^/]+)\/play/.exec(page.url())?.[1];
  if (!songId) throw new Error(`No song id in ${page.url()}`);
  await saveNewLoop(page, { name: 'Verse', firstBar: 1, lastBar: 2 });
  await saveNewLoop(page, { name: 'Bridge', firstBar: 9, lastBar: 10 });
  const ids = Object.fromEntries((await loopsOf(user)).map((loop) => [loop.name, loop.id]));
  const practiceUrl = (name: string) => new RegExp(`/songs/${songId}/loops/${ids[name]}$`);
  const songUrl = new RegExp(`/songs/${songId}$`);

  // Songs, the song, a loop.
  await navLink(page, 'Songs').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Tempo Change' }).click();
  await expect(page).toHaveURL(songUrl);
  await openPractice(page, 'Verse');
  await expect(page).toHaveURL(practiceUrl('Verse'));

  // A loop key moves on and the address follows, in place of the loop's entry.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 1, name: 'Bridge' })).toBeVisible();
  await expect(page).toHaveURL(practiceUrl('Bridge'));

  await page.goBack();
  await expect(page).toHaveURL(songUrl);
  await expect(page.getByRole('link', { name: 'Practise Verse' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(songUrl);
  await page.goForward();
  await expect(page).toHaveURL(practiceUrl('Bridge'));
  await expect(page.getByRole('heading', { level: 1, name: 'Bridge' })).toBeVisible();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(practiceSpeed(page)).toHaveText('100%');

  // A link from an earlier build opens the loop's practice screen; Back skips it.
  await navLink(page, 'Stats').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible();
  await page.goto(`/songs/${songId}?loop=${ids.Verse}`);
  await expect(page).toHaveURL(practiceUrl('Verse'));
  await expect(page.getByRole('heading', { level: 1, name: 'Verse' })).toBeVisible();
  await expect(status(page)).toContainText('Bar 1 of 16');
  await page.goBack();
  await expect(page).toHaveURL(/\/stats$/);
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
  await page.getByRole('main').getByRole('link', { name: 'Groove 120' }).click();
  await openPractice(page, 'Leaving');
  await playOn(page, 3_500);
  await navLink(page, 'Songs').click();

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
  await expect(history.getByTestId('loop-history-summary')).toContainText('1 day');
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
  await chooseCountIn(page, 1);
  await chooseCountInMode(page, 'every_repeat');
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
