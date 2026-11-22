/**
 * Seeds the local Supabase stack with two users, their songs (real files in
 * Storage, built from the synthetic fixtures), loops and practice sessions.
 * Safe to re-run: the seed users are deleted first, which cascades to their rows.
 *
 * Run with: npm run db:seed (or npm run db:reset for migrations + seed)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesInsert } from '../src/lib/database.types.ts';
import { GP_FILES_BUCKET, songFilePath } from '../src/lib/schema.ts';
import { drumTrackIndex, loadScoreFile, tempoAtBar } from '../tests/unit/score-helpers.ts';
import { localSupabaseEnv } from './local-supabase.ts';

type Admin = SupabaseClient<Database>;

interface SeedLoop {
  name: string;
  startBar: number;
  endBar: number;
  speedRatio: number;
  targetRatio: number | null;
  finished?: boolean;
  /** Sessions as [days ago, minutes, speed ratio, repeats] */
  sessions?: [number, number, number, number][];
}

interface SeedSong {
  fixture: string;
  loops: SeedLoop[];
}

interface SeedUser {
  email: string;
  songs: SeedSong[];
}

// Magic-link sign-in for these addresses lands in Mailpit (http://127.0.0.1:54324).
const seedUsers: SeedUser[] = [
  {
    email: 'demo@drumpal.test',
    songs: [
      {
        fixture: 'groove-120',
        loops: [
          {
            name: 'Main groove',
            startBar: 1,
            endBar: 4,
            speedRatio: 0.8,
            targetRatio: 1.0,
            sessions: [
              [3, 6, 0.7, 14],
              [1, 8, 0.8, 18],
            ],
          },
          {
            name: 'Whole song',
            startBar: 1,
            endBar: 16,
            speedRatio: 1.0,
            targetRatio: 1.0,
            finished: true,
            sessions: [[10, 5, 1.0, 1]],
          },
        ],
      },
      {
        fixture: 'tempo-change',
        loops: [
          {
            name: 'Across the tempo drop',
            startBar: 7,
            endBar: 10,
            speedRatio: 0.75,
            targetRatio: 1.1,
            sessions: [[2, 4, 0.75, 10]],
          },
          { name: 'Single bar', startBar: 9, endBar: 9, speedRatio: 0.5, targetRatio: null },
        ],
      },
      { fixture: 'multi-track', loops: [] },
    ],
  },
  {
    email: 'other@drumpal.test',
    songs: [
      {
        fixture: 'waltz-34',
        loops: [
          { name: 'Waltz intro', startBar: 1, endBar: 4, speedRatio: 1.0, targetRatio: 1.25 },
        ],
      },
    ],
  },
];

const fixturesDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'tests',
  'fixtures',
  'gp',
);
const DAY_MS = 24 * 60 * 60 * 1000;

async function deleteUserByEmail(admin: Admin, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email === email);
  if (!existing) return;

  // Storage objects aren't tied to auth.users, so remove them before the user.
  const { data: files } = await admin.storage.from(GP_FILES_BUCKET).list(existing.id);
  if (files && files.length > 0) {
    await admin.storage
      .from(GP_FILES_BUCKET)
      .remove(files.map((file) => `${existing.id}/${file.name}`));
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(existing.id);
  if (deleteError) throw deleteError;
}

async function seedSong(admin: Admin, userId: string, song: SeedSong) {
  const path = join(fixturesDir, `${song.fixture}.gp`);
  const bytes = readFileSync(path);
  const score = loadScoreFile(path);
  const songId = crypto.randomUUID();
  const filePath = songFilePath(userId, songId);

  const upload = await admin.storage
    .from(GP_FILES_BUCKET)
    .upload(filePath, bytes, { contentType: 'application/octet-stream' });
  if (upload.error) throw upload.error;

  const row: TablesInsert<'songs'> = {
    id: songId,
    user_id: userId,
    title: score.title,
    artist: score.artist,
    file_path: filePath,
    file_hash: createHash('sha256').update(bytes).digest('hex'),
    original_tempo: tempoAtBar(score, 1),
    bar_count: score.masterBars.length,
    drum_track_index: drumTrackIndex(score),
  };
  const { error } = await admin.from('songs').insert(row);
  if (error) throw error;

  for (const loop of song.loops) {
    const loopId = crypto.randomUUID();
    const { error: loopError } = await admin.from('loops').insert({
      id: loopId,
      user_id: userId,
      song_id: songId,
      name: loop.name,
      start_bar: loop.startBar,
      end_bar: loop.endBar,
      speed_ratio: loop.speedRatio,
      target_ratio: loop.targetRatio,
      status: loop.finished ? 'finished' : 'active',
    });
    if (loopError) throw loopError;

    const sessions = (loop.sessions ?? []).map(([daysAgo, minutes, speedRatio, repeats]) => ({
      user_id: userId,
      loop_id: loopId,
      started_at: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
      duration_seconds: minutes * 60,
      speed_ratio: speedRatio,
      repeats,
    }));
    if (sessions.length > 0) {
      const { error: sessionError } = await admin.from('practice_sessions').insert(sessions);
      if (sessionError) throw sessionError;
    }
  }
  return score.title;
}

async function main() {
  const env = localSupabaseEnv();
  const admin = createClient<Database>(env.url, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const user of seedUsers) {
    await deleteUserByEmail(admin, user.email);
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
    });
    if (error) throw error;
    const titles: string[] = [];
    for (const song of user.songs) titles.push(await seedSong(admin, data.user.id, song));
    console.log(`seeded ${user.email}: ${titles.join(', ')}`);
  }
}

await main();
