import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GP_FILES_BUCKET, songFilePath } from '../../src/lib/schema.ts';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  insertLoop,
  insertSong,
  songRow,
  type TestUser,
} from './helpers';

let a: TestUser;
let b: TestUser;
let songA: string;
let loopA: string;
let filePathA: string;
const fileBytes = new Uint8Array([1, 2, 3, 4]);

beforeAll(async () => {
  a = await createTestUser('rls-a');
  b = await createTestUser('rls-b');
  songA = await insertSong(a);
  loopA = await insertLoop(a, songA);
  const session = await a.client.from('practice_sessions').insert({
    loop_id: loopA,
    user_id: a.id,
    started_at: new Date().toISOString(),
    duration_seconds: 60,
    speed_ratio: 1,
  });
  if (session.error) throw session.error;
  filePathA = songFilePath(a.id, songA);
  const upload = await a.client.storage.from(GP_FILES_BUCKET).upload(filePathA, fileBytes);
  if (upload.error) throw upload.error;
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe('row-level security between two users', () => {
  it('the owner sees their own rows', async () => {
    expect((await a.client.from('songs').select('id')).data).toEqual([{ id: songA }]);
    expect((await a.client.from('loops').select('id')).data).toEqual([{ id: loopA }]);
    expect((await a.client.from('practice_sessions').select('id')).data).toHaveLength(1);
    expect((await a.client.from('user_settings').select('user_id')).data).toEqual([
      { user_id: a.id },
    ]);
  });

  it.each(['songs', 'loops', 'practice_sessions'] as const)(
    "B can't read A's %s",
    async (table) => {
      const { data, error } = await b.client.from(table).select('*');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    },
  );

  it('B only sees their own user_settings', async () => {
    const { data } = await b.client.from('user_settings').select('user_id');
    expect(data).toEqual([{ user_id: b.id }]);
  });

  it("B can't update or delete A's song", async () => {
    const update = await b.client
      .from('songs')
      .update({ title: 'Hacked' })
      .eq('id', songA)
      .select();
    expect(update.data ?? []).toEqual([]);
    const del = await b.client.from('songs').delete().eq('id', songA).select();
    expect(del.data ?? []).toEqual([]);
    const { data } = await a.client.from('songs').select('title').eq('id', songA).single();
    expect(data?.title).toBe('Test Song');
  });

  it("B can't update or delete A's loop or settings", async () => {
    const loop = await b.client.from('loops').update({ name: 'Hacked' }).eq('id', loopA).select();
    expect(loop.data ?? []).toEqual([]);
    const del = await b.client.from('loops').delete().eq('id', loopA).select();
    expect(del.data ?? []).toEqual([]);
    const settings = await b.client
      .from('user_settings')
      .update({ count_in_bars: 2 })
      .eq('user_id', a.id)
      .select();
    expect(settings.data ?? []).toEqual([]);
    const { data } = await a.client.from('loops').select('name').eq('id', loopA).single();
    expect(data?.name).toBe('Test loop');
  });

  it("B can't insert rows owned by A", async () => {
    const { error } = await b.client.from('songs').insert(songRow(a.id));
    expect(error?.code).toBe('42501');
  });

  it("B can't attach a loop or session to A's song or loop", async () => {
    const loop = await b.client
      .from('loops')
      .insert({ user_id: b.id, song_id: songA, name: 'Sneaky', start_bar: 1, end_bar: 2 });
    expect(loop.error?.code).toBe('23503');

    const session = await b.client.from('practice_sessions').insert({
      user_id: b.id,
      loop_id: loopA,
      started_at: new Date().toISOString(),
      duration_seconds: 30,
      speed_ratio: 1,
    });
    expect(session.error?.code).toBe('23503');
  });

  it("B can't move their own song to A", async () => {
    const songB = await insertSong(b);
    const { data } = await b.client.from('songs').update({ title: 'x' }).eq('id', songB).select();
    expect(data).toHaveLength(1);
    // user_id isn't in the column grant, so this fails before RLS is even checked.
    const move = await b.client.from('songs').update({ user_id: a.id }).eq('id', songB);
    expect(move.error?.code).toBe('42501');
  });

  it('signed-out clients see nothing', async () => {
    const anon = anonClient();
    for (const table of ['songs', 'loops', 'practice_sessions', 'user_settings'] as const) {
      const { data } = await anon.from(table).select('*');
      expect(data ?? []).toEqual([]);
    }
  });
});

describe('gp-files storage between two users', () => {
  it('the owner can download their file', async () => {
    const { data, error } = await a.client.storage.from(GP_FILES_BUCKET).download(filePathA);
    expect(error).toBeNull();
    expect(new Uint8Array(await data!.arrayBuffer())).toEqual(fileBytes);
  });

  it("B can't download or list A's files", async () => {
    const download = await b.client.storage.from(GP_FILES_BUCKET).download(filePathA);
    expect(download.error).not.toBeNull();
    const list = await b.client.storage.from(GP_FILES_BUCKET).list(a.id);
    expect(list.data ?? []).toEqual([]);
  });

  it("B can't write into A's folder", async () => {
    const path = songFilePath(a.id, crypto.randomUUID());
    const upload = await b.client.storage.from(GP_FILES_BUCKET).upload(path, fileBytes);
    expect(upload.error).not.toBeNull();
    const overwrite = await b.client.storage
      .from(GP_FILES_BUCKET)
      .upload(filePathA, new Uint8Array([9]), { upsert: true });
    expect(overwrite.error).not.toBeNull();
  });

  it("B can't delete A's file", async () => {
    await b.client.storage.from(GP_FILES_BUCKET).remove([filePathA]);
    const { error } = await a.client.storage.from(GP_FILES_BUCKET).download(filePathA);
    expect(error).toBeNull();
  });

  it('uploads must use the {user_id}/{song_id}.gp shape', async () => {
    const bucket = b.client.storage.from(GP_FILES_BUCKET);
    expect((await bucket.upload(`${b.id}/not-a-uuid.gp`, fileBytes)).error).not.toBeNull();
    expect(
      (await bucket.upload(`${b.id}/${crypto.randomUUID()}.mid`, fileBytes)).error,
    ).not.toBeNull();
    expect(
      (await bucket.upload(songFilePath(b.id, crypto.randomUUID()), fileBytes)).error,
    ).toBeNull();
  });

  it('signed-out clients cannot download', async () => {
    const { error } = await anonClient().storage.from(GP_FILES_BUCKET).download(filePathA);
    expect(error).not.toBeNull();
  });
});
