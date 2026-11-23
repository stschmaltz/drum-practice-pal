/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './auth';
import {
  barNumber,
  drumsOnlyButton,
  fixture,
  muteDrumsButton,
  openFixture,
  playButton,
} from './playerPage';

// Unit 07: Drums only. Nothing here listens to audio; whether the drums are
// heard alone is a Human check. These read what alphaTab tells its synth:
// alphaTab mutes by MIDI channel, with a message to the synth's worker, and
// the synth keeps a channel muted until it is told otherwise.
//
// The `alphaSynth.*` command names and the `{ cmd, channel, mute }` message are
// alphaTab internals, read from 1.9.0's source (the lockfile pins the version).
// If an upgrade renames them the recorder sees nothing, so every test below
// first asserts something it must have recorded (a transport command, a muted
// channel or the synth itself) and fails there instead of passing on an empty log.

/** MIDI's percussion channel, which alphaTab gives the drum track. */
const DRUM_CHANNEL = 9;

const TRANSPORT_COMMANDS = [
  'alphaSynth.play',
  'alphaSynth.pause',
  'alphaSynth.playPause',
  'alphaSynth.stop',
  'alphaSynth.loadMidi',
];

interface SynthLog {
  /** Channel to muted, per synth worker in the order they appeared; a new player is a new worker. */
  synths: Record<number, boolean>[];
  /** Every command sent to the newest synth worker, in order. */
  commands: string[];
}

type SynthWindow = Window & { __synthLog: SynthLog };

/**
 * Records the mute and transport messages alphaTab posts to its synth worker.
 * Call before the page loads. The wrapper lives in this test's page only (an
 * init script, run again on each full load) and goes with it, so there is
 * nothing to restore.
 */
async function recordSynthMessages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: SynthLog = { synths: [], commands: [] };
    (window as unknown as SynthWindow).__synthLog = log;
    const mutesByWorker = new WeakMap<Worker, Record<number, boolean>>();
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const message = args[0] as { cmd?: unknown; channel?: number; mute?: boolean } | null;
      const cmd = typeof message?.cmd === 'string' ? message.cmd : '';
      // The render worker gets alphaTab.* messages; only the synth's matter here.
      if (cmd.startsWith('alphaSynth.')) {
        let mutes = mutesByWorker.get(this);
        if (!mutes) {
          mutes = {};
          mutesByWorker.set(this, mutes);
          log.synths.push(mutes);
          log.commands = [];
        }
        log.commands.push(cmd);
        if (cmd === 'alphaSynth.setChannelMute' && typeof message?.channel === 'number') {
          mutes[message.channel] = message.mute === true;
        }
        if (cmd === 'alphaSynth.resetChannelStates') {
          for (const channel of Object.keys(mutes)) delete mutes[Number(channel)];
        }
      }
      return (post as (...postArgs: unknown[]) => void).apply(this, args);
    } as typeof Worker.prototype.postMessage;
  });
}

/** The channels the newest synth has muted, ascending. */
function mutedChannels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const mutes = (window as unknown as SynthWindow).__synthLog.synths.at(-1) ?? {};
    return Object.entries(mutes)
      .filter(([, muted]) => muted)
      .map(([channel]) => Number(channel))
      .sort((a, b) => a - b);
  });
}

const synthCount = (page: Page) =>
  page.evaluate(() => (window as unknown as SynthWindow).__synthLog.synths.length);

/** How many times the newest synth was told to start, stop or reload. */
function transportCommands(page: Page): Promise<number> {
  return page.evaluate(
    (transport) =>
      (window as unknown as SynthWindow).__synthLog.commands.filter((cmd) =>
        transport.includes(cmd),
      ).length,
    TRANSPORT_COMMANDS,
  );
}

/** The multi-track fixture's bass and guitar, each on a primary and a secondary channel of its own. */
function expectOnlyDrumsSounding(muted: number[]) {
  expect(muted).not.toContain(DRUM_CHANNEL);
  expect(muted).toHaveLength(4);
}

