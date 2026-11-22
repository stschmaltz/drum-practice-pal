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

export async function findUserIdsByEmail(admin: DbClient, email: string): Promise<string[]> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.filter((user) => user.email === email).map((user) => user.id);
}

/**
 * Deletes everything in the user's gp-files folder. Storage objects aren't tied
 * to auth.users, so call this before deleting a user or the files are orphaned.
 */
export async function removeUserFiles(admin: DbClient, userId: string): Promise<void> {
  const bucket = admin.storage.from(GP_FILES_BUCKET);
  const { data: files } = await bucket.list(userId);
  if (files && files.length > 0) {
    await bucket.remove(files.map((file) => `${userId}/${file.name}`));
  }
}
