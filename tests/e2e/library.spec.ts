/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { fixtures } from '../fixtures/sources.ts';
import { expect, signIn, test, type E2eUser } from './auth';
import { chooseSongAction, songRows, userFiles } from './libraryPage';

// Unit 04: upload, dedupe, refuse bad files, edit, delete, search and sort.

const admin = createAdminClient();
const fixture = (name: string) => join(process.cwd(), 'tests', 'fixtures', 'gp', `${name}.gp`);

const uploadInput = (page: Page) => page.getByLabel('Upload a Guitar Pro file');

async function upload(page: Page, file: string | { name: string; buffer: Buffer }) {
  await uploadInput(page).setInputFiles(
    typeof file === 'string'
      ? file
      : { name: file.name, mimeType: 'application/octet-stream', buffer: file.buffer },
  );
}

test('uploads a Guitar Pro file with its metadata, and warns on a duplicate', async ({
  user,
  page,
}) => {
  await signIn(page, user, '/library');
  await expect(page.getByText('No songs yet.')).toBeVisible();

  await upload(page, fixture('tempo-change'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Tempo Change”.' })).toBeVisible();
  const list = page.getByRole('list');
  await expect(list.getByRole('link', { name: 'Tempo Change' })).toBeVisible();
  // One line under the name on the list (Unit 16); the file's facts are on the song's overview.
  await expect(list.getByTestId('song-line')).toHaveText('Fixture · No loops yet');

  const [row] = await songRows(user);
  expect(row).toMatchObject({
    title: 'Tempo Change',
    artist: 'Fixture',
    original_tempo: 120,
    bar_count: 16,
    drum_track_index: 0,
    file_path: `${user.id}/${row!.id}.gp`,
  });
  expect(await userFiles(user)).toEqual([`${row!.id}.gp`]);

  // The same bytes under another name are still a duplicate.
  await upload(page, { name: 'renamed.gp', buffer: readFileSync(fixture('tempo-change')) });
  const warning = page.getByRole('status').filter({ hasText: 'already uploaded' });
  await expect(warning).toBeVisible();
  expect(await songRows(user)).toHaveLength(1);
  await warning.getByRole('link', { name: 'Open “Tempo Change”' }).click();
  await expect(page).toHaveURL(`/songs/${row!.id}`);
  await expect(page.getByTestId('song-facts')).toHaveText('16 bars · 120 BPM');
});

test('a file with no drum track uploads with a null index and a note', async ({ user, page }) => {
  await signIn(page, user, '/library');
  await upload(page, fixture('no-drums'));
  await expect(page.getByRole('status').getByText('No drum track found')).toBeVisible();
  await expect(page.getByRole('listitem').getByText('No drum track found')).toBeVisible();
  const [row] = await songRows(user);
  expect(row?.drum_track_index).toBeNull();
});

test('refuses MIDI, non-Guitar Pro and corrupt files, creating nothing', async ({ user, page }) => {
  await signIn(page, user, '/library');
  const alert = page.getByRole('alert');

  await upload(page, { name: 'song.mid', buffer: Buffer.from('MThd\0\0\0\u0006\0\u0001') });
  await expect(alert).toContainText("MIDI files aren't supported");
  await expect(alert).toContainText('Songsterr');

  await upload(page, { name: 'notes.gp', buffer: Buffer.from('not a tab at all') });
  await expect(alert).toContainText("That isn't a Guitar Pro file");

  const truncated = readFileSync(fixture('groove-120')).subarray(0, 300);
  await upload(page, { name: 'broken.gp', buffer: truncated });
  await expect(alert).toContainText("couldn't be read");

  expect(await songRows(user)).toEqual([]);
  expect(await userFiles(user)).toEqual([]);
});

test('accepts a dropped file', async ({ user, page }) => {
  await signIn(page, user, '/library');
  const bytes = Array.from(readFileSync(fixture('waltz-34')));
  const dataTransfer = await page.evaluateHandle((data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'waltz.gp'));
    return transfer;
  }, bytes);
  await page.getByTestId('drop-zone').dispatchEvent('drop', { dataTransfer });
  await expect(page.getByRole('status').filter({ hasText: 'Added “Waltz 3-4”.' })).toBeVisible();
});

