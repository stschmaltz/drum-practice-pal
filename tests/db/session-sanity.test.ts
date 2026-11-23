// Unit 09's migration (20261123010000_session_sanity.sql) from the app's side:
// the bounds on a logged session, which columns a client may send, the
// idempotent insert logSession and the keepalive request both rely on, and the
// home page's read of every loop with its song.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_MAX_DURATION_SECONDS } from '../../src/lib/schema.ts';
import { localSupabaseEnv } from '../../scripts/local-supabase.ts';
import {
  admin,
  createTestUser,
  deleteTestUser,
  insertLoop,
  insertSong,
  PG,
  sessionRow,
  type TestUser,
} from './helpers';

// The app's own select (PRACTICE_LOOP_SELECT in src/features/loops/practiceList.ts), written
// out: that module imports through the `@/` alias, which the database test config doesn't have.
const PRACTICE_LOOP_SELECT =
  'id, song_id, name, start_bar, end_bar, speed_ratio, target_ratio, status, finished_at, last_practiced_at, created_at, song:songs!loops_song_fkey(title, artist)';

const DAY_MS = 24 * 60 * 60 * 1000;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

let a: TestUser;
let b: TestUser;
let songA: string;
let songB: string;

beforeAll(async () => {
  a = await createTestUser('session-sanity-a');
  b = await createTestUser('session-sanity-b');
  songA = await insertSong(a, { bar_count: 16, title: 'Song of A', artist: 'A Band' });
  songB = await insertSong(b, { bar_count: 16, title: 'Song of B' });
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

async function loopAsAdmin(id: string) {
  const { data, error } = await admin.from('loops').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function sessionsAsAdmin(loopId: string) {
  const { data, error } = await admin.from('practice_sessions').select('*').eq('loop_id', loopId);
  if (error) throw error;
  return data;
}

describe('duration', () => {
  it('accepts a session of exactly a day', async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { duration_seconds: SESSION_MAX_DURATION_SECONDS }));
    expect(error).toBeNull();
  });

  it('refuses a second more, and the loop stays unpracticed', async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { duration_seconds: SESSION_MAX_DURATION_SECONDS + 1 }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect(await sessionsAsAdmin(loopId)).toEqual([]);
    expect((await loopAsAdmin(loopId)).last_practiced_at).toBeNull();
  });
});

describe('start time', () => {
  it('accepts a start 23 hours ahead (a clock that is merely off)', async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { started_at: fromNow(23 * 60 * 60 * 1000) }));
    expect(error).toBeNull();
  });

  it('refuses a start more than a day ahead, so it can never pin the loop to the top', async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { started_at: fromNow(DAY_MS + 60_000) }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect(await sessionsAsAdmin(loopId)).toEqual([]);
    expect((await loopAsAdmin(loopId)).last_practiced_at).toBeNull();
  });

  it('refuses it for the service role too: the rule is a trigger, not a grant', async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await admin
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { started_at: fromNow(30 * DAY_MS) }));
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it('accepts a start long past, for a queue that replays old sessions', async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { started_at: '2025-01-01T10:00:00.000Z' }));
    expect(error).toBeNull();
  });
});

describe('what a client may send', () => {
  it('inserts the columns logSession sends', async () => {
    const loopId = await insertLoop(a, songA);
    const row = sessionRow(a.id, loopId, {
      duration_seconds: 61,
      speed_ratio: 0.855556,
      repeats: 7,
    });
    const { error } = await a.client.from('practice_sessions').insert(row);
    expect(error).toBeNull();
    expect(await sessionsAsAdmin(loopId)).toEqual([
      expect.objectContaining({
        id: row.id,
        user_id: a.id,
        duration_seconds: 61,
        speed_ratio: 0.855556,
        repeats: 7,
      }),
    ]);
  });

  it("can't choose created_at: the whole insert is refused", async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { created_at: '2020-01-01T00:00:00.000Z' }));
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await sessionsAsAdmin(loopId)).toEqual([]);
  });

  it('created_at is the server clock, whoever inserts', async () => {
    const loopId = await insertLoop(a, songA);
    const before = Date.now();
    const { error } = await admin
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { created_at: '2020-01-01T00:00:00.000Z' }));
    expect(error).toBeNull();
    const [session] = await sessionsAsAdmin(loopId);
    expect(Date.parse(session!.created_at)).toBeGreaterThanOrEqual(before - 5_000);
  });

  it("can't log to another user's loop, as themselves or as the owner", async () => {
    const loopOfB = await insertLoop(b, songB);
    const asSelf = await a.client.from('practice_sessions').insert(sessionRow(a.id, loopOfB));
    // The (loop_id, user_id) foreign key: A has no such loop.
    expect(asSelf.error?.code).toBe(PG.FOREIGN_KEY_VIOLATION);
    const asOwner = await a.client.from('practice_sessions').insert(sessionRow(b.id, loopOfB));
    expect(asOwner.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await sessionsAsAdmin(loopOfB)).toEqual([]);
    expect((await loopAsAdmin(loopOfB)).last_practiced_at).toBeNull();
  });
});

