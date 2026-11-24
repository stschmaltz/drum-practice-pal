/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import { fixtures } from '../fixtures/sources.ts';
import { expect, signIn, test, type E2eUser } from './auth';

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

async function songRows(user: E2eUser) {
  const { data, error } = await admin
    .from('songs')
    .select('id, title, artist, original_tempo, bar_count, drum_track_index, file_path')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
}

/** One page is enough: each test uploads a handful of files at most. */
async function userFiles(user: E2eUser) {
  const { data, error } = await admin.storage.from('gp-files').list(user.id, { limit: 1000 });
  if (error) throw error;
  return data.map((file) => file.name);
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
  await expect(list.getByText('16 bars · 120 BPM')).toBeVisible();

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

  await page.getByRole('button', { name: 'Edit Groove 120' }).click();
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

  await page.getByRole('button', { name: 'Delete Waltz 3-4' }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.getByRole('button', { name: 'Delete Waltz 3-4' }).click();
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
    await expect(item).toContainText(`${expected.barCount} bars · ${expected.tempoAtBar1} BPM`);
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
  // Groove was added first but practiced last, so it leads "Recently practiced".
  await addPractice(user, waltz.id, '2026-11-20T10:00:00Z');
  await addPractice(user, groove.id, '2026-11-21T10:00:00Z');
  await page.reload();

  const titles = page.getByRole('list').getByRole('link');
  await expect(titles).toHaveText(['Groove 120', 'Waltz 3-4']);
  await page.getByLabel('Sort by').selectOption('added');
  await expect(titles).toHaveText(['Waltz 3-4', 'Groove 120']);
  expect(await childRows('loops', user)).toHaveLength(2);
  expect(await childRows('practice_sessions', user)).toHaveLength(2);

  await page.getByRole('button', { name: 'Delete Groove 120' }).click();
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

  // A press on the card away from its title (near its top right corner) opens the song.
  const card = page.getByRole('listitem').filter({ hasText: 'Groove 120' });
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error('No card');
  await page.mouse.click(box.x + box.width - 12, box.y + 12);
  await expect(page.getByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
});