test('drums only mutes every channel but the drums in the synth, and unmutes them, mid-play', async ({
  user,
  page,
}) => {
  await recordSynthMessages(page);
  await openFixture(page, user, 'multi-track', 'Multi Track');
  expect(await mutedChannels(page)).toEqual([]);

  // At full speed: eight bars at 100 BPM leave time for every step before the song ends.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  const transportBefore = await transportCommands(page);
  // Play itself was recorded, so an unchanged count below means something.
  expect(transportBefore).toBeGreaterThan(0);
  const barBefore = await barNumber(page);

  await drumsOnlyButton(page).click();
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  const others = await mutedChannels(page);
  expectOnlyDrumsSounding(others);

  // Mute drums takes over: the band is back and only the drum channel is silent.
  await muteDrumsButton(page).click();
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await mutedChannels(page)).toEqual([DRUM_CHANNEL]);

  // And back: the drums return, the same other channels go.
  await drumsOnlyButton(page).click();
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await mutedChannels(page)).toEqual(others);

  await drumsOnlyButton(page).click();
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await mutedChannels(page)).toEqual([]);

  // The synth was never told to stop, start or reload, and the song kept moving.
  expect(await transportCommands(page)).toBe(transportBefore);
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(barBefore);
});

test('drums only pressed before the sounds have loaded holds once the song is ready and playing', async ({
  user,
  page,
}) => {
  await recordSynthMessages(page);
  await signIn(page, user, '/library');
  await page.getByLabel('Upload a Guitar Pro file').setInputFiles(fixture('multi-track'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Multi Track”.' })).toBeVisible();

  // Hold the soundfont back, so the player exists but alphaTab is not ready for playback.
  let releaseSoundFont = () => {};
  const held = new Promise<void>((resolve) => {
    releaseSoundFont = resolve;
  });
  await page.route('**/soundfont/**', async (route) => {
    await held;
    await route.continue();
  });

  await page.getByRole('list').getByRole('link', { name: 'Multi Track' }).click();
  await expect(drumsOnlyButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(playButton(page)).toBeDisabled();
  await drumsOnlyButton(page).click();
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');

  releaseSoundFont();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => mutedChannels(page)).not.toEqual([]);
  const mutedWhenReady = await mutedChannels(page);
  expectOnlyDrumsSounding(mutedWhenReady);

  // Starting playback changes nothing about who is muted.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  expect(await mutedChannels(page)).toEqual(mutedWhenReady);

  await drumsOnlyButton(page).click();
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await mutedChannels(page)).toEqual([]);
  await expect(playButton(page)).toHaveText('Pause');
});

test('drums only is off again when the song is opened again, with nothing muted', async ({
  user,
  page,
}) => {
  await recordSynthMessages(page);
  await openFixture(page, user, 'multi-track', 'Multi Track');
  await drumsOnlyButton(page).click();
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  expectOnlyDrumsSounding(await mutedChannels(page));
  expect(await synthCount(page)).toBe(1);

  // Back to the library and in again, without a page load: a new player in the same tab.
  await page.goBack();
  await page.getByRole('list').getByRole('link', { name: 'Multi Track' }).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 20_000 });

  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(muteDrumsButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await synthCount(page)).toBe(2);
  expect(await mutedChannels(page)).toEqual([]);
});

test('a song that is only drums plays on with drums only on', async ({ user, page }) => {
  await recordSynthMessages(page);
  await openFixture(page, user, 'groove-120', 'Groove 120');
  await expect(drumsOnlyButton(page)).toBeEnabled();

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  const transportBefore = await transportCommands(page);
  // Play itself was recorded, so an unchanged count below means something.
  expect(transportBefore).toBeGreaterThan(0);
  const barBefore = await barNumber(page);

  await drumsOnlyButton(page).click();
  await expect(drumsOnlyButton(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await mutedChannels(page)).toEqual([]);

  expect(await transportCommands(page)).toBe(transportBefore);
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => barNumber(page), { timeout: 10_000 }).toBeGreaterThan(barBefore);
});
