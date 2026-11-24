import type { TablesInsert } from '../../src/lib/database.types.ts';
import { songFilePath } from '../../src/lib/schema.ts';
import { localSupabaseEnv } from '../../scripts/local-supabase.ts';
import {
  createAdminClient,
  createNodeClient,
  removeUserFiles,
  type DbClient,
} from '../../scripts/supabase-admin.ts';

/** Postgres error codes the DB tests assert on. */
export const PG = {
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  /** Also what an unknown enum value raises. */
  INVALID_TEXT_REPRESENTATION: '22P02',
  /** Missing grant, or a row rejected by an RLS `with check`. */
  INSUFFICIENT_PRIVILEGE: '42501',
} as const;

const env = localSupabaseEnv();

export const admin: DbClient = createAdminClient();

export function anonClient(): DbClient {
  return createNodeClient(env.url, env.publishableKey);
}

export interface TestUser {
  id: string;
  email: string;
  client: DbClient;
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
  await removeUserFiles(admin, user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

/** updated_at comes from now(), so wait before an update that should move it. */
export function waitForClockTick() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/** A random value in the shape the file_hash check requires: 64 lowercase hex chars. */
export function fakeHash(): string {
  const hex = crypto.randomUUID().replaceAll('-', '');
  return hex.repeat(2);
}

type SongInsert = TablesInsert<'songs'> & { id: string };

/** A valid songs insert for the given user; override fields to test constraints. */
export function songRow(
  userId: string,
  overrides: Partial<TablesInsert<'songs'>> = {},
): SongInsert {
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
  return row.id;
}

/** Inserts a loop (bars 1 to 4 by default) as the user and returns its id. */
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

/** A valid 60-second practice_sessions insert; override fields to test constraints. */
export function sessionRow(
  userId: string,
  loopId: string,
  overrides: Record<string, unknown> = {},
): TablesInsert<'practice_sessions'> & { id: string } {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    loop_id: loopId,
    started_at: '2026-11-20T10:00:00.000Z',
    duration_seconds: 60,
    speed_ratio: 1,
    ...overrides,
  };
}

/** Inserts a session as the user, for a test's setup: a refusal fails the test there. */
export async function insertSession(
  user: TestUser,
  row: TablesInsert<'practice_sessions'>,
): Promise<void> {
  const { error } = await user.client.from('practice_sessions').insert(row);
  if (error) throw error;
}
