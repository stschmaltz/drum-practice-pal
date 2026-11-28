/// <reference lib="dom" />
/**
 * Locators and steps for practice sessions and the home page (Unit 09), used
 * by practice.spec.ts: what the database holds for a user, the "Practice
 * logged" notice, a loop's history, a song overview's lists (Unit 16), and the
 * ways a spec shortens, watches and interrupts a session.
 */
import type { Locator, Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, type E2eUser } from './auth';
import { chooseLoopAction, loopPanel } from './loopsPage';
import { playButton, status } from './playerPage';

const admin = createAdminClient();

/** The user's logged sessions, oldest first, read with the service role. */
export async function sessionsOf(user: E2eUser) {
  const { data, error } = await admin
    .from('practice_sessions')
    .select('id, loop_id, started_at, duration_seconds, speed_ratio, repeats')
    .eq('user_id', user.id)
    .order('started_at');
  if (error) throw error;
  return data;
}

/** Polls the database for how many sessions the user has: `await sessionCount(user).toBe(1)`. */
export const sessionCount = (user: E2eUser, options?: { timeout?: number }) =>
  expect.poll(async () => (await sessionsOf(user)).length, options);

export async function loopsOf(user: E2eUser) {
  const { data, error } = await admin
    .from('loops')
    .select('id, name, status, speed_ratio, finished_at, last_practiced_at')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
}

/** The practice screen's speed in large type and its round nudges, each saved as made (Unit 16). */
export const practiceSpeed = (page: Page) => page.getByTestId('practice-speed');
export const nudge = (page: Page, which: 'Slower' | 'Faster') =>
  page.getByRole('button', { name: `${which} by 5%` });
/** The practice screen's line of the sitting so far: bars, play time, passes. */
export const practiceProgress = (page: Page) => page.getByTestId('practice-progress');
/**
 * The song overview's summary of what was practised in this visit: a line per
 * loop, the streak, badges earned, and Dismiss. Nothing is shown while
 * practising (the Session complete sheet is gone: Shane, 2026-11-27).
 */
export const visitSummary = (page: Page) => page.getByTestId('visit-summary');
/** Anything of the sheet that used to come up at a pause: there must be none. */
export const sessionCompleteLeftovers = (page: Page) =>
  page.getByText(/Session complete|Keep going/);

/** From a song's overview, a loop's round play button: its practice screen, ready for Play. */
export async function openPractice(page: Page, loopName: string): Promise<void> {
  await page.getByRole('link', { name: `Practise ${loopName}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: loopName })).toBeVisible();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
}

/** The way back up a level, "← Song title", above a screen's title. */
export const backTo = (page: Page, title: string) =>
  page.getByRole('main').getByRole('link', { name: title, exact: true });

/** The song page's "Practice logged: …" line. */
export const sessionLogged = (page: Page) => page.getByTestId('session-logged');

/** The bottom tabs on a phone, the sidebar from 768 px; only one is on show. */
export const navLink = (page: Page, name: 'Songs' | 'Stats' | 'Settings') =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

/**
 * A song overview's list of loops: those on the go, or the mastered ones. By
 * its name, never just "a list in main": the jam page's loop panel is a list
 * in main too, and is still there for a moment after a link is pressed.
 */
export const overviewList = (page: Page, which: 'on the go' | 'mastered') =>
  page
    .getByRole('main')
    .getByRole('list', { name: which === 'on the go' ? 'Loops on the go' : 'Mastered loops' });
export const overviewItem = (page: Page, which: 'on the go' | 'mastered', name: string) =>
  overviewList(page, which).getByRole('listitem').filter({ hasText: name });

/** Opens a loop's history in the panel (opening the panel first) and returns it. */
export async function openLoopHistory(page: Page, loopName: string): Promise<Locator> {
  await chooseLoopAction(page, loopName, 'History');
  return loopPanel(page).getByRole('region', { name: `History of ${loopName}` });
}

/**
 * Lowers the play time a session needs (30 s in the app) for this page, so a
 * spec about what happens after a session needn't play for half a minute.
 * `window.__drumPalMinSessionSeconds` is read in dev and the e2e build only.
 */
export async function shortSessions(page: Page, seconds: number): Promise<void> {
  await page.addInitScript((min) => {
    (window as unknown as { __drumPalMinSessionSeconds: number }).__drumPalMinSessionSeconds = min;
  }, seconds);
}

/**
 * Once playback is under way, waits `ms` and pauses. Returns the ms it played.
 * The press that starts playback is the spec's own (Play, or "Play loop").
 */
export async function playFor(page: Page, ms: number): Promise<number> {
  await expect(playButton(page)).toHaveText('Pause');
  await expect(status(page)).not.toContainText('Counting in');
  const started = Date.now();
  await page.waitForTimeout(ms);
  await playButton(page).click();
  const played = Date.now() - started;
  await expect(playButton(page)).toHaveText('Play');
  return played;
}

/** Presses Play and leaves it playing after `ms`, for a spec that then leaves or hides the page. */
export async function playOn(page: Page, ms: number): Promise<void> {
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await page.waitForTimeout(ms);
}

/** A `practice_sessions` insert the page sent: its row's id, and whether it asked the browser to keep it alive. */
interface SentSession {
  id: string;
  keepalive: boolean;
}

interface SentSessionsWindow {
  __sentSessions?: SentSession[];
}

/**
 * Records every session insert the page sends from its next load on, by
 * wrapping `fetch`: Playwright's own request events don't say whether a
 * request was sent with `keepalive`.
 */
export async function recordSentSessions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sent: SentSession[] = [];
    (window as unknown as SentSessionsWindow).__sentSessions = sent;
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (url.includes('/rest/v1/practice_sessions') && method === 'POST') {
        const body = typeof init?.body === 'string' ? init.body : '{}';
        const row = JSON.parse(body) as { id?: string } | { id?: string }[];
        const id = (Array.isArray(row) ? row[0]?.id : row.id) ?? 'unknown';
        sent.push({ id, keepalive: init?.keepalive === true });
      }
      return realFetch(input, init);
    };
  });
}

export const sentSessions = (page: Page) =>
  page.evaluate(() => (window as unknown as SentSessionsWindow).__sentSessions ?? []);

/** Hides or shows the page as a phone does when it is locked or another app comes up. */
export async function setPageVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => next === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}
