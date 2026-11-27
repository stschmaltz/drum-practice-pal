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
import type { TablesInsert } from '../src/lib/database.types.ts';
import { DEV_PASSWORD } from '../src/features/auth/devPassword.ts';
import { GP_FILES_BUCKET, songFilePath } from '../src/lib/schema.ts';
import { drumTrackIndex, loadScoreFile, tempoAtBar } from '../tests/unit/score-helpers.ts';
import {
  createAdminClient,
  findUserIdsByEmail,
  removeUserFiles,
  type DbClient,
} from './supabase-admin.ts';

interface SeedSession {
  daysAgo: number;
  minutes: number;
  speedRatio: number;
  repeats: number;
}

interface SeedLoop {
  name: string;
  startBar: number;
  endBar: number;
  speedRatio: number;
  finished?: boolean;
  sessions?: SeedSession[];
}

interface SeedSong {
  fixture: string;
  loops: SeedLoop[];
}

interface SeedUser {
  email: string;
  songs: SeedSong[];
}

// Magic-link sign-in for these addresses lands in Mailpit (http://127.0.0.1:54324); on the
// dev server "Dev: sign in" skips the email.
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
            sessions: [
              { daysAgo: 3, minutes: 6, speedRatio: 0.7, repeats: 14 },
              { daysAgo: 1, minutes: 8, speedRatio: 0.8, repeats: 18 },
            ],
          },
          {
            name: 'Whole song',
            startBar: 1,
            endBar: 16,
            speedRatio: 1.0,
            finished: true,
            sessions: [{ daysAgo: 10, minutes: 5, speedRatio: 1.0, repeats: 1 }],
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
            sessions: [{ daysAgo: 2, minutes: 4, speedRatio: 0.75, repeats: 10 }],
          },
          { name: 'Single bar', startBar: 9, endBar: 9, speedRatio: 0.5 },
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
        loops: [{ name: 'Waltz intro', startBar: 1, endBar: 4, speedRatio: 1.0 }],
      },
    ],
  },
];

const fixturesDir = fileURLToPath(new URL('../tests/fixtures/gp/', import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;

async function deleteUserByEmail(admin: DbClient, email: string) {
  const [existingId] = await findUserIdsByEmail(admin, email);
  if (!existingId) return;
  await removeUserFiles(admin, existingId);
  const { error } = await admin.auth.admin.deleteUser(existingId);
  if (error) throw error;
}

async function createSeedUser(admin: DbClient, email: string): Promise<string> {
  // The dev password lets the dev server's "Dev: sign in" button skip the email.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: DEV_PASSWORD,
  });
  if (error) throw error;
  return data.user.id;
}

/** Uploads the fixture file and inserts its songs row. Returns the song's id and title. */
async function seedSong(admin: DbClient, userId: string, fixture: string) {
  const path = join(fixturesDir, `${fixture}.gp`);
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
  return { songId, title: score.title };
}

async function seedLoop(admin: DbClient, userId: string, songId: string, loop: SeedLoop) {
  const loopId = crypto.randomUUID();
  const { error } = await admin.from('loops').insert({
    id: loopId,
    user_id: userId,
    song_id: songId,
    name: loop.name,
    start_bar: loop.startBar,
    end_bar: loop.endBar,
    speed_ratio: loop.speedRatio,
    status: loop.finished ? 'finished' : 'active',
  });
  if (error) throw error;

  const sessions = (loop.sessions ?? []).map((session): TablesInsert<'practice_sessions'> => ({
    user_id: userId,
    loop_id: loopId,
    started_at: new Date(Date.now() - session.daysAgo * DAY_MS).toISOString(),
    duration_seconds: session.minutes * 60,
    speed_ratio: session.speedRatio,
    repeats: session.repeats,
  }));
  if (sessions.length > 0) {
    const { error: sessionError } = await admin.from('practice_sessions').insert(sessions);
    if (sessionError) throw sessionError;
  }
}

async function main() {
  const admin = createAdminClient();

  for (const user of seedUsers) {
    await deleteUserByEmail(admin, user.email);
    const userId = await createSeedUser(admin, user.email);
    const titles: string[] = [];
    for (const song of user.songs) {
      const { songId, title } = await seedSong(admin, userId, song.fixture);
      for (const loop of song.loops) await seedLoop(admin, userId, songId, loop);
      titles.push(title);
    }
    console.log(`seeded ${user.email}: ${titles.join(', ')}`);
  }
}

await main();
