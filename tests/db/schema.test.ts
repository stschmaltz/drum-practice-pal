import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createTestUser,
  deleteTestUser,
  insertLoop,
  insertSession,
  insertSong,
  PG,
  sessionRow,
  songRow,
  waitForClockTick,
  type TestUser,
} from './helpers';

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser('schema');
});

afterAll(async () => {
  await deleteTestUser(user);
});

describe('signup', () => {
  it('creates a user_settings row with defaults', async () => {
    const { data } = await user.client.from('user_settings').select('*').single();
    expect(data).toMatchObject({
      user_id: user.id,
      metronome_on: true,
      count_in_bars: 0,
      count_in_mode: 'start',
      metronome_sound: 'click',
      metronome_accent: true,
      metronome_accent_sound: 'click',
      metronome_subdivision: 1,
      drums_muted_default: false,
    });
  });
});

describe('songs constraints', () => {
  it('rejects a duplicate file hash for the same user', async () => {
    const hash = songRow(user.id).file_hash;
    await insertSong(user, { file_hash: hash });
    const { error } = await user.client.from('songs').insert(songRow(user.id, { file_hash: hash }));
    expect(error?.code).toBe(PG.UNIQUE_VIOLATION);
  });

  it("rejects a file_path that isn't {user_id}/{id}.gp", async () => {
    const { error } = await user.client
      .from('songs')
      .insert(songRow(user.id, { file_path: `${user.id}/other.gp` }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it.each([
    ['bar_count', 0],
    ['original_tempo', 0],
    ['drum_track_index', -1],
    ['title', ''],
  ])('rejects %s = %j', async (field, value) => {
    const { error } = await user.client.from('songs').insert(songRow(user.id, { [field]: value }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it('allows a null drum_track_index', async () => {
    await expect(insertSong(user, { drum_track_index: null })).resolves.toBeTruthy();
  });

  it('only lets title and artist be edited', async () => {
    const id = await insertSong(user);
    const edit = await user.client
      .from('songs')
      .update({ title: 'New', artist: 'Band' })
      .eq('id', id);
    expect(edit.error).toBeNull();
    const barCount = await user.client.from('songs').update({ bar_count: 99 }).eq('id', id);
    expect(barCount.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
  });
});

describe('loops constraints', () => {
  let songId: string;
  beforeAll(async () => {
    songId = await insertSong(user, { bar_count: 16 });
  });

  it.each([
    [1, 1],
    [1, 16],
    [9, 12],
  ])('accepts bars %i to %i', async (start, end) => {
    await expect(
      insertLoop(user, songId, { start_bar: start, end_bar: end }),
    ).resolves.toBeTruthy();
  });

  it.each([
    [0, 4],
    [5, 4],
    [1, 17],
  ])('rejects bars %i to %i', async (start, end) => {
    await expect(
      insertLoop(user, songId, { start_bar: start, end_bar: end }),
    ).rejects.toMatchObject({
      code: PG.CHECK_VIOLATION,
    });
  });

  it('rejects an update that moves end_bar past the song', async () => {
    const id = await insertLoop(user, songId);
    const { error } = await user.client.from('loops').update({ end_bar: 20 }).eq('id', id);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it.each([
    ['speed_ratio', 0.24],
    ['speed_ratio', 2.01],
    ['target_ratio', 0.2],
    ['target_ratio', 2.5],
    ['name', ''],
  ])('rejects %s = %j', async (field, value) => {
    await expect(insertLoop(user, songId, { [field]: value })).rejects.toMatchObject({
      code: PG.CHECK_VIOLATION,
    });
  });

  it('defaults to active at speed 1.0', async () => {
    const id = await insertLoop(user, songId);
    const { data } = await user.client.from('loops').select('*').eq('id', id).single();
    expect(data).toMatchObject({ status: 'active', speed_ratio: 1, finished_at: null });
  });

  it('sets finished_at on finish and clears it on reopen', async () => {
    const id = await insertLoop(user, songId);
    const finished = await user.client
      .from('loops')
      .update({ status: 'finished' })
      .eq('id', id)
      .select('finished_at')
      .single();
    expect(finished.data?.finished_at).not.toBeNull();

    const reopened = await user.client
      .from('loops')
      .update({ status: 'active' })
      .eq('id', id)
      .select('finished_at')
      .single();
    expect(reopened.data?.finished_at).toBeNull();
  });

  it('bumps updated_at on update', async () => {
    const id = await insertLoop(user, songId);
    const before = await user.client.from('loops').select('updated_at').eq('id', id).single();
    await waitForClockTick();
    const after = await user.client
      .from('loops')
      .update({ speed_ratio: 0.9 })
      .eq('id', id)
      .select('updated_at')
      .single();
    expect(Date.parse(after.data!.updated_at)).toBeGreaterThan(Date.parse(before.data!.updated_at));
  });
});

describe('practice_sessions', () => {
  it('sets last_practiced_at to the latest session end', async () => {
    const songId = await insertSong(user);
    const loopId = await insertLoop(user, songId);
    await user.client
      .from('practice_sessions')
      .insert(sessionRow(user.id, loopId, { duration_seconds: 90 }));
    // An older session arriving later (offline queue) must not move it back.
    await user.client
      .from('practice_sessions')
      .insert(sessionRow(user.id, loopId, { started_at: '2026-11-01T10:00:00.000Z' }));

    const { data } = await user.client
      .from('loops')
      .select('last_practiced_at')
      .eq('id', loopId)
      .single();
    expect(Date.parse(data!.last_practiced_at!)).toBe(Date.parse('2026-11-20T10:01:30.000Z'));
  });

  it('a retried insert with the same id is ignored', async () => {
    const songId = await insertSong(user);
    const loopId = await insertLoop(user, songId);
    const row = sessionRow(user.id, loopId);
    for (let i = 0; i < 2; i++) {
      const { error } = await user.client
        .from('practice_sessions')
        .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
      expect(error).toBeNull();
    }
    const { data } = await user.client.from('practice_sessions').select('id').eq('loop_id', loopId);
    expect(data).toHaveLength(1);
  });

  it.each([
    ['duration_seconds', -1],
    ['repeats', -1],
    ['speed_ratio', 3],
  ])('rejects %s = %j', async (field, value) => {
    const songId = await insertSong(user);
    const loopId = await insertLoop(user, songId);
    const { error } = await user.client
      .from('practice_sessions')
      .insert(sessionRow(user.id, loopId, { [field]: value }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it("can't be edited (append-only)", async () => {
    const songId = await insertSong(user);
    const loopId = await insertLoop(user, songId);
    const row = sessionRow(user.id, loopId);
    await insertSession(user, row);
    const { error } = await user.client
      .from('practice_sessions')
      .update({ repeats: 99 })
      .eq('id', row.id);
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
  });
});

describe('user_settings constraints', () => {
  it.each([{ count_in_bars: 3 }, { metronome_volume: 1.5 }])('rejects %j', async (change) => {
    const { error } = await user.client.from('user_settings').update(change).eq('user_id', user.id);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it('accepts a valid change', async () => {
    const { data } = await user.client
      .from('user_settings')
      .update({ count_in_bars: 2, count_in_mode: 'every_repeat' })
      .eq('user_id', user.id)
      .select()
      .single();
    expect(data).toMatchObject({ count_in_bars: 2, count_in_mode: 'every_repeat' });
  });
});

describe('cascades', () => {
  it('deleting a song removes its loops and their sessions', async () => {
    const songId = await insertSong(user);
    const loopId = await insertLoop(user, songId);
    await insertSession(user, sessionRow(user.id, loopId));

    const { error } = await user.client.from('songs').delete().eq('id', songId);
    expect(error).toBeNull();
    expect((await user.client.from('loops').select('id').eq('id', loopId)).data).toEqual([]);
    expect(
      (await user.client.from('practice_sessions').select('id').eq('loop_id', loopId)).data,
    ).toEqual([]);
  });

  it('deleting a user removes all their rows', async () => {
    const temp = await createTestUser('cascade');
    await insertLoop(temp, await insertSong(temp));
    await deleteTestUser(temp);
    // Admin client bypasses RLS, so an empty result means the rows are gone.
    for (const table of ['songs', 'loops', 'user_settings'] as const) {
      const { data } = await admin.from(table).select('user_id').eq('user_id', temp.id);
      expect(data).toEqual([]);
    }
  });
});