test('edits title and artist, searches, sorts and deletes', async ({ user, page }) => {
  await signIn(page, user, '/library');
  await upload(page, fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toBeVisible();
  await upload(page, fixture('waltz-34'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Waltz 3-4”' })).toBeVisible();

  const titles = page.getByRole('list').getByRole('link');
  await page.getByLabel('Sort by').selectOption('added');
  await expect(titles).toHaveText(['Waltz 3-4', 'Groove 120']);

  await chooseSongAction(page, 'Groove 120', 'Edit');
  await page.getByLabel('Title', { exact: true }).fill('  Back Beat ');
  await page.getByLabel('Artist', { exact: true }).fill('The Band');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(titles).toHaveText(['Waltz 3-4', 'Back Beat']);
  await expect(page.getByText('The Band')).toBeVisible();

  await page.getByLabel('Search title or artist').fill('band');
  await expect(titles).toHaveText(['Back Beat']);
  await page.reload();
  await expect(titles).toHaveText(['Back Beat']);
  await page.getByLabel('Search title or artist').fill('');

  const songs = await songRows(user);
  expect(songs.find((song) => song.title === 'Back Beat')?.artist).toBe('The Band');

  await chooseSongAction(page, 'Waltz 3-4', 'Delete');
  await page.getByRole('button', { name: 'Keep it' }).click();
  await chooseSongAction(page, 'Waltz 3-4', 'Delete');
  await page.getByRole('button', { name: 'Delete song' }).click();
  await expect(titles).toHaveText(['Back Beat']);
  expect((await songRows(user)).map((song) => song.title)).toEqual(['Back Beat']);
  expect(await userFiles(user)).toHaveLength(1);
});

// Test stage -----------------------------------------------------------------

/** Rows of a child table for the user, read past RLS. */
async function childRows(table: 'loops' | 'practice_sessions', user: E2eUser) {
  const { data, error } = await admin.from(table).select('id').eq('user_id', user.id);
  if (error) throw error;
  return data;
}

/** A loop on the song, practiced at `lastPracticedAt`, with one logged session. */
async function addPractice(user: E2eUser, songId: string, lastPracticedAt: string) {
  const loopId = crypto.randomUUID();
  const loop = await admin.from('loops').insert({
    id: loopId,
    user_id: user.id,
    song_id: songId,
    name: 'Fill',
    start_bar: 1,
    end_bar: 2,
    last_practiced_at: lastPracticedAt,
  });
  if (loop.error) throw loop.error;
  const session = await admin.from('practice_sessions').insert({
    id: crypto.randomUUID(),
    user_id: user.id,
    loop_id: loopId,
    started_at: lastPracticedAt,
    duration_seconds: 60,
    speed_ratio: 0.8,
  });
  if (session.error) throw session.error;
}

test('every fixture uploads with the metadata its source declares', async ({ user, page }) => {
  await signIn(page, user, '/library');
  for (const { name, expected } of fixtures) {
    await upload(page, fixture(name));
    await expect(
      page.getByRole('status').filter({ hasText: `Added “${expected.title}”.` }),
    ).toBeVisible();
    const item = page.getByRole('listitem').filter({
      has: page.getByRole('link', { name: expected.title, exact: true }),
    });
    await expect(item.getByTestId('song-line')).toHaveText('Fixture · No loops yet');
    await expect(item.getByText('No drum track found')).toHaveCount(
      expected.drumTrackIndex === null ? 1 : 0,
    );
  }

  const rows = await songRows(user);
  expect(rows).toHaveLength(fixtures.length);
  for (const { expected } of fixtures) {
    expect(rows.find((row) => row.title === expected.title)).toMatchObject({
      artist: 'Fixture',
      original_tempo: expected.tempoAtBar1,
      bar_count: expected.barCount,
      drum_track_index: expected.drumTrackIndex,
    });
  }
  expect((await userFiles(user)).sort()).toEqual(rows.map((row) => `${row.id}.gp`).sort());
});

test('a failed insert removes the uploaded file and lists nothing', async ({ user, page }) => {
  await signIn(page, user, '/library');
  const fileUploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/storage/v1/object/gp-files/')) {
      fileUploads.push(request.url());
    }
  });
  await page.route('**/rest/v1/songs**', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'insert broke', code: 'XX000' }),
        })
      : route.continue(),
  );

  await upload(page, fixture('groove-120'));
  await expect(page.getByRole('alert')).toContainText("Couldn't upload groove-120.gp");
  await expect(page.getByText('No songs yet.')).toBeVisible();
  expect(await songRows(user)).toEqual([]);
  // The file went up before the insert failed, so an empty folder means it was removed.
  expect(fileUploads).toHaveLength(1);
  expect(await userFiles(user)).toEqual([]);
});

