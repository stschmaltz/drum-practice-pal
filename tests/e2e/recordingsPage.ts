/// <reference lib="dom" />
/**
 * Locators and steps for a song's recordings (Unit 14), used by
 * recordings.spec.ts and design.spec.ts: the overview's Play along block and
 * its form, the play screen's source switch and video box, and a stand-in for
 * YouTube, which a CI machine can't (and mustn't) play.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { expect, signIn, type E2eUser } from './auth';
import { openSongOverview, uploadFixture } from './playerPage';

const admin = createAdminClient();

export const VIDEO_ID = 'dQw4w9WgXcQ';
export const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
/** The origin every spec's pages are on (`baseURL` in playwright.config.ts). */
const APP_ORIGIN = `http://localhost:${Number(process.env.E2E_PORT ?? 4173)}`;
/** What the frame's address carries so the player answers the app, and only the app (Unit 19). */
export const PLAYER_API_PARAMS = `&enablejsapi=1&origin=${encodeURIComponent(APP_ORIGIN)}`;
export const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?playsinline=1&rel=0${PLAYER_API_PARAMS}`;
/** YouTube's IFrame Player API: the one script the app asks YouTube for, when a video's frame is drawn. */
export const PLAYER_API_URL = 'https://www.youtube.com/iframe_api';
export const SPOTIFY_URL = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

/** Anything of YouTube's or Spotify's: their pages, players, thumbnails and video. */
const SERVICE_HOSTS =
  /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com|spotify\.com|scdn\.co)$/;

export const STUB_PLAYER_TEXT = 'Stub YouTube player';

/**
 * The stub of YouTube's embedded player: a page with a clock of its own that
 * runs while it "plays", a Play / Pause button (the tap a real video needs
 * before a page may drive it), and the player's side of a small message
 * protocol with `STUB_PLAYER_API` below. It posts only to the origin its
 * address names in `origin`, as YouTube's does: an address without the app's
 * own origin gets no answer, and nothing follows. A test drives it through
 * `window.stub` in the frame (`videoStub(page)`).
 */
const STUB_PLAYER_PAGE = `<!doctype html><title>Stub</title>
<body style="margin:0;background:#000;color:#fff;font:16px sans-serif">
<p>${STUB_PLAYER_TEXT}</p><p id="at"></p>
<button id="toggle" type="button" style="font:inherit;min-height:44px">Play</button>
<p id="clock">0.00</p>
<script>
document.getElementById('at').textContent = location.href;
(function () {
  var params = new URLSearchParams(location.search);
  var apiOn = params.get('enablejsapi') === '1';
  var pageOrigin = params.get('origin');
  var time = Number(params.get('start') || 0), rate = 1, playing = false, started = false;
  var last = performance.now(), listening = false;
  function now() {
    var at = performance.now();
    if (playing) time += ((at - last) / 1000) * rate;
    last = at;
    return time;
  }
  function post(extra) {
    if (!listening || !apiOn || !pageOrigin) return;
    parent.postMessage(Object.assign({ stub: 'yt', time: now(), rate: rate }, extra || {}), pageOrigin);
  }
  function setPlaying(next) {
    now();
    playing = next;
    if (next) started = true;
    document.getElementById('toggle').textContent = next ? 'Pause' : 'Play';
    post({ event: 'state', state: next ? 1 : 2 });
  }
  window.stub = {
    play: function () { setPlaying(true); },
    pause: function () { setPlaying(false); },
    seek: function (seconds) { now(); time = seconds; post({ event: 'state', state: playing ? 1 : 2 }); },
    setRate: function (next) { now(); rate = next; post({ event: 'rate' }); },
    time: function () { return now(); },
    playing: function () { return playing; },
  };
  document.getElementById('toggle').addEventListener('click', function () { setPlaying(!playing); });
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== parent || event.origin !== pageOrigin || !data || data.stub !== 'yt') return;
    if (data.cmd === 'listening') { if (!listening) { listening = true; post({ event: 'ready' }); } }
    // Like a real player: a page can't start a video nobody has tapped.
    else if (data.cmd === 'play') { if (started) setPlaying(true); }
    else if (data.cmd === 'pause') setPlaying(false);
    else if (data.cmd === 'seek') window.stub.seek(data.seconds);
  });
  setInterval(function () {
    document.getElementById('clock').textContent = now().toFixed(2);
    if (playing) post();
  }, 100);
})();
</script></body>`;

/**
 * The stub of `https://www.youtube.com/iframe_api`: `YT.Player` over a frame
 * the page already has, with the methods and events the app uses
 * (youTubePlayer.ts), speaking to `STUB_PLAYER_PAGE` in that frame.
 */
