/// <reference lib="dom" />
/**
 * Locators and steps for a song's recordings (Unit 14), used by
 * recordings.spec.ts and design.spec.ts: the overview's Play along block and
 * its form, the play screen's source switch and video box, and a stand-in for
 * YouTube, which a CI machine can't (and mustn't) play.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, type E2eUser } from './auth';

const admin = createAdminClient();

export const VIDEO_ID = 'dQw4w9WgXcQ';
export const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
export const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?playsinline=1&rel=0`;
export const SPOTIFY_URL = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

/** Anything of YouTube's or Spotify's: their pages, players, thumbnails and video. */
const SERVICE_HOSTS =
  /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com|spotify\.com|scdn\.co)$/;

export const STUB_PLAYER_TEXT = 'Stub YouTube player';

/**
 * Answers every request to YouTube and Spotify with a stub page, so nothing
 * leaves the machine, and records each one. A spec that says "no request was
 * made" first proves the recorder sees one (an empty list must not pass by
 * the routes never having been reached).
 */
export async function stubServices(context: BrowserContext): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  await context.route(
    (url) => SERVICE_HOSTS.test(url.hostname),
    async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>Stub</title><body style="margin:0;background:#000;color:#fff;font:16px sans-serif"><p>${STUB_PLAYER_TEXT}</p><p id="at"></p><script>document.getElementById('at').textContent = location.href</script></body>`,
      });
    },
  );
  return { requests };
}

export const playAlong = (page: Page) => page.getByRole('region', { name: 'Play along' });
export const recordingsForm = (page: Page) => page.getByRole('form', { name: 'Recordings' });
export const linkField = (page: Page, name: 'Original' | 'Drumless' | `Other link ${number}`) =>
  recordingsForm(page).getByRole('textbox', { name: new RegExp(`^${name}`) });
export const sourceSwitch = (page: Page) =>
  page.getByRole('radiogroup', { name: 'Play along with' });
export const recordingFrame = (page: Page) => page.getByTestId('recording-frame');
export const recordingBar = (page: Page) => page.getByTestId('recording-bar');
/** Why the tab's controls aren't there: in the bar from 1024 px and in a phone on its side, under it otherwise, one of the two drawn. */
export const recordingNote = (page: Page) =>
  page.getByText(/^The video has its own controls\./).filter({ visible: true });

/** The source's option: its label, since the radio itself is visually hidden inside it. */
export const sourceOption = (page: Page, name: 'Tab' | 'Original' | 'Drumless') =>
  sourceSwitch(page)
    .locator('label')
    .filter({ hasText: new RegExp(`^${name}$`) });

/** On a song's overview: opens the recordings form by whichever door the page has. */
export async function openRecordingsForm(page: Page, songTitle: string): Promise<void> {
  const add = page.getByRole('button', { name: 'Add a recording' });
  if (await add.isVisible()) await add.click();
  else {
    await page.getByRole('button', { name: `More actions for ${songTitle}` }).click();
    await page.getByRole('menuitem', { name: 'Manage recordings' }).click();
  }
  await expect(recordingsForm(page)).toBeVisible();
}

/** Fills the form's fields as given and saves; resolves once the form has closed. */
export async function saveRecordings(
  page: Page,
  songTitle: string,
  fields: Partial<Record<'Original' | 'Drumless', string>>,
): Promise<void> {
  await openRecordingsForm(page, songTitle);
  for (const [name, text] of Object.entries(fields)) {
    await linkField(page, name as 'Original' | 'Drumless').fill(text);
  }
  await recordingsForm(page).getByRole('button', { name: 'Save' }).click();
  await expect(recordingsForm(page)).toHaveCount(0);
}

export const openInYouTube = (page: Page) => page.getByRole('link', { name: /^Open in YouTube/ });

/** The user's links as the database has them, by the service role. */
export async function linksOf(user: E2eUser) {
  const { data, error } = await admin
    .from('song_links')
    .select('kind, provider, url')
    .eq('user_id', user.id)
    .order('kind');
  if (error) throw error;
  return data;
}

/** When each of the user's songs was last played along to, by title. */
export async function lastPlayedOf(user: E2eUser): Promise<Record<string, string | null>> {
  const { data, error } = await admin
    .from('songs')
    .select('title, last_played_at')
    .eq('user_id', user.id);
  if (error) throw error;
  return Object.fromEntries(data.map((song) => [song.title, song.last_played_at]));
}