describe('logging the same session twice', () => {
  const upsertAsApp = (user: TestUser, row: ReturnType<typeof sessionRow>) =>
    user.client.from('practice_sessions').upsert(row, { onConflict: 'id', ignoreDuplicates: true });

  it('the app\'s "on conflict do nothing" insert works under the column grant, and a retry adds nothing', async () => {
    const loopId = await insertLoop(a, songA);
    const row = sessionRow(a.id, loopId, { started_at: fromNow(-60_000), duration_seconds: 45 });

    expect((await upsertAsApp(a, row)).error).toBeNull();
    const practicedAt = (await loopAsAdmin(loopId)).last_practiced_at;
    expect(practicedAt).not.toBeNull();
    expect((await upsertAsApp(a, { ...row, duration_seconds: 500 })).error).toBeNull();

    const sessions = await sessionsAsAdmin(loopId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.duration_seconds).toBe(45);
    expect((await loopAsAdmin(loopId)).last_practiced_at).toBe(practicedAt);
  });

  it('the keepalive request (raw PostgREST, as keepaliveInsert sends it) logs once however often it is sent', async () => {
    const loopId = await insertLoop(a, songA);
    const row = sessionRow(a.id, loopId, { started_at: fromNow(-120_000), duration_seconds: 90 });
    const env = localSupabaseEnv();
    const session = await a.client.auth.getSession();
    if (session.error) throw session.error;
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error('test user has no session');
    const send = () =>
      fetch(`${env.url}/rest/v1/practice_sessions?on_conflict=id`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: env.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(row),
      });

    const first = await send();
    const second = await send();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(await sessionsAsAdmin(loopId)).toHaveLength(1);
    expect((await loopAsAdmin(loopId)).last_practiced_at).not.toBeNull();
  });

  it('answers a session for a deleted loop with a foreign key error the app can tell apart', async () => {
    const loopId = await insertLoop(a, songA);
    const { error: deleteError } = await a.client.from('loops').delete().eq('id', loopId);
    if (deleteError) throw deleteError;

    const { error } = await upsertAsApp(a, sessionRow(a.id, loopId));

    expect(error?.code).toBe(PG.FOREIGN_KEY_VIOLATION);
  });

  /** The request keepaliveInsert builds (src/lib/keepaliveInsert.ts), as that user. */
  async function keepaliveAs(user: TestUser, row: ReturnType<typeof sessionRow>) {
    const env = localSupabaseEnv();
    const session = await user.client.auth.getSession();
    if (session.error) throw session.error;
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error('test user has no session');
    return fetch(`${env.url}/rest/v1/practice_sessions?on_conflict=id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: env.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    });
  }

  it('the keepalive request for a deleted loop is refused with the code in its body, where the app reads it', async () => {
    const loopId = await insertLoop(a, songA);
    const { error: deleteError } = await a.client.from('loops').delete().eq('id', loopId);
    if (deleteError) throw deleteError;

    const response = await keepaliveAs(a, sessionRow(a.id, loopId));

    expect(response.ok).toBe(false);
    expect(await response.json()).toMatchObject({ code: PG.FOREIGN_KEY_VIOLATION });
  });

  it('the keepalive request is bound by the same rules: a start days ahead is refused, not ignored', async () => {
    const loopId = await insertLoop(a, songA);

    const response = await keepaliveAs(
      a,
      sessionRow(a.id, loopId, { started_at: fromNow(3 * DAY_MS) }),
    );

    expect(response.ok).toBe(false);
    expect(await response.json()).toMatchObject({ code: PG.CHECK_VIOLATION });
    expect(await sessionsAsAdmin(loopId)).toEqual([]);
  });

  it("sending an id that is another user's session changes nothing of theirs and logs nothing", async () => {
    const loopOfB = await insertLoop(b, songB);
    const theirs = sessionRow(b.id, loopOfB, { duration_seconds: 77 });
    const { error: theirError } = await b.client.from('practice_sessions').insert(theirs);
    if (theirError) throw theirError;
    const before = await sessionsAsAdmin(loopOfB);
    const loopOfA = await insertLoop(a, songA);

    const { error, data } = await upsertAsApp(a, {
      ...sessionRow(a.id, loopOfA, { duration_seconds: 500 }),
      id: theirs.id,
    }).select('id');

    // "On conflict do nothing" skips it without an error, and returns no row: nothing of B's is told.
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await sessionsAsAdmin(loopOfB)).toEqual(before);
    expect(await sessionsAsAdmin(loopOfA)).toEqual([]);
    expect((await loopAsAdmin(loopOfA)).last_practiced_at).toBeNull();
  });
});

describe('how far a wrong clock can move a loop', () => {
  it('at most two days ahead: the latest start the trigger takes, for the longest session the check takes', async () => {
    const loopId = await insertLoop(a, songA);
    const { error } = await a.client.from('practice_sessions').insert(
      sessionRow(a.id, loopId, {
        started_at: fromNow(DAY_MS - 60_000),
        duration_seconds: SESSION_MAX_DURATION_SECONDS,
      }),
    );
    expect(error).toBeNull();

    const practicedAt = Date.parse((await loopAsAdmin(loopId)).last_practiced_at ?? '');
    expect(practicedAt).toBeGreaterThan(Date.now() + DAY_MS);
    expect(practicedAt).toBeLessThanOrEqual(Date.now() + 2 * DAY_MS);
  });

  it('an honest session logged afterwards does not move it back, and is in the history all the same', async () => {
    const loopId = await insertLoop(a, songA);
    const ahead = sessionRow(a.id, loopId, { started_at: fromNow(20 * 60 * 60 * 1000) });
    const { error: aheadError } = await a.client.from('practice_sessions').insert(ahead);
    if (aheadError) throw aheadError;
    const pinned = (await loopAsAdmin(loopId)).last_practiced_at;

    const { error } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId, { started_at: fromNow(-60_000), duration_seconds: 45 }));

    expect(error).toBeNull();
    expect((await loopAsAdmin(loopId)).last_practiced_at).toBe(pinned);
    expect(await sessionsAsAdmin(loopId)).toHaveLength(2);
  });
});

describe("the history's read", () => {
  // The app's own select and order (fetchLoopSessions in src/features/practice/sessionsApi.ts).
  const SESSION_SELECT = 'id, loop_id, started_at, duration_seconds, speed_ratio, repeats';

  it("returns the loop's sessions newest first, with the exact speed, and none of another loop's or user's", async () => {
    const loopId = await insertLoop(a, songA);
    const otherLoop = await insertLoop(a, songA);
    const loopOfB = await insertLoop(b, songB);
    const older = sessionRow(a.id, loopId, { started_at: fromNow(-2 * DAY_MS) });
    const newer = sessionRow(a.id, loopId, {
      started_at: fromNow(-60_000),
      duration_seconds: 61,
      speed_ratio: 0.855556,
      repeats: 7,
    });
    for (const [user, row] of [
      [a, older],
      [a, newer],
      [a, sessionRow(a.id, otherLoop)],
      [b, sessionRow(b.id, loopOfB)],
    ] as const) {
      const { error } = await user.client.from('practice_sessions').insert(row);
      if (error) throw error;
    }

    const { data, error } = await a.client
      .from('practice_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', a.id)
      .eq('loop_id', loopId)
      .order('started_at', { ascending: false })
      .order('id');

    expect(error).toBeNull();
    expect(data?.map((session) => session.id)).toEqual([newer.id, older.id]);
    expect(data?.[0]).toMatchObject({ duration_seconds: 61, speed_ratio: 0.855556, repeats: 7 });

    // B asking for A's loop gets nothing, and no error to tell the loop exists.
    const asB = await b.client
      .from('practice_sessions')
      .select(SESSION_SELECT)
      .eq('loop_id', loopId);
    expect(asB.error).toBeNull();
    expect(asB.data).toEqual([]);
  });

  it('deleting the loop takes its history with it', async () => {
    const loopId = await insertLoop(a, songA);
    const { error: logError } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId));
    if (logError) throw logError;
    expect(await sessionsAsAdmin(loopId)).toHaveLength(1);

    const { error } = await a.client.from('loops').delete().eq('id', loopId);

    expect(error).toBeNull();
    expect(await sessionsAsAdmin(loopId)).toEqual([]);
  });
});

describe("the home page's read", () => {
  it("returns each of the user's loops with its song's name, and nobody else's", async () => {
    const mine = await insertLoop(a, songA, { name: 'Mine' });
    await insertLoop(b, songB, { name: 'Theirs' });

    const { data, error } = await a.client
      .from('loops')
      .select(PRACTICE_LOOP_SELECT)
      .eq('user_id', a.id);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((loop) => loop.song.title === 'Song of A')).toBe(true);
    expect(data?.find((loop) => loop.id === mine)).toMatchObject({
      name: 'Mine',
      status: 'active',
      finished_at: null,
      song: { title: 'Song of A', artist: 'A Band' },
    });
  });

  it('finish and reopen move finished_at with the status and keep the history', async () => {
    const loopId = await insertLoop(a, songA);
    const { error: logError } = await a.client
      .from('practice_sessions')
      .insert(sessionRow(a.id, loopId));
    if (logError) throw logError;

    const finished = await a.client
      .from('loops')
      .update({ status: 'finished' })
      .eq('id', loopId)
      .select('status, finished_at')
      .single();
    expect(finished.error).toBeNull();
    expect(finished.data?.status).toBe('finished');
    expect(finished.data?.finished_at).not.toBeNull();

    const reopened = await a.client
      .from('loops')
      .update({ status: 'active' })
      .eq('id', loopId)
      .select('status, finished_at')
      .single();
    expect(reopened.error).toBeNull();
    expect(reopened.data).toEqual({ status: 'active', finished_at: null });
    expect(await sessionsAsAdmin(loopId)).toHaveLength(1);
  });
});
