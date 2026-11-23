// Unit 08's migration (20261123000000_loops_grants.sql) from the app's side:
// what a signed-in client can and can't write on loops now that the grants
// are per column, what the triggers fill in, and that none of it loosened
// row-level security. The single-column refusals are in constraints.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TablesInsert, TablesUpdate } from '../../src/lib/database.types.ts';
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestUser,
  insertLoop,
  insertSong,
  PG,
  sessionRow,
  waitForClockTick,
  type TestUser,
} from './helpers';

// The app's own select (LOOP_SELECT in src/features/loops/loopForm.ts), written out: that
// module imports through the `@/` alias, which the database test config doesn't have.
const LOOP_SELECT =
  'id, song_id, name, start_bar, end_bar, speed_ratio, target_ratio, status, last_practiced_at, created_at';

let a: TestUser;
let b: TestUser;
let songA: string;
let songB: string;

beforeAll(async () => {
  a = await createTestUser('loops-grants-a');
  b = await createTestUser('loops-grants-b');
  songA = await insertSong(a, { bar_count: 16 });
  songB = await insertSong(b, { bar_count: 16 });
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

/** The whole row, read with the service role so RLS and grants don't colour the answer. */
async function loopAsAdmin(id: string) {
  const { data, error } = await admin.from('loops').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

describe('what the app writes', () => {
  it('inserts a loop with the columns createLoop sends, and reads the saved row back', async () => {
    const id = crypto.randomUUID();
    const { data, error } = await a.client
      .from('loops')
      .insert({
        id,
        user_id: a.id,
        song_id: songA,
        name: 'Chorus fill',
        start_bar: 9,
        end_bar: 12,
        speed_ratio: 0.708333,
        target_ratio: 1,
      })
      .select(LOOP_SELECT)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id,
      song_id: songA,
      name: 'Chorus fill',
      start_bar: 9,
      end_bar: 12,
      // A typed BPM's ratio: stored to all six decimals, not rounded to a percent.
      speed_ratio: 0.708333,
      target_ratio: 1,
      status: 'active',
      last_practiced_at: null,
    });
    expect(data?.created_at).toEqual(expect.any(String));
  });

  it.each([
    ['name', 'Renamed'],
    ['start_bar', 2],
    ['end_bar', 16],
    ['speed_ratio', 0.855556],
    ['target_ratio', 1.25],
    ['target_ratio', null],
  ] as const)('updates %s to %j and returns the saved row', async (field, value) => {
    const id = await insertLoop(a, songA, { target_ratio: 0.9 });
    const { data, error } = await a.client
      .from('loops')
      .update({ [field]: value } as TablesUpdate<'loops'>)
      .eq('id', id)
      .eq('user_id', a.id)
      .select(LOOP_SELECT)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id, [field]: value });
  });

  it('finishes and reopens a loop through status, which is the client’s to write', async () => {
    const id = await insertLoop(a, songA);
    const finished = await a.client.from('loops').update({ status: 'finished' }).eq('id', id);
    expect(finished.error).toBeNull();
    expect(await loopAsAdmin(id)).toMatchObject({ status: 'finished' });
    expect((await loopAsAdmin(id))?.finished_at).not.toBeNull();

    const reopened = await a.client.from('loops').update({ status: 'active' }).eq('id', id);
    expect(reopened.error).toBeNull();
    expect(await loopAsAdmin(id)).toMatchObject({ status: 'active', finished_at: null });
  });

  it('deletes a loop, and its sessions go with it', async () => {
    const id = await insertLoop(a, songA);
    const session = await a.client.from('practice_sessions').insert(sessionRow(a.id, id));
    expect(session.error).toBeNull();

    const { error } = await a.client.from('loops').delete().eq('id', id).eq('user_id', a.id);
    expect(error).toBeNull();
    expect(await loopAsAdmin(id)).toBeNull();
    const left = await admin.from('practice_sessions').select('id').eq('loop_id', id);
    expect(left.error).toBeNull();
    expect(left.data).toEqual([]);
  });
});

