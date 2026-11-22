import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesInsert } from '../../src/lib/database.types.ts';
import { GP_FILES_BUCKET, songFilePath } from '../../src/lib/schema.ts';
import { localSupabaseEnv } from '../../scripts/local-supabase.ts';

export type Client = SupabaseClient<Database>;

const env = localSupabaseEnv();
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin: Client = createClient<Database>(env.url, env.secretKey, noSession);

export function anonClient(): Client {
  return createClient<Database>(env.url, env.publishableKey, noSession);
}

export interface TestUser {
  id: string;
  email: string;
  client: Client;
}

/**
 * Creates a user and signs them in through the magic-link flow: the admin API
 * generates the link's token, and the user's own client verifies it.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@drumpal.test`;
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;

  const client = anonClient();
  const { data, error } = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    // A first-time address gets a signup link; 'email' verifies either kind.
    type: 'email',
  });
  if (error) throw error;
  if (!data.user) throw new Error('verifyOtp returned no user');
  return { id: data.user.id, email, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return;
  const { data } = await admin.storage.from(GP_FILES_BUCKET).list(user.id);
  if (data && data.length > 0) {
    await admin.storage.from(GP_FILES_BUCKET).remove(data.map((f) => `${user.id}/${f.name}`));
  }
  await admin.auth.admin.deleteUser(user.id);
}

export function fakeHash(): string {
  const hex = crypto.randomUUID().replaceAll('-', '');
  return hex.repeat(2);
}

/** A valid songs insert for the given user; override fields to test constraints. */
export function songRow(
  userId: string,
  overrides: Partial<TablesInsert<'songs'>> = {},
): TablesInsert<'songs'> {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    user_id: userId,
    title: 'Test Song',
    artist: 'Test Artist',
    file_path: songFilePath(userId, id),
    file_hash: fakeHash(),
    original_tempo: 120,
    bar_count: 16,
    drum_track_index: 0,
    ...overrides,
  };
}

/** Inserts a song as the user (through RLS) and returns its id. */
export async function insertSong(user: TestUser, overrides: Partial<TablesInsert<'songs'>> = {}) {
  const row = songRow(user.id, overrides);
  const { error } = await user.client.from('songs').insert(row);
  if (error) throw error;
  return row.id as string;
}

export async function insertLoop(
  user: TestUser,
  songId: string,
  overrides: Partial<TablesInsert<'loops'>> = {},
) {
  const id = crypto.randomUUID();
  const { error } = await user.client.from('loops').insert({
    id,
    user_id: user.id,
    song_id: songId,
    name: 'Test loop',
    start_bar: 1,
    end_bar: 4,
    ...overrides,
  });
  if (error) throw error;
  return id;
}