const STUB_PLAYER_API = `(function () {
  function Player(frame, options) {
    var self = this;
    this.frame = frame; this.time = 0; this.rate = 1; this.ready = false;
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (event.source !== frame.contentWindow || !data || data.stub !== 'yt') return;
      if (typeof data.time === 'number') self.time = data.time;
      if (typeof data.rate === 'number') self.rate = data.rate;
      if (data.event === 'ready' && !self.ready) { self.ready = true; options.events.onReady({ target: self }); }
      if (data.event === 'state') options.events.onStateChange({ target: self, data: data.state });
      if (data.event === 'rate') options.events.onPlaybackRateChange({ target: self, data: data.rate });
    });
    // The frame may still be loading: say hello until it answers.
    var hello = setInterval(function () {
      if (self.ready || !frame.isConnected) return clearInterval(hello);
      self.send({ cmd: 'listening' });
    }, 50);
  }
  Player.prototype.send = function (message) {
    if (this.frame.contentWindow) this.frame.contentWindow.postMessage(Object.assign({ stub: 'yt' }, message), '*');
  };
  Player.prototype.getCurrentTime = function () { return this.time; };
  Player.prototype.getPlaybackRate = function () { return this.rate; };
  Player.prototype.seekTo = function (seconds) { this.time = seconds; this.send({ cmd: 'seek', seconds: seconds }); };
  Player.prototype.playVideo = function () { this.send({ cmd: 'play' }); };
  Player.prototype.pauseVideo = function () { this.send({ cmd: 'pause' }); };
  window.YT = { Player: Player };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();`;

/**
 * Answers every request to YouTube and Spotify with a stub, so nothing
 * leaves the machine, and records each one: YouTube's player API script by
 * `STUB_PLAYER_API`, everything else by the stub player's page. A spec that
 * says "no request was made" first proves the recorder sees one (an empty
 * list must not pass by the routes never having been reached).
 *
 * `requests` is every request; `frames()` those for a page (the video frame
 * itself), `scripts()` those for the player API.
 */
export async function stubServices(context: BrowserContext): Promise<{
  requests: string[];
  frames: () => string[];
  scripts: () => string[];
}> {
  const requests: string[] = [];
  await context.route(
    (url) => SERVICE_HOSTS.test(url.hostname),
    async (route) => {
      const url = route.request().url();
      requests.push(url);
      if (url === PLAYER_API_URL) {
        await route.fulfill({ contentType: 'text/javascript', body: STUB_PLAYER_API });
      } else {
        await route.fulfill({ contentType: 'text/html', body: STUB_PLAYER_PAGE });
      }
    },
  );
  return {
    requests,
    frames: () => requests.filter((url) => url !== PLAYER_API_URL),
    scripts: () => requests.filter((url) => url === PLAYER_API_URL),
  };
}

/** What the stub player's page exposes to a test (`window.stub` in the frame). */
interface VideoStub {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  time(): number;
  playing(): boolean;
}

/**
 * The stub video on the page, driven as a viewer would drive YouTube's own
 * controls: `tapPlay` is the tap on the video a real one needs first; the
 * rest act inside the frame.
 */