describe('what a client cannot write', () => {
  it("won't let a loop's id change", async () => {
    const id = await insertLoop(a, songA);
    const { error } = await a.client.from('loops').update({ id: crypto.randomUUID() }).eq('id', id);
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await loopAsAdmin(id)).not.toBeNull();
  });

  it.each(['finished_at', 'last_practiced_at', 'created_at', 'updated_at'] as const)(
    'refuses a whole update that carries %s beside a column it may write',
    async (field) => {
      const id = await insertLoop(a, songA);
      const before = await loopAsAdmin(id);
      const { error } = await a.client
        .from('loops')
        .update({ name: 'Renamed', [field]: '2030-01-01T00:00:00.000Z' } as TablesUpdate<'loops'>)
        .eq('id', id);
      expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
      // Nothing of it was applied, the allowed column included.
      expect(await loopAsAdmin(id)).toEqual(before);
    },
  );

  it('refuses a whole insert that carries a server-owned column, leaving no row', async () => {
    const id = crypto.randomUUID();
    const { error } = await a.client.from('loops').insert({
      id,
      user_id: a.id,
      song_id: songA,
      name: 'Backdated',
      start_bar: 1,
      end_bar: 4,
      last_practiced_at: '2030-01-01T00:00:00.000Z',
    });
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await loopAsAdmin(id)).toBeNull();
  });

  it('signed-out clients can neither insert a loop nor change one', async () => {
    const id = await insertLoop(a, songA);
    const anon = anonClient();
    const insert = await anon.from('loops').insert({
      id: crypto.randomUUID(),
      user_id: a.id,
      song_id: songA,
      name: 'Anon',
      start_bar: 1,
      end_bar: 2,
    });
    expect(insert.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    // anon has no grant on loops at all, so these are refused outright, not filtered by RLS.
    const update = await anon.from('loops').update({ name: 'Anon' }).eq('id', id).select();
    expect(update.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const del = await anon.from('loops').delete().eq('id', id).select();
    expect(del.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await loopAsAdmin(id)).toMatchObject({ name: 'Test loop' });
  });
});

describe('what the triggers fill in', () => {
  it('stamps created_at and updated_at together on insert', async () => {
    const id = await insertLoop(a, songA);
    const row = await loopAsAdmin(id);
    expect(row?.created_at).toBe(row?.updated_at);
    // The server's clock, give or take a minute of drift between Docker and the host.
    expect(Math.abs(Date.parse(row!.created_at) - Date.now())).toBeLessThan(60_000);
  });

  it('moves updated_at on every edit and never created_at', async () => {
    const id = await insertLoop(a, songA);
    const before = await loopAsAdmin(id);
    await waitForClockTick();
    const { error } = await a.client.from('loops').update({ speed_ratio: 0.9 }).eq('id', id);
    expect(error).toBeNull();
    const after = await loopAsAdmin(id);
    expect(after?.created_at).toBe(before?.created_at);
    expect(Date.parse(after!.updated_at)).toBeGreaterThan(Date.parse(before!.updated_at));
  });

  it('ignores timestamps sent by any role, the service role included', async () => {
    const id = crypto.randomUUID();
    const row: TablesInsert<'loops'> = {
      id,
      user_id: a.id,
      song_id: songA,
      name: 'From a script',
      start_bar: 1,
      end_bar: 4,
      created_at: '2001-01-01T00:00:00.000Z',
      updated_at: '2001-01-01T00:00:00.000Z',
    };
    const { error } = await admin.from('loops').insert(row);
    expect(error).toBeNull();
    const saved = await loopAsAdmin(id);
    expect(new Date(saved!.created_at).getUTCFullYear()).toBeGreaterThan(2001);
    expect(new Date(saved!.updated_at).getUTCFullYear()).toBeGreaterThan(2001);
  });

  it('a session sets last_practiced_at to its end, for the owner’s loop only', async () => {
    const mine = await insertLoop(a, songA);
    const other = await insertLoop(a, songA);
    const theirs = await insertLoop(b, songB);
    const { error } = await a.client
      .from('practice_sessions')
      .insert(
        sessionRow(a.id, mine, { started_at: '2026-11-20T10:00:00.000Z', duration_seconds: 90 }),
      );
    expect(error).toBeNull();

    expect(Date.parse((await loopAsAdmin(mine))!.last_practiced_at!)).toBe(
      Date.parse('2026-11-20T10:01:30.000Z'),
    );
    expect((await loopAsAdmin(other))?.last_practiced_at).toBeNull();
    expect((await loopAsAdmin(theirs))?.last_practiced_at).toBeNull();
  });

  it('an older session logged late does not move last_practiced_at back', async () => {
    const id = await insertLoop(a, songA);
    for (const started_at of ['2026-11-20T10:00:00.000Z', '2026-11-01T10:00:00.000Z']) {
      const { error } = await a.client
        .from('practice_sessions')
        .insert(sessionRow(a.id, id, { started_at, duration_seconds: 60 }));
      expect(error).toBeNull();
    }
    expect(Date.parse((await loopAsAdmin(id))!.last_practiced_at!)).toBe(
      Date.parse('2026-11-20T10:01:00.000Z'),
    );
  });

  it('logging a session does not need, or leave, any write on the loop by the user', async () => {
    const id = await insertLoop(a, songA);
    const session = await a.client.from('practice_sessions').insert(sessionRow(a.id, id));
    expect(session.error).toBeNull();
    // The trigger wrote it; the user still can't.
    const direct = await a.client
      .from('loops')
      .update({ last_practiced_at: null } as TablesUpdate<'loops'>)
      .eq('id', id);
    expect(direct.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect((await loopAsAdmin(id))?.last_practiced_at).not.toBeNull();
  });

  it("the trigger runs as the owner of the table, but can't be pointed at another user's loop", async () => {
    const loopOfA = await insertLoop(a, songA);
    // B claims the session as theirs against A's loop, and as A's outright.
    const asB = await b.client.from('practice_sessions').insert(sessionRow(b.id, loopOfA));
    expect(asB.error?.code).toBe(PG.FOREIGN_KEY_VIOLATION);
    const asA = await b.client.from('practice_sessions').insert(sessionRow(a.id, loopOfA));
    expect(asA.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);

    expect((await loopAsAdmin(loopOfA))?.last_practiced_at).toBeNull();
    const sessions = await admin.from('practice_sessions').select('id').eq('loop_id', loopOfA);
    expect(sessions.error).toBeNull();
    expect(sessions.data).toEqual([]);
  });
});

describe('row-level security on loops is still owner-only', () => {
  it("B can't see A's loop, by id or in a list", async () => {
    const id = await insertLoop(a, songA);
    const byId = await b.client.from('loops').select(LOOP_SELECT).eq('id', id);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
    const bySong = await b.client.from('loops').select('id').eq('song_id', songA);
    expect(bySong.error).toBeNull();
    expect(bySong.data).toEqual([]);
  });

  it.each([
    ['name', 'Hacked'],
    ['start_bar', 3],
    ['end_bar', 5],
    ['speed_ratio', 2],
    ['target_ratio', 0.25],
    ['status', 'finished'],
  ] as const)("B's update of %s on A's loop changes no row", async (field, value) => {
    const id = await insertLoop(a, songA);
    const before = await loopAsAdmin(id);
    const { data, error } = await b.client
      .from('loops')
      .update({ [field]: value } as TablesUpdate<'loops'>)
      .eq('id', id)
      .select('id');
    // The column is B's to write on B's own rows, so this is RLS, not the grant.
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await loopAsAdmin(id)).toEqual(before);
  });

  it("B can't delete A's loop", async () => {
    const id = await insertLoop(a, songA);
    const { data, error } = await b.client.from('loops').delete().eq('id', id).select('id');
    // Not refused, which would also leave the row: RLS hides it, so there is nothing to delete.
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await loopAsAdmin(id)).not.toBeNull();
  });

  it("B can't insert a loop on A's song, as B or as A", async () => {
    const base = { song_id: songA, name: 'Sneaky', start_bar: 1, end_bar: 2 };
    const asB = await b.client.from('loops').insert({ ...base, user_id: b.id });
    expect(asB.error?.code).toBe(PG.FOREIGN_KEY_VIOLATION);
    const asA = await b.client.from('loops').insert({ ...base, user_id: a.id });
    expect(asA.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const listed = await admin.from('loops').select('id').eq('name', 'Sneaky');
    expect(listed.error).toBeNull();
    expect(listed.data).toEqual([]);
  });

  it('each user lists only their own loops', async () => {
    const mine = await insertLoop(a, songA, { name: 'Only A sees this' });
    const theirs = await insertLoop(b, songB, { name: 'Only B sees this' });
    const seenByA = await a.client.from('loops').select('id').in('id', [mine, theirs]);
    const seenByB = await b.client.from('loops').select('id').in('id', [mine, theirs]);
    expect(seenByA.error).toBeNull();
    expect(seenByB.error).toBeNull();
    expect(seenByA.data).toEqual([{ id: mine }]);
    expect(seenByB.data).toEqual([{ id: theirs }]);
  });
});

