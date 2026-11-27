// Boundary and edge cases for the Data model rules in docs/plan.md, on top of
// the happy-path and obvious-violation checks in schema.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TablesUpdate } from '../../src/lib/database.types.ts';
import {
  LOOP_NAME_MAX_LENGTH,
  SONG_TEXT_MAX_LENGTH,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
} from '../../src/lib/schema.ts';
import {
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
let songId: string;

beforeAll(async () => {
  user = await createTestUser('constraints');
  songId = await insertSong(user, { bar_count: 16 });
});

afterAll(async () => {
  await deleteTestUser(user);
});

async function loopById(id: string) {
  const { data, error } = await user.client.from('loops').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

describe('songs edges', () => {
  it('accepts a single-bar song and text at the length limit', async () => {
    const long = 'x'.repeat(SONG_TEXT_MAX_LENGTH);
    await expect(
      insertSong(user, { bar_count: 1, title: long, artist: long }),
    ).resolves.toBeTruthy();
  });

  it.each([
    ['title', 'x'.repeat(SONG_TEXT_MAX_LENGTH + 1)],
    ['artist', 'x'.repeat(SONG_TEXT_MAX_LENGTH + 1)],
    ['original_tempo', 1001],
    ['original_tempo', -120],
    ['file_hash', 'abc123'],
    ['file_hash', 'A'.repeat(64)],
  ])('rejects %s = %j', async (field, value) => {
    const { error } = await user.client.from('songs').insert(songRow(user.id, { [field]: value }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it('defaults artist to an empty string', async () => {
    const row = songRow(user.id);
    delete row.artist;
    const { data, error } = await user.client.from('songs').insert(row).select('artist').single();
    expect(error).toBeNull();
    expect(data?.artist).toBe('');
  });

  it("rejects a file_path in another user's folder", async () => {
    const row = songRow(user.id);
    const other = crypto.randomUUID();
    const { error } = await user.client
      .from('songs')
      .insert({ ...row, file_path: `${other}/${row.id}.gp` });
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it.each([
    ['file_hash', 'f'.repeat(64)],
    ['file_path', 'x/y.gp'],
    ['original_tempo', 90],
    ['drum_track_index', 2],
  ])("won't let %s change after insert", async (field, value) => {
    const id = await insertSong(user);
    const { error } = await user.client
      .from('songs')
      .update({ [field]: value } as TablesUpdate<'songs'>)
      .eq('id', id);
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
  });

  it('bumps updated_at when title changes', async () => {
    const id = await insertSong(user);
    const before = await user.client.from('songs').select('updated_at').eq('id', id).single();
    await waitForClockTick();
    const after = await user.client
      .from('songs')
      .update({ title: 'Renamed' })
      .eq('id', id)
      .select('updated_at')
      .single();
    expect(Date.parse(after.data!.updated_at)).toBeGreaterThan(Date.parse(before.data!.updated_at));
  });
});

describe('loops edges', () => {
  it.each([
    ['speed_ratio', SPEED_RATIO_MIN],
    ['speed_ratio', SPEED_RATIO_MAX],
  ])('accepts %s = %j', async (field, value) => {
    const id = await insertLoop(user, songId, { [field]: value });
    expect((await loopById(id))[field as 'speed_ratio']).toBe(value);
  });

  it('accepts the last bar as a single-bar loop', async () => {
    await expect(insertLoop(user, songId, { start_bar: 16, end_bar: 16 })).resolves.toBeTruthy();
  });

  it('rejects a loop that starts past the last bar', async () => {
    await expect(insertLoop(user, songId, { start_bar: 17, end_bar: 17 })).rejects.toMatchObject({
      code: PG.CHECK_VIOLATION,
    });
  });

  it('rejects an update that makes start_bar > end_bar', async () => {
    const id = await insertLoop(user, songId, { start_bar: 2, end_bar: 4 });
    const { error } = await user.client.from('loops').update({ start_bar: 5 }).eq('id', id);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect(await loopById(id)).toMatchObject({ start_bar: 2, end_bar: 4 });
  });

  it.each([
    ['speed_ratio', 0.1],
    ['speed_ratio', 2.5],
  ])('rejects an update to %s = %j', async (field, value) => {
    const id = await insertLoop(user, songId);
    const { error } = await user.client
      .from('loops')
      .update({ [field]: value } as TablesUpdate<'loops'>)
      .eq('id', id);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it('accepts a name at the length limit and rejects one over it', async () => {
    await expect(
      insertLoop(user, songId, { name: 'n'.repeat(LOOP_NAME_MAX_LENGTH) }),
    ).resolves.toBeTruthy();
    await expect(
      insertLoop(user, songId, { name: 'n'.repeat(LOOP_NAME_MAX_LENGTH + 1) }),
    ).rejects.toMatchObject({ code: PG.CHECK_VIOLATION });
  });

  it('rejects a status outside the enum', async () => {
    await expect(insertLoop(user, songId, { status: 'paused' as never })).rejects.toMatchObject({
      code: PG.INVALID_TEXT_REPRESENTATION,
    });
  });

  it('a loop inserted as finished gets finished_at', async () => {
    const id = await insertLoop(user, songId, { status: 'finished' });
    expect((await loopById(id)).finished_at).not.toBeNull();
  });

  // Unit 08: these columns are the database's, set by trigger; a client can't send them.
  it.each([
    ['finished_at', '2026-01-01T00:00:00.000Z'],
    ['last_practiced_at', '2026-01-01T00:00:00.000Z'],
    ['created_at', '2026-01-01T00:00:00.000Z'],
    ['updated_at', '2026-01-01T00:00:00.000Z'],
  ])("won't take %s on insert", async (field, value) => {
    await expect(insertLoop(user, songId, { [field]: value })).rejects.toMatchObject({
      code: PG.INSUFFICIENT_PRIVILEGE,
    });
  });

  it.each([
    ['finished_at', '2026-01-01T00:00:00.000Z'],
    ['last_practiced_at', '2026-01-01T00:00:00.000Z'],
    ['created_at', '2026-01-01T00:00:00.000Z'],
    ['updated_at', '2026-01-01T00:00:00.000Z'],
    ['song_id', crypto.randomUUID()],
    ['user_id', crypto.randomUUID()],
  ])("won't let %s change after insert", async (field, value) => {
    const id = await insertLoop(user, songId);
    const before = await loopById(id);
    const { error } = await user.client
      .from('loops')
      .update({ [field]: value } as TablesUpdate<'loops'>)
      .eq('id', id);
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await loopById(id)).toEqual(before);
  });

  it.each(['   ', '\t', '\n \n'])('rejects a blank name %j', async (name) => {
    await expect(insertLoop(user, songId, { name })).rejects.toMatchObject({
      code: PG.CHECK_VIOLATION,
    });
  });

  it('rejects renaming a loop to a blank name', async () => {
    const id = await insertLoop(user, songId);
    const { error } = await user.client.from('loops').update({ name: '  ' }).eq('id', id);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect((await loopById(id)).name).toBe('Test loop');
  });

  it('editing a finished loop keeps its finished_at', async () => {
    const id = await insertLoop(user, songId, { status: 'finished' });
    const { finished_at } = await loopById(id);
    await waitForClockTick();
    const { error } = await user.client.from('loops').update({ name: 'Renamed' }).eq('id', id);
    expect(error).toBeNull();
    expect((await loopById(id)).finished_at).toBe(finished_at);
  });

  it('finish and reopen keep the session history', async () => {
    const id = await insertLoop(user, songId);
    await insertSession(user, sessionRow(user.id, id));
    await insertSession(user, sessionRow(user.id, id));
    for (const status of ['finished', 'active'] as const) {
      const { error } = await user.client.from('loops').update({ status }).eq('id', id);
      expect(error).toBeNull();
      const { data } = await user.client.from('practice_sessions').select('id').eq('loop_id', id);
      expect(data).toHaveLength(2);
    }
  });

  it("can't point a loop at a song that doesn't exist", async () => {
    await expect(insertLoop(user, crypto.randomUUID())).rejects.toMatchObject({
      code: PG.FOREIGN_KEY_VIOLATION,
    });
  });
});

describe('practice_sessions edges', () => {
  it.each([SPEED_RATIO_MIN, SPEED_RATIO_MAX])('accepts speed_ratio = %j', async (ratio) => {
    const loopId = await insertLoop(user, songId);
    const { error } = await user.client
      .from('practice_sessions')
      .insert(sessionRow(user.id, loopId, { speed_ratio: ratio }));
    expect(error).toBeNull();
  });

  it('rejects speed_ratio below the minimum', async () => {
    const loopId = await insertLoop(user, songId);
    const { error } = await user.client
      .from('practice_sessions')
      .insert(sessionRow(user.id, loopId, { speed_ratio: 0.2 }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it("can't be deleted directly", async () => {
    const loopId = await insertLoop(user, songId);
    const row = sessionRow(user.id, loopId);
    await insertSession(user, row);
    const { error } = await user.client.from('practice_sessions').delete().eq('id', row.id);
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const { data } = await user.client.from('practice_sessions').select('id').eq('id', row.id);
    expect(data).toHaveLength(1);
  });

  it('a retry with the same id but different values keeps the first write', async () => {
    const loopId = await insertLoop(user, songId);
    const row = sessionRow(user.id, loopId, { repeats: 3 });
    await insertSession(user, row);
    const retry = await user.client
      .from('practice_sessions')
      .upsert({ ...row, repeats: 7 }, { onConflict: 'id', ignoreDuplicates: true });
    expect(retry.error).toBeNull();
    const { data } = await user.client
      .from('practice_sessions')
      .select('repeats')
      .eq('id', row.id)
      .single();
    expect(data?.repeats).toBe(3);
  });
});

describe('user_settings edges', () => {
  it.each([0, 1, 2])('accepts count_in_bars = %i', async (bars) => {
    const { error } = await user.client
      .from('user_settings')
      .update({ count_in_bars: bars })
      .eq('user_id', user.id);
    expect(error).toBeNull();
  });

  it.each([{ count_in_bars: -1 }, { metronome_volume: -0.1 }])('rejects %j', async (change) => {
    const { error } = await user.client.from('user_settings').update(change).eq('user_id', user.id);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it.each([0, 1])('accepts metronome_volume = %j', async (volume) => {
    const { error } = await user.client
      .from('user_settings')
      .update({ metronome_volume: volume })
      .eq('user_id', user.id);
    expect(error).toBeNull();
  });

  it('rejects a count_in_mode outside the enum', async () => {
    const { error } = await user.client
      .from('user_settings')
      .update({ count_in_mode: 'sometimes' as never })
      .eq('user_id', user.id);
    expect(error?.code).toBe(PG.INVALID_TEXT_REPRESENTATION);
  });

  it('bumps updated_at on change', async () => {
    const before = await user.client.from('user_settings').select('updated_at').single();
    await waitForClockTick();
    const after = await user.client
      .from('user_settings')
      .update({ drums_muted_default: true })
      .eq('user_id', user.id)
      .select('updated_at')
      .single();
    expect(Date.parse(after.data!.updated_at)).toBeGreaterThan(Date.parse(before.data!.updated_at));
  });

  it("can't be inserted or deleted by the user (one row, from signup)", async () => {
    const insert = await user.client.from('user_settings').insert({ user_id: user.id });
    expect(insert.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const del = await user.client.from('user_settings').delete().eq('user_id', user.id);
    expect(del.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const { data } = await user.client.from('user_settings').select('user_id');
    expect(data).toEqual([{ user_id: user.id }]);
  });
});

describe('cascades', () => {
  it('deleting a loop removes only its sessions', async () => {
    const keep = await insertLoop(user, songId);
    const drop = await insertLoop(user, songId);
    await insertSession(user, sessionRow(user.id, keep));
    await insertSession(user, sessionRow(user.id, drop));

    const { error } = await user.client.from('loops').delete().eq('id', drop);
    expect(error).toBeNull();
    const sessions = async (loopId: string) =>
      (await user.client.from('practice_sessions').select('id').eq('loop_id', loopId)).data;
    expect(await sessions(drop)).toEqual([]);
    expect(await sessions(keep)).toHaveLength(1);
    expect((await user.client.from('songs').select('id').eq('id', songId)).data).toHaveLength(1);
  });

  it("deleting a song leaves other songs' loops alone", async () => {
    const doomed = await insertSong(user);
    const other = await insertSong(user);
    await insertLoop(user, doomed);
    const otherLoop = await insertLoop(user, other);
    const { error } = await user.client.from('songs').delete().eq('id', doomed);
    expect(error).toBeNull();
    expect((await user.client.from('loops').select('id').eq('song_id', doomed)).data).toEqual([]);
    expect((await user.client.from('loops').select('id').eq('id', otherLoop)).data).toHaveLength(1);
  });
});
