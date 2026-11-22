// Runs the real seed script twice and checks the result, so "seed runs clean"
// and "seed is safe to re-run" are proven, not assumed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { GP_FILES_BUCKET } from '../../src/lib/schema.ts';
import { findUserIdsByEmail } from '../../scripts/supabase-admin.ts';
import { admin } from './helpers';

const DEMO_EMAIL = 'demo@drumpal.test';
const OTHER_EMAIL = 'other@drumpal.test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const tsxCli = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));

function runSeed(): string {
  return execFileSync(process.execPath, [tsxCli, 'scripts/seed.ts'], {
    cwd: root,
    encoding: 'utf8',
  });
}

async function seededUser(email: string) {
  const ids = await findUserIdsByEmail(admin, email);
  expect(ids).toHaveLength(1);
  return ids[0]!;
}

let firstDemoId: string;

beforeAll(async () => {
  runSeed();
  firstDemoId = await seededUser(DEMO_EMAIL);
  const output = runSeed();
  expect(output).toContain('seeded demo@drumpal.test: Groove 120, Tempo Change, Multi Track');
  expect(output).toContain('seeded other@drumpal.test: Waltz 3-4');
}, 120_000);

describe('seed script, run twice', () => {
  it('replaces the seed users instead of duplicating them', async () => {
    const demoId = await seededUser(DEMO_EMAIL);
    await seededUser(OTHER_EMAIL);
    expect(demoId).not.toBe(firstDemoId);
    const leftovers = await Promise.all(
      ['songs', 'loops', 'practice_sessions', 'user_settings'].map(async (table) => {
        const { data } = await admin
          .from(table as 'songs')
          .select('user_id')
          .eq('user_id', firstDemoId);
        return data;
      }),
    );
    expect(leftovers).toEqual([[], [], [], []]);
  });

  it('gives each seed user one settings row with defaults', async () => {
    for (const email of [DEMO_EMAIL, OTHER_EMAIL]) {
      const id = await seededUser(email);
      const { data } = await admin.from('user_settings').select('*').eq('user_id', id);
      expect(data).toHaveLength(1);
      expect(data![0]).toMatchObject({ count_in_bars: 0, count_in_mode: 'start' });
    }
  });

  it('seeds the expected songs and loops for demo', async () => {
    const demoId = await seededUser(DEMO_EMAIL);
    const songs = await admin
      .from('songs')
      .select('title, bar_count, drum_track_index, loops (name, start_bar, end_bar, status)')
      .eq('user_id', demoId)
      .order('title');
    expect(songs.data?.map((s) => [s.title, s.loops.length])).toEqual([
      ['Groove 120', 2],
      ['Multi Track', 0],
      ['Tempo Change', 2],
    ]);
    const loops = songs.data!.flatMap((s) => s.loops);
    for (const loop of loops) {
      expect(loop.start_bar).toBeGreaterThanOrEqual(1);
      expect(loop.end_bar).toBeGreaterThanOrEqual(loop.start_bar);
    }
    expect(loops.filter((l) => l.status === 'finished').map((l) => l.name)).toEqual(['Whole song']);
  });

  it('derives loop state from status and sessions', async () => {
    const demoId = await seededUser(DEMO_EMAIL);
    const { data } = await admin
      .from('loops')
      .select('name, status, finished_at, last_practiced_at, practice_sessions (id)')
      .eq('user_id', demoId);
    for (const loop of data!) {
      expect(loop.finished_at !== null).toBe(loop.status === 'finished');
      expect(loop.last_practiced_at !== null).toBe(loop.practice_sessions.length > 0);
    }
  });

  it("stores each song's file at its file_path with a matching hash, and nothing else", async () => {
    for (const email of [DEMO_EMAIL, OTHER_EMAIL]) {
      const id = await seededUser(email);
      const { data: songs } = await admin
        .from('songs')
        .select('file_path, file_hash')
        .eq('user_id', id);
      const { data: files } = await admin.storage.from(GP_FILES_BUCKET).list(id);
      expect(files?.map((f) => `${id}/${f.name}`).sort()).toEqual(
        songs!.map((s) => s.file_path).sort(),
      );
      for (const song of songs!) {
        const { data } = await admin.storage.from(GP_FILES_BUCKET).download(song.file_path);
        const bytes = new Uint8Array(await data!.arrayBuffer());
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(song.file_hash);
      }
    }
  });

  it("leaves no files behind in the first run's user folder", async () => {
    const { data } = await admin.storage.from(GP_FILES_BUCKET).list(firstDemoId);
    expect(data ?? []).toEqual([]);
  });
});