describe('blank names and titles', () => {
  it.each(['', ' ', '   ', '\t', '\n', ' \t\r\n '])('refuses the song title %j', async (title) => {
    await expect(insertSong(a, { title })).rejects.toMatchObject({ code: PG.CHECK_VIOLATION });
  });

  it('refuses renaming a song to a blank title, and keeps the old one', async () => {
    const { error } = await a.client.from('songs').update({ title: ' \t ' }).eq('id', songA);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    const { data, error: readError } = await a.client
      .from('songs')
      .select('title')
      .eq('id', songA)
      .single();
    expect(readError).toBeNull();
    expect(data?.title).toBe('Test Song');
  });

  // Loop names of spaces, tabs and newlines are in constraints.test.ts ("rejects a blank name").
  it('refuses an empty loop name', async () => {
    await expect(insertLoop(a, songA, { name: '' })).rejects.toMatchObject({
      code: PG.CHECK_VIOLATION,
    });
  });

  it.each(['x', ' Chorus fill ', 'Fill\t2', '.', '１'])(
    'accepts the name %j for a loop and a song',
    async (name) => {
      const id = await insertLoop(a, songA, { name });
      expect((await loopAsAdmin(id))?.name).toBe(name);
      await expect(insertSong(a, { title: name })).resolves.toBeTruthy();
    },
  );

  it('still lets a song with a blank artist in, which was never required', async () => {
    await expect(insertSong(a, { artist: '' })).resolves.toBeTruthy();
  });
});