test('cancelling during the upload removes the file', async ({ user, page }) => {
  await signIn(page, user, '/library');
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/storage/v1/object/gp-files/**', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });

  await upload(page, fixture('waltz-34'));
  await expect(page.getByRole('status').filter({ hasText: 'Uploading waltz-34.gp' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  release();

  await expect(page.getByText('Upload cancelled. Nothing was saved.')).toBeVisible();
  expect(await songRows(user)).toEqual([]);
  await expect.poll(() => userFiles(user)).toEqual([]);
});

test('sorts by recent practice, and deleting a song removes its file, loops and sessions', async ({
  user,
  page,
}) => {
  await signIn(page, user, '/library');
  await upload(page, fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Groove 120”' })).toBeVisible();
  await upload(page, fixture('waltz-34'));
  await expect(page.getByRole('status').filter({ hasText: 'Added “Waltz 3-4”' })).toBeVisible();

  const songs = await songRows(user);
  const groove = songs.find((song) => song.title === 'Groove 120')!;
  const waltz = songs.find((song) => song.title === 'Waltz 3-4')!;
  // Groove was added first but practiced last, so it leads "Recently practised".
  await addPractice(user, waltz.id, '2026-11-20T10:00:00Z');
  await addPractice(user, groove.id, '2026-11-21T10:00:00Z');
  await page.reload();

  const titles = page.getByRole('list').getByRole('link');
  await expect(titles).toHaveText(['Groove 120', 'Waltz 3-4']);
  await page.getByLabel('Sort by').selectOption('added');
  await expect(titles).toHaveText(['Waltz 3-4', 'Groove 120']);
  expect(await childRows('loops', user)).toHaveLength(2);
  expect(await childRows('practice_sessions', user)).toHaveLength(2);

  await chooseSongAction(page, 'Groove 120', 'Delete');
  await page.getByRole('button', { name: 'Delete song' }).click();
  await expect(titles).toHaveText(['Waltz 3-4']);

  expect((await songRows(user)).map((song) => song.id)).toEqual([waltz.id]);
  expect(await userFiles(user)).toEqual([`${waltz.id}.gp`]);
  // The other song's loop and session stay; the deleted song's are gone.
  const { data: loops, error } = await admin.from('loops').select('song_id').eq('user_id', user.id);
  if (error) throw error;
  expect(loops).toEqual([{ song_id: waltz.id }]);
  expect(await childRows('practice_sessions', user)).toHaveLength(1);
});

// 12 UX pass, item 11.
test('once there are songs, a song opens from anywhere on its card, and a file dropped on the list uploads', async ({
  user,
  page,
}) => {
  await signIn(page, user, '/library');
  await upload(page, fixture('groove-120'));
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toBeVisible();

  // The big drop box has become an Upload button with the same name.
  await expect(page.getByText(/or drop one here/)).toHaveCount(0);
  await expect(uploadInput(page)).toBeAttached();

  const bytes = Array.from(readFileSync(fixture('waltz-34')));
  const dataTransfer = await page.evaluateHandle((data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'waltz.gp'));
    return transfer;
  }, bytes);
  await page.getByRole('list').dispatchEvent('drop', { dataTransfer });
  await expect(page.getByRole('status').filter({ hasText: 'Added “Waltz 3-4”.' })).toBeVisible();

  // A press on the card away from its title (near its lower right corner, below its More
  // menu's button at the top right) opens the song.
  const card = page.getByRole('listitem').filter({ hasText: 'Groove 120' });
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error('No card');
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 6);
  await expect(page.getByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
});

// Unit 20, 13.14 and 13.16a: postgrest-js sent every failed read again three times under each
// of TanStack Query's three tries, so a list with no server to reach said "Loading…" for about
// 24 seconds before it said why.
test('a library that can’t reach the server says so within about 5 seconds, and "Try again" reads it', async ({
  user,
  page,
}) => {
  const dropped: number[] = [];
  const songsRead = /\/rest\/v1\/songs\?/;
  await page.route(songsRead, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    dropped.push(Date.now());
    return route.abort('connectionfailed');
  });
  await signIn(page, user, '/library');

  const alert = page.getByRole('alert').filter({ hasText: "Couldn't load your songs." });
  await expect(alert).toBeVisible({ timeout: 10_000 });
  const first = dropped[0];
  if (first === undefined) throw new Error('No read of the songs was sent');
  expect(Date.now() - first).toBeLessThan(5000);
  await expect(alert).toContainText("The server couldn't be reached.");
  // One layer retries: the query's three tries, each one request.
  expect(dropped).toHaveLength(3);
  // And nothing is still on its way to be sent again later.
  await page.waitForTimeout(5000);
  expect(dropped).toHaveLength(3);

  await page.unroute(songsRead);
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No songs yet.')).toBeVisible();
});

// 20 batch 8 (13.37b): on a cold start (a device that hasn't read the library yet) the
// upload is the compact button while the songs load, as it is once they are in, so nothing
// moves under a pointer on its way to it. The second context is that device.
test('on a cold start the upload is where it stays: no big drop box while the songs load', async ({
  user,
  page,
  browser,
}) => {
  await signIn(page, user, '/library');
  await upload(page, fixture('groove-120'));
  await expect(page.getByRole('list').getByRole('link', { name: 'Groove 120' })).toBeVisible();

  const context = await browser.newContext();
  try {
    const cold = await context.newPage();
    const songsRead = /\/rest\/v1\/songs\?/;
    const held: (() => void)[] = [];
    await cold.route(songsRead, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await new Promise<void>((resolve) => held.push(resolve));
      await route.fallback();
    });
    await signIn(cold, user, '/library');

    await expect(cold.getByText('Loading your songs…')).toBeVisible();
    // The read really is held, or this is a list that simply loaded.
    await expect.poll(() => held.length).toBeGreaterThan(0);
    const picker = cold.locator('label').filter({ has: uploadInput(cold) });
    await expect(picker).toBeVisible();
    await expect(cold.getByText(/or drop one here/)).toHaveCount(0);
    const whileLoading = await picker.boundingBox();

    await cold.unroute(songsRead);
    for (const release of held) release();
    await expect(cold.getByRole('list').getByRole('link', { name: 'Groove 120' })).toBeVisible();
    await expect(cold.getByText(/or drop one here/)).toHaveCount(0);
    expect(await picker.boundingBox()).toEqual(whileLoading);
  } finally {
    await context.close();
  }
});
