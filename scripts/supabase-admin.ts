/**
 * Supabase clients and admin chores shared by node scripts and database tests.
 * The secret-key client bypasses RLS, so this never runs in the browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types.ts';
import { GP_FILES_BUCKET } from '../src/lib/schema.ts';
import { localSupabaseEnv } from './local-supabase.ts';

export type DbClient = SupabaseClient<Database>;

/** A client with no stored or refreshed session; each one is signed in (or not) on its own. */
export function createNodeClient(url: string, key: string): DbClient {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient(): DbClient {
  const env = localSupabaseEnv();
  return createNodeClient(env.url, env.secretKey);
}

const USERS_PER_PAGE = 1000;

export async function findUserIdsByEmail(admin: DbClient, email: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw error;
    ids.push(...data.users.filter((user) => user.email === email).map((user) => user.id));
    if (data.users.length < USERS_PER_PAGE) return ids;
  }
}

/**
 * Deletes everything in the user's gp-files folder. Storage objects aren't tied
 * to auth.users, so call this before deleting a user or the files are orphaned.
 */
export async function removeUserFiles(admin: DbClient, userId: string): Promise<void> {
  const bucket = admin.storage.from(GP_FILES_BUCKET);
  // list() returns one page, so remove the first page until the folder is empty.
  for (;;) {
    const { data: files, error: listError } = await bucket.list(userId);
    if (listError) throw listError;
    if (files.length === 0) return;
    const { error: removeError } = await bucket.remove(
      files.map((file) => `${userId}/${file.name}`),
    );
    if (removeError) throw removeError;
  }
}
