import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GP_FILES_BUCKET, songFilePath } from '../../src/lib/schema.ts';
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestUser,
  insertLoop,
  insertSong,
  PG,
  sessionRow,
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
  const session = await a.client.from('practice_sessions').insert(sessionRow(a.id, loopA));
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
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
  });

  it("B can't attach a loop or session to A's song or loop", async () => {
    const loop = await b.client
      .from('loops')
      .insert({ user_id: b.id, song_id: songA, name: 'Sneaky', start_bar: 1, end_bar: 2 });
    expect(loop.error?.code).toBe(PG.FOREIGN_KEY_VIOLATION);

    const session = await b.client.from('practice_sessions').insert(sessionRow(b.id, loopA));
    expect(session.error?.code).toBe(PG.FOREIGN_KEY_VIOLATION);
  });

  it("B can't move their own song to A", async () => {
    const songB = await insertSong(b);
    const { data } = await b.client.from('songs').update({ title: 'x' }).eq('id', songB).select();
    expect(data).toHaveLength(1);
    // user_id isn't in the column grant, so this fails before RLS is even checked.
    const move = await b.client.from('songs').update({ user_id: a.id }).eq('id', songB);
    expect(move.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
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

describe('cross-user writes that must fail', () => {
  it("B can't insert a loop or session claiming A as owner", async () => {
    const loop = await b.client
      .from('loops')
      .insert({ user_id: a.id, song_id: songA, name: 'Sneaky', start_bar: 1, end_bar: 2 });
    expect(loop.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);

    const session = await b.client.from('practice_sessions').insert(sessionRow(a.id, loopA));
    expect(session.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const { data } = await admin.from('practice_sessions').select('id').eq('loop_id', loopA);
    expect(data).toHaveLength(1);
  });

  it("B can't move their own loop onto A's song or to A", async () => {
    const songB = await insertSong(b);
    const loopB = await insertLoop(b, songB);
    const toSong = await b.client.from('loops').update({ song_id: songA }).eq('id', loopB);
    // Since Unit 08 a loop's song and owner aren't updatable columns at all.
    expect(toSong.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const toUser = await b.client.from('loops').update({ user_id: a.id }).eq('id', loopB);
    expect(toUser.error).not.toBeNull();
    const { data } = await admin.from('loops').select('user_id, song_id').eq('id', loopB).single();
    expect(data).toEqual({ user_id: b.id, song_id: songB });
  });

  it("B can't hand their settings row to A", async () => {
    const { error } = await b.client
      .from('user_settings')
      .update({ user_id: a.id })
      .eq('user_id', b.id);
    expect(error).not.toBeNull();
    const { data } = await admin.from('user_settings').select('user_id').eq('user_id', b.id);
    expect(data).toHaveLength(1);
  });

  it("B can't read A's rows even by id", async () => {
    expect((await b.client.from('songs').select('id').eq('id', songA)).data).toEqual([]);
    expect((await b.client.from('loops').select('id').eq('id', loopA)).data).toEqual([]);
    expect(
      (await b.client.from('user_settings').select('user_id').eq('user_id', a.id)).data,
    ).toEqual([]);
  });

  it('two users can upload the same file (hash is unique per user)', async () => {
    const { data } = await admin.from('songs').select('file_hash').eq('id', songA).single();
    await expect(insertSong(b, { file_hash: data!.file_hash })).resolves.toBeTruthy();
  });

  it("A's rows are untouched by everything B tried", async () => {
    const { data } = await admin.from('songs').select('title, user_id').eq('id', songA).single();
    expect(data).toEqual({ title: 'Test Song', user_id: a.id });
    const loop = await admin.from('loops').select('name, user_id').eq('id', loopA).single();
    expect(loop.data).toEqual({ name: 'Test loop', user_id: a.id });
  });
});

describe('signed-out writes', () => {
  it('anon clients cannot insert, update or delete anything', async () => {
    const anon = anonClient();
    const song = await anon.from('songs').insert(songRow(a.id));
    expect(song.error).not.toBeNull();
    const loop = await anon.from('loops').update({ name: 'x' }).eq('id', loopA).select();
    expect(loop.data ?? []).toEqual([]);
    const del = await anon.from('songs').delete().eq('id', songA).select();
    expect(del.data ?? []).toEqual([]);
    const settings = await anon
      .from('user_settings')
      .update({ count_in_bars: 2 })
      .eq('user_id', a.id)
      .select();
    expect(settings.data ?? []).toEqual([]);
    expect((await admin.from('songs').select('id').eq('id', songA)).data).toHaveLength(1);
  });

  it('anon clients cannot list or upload files', async () => {
    const bucket = anonClient().storage.from(GP_FILES_BUCKET);
    expect((await bucket.list(a.id)).data ?? []).toEqual([]);
    const upload = await bucket.upload(songFilePath(a.id, crypto.randomUUID()), fileBytes);
    expect(upload.error).not.toBeNull();
  });
});

describe('gp-files storage edges', () => {
  it('the bucket is private: public URLs do not serve files', async () => {
    const { data } = a.client.storage.from(GP_FILES_BUCKET).getPublicUrl(filePathA);
    const response = await fetch(data.publicUrl);
    expect(response.ok).toBe(false);
  });

  it("B can't get a signed URL for A's file", async () => {
    const { data, error } = await b.client.storage
      .from(GP_FILES_BUCKET)
      .createSignedUrl(filePathA, 60);
    expect(error ?? !data?.signedUrl).toBeTruthy();
  });

  it("B can't move or copy A's file", async () => {
    const bucket = b.client.storage.from(GP_FILES_BUCKET);
    const target = songFilePath(b.id, crypto.randomUUID());
    expect((await bucket.move(filePathA, target)).error).not.toBeNull();
    expect((await bucket.copy(filePathA, target)).error).not.toBeNull();
    const { error } = await a.client.storage.from(GP_FILES_BUCKET).download(filePathA);
    expect(error).toBeNull();
  });

  it("B can't move their own file into A's folder", async () => {
    const bucket = b.client.storage.from(GP_FILES_BUCKET);
    const own = songFilePath(b.id, crypto.randomUUID());
    expect((await bucket.upload(own, fileBytes)).error).toBeNull();
    const move = await bucket.move(own, songFilePath(a.id, crypto.randomUUID()));
    expect(move.error).not.toBeNull();
    const list = await admin.storage.from(GP_FILES_BUCKET).list(a.id);
    expect(list.data?.map((f) => `${a.id}/${f.name}`)).toEqual([filePathA]);
  });

  it('rejects nested folders inside the user folder', async () => {
    const { error } = await b.client.storage
      .from(GP_FILES_BUCKET)
      .upload(`${b.id}/nested/${crypto.randomUUID()}.gp`, fileBytes);
    expect(error).not.toBeNull();
  });

  it('the owner can replace and delete their own file', async () => {
    const bucket = b.client.storage.from(GP_FILES_BUCKET);
    const path = songFilePath(b.id, crypto.randomUUID());
    expect((await bucket.upload(path, fileBytes)).error).toBeNull();
    const replaced = await bucket.upload(path, new Uint8Array([7, 7]), { upsert: true });
    expect(replaced.error).toBeNull();
    const download = await bucket.download(path);
    expect(new Uint8Array(await download.data!.arrayBuffer())).toEqual(new Uint8Array([7, 7]));
    expect((await bucket.remove([path])).error).toBeNull();
    expect((await bucket.download(path)).error).not.toBeNull();
  });

  it('rejects files over the 20 MiB limit', async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    const { error } = await b.client.storage
      .from(GP_FILES_BUCKET)
      .upload(songFilePath(b.id, crypto.randomUUID()), big);
    expect(error).not.toBeNull();
  });
});
