/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
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
