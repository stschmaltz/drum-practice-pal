import type { Page } from '@playwright/test';
import { createAdminClient } from '../../scripts/supabase-admin.ts';
import type { E2eUser } from './auth';

/** On the songs list, a song row's Edit or Delete, from its "More" menu (16 QA issue 3). */
export async function chooseSongAction(
  page: Page,
  title: string,
  action: 'Edit' | 'Delete',
): Promise<void> {
  await page.getByRole('button', { name: `More actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

// The library's rows and files as the database has them, by the service role.

const admin = createAdminClient();

export async function songRows(user: E2eUser) {
  const { data, error } = await admin
    .from('songs')
    .select('id, title, artist, original_tempo, bar_count, drum_track_index, file_path')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
}

/** One page is enough: each test uploads a handful of files at most. */
export async function userFiles(user: E2eUser) {
  const { data, error } = await admin.storage.from('gp-files').list(user.id, { limit: 1000 });
  if (error) throw error;
  return data.map((file) => file.name);
}