export function videoStub(page: Page) {
  const frame = () => {
    const found = page.frames().find((candidate) => candidate.url().includes('/embed/'));
    if (!found) throw new Error('No video frame on the page');
    return found;
  };
  return {
    tapPlay: () =>
      page
        .frameLocator('[data-testid="recording-frame"]')
        .getByRole('button', { name: 'Play' })
        .click(),
    pause: () => frame().evaluate(() => (window as never as { stub: VideoStub }).stub.pause()),
    play: () => frame().evaluate(() => (window as never as { stub: VideoStub }).stub.play()),
    seek: (seconds: number) =>
      frame().evaluate((to) => (window as never as { stub: VideoStub }).stub.seek(to), seconds),
    setRate: (rate: number) =>
      frame().evaluate((to) => (window as never as { stub: VideoStub }).stub.setRate(to), rate),
    time: () => frame().evaluate(() => (window as never as { stub: VideoStub }).stub.time()),
    playing: () => frame().evaluate(() => (window as never as { stub: VideoStub }).stub.playing()),
  };
}

/** The line-up under the video (Unit 19) and its controls. */
export const lineUp = (page: Page) => page.getByTestId('line-up');
export const lineUpMessage = (page: Page) => page.getByTestId('line-up-message');
export const lineUpButton = (
  page: Page,
  name: 'Bar 1 starts now' | 'Line up again' | 'Tab earlier' | 'Tab later' | 'Follow' | 'Cancel',
) => lineUp(page).getByRole('button', { name, exact: true });

/** The bars marked on the score, 1-based, as the mounted player has them (debugPlayer.ts); null for none. */
export function markedBars(page: Page): Promise<[number, number] | null> {
  return page.evaluate(() => {
    const player = (
      window as never as {
        __drumPalPlayer?: {
          getSnapshot(): { highlight: { startBar: number; endBar: number } | null };
        };
      }
    ).__drumPalPlayer;
    if (!player) throw new Error('No player on window.__drumPalPlayer');
    const { highlight } = player.getSnapshot();
    return highlight ? [highlight.startBar, highlight.endBar] : null;
  });
}

/** Where bar 1 falls in each of the user's links' videos, as the database has it, by kind. */
export async function barOneOf(user: E2eUser): Promise<Record<string, number | null>> {
  const { data, error } = await admin
    .from('song_links')
    .select('kind, bar_one_seconds')
    .eq('user_id', user.id);
  if (error) throw error;
  return Object.fromEntries(data.map((link) => [link.kind, link.bar_one_seconds]));
}

/** A new user's one song, Groove 120 with no links yet, on its overview. */
export async function openNewSongOverview(page: Page, user: E2eUser): Promise<void> {
  await signIn(page, user, '/');
  await uploadFixture(page, 'groove-120', 'Groove 120');
  await openSongOverview(page, 'Groove 120');
}

export const playAlong = (page: Page) => page.getByRole('region', { name: 'Play along' });
/** "Tab": the tab's own player, on every song. */
export const tabLink = (page: Page) =>
  playAlong(page).getByRole('link', { name: 'Tab', exact: true });
/** The button of a recording that plays in the app (a YouTube link). */
export const recordingLink = (page: Page, name: 'Original' | 'Drumless') =>
  playAlong(page).getByRole('link', { name, exact: true });
/** On the overview of a song with no links, once they have been read. */
export const addRecordingButton = (page: Page) =>
  page.getByRole('button', { name: 'Add a recording' });
export const recordingsForm = (page: Page) => page.getByRole('form', { name: 'Recordings' });
export const linkField = (page: Page, name: 'Original' | 'Drumless' | `Other link ${number}`) =>
  recordingsForm(page).getByRole('textbox', { name: new RegExp(`^${name}`) });
export const saveRecordingsButton = (page: Page) =>
  recordingsForm(page).getByRole('button', { name: 'Save' });
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
  const add = addRecordingButton(page);
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
  await saveRecordingsButton(page).click();
  await expect(recordingsForm(page)).toHaveCount(0);
}

export const openInYouTube = (page: Page) => page.getByRole('link', { name: /^Open in YouTube/ });

/** The play screen the page is on, opened again by address with `?source=` set to `source`. */
export async function gotoSource(page: Page, source: string): Promise<void> {
  await page.goto(`${new URL(page.url()).pathname}?source=${source}`);
}

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
