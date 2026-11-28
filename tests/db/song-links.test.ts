// Unit 19's column (20261201000000_song_link_bar_one.sql) is at the end: where bar 1 of
// the tab falls in a link's video.
// Unit 14's migration (20261130000000_song_links.sql) from the app's side: what
// a signed-in client can and can't write on song_links and songs.last_played_at,
// what the checks and triggers do, and that every row is its owner's alone.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TablesInsert, TablesUpdate } from '../../src/lib/database.types.ts';
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestUser,
  insertSong,
  PG,
  waitForClockTick,
  type TestUser,
} from './helpers';

// The app's own select (SONG_LINK_SELECT in src/features/recordings/songLinkForm.ts), written
// out: that module imports through the `@/` alias, which the database test config doesn't have.
const SONG_LINK_SELECT = 'id, song_id, kind, provider, url, created_at, bar_one_seconds';
const WATCH = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

let a: TestUser;
let b: TestUser;
let songA: string;
let songB: string;

beforeAll(async () => {
  a = await createTestUser('song-links-a');
  b = await createTestUser('song-links-b');
  songA = await insertSong(a);
  songB = await insertSong(b);
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

type LinkInsert = TablesInsert<'song_links'> & { id: string };

function linkRow(user: TestUser, songId: string, overrides: Partial<LinkInsert> = {}): LinkInsert {
  return {
    id: crypto.randomUUID(),
    user_id: user.id,
    song_id: songId,
    kind: 'other',
    provider: 'web',
    url: 'https://example.com/lesson',
    ...overrides,
  };
}

/** Inserts a link as the user, for a test's setup: a refusal fails the test there. */
async function insertLink(user: TestUser, songId: string, overrides: Partial<LinkInsert> = {}) {
  const row = linkRow(user, songId, overrides);
  const { error } = await user.client.from('song_links').insert(row);
  if (error) throw error;
  return row.id;
}

/** The whole row, read with the service role so RLS and grants don't colour the answer. */
async function linkAsAdmin(id: string) {
  const { data, error } = await admin.from('song_links').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function songAsAdmin(id: string) {
  const { data, error } = await admin.from('songs').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

describe('what the app writes on song_links', () => {
  it('inserts a link with the columns the form sends, and lists it with the app’s select', async () => {
    const song = await insertSong(a);
    const id = await insertLink(a, song, { kind: 'original', provider: 'youtube', url: WATCH });
    const { data, error } = await a.client
      .from('song_links')
      .select(SONG_LINK_SELECT)
      .eq('user_id', a.id)
      .eq('song_id', song)
      .order('created_at')
      .order('id');
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        id,
        song_id: song,
        kind: 'original',
        provider: 'youtube',
        url: WATCH,
        created_at: expect.any(String),
        bar_one_seconds: null,
      },
    ]);
  });

  it('points a link elsewhere: url and provider are the client’s to update', async () => {
    const id = await insertLink(a, songA);
    const { error } = await a.client
      .from('song_links')
      .update({ provider: 'spotify', url: SPOTIFY })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(error).toBeNull();
    expect(await linkAsAdmin(id)).toMatchObject({ provider: 'spotify', url: SPOTIFY });
  });

  it('removes several links in one request, as a save does', async () => {
    const first = await insertLink(a, songA);
    const second = await insertLink(a, songA);
    const { error } = await a.client
      .from('song_links')
      .delete()
      .in('id', [first, second])
      .eq('user_id', a.id);
    expect(error).toBeNull();
    expect(await linkAsAdmin(first)).toBeNull();
    expect(await linkAsAdmin(second)).toBeNull();
  });

  it('answers a second insert of the same id with a duplicate key, which the app turns into an update', async () => {
    const row = linkRow(a, songA);
    expect((await a.client.from('song_links').insert(row)).error).toBeNull();
    const again = await a.client
      .from('song_links')
      .insert({ ...row, url: 'https://example.com/changed' });
    expect(again.error?.code).toBe(PG.UNIQUE_VIOLATION);
    // The app's fallback: point the row that is there at what the field holds now.
    const updated = await a.client
      .from('song_links')
      .update({ provider: 'web', url: 'https://example.com/changed' })
      .eq('id', row.id)
      .eq('user_id', a.id)
      .select('id')
      .maybeSingle();
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual({ id: row.id });
    expect((await linkAsAdmin(row.id))?.url).toBe('https://example.com/changed');
  });
});

describe('one Original and one Drumless per song', () => {
  it.each(['original', 'drumless'] as const)('refuses a second %s link on a song', async (kind) => {
    const song = await insertSong(a);
    await insertLink(a, song, { kind });
    const second = linkRow(a, song, { kind, url: 'https://example.com/second' });
    const { error } = await a.client.from('song_links').insert(second);
    expect(error?.code).toBe(PG.UNIQUE_VIOLATION);
    expect(await linkAsAdmin(second.id)).toBeNull();
  });

  it('takes one of each on the same song, and the same kind on another song', async () => {
    const song = await insertSong(a);
    const other = await insertSong(a);
    await insertLink(a, song, { kind: 'original' });
    await expect(insertLink(a, song, { kind: 'drumless' })).resolves.toBeTruthy();
    await expect(insertLink(a, other, { kind: 'original' })).resolves.toBeTruthy();
  });

  it('takes any number of Other links, the same address twice included', async () => {
    const song = await insertSong(a);
    for (let count = 0; count < 5; count += 1) await insertLink(a, song, { kind: 'other' });
    const { data, error } = await admin.from('song_links').select('id').eq('song_id', song);
    expect(error).toBeNull();
    expect(data).toHaveLength(5);
  });
});

describe('the URL checks', () => {
  it.each([
    ['an http address', 'http://example.com/'],
    ['a javascript: address', 'javascript:alert(1)'],
    ['a data: address', 'data:text/html,hi'],
    ['no scheme', 'example.com/lesson'],
    ['https in capitals', 'HTTPS://example.com/'],
    ['a scheme and nothing else', 'https://'],
    ['a space inside', 'https://example.com/a b'],
    ['a newline, then a second address', 'https://example.com/\njavascript:alert(1)'],
    ['a leading space', ' https://example.com/'],
    ['nothing', ''],
  ])('refuses %s', async (_name, url) => {
    const row = linkRow(a, songA, { url });
    const { error } = await a.client.from('song_links').insert(row);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect(await linkAsAdmin(row.id)).toBeNull();
  });

  it('takes an address of 2048 characters and refuses one of 2049', async () => {
    const longest = `https://example.com/${'a'.repeat(2048 - 20)}`;
    expect(longest).toHaveLength(2048);
    await expect(insertLink(a, songA, { url: longest })).resolves.toBeTruthy();
    const tooLong = linkRow(a, songA, { url: `${longest}a` });
    const { error } = await a.client.from('song_links').insert(tooLong);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
  });

  it('refuses an update to an address that isn’t https, and keeps the old one', async () => {
    const id = await insertLink(a, songA);
    const { error } = await a.client
      .from('song_links')
      .update({ url: 'javascript:alert(1)' })
      .eq('id', id);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect((await linkAsAdmin(id))?.url).toBe('https://example.com/lesson');
  });

  it.each(['video', 'YOUTUBE', ''])('refuses the provider %j', async (provider) => {
    const row = { ...linkRow(a, songA), provider } as unknown as LinkInsert;
    const { error } = await a.client.from('song_links').insert(row);
    expect(error?.code).toBe(PG.INVALID_TEXT_REPRESENTATION);
  });

  it('refuses a kind that isn’t one of the three', async () => {
    const row = { ...linkRow(a, songA), kind: 'cover' } as unknown as LinkInsert;
    const { error } = await a.client.from('song_links').insert(row);
    expect(error?.code).toBe(PG.INVALID_TEXT_REPRESENTATION);
  });
});

describe('what a client cannot write on song_links', () => {
  it.each([
    ['id', (): string => crypto.randomUUID()],
    ['song_id', (): string => songA],
    ['kind', (): string => 'drumless'],
    ['user_id', (): string => b.id],
    ['created_at', (): string => '2001-01-01T00:00:00.000Z'],
    ['updated_at', (): string => '2001-01-01T00:00:00.000Z'],
  ] as const)('refuses an update of %s, alone or beside the url', async (field, value) => {
    const id = await insertLink(a, songA);
    const before = await linkAsAdmin(id);
    const alone = await a.client
      .from('song_links')
      .update({ [field]: value() } as TablesUpdate<'song_links'>)
      .eq('id', id);
    expect(alone.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const beside = await a.client
      .from('song_links')
      .update({ url: SPOTIFY, [field]: value() } as TablesUpdate<'song_links'>)
      .eq('id', id);
    expect(beside.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    // Nothing of either was applied, the allowed column included.
    expect(await linkAsAdmin(id)).toEqual(before);
  });

  it('refuses a whole insert that carries a timestamp, leaving no row', async () => {
    const row = { ...linkRow(a, songA), created_at: '2001-01-01T00:00:00.000Z' };
    const { error } = await a.client.from('song_links').insert(row);
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await linkAsAdmin(row.id)).toBeNull();
  });

  it('an upsert is refused too: it would need to update the id and the song', async () => {
    const row = linkRow(a, songA);
    const { error } = await a.client.from('song_links').upsert(row, { onConflict: 'id' });
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await linkAsAdmin(row.id)).toBeNull();
  });

  it('signed-out clients can do nothing with links', async () => {
    const id = await insertLink(a, songA);
    const anon = anonClient();
    // anon has no grant at all, so each is refused outright, not filtered by RLS.
    const read = await anon.from('song_links').select('id').eq('id', id);
    expect(read.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const insert = await anon.from('song_links').insert(linkRow(a, songA));
    expect(insert.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const update = await anon.from('song_links').update({ url: SPOTIFY }).eq('id', id).select();
    expect(update.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    const del = await anon.from('song_links').delete().eq('id', id).select();
    expect(del.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect((await linkAsAdmin(id))?.url).toBe('https://example.com/lesson');
  });
});

describe('row-level security on song_links is owner-only', () => {
  it("B can't see A's link, by id or by song", async () => {
    const id = await insertLink(a, songA);
    const byId = await b.client.from('song_links').select(SONG_LINK_SELECT).eq('id', id);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
    const bySong = await b.client.from('song_links').select('id').eq('song_id', songA);
    expect(bySong.error).toBeNull();
    expect(bySong.data).toEqual([]);
  });

  it("B's update of A's link changes no row", async () => {
    const id = await insertLink(a, songA);
    const { data, error } = await b.client
      .from('song_links')
      .update({ url: 'https://example.com/hacked' })
      .eq('id', id)
      .select('id');
    // The column is B's to write on B's own rows, so this is RLS, not the grant.
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await linkAsAdmin(id))?.url).toBe('https://example.com/lesson');
  });

  it("B can't delete A's link", async () => {
    const id = await insertLink(a, songA);
    const { data, error } = await b.client.from('song_links').delete().eq('id', id).select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await linkAsAdmin(id)).not.toBeNull();
  });

  it("B can't put a link on A's song, as B or as A", async () => {
    const asB = linkRow(b, songA);
    expect((await b.client.from('song_links').insert(asB)).error?.code).toBe(
      PG.FOREIGN_KEY_VIOLATION,
    );
    const asA = linkRow(a, songA);
    expect((await b.client.from('song_links').insert(asA)).error?.code).toBe(
      PG.INSUFFICIENT_PRIVILEGE,
    );
    expect(await linkAsAdmin(asB.id)).toBeNull();
    expect(await linkAsAdmin(asA.id)).toBeNull();
  });

  it('each user lists only their own links', async () => {
    const mine = await insertLink(a, songA);
    const theirs = await insertLink(b, songB);
    const seenByA = await a.client.from('song_links').select('id').in('id', [mine, theirs]);
    const seenByB = await b.client.from('song_links').select('id').in('id', [mine, theirs]);
    expect(seenByA.error).toBeNull();
    expect(seenByB.error).toBeNull();
    expect(seenByA.data).toEqual([{ id: mine }]);
    expect(seenByB.data).toEqual([{ id: theirs }]);
  });
});

describe('what the triggers and cascades do', () => {
  it('stamps created_at and updated_at from the server’s clock, and moves only updated_at on an edit', async () => {
    const id = await insertLink(a, songA);
    const before = await linkAsAdmin(id);
    expect(before?.created_at).toBe(before?.updated_at);
    expect(Math.abs(Date.parse(before!.created_at) - Date.now())).toBeLessThan(60_000);
    await waitForClockTick();
    const { error } = await a.client.from('song_links').update({ url: SPOTIFY }).eq('id', id);
    expect(error).toBeNull();
    const after = await linkAsAdmin(id);
    expect(after?.created_at).toBe(before?.created_at);
    expect(Date.parse(after!.updated_at)).toBeGreaterThan(Date.parse(before!.updated_at));
  });

  it('ignores timestamps sent by any role, the service role included', async () => {
    const row = {
      ...linkRow(a, songA),
      created_at: '2001-01-01T00:00:00.000Z',
      updated_at: '2001-01-01T00:00:00.000Z',
    };
    const { error } = await admin.from('song_links').insert(row);
    expect(error).toBeNull();
    const saved = await linkAsAdmin(row.id);
    expect(new Date(saved!.created_at).getUTCFullYear()).toBeGreaterThan(2001);
    expect(new Date(saved!.updated_at).getUTCFullYear()).toBeGreaterThan(2001);
  });

  it('deleting a song deletes its links, and no other song’s', async () => {
    const song = await insertSong(a);
    const gone = await insertLink(a, song, { kind: 'original' });
    const alsoGone = await insertLink(a, song);
    const kept = await insertLink(a, songA);
    const { error } = await a.client.from('songs').delete().eq('id', song).eq('user_id', a.id);
    expect(error).toBeNull();
    expect(await linkAsAdmin(gone)).toBeNull();
    expect(await linkAsAdmin(alsoGone)).toBeNull();
    expect(await linkAsAdmin(kept)).not.toBeNull();
  });

  it('deleting a user deletes their links', async () => {
    const leaving = await createTestUser('song-links-leaving');
    try {
      const song = await insertSong(leaving);
      const id = await insertLink(leaving, song);
      await deleteTestUser(leaving);
      expect(await linkAsAdmin(id)).toBeNull();
    } catch (error) {
      await deleteTestUser(leaving).catch(() => {});
      throw error;
    }
  });
});

describe('songs.last_played_at', () => {
  /** What the app sends (`markSongPlayed`): the update, reading back what was kept. */
  async function markPlayed(user: TestUser, songId: string, playedAt: string) {
    return user.client
      .from('songs')
      .update({ last_played_at: playedAt })
      .eq('id', songId)
      .eq('user_id', user.id)
      .select('last_played_at')
      .maybeSingle();
  }

  it('is null on a new song, and the client can set it', async () => {
    const song = await insertSong(a);
    expect((await songAsAdmin(song)).last_played_at).toBeNull();
    const { data, error } = await markPlayed(a, song, '2026-11-20T10:00:00.000Z');
    expect(error).toBeNull();
    expect(Date.parse(data!.last_played_at!)).toBe(Date.parse('2026-11-20T10:00:00.000Z'));
  });

  it('never moves back: an older time sent late changes nothing, and neither does the same time twice', async () => {
    const song = await insertSong(a);
    const newer = '2026-11-20T10:00:00.000Z';
    for (const playedAt of [newer, '2026-11-01T10:00:00.000Z', newer]) {
      const { data, error } = await markPlayed(a, song, playedAt);
      expect(error).toBeNull();
      // What comes back is what was kept, which is what the app shows.
      expect(Date.parse(data!.last_played_at!)).toBe(Date.parse(newer));
    }
  });

  it('can’t be cleared by the client once set', async () => {
    const song = await insertSong(a);
    expect((await markPlayed(a, song, '2026-11-20T10:00:00.000Z')).error).toBeNull();
    const { error } = await a.client.from('songs').update({ last_played_at: null }).eq('id', song);
    expect(error).toBeNull();
    expect((await songAsAdmin(song)).last_played_at).not.toBeNull();
  });

  it('keeps the server’s clock when the device’s runs ahead', async () => {
    const song = await insertSong(a);
    const { data, error } = await markPlayed(a, song, '2099-01-01T00:00:00.000Z');
    expect(error).toBeNull();
    expect(Math.abs(Date.parse(data!.last_played_at!) - Date.now())).toBeLessThan(60_000);
  });

  it('is never in the future on an insert either', async () => {
    const song = await insertSong(a, { last_played_at: '2099-01-01T00:00:00.000Z' });
    const saved = await songAsAdmin(song);
    expect(Math.abs(Date.parse(saved.last_played_at!) - Date.now())).toBeLessThan(60_000);
  });

  it('leaves title and artist edits as they were, and the file columns still fixed', async () => {
    const song = await insertSong(a);
    const renamed = await a.client.from('songs').update({ title: 'Renamed' }).eq('id', song);
    expect(renamed.error).toBeNull();
    const withTempo = await a.client
      .from('songs')
      .update({ last_played_at: '2026-11-20T10:00:00.000Z', bar_count: 99 })
      .eq('id', song);
    expect(withTempo.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect(await songAsAdmin(song)).toMatchObject({
      title: 'Renamed',
      bar_count: 16,
      last_played_at: null,
    });
  });

  it("B's write to A's song changes no row, and a song that is gone answers with none", async () => {
    const song = await insertSong(a);
    const asB = await b.client
      .from('songs')
      .update({ last_played_at: '2026-11-20T10:00:00.000Z' })
      .eq('id', song)
      .select('id');
    expect(asB.error).toBeNull();
    expect(asB.data).toEqual([]);
    expect((await songAsAdmin(song)).last_played_at).toBeNull();

    const gone = await markPlayed(a, crypto.randomUUID(), '2026-11-20T10:00:00.000Z');
    expect(gone.error).toBeNull();
    expect(gone.data).toBeNull();
  });

  it('signed-out clients can’t write it', async () => {
    const { error } = await anonClient()
      .from('songs')
      .update({ last_played_at: '2026-11-20T10:00:00.000Z' })
      .eq('id', songA)
      .select();
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
  });

  it('comes back with the Songs list’s select', async () => {
    const song = await insertSong(a);
    expect((await markPlayed(a, song, '2026-11-20T10:00:00.000Z')).error).toBeNull();
    // LIBRARY_SELECT in src/features/library/songForm.ts, written out (see the note at the top).
    const { data, error } = await a.client
      .from('songs')
      .select(
        'id, title, artist, original_tempo, bar_count, drum_track_index, created_at, last_played_at, loops(last_practiced_at)',
      )
      .eq('id', song)
      .single();
    expect(error).toBeNull();
    expect(Date.parse(data!.last_played_at!)).toBe(Date.parse('2026-11-20T10:00:00.000Z'));
    expect(data?.loops).toEqual([]);
  });
});

// 14 Test. The addresses are `parseSongLink`'s own output for odd pastes (songLinks.test.ts has
// the pastes), written out for the reason given at the top: what the parser saves, the checks take.
describe('the forms the parser saves pass the checks', () => {
  it.each([
    ['a video with a start time', 'youtube', `${WATCH}&t=90s`],
    ['a host in another script, as punycode', 'web', 'https://xn--mnchen-3ya.example/lesson'],
    [
      'a path in another script, encoded',
      'web',
      'https://example.com/%D0%BF%D1%83%D1%82%D1%8C?q=%D1%83%D0%B4%D0%B0%D1%80%D0%BD%D1%8B%D0%B5#%D1%87',
    ],
    ['an encoded space and NUL', 'web', 'https://example.com/a%20b/x%00y'],
    ['an address with a port and a fragment', 'web', 'https://example.com:8443/x?a=1&a=2#part-2'],
    ['a bare host', 'web', 'https://a.b/'],
    ['an IP address', 'web', 'https://127.0.0.1/x'],
    ['a YouTube page that is no video', 'web', 'https://www.youtube.com/@somedrummer'],
  ] as const)('takes %s and gives it back unchanged', async (_name, provider, url) => {
    const id = await insertLink(a, songA, { provider, url });
    expect(await linkAsAdmin(id)).toMatchObject({ provider, url });
  });

  it.each([
    ['a space inside', 'https://example.com/a b'],
    ['a line break at the end', 'https://example.com/a\n'],
    ['a tab inside', 'https://example.com/a\tb'],
    ['capitals in the scheme', 'HTTPS://example.com/a'],
    ['nothing after the scheme', 'https://'],
  ])('refuses %s, which the parser never saves', async (_name, url) => {
    const row = linkRow(a, songA, { url });
    const { error } = await a.client.from('song_links').insert(row);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect(await linkAsAdmin(row.id)).toBeNull();
  });
});

// What each step of the form's save meets when another tab or device got there first.
describe('a save’s steps after another device has changed the links', () => {
  it('an update of a link removed since is no error and changes no row: only the row asked back tells', async () => {
    const song = await insertSong(a);
    const id = await insertLink(a, song, { kind: 'original', provider: 'youtube', url: WATCH });
    const removed = await a.client.from('song_links').delete().eq('id', id).eq('user_id', a.id);
    expect(removed.error).toBeNull();

    // Sent bare, nothing says no row was there (how the form once closed on a link that had gone).
    const blind = await a.client
      .from('song_links')
      .update({ provider: 'spotify', url: SPOTIFY })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(blind.error).toBeNull();
    // As `updateSongLink` sends it, asking for the row: the empty answer is what it reports as gone.
    const asked = await a.client
      .from('song_links')
      .update({ provider: 'spotify', url: SPOTIFY })
      .eq('id', id)
      .eq('user_id', a.id)
      .select('id')
      .maybeSingle();
    expect(asked.error).toBeNull();
    expect(asked.data).toBeNull();
    const { data, error } = await admin.from('song_links').select('id').eq('song_id', song);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('a removal of a link already gone is no error, so a removal sent twice is safe', async () => {
    const id = await insertLink(a, songA);
    for (const attempt of [1, 2]) {
      const { error } = await a.client
        .from('song_links')
        .delete()
        .in('id', [id])
        .eq('user_id', a.id);
      expect(error, `attempt ${attempt}`).toBeNull();
    }
    expect(await linkAsAdmin(id)).toBeNull();
  });

  it('a second Original under a new id is a duplicate key with no row of that id, which the app reports as a refusal', async () => {
    const song = await insertSong(a);
    const theirs = await insertLink(a, song, {
      kind: 'original',
      provider: 'spotify',
      url: SPOTIFY,
    });
    const mine = linkRow(a, song, { kind: 'original', provider: 'youtube', url: WATCH });
    const inserted = await a.client.from('song_links').insert(mine);
    expect(inserted.error?.code).toBe(PG.UNIQUE_VIOLATION);
    // The app's next step: is it my own row, saved by a press whose answer was lost? No.
    const mineThere = await a.client
      .from('song_links')
      .update({ provider: mine.provider, url: mine.url })
      .eq('id', mine.id)
      .eq('user_id', a.id)
      .select('id')
      .maybeSingle();
    expect(mineThere.error).toBeNull();
    expect(mineThere.data).toBeNull();
    expect(await linkAsAdmin(theirs)).toMatchObject({ provider: 'spotify', url: SPOTIFY });
  });

  it('the same time played sent twice, and an older one after it, leave one time: the write needs no order', async () => {
    const song = await insertSong(a);
    const times = [
      '2026-11-20T10:00:05.000Z',
      '2026-11-20T10:00:05.000Z',
      '2026-11-20T10:00:00.000Z',
    ];
    for (const time of times) {
      const { error } = await a.client
        .from('songs')
        .update({ last_played_at: time })
        .eq('id', song)
        .eq('user_id', a.id);
      expect(error).toBeNull();
    }
    expect(Date.parse((await songAsAdmin(song)).last_played_at!)).toBe(Date.parse(times[0]!));
  });
});

// Unit 19: 20261201000000_song_link_bar_one.sql.
describe('song_links.bar_one_seconds (where bar 1 falls in the video)', () => {
  /** The write the app sends (`saveBarOne`): the row is asked for back. */
  const saveBarOne = (user: TestUser, id: string, barOneSeconds: number | null) =>
    user.client
      .from('song_links')
      .update({ bar_one_seconds: barOneSeconds })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, bar_one_seconds')
      .maybeSingle();

  it('is null on a new link, and the client can set it, move it and clear it', async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBeNull();

    const lined = await saveBarOne(a, id, 7.432);
    expect(lined.error).toBeNull();
    // A number, as the app compares it, to the millisecond it was sent with.
    expect(lined.data).toEqual({ id, bar_one_seconds: 7.432 });

    const nudged = await saveBarOne(a, id, 7.682);
    expect(nudged.data).toEqual({ id, bar_one_seconds: 7.682 });
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(7.682);

    const cleared = await saveBarOne(a, id, null);
    expect(cleared.error).toBeNull();
    expect(cleared.data).toEqual({ id, bar_one_seconds: null });
  });

  it('can be sent with a new link', async () => {
    const row = linkRow(a, songA, { provider: 'youtube', url: WATCH, bar_one_seconds: 12.5 });
    expect((await a.client.from('song_links').insert(row)).error).toBeNull();
    expect((await linkAsAdmin(row.id))?.bar_one_seconds).toBe(12.5);
  });

  it.each([
    ['the video’s start', 0],
    ['twelve hours in', 43200],
  ])('takes %s', async (_name, seconds) => {
    const id = await insertLink(a, songA);
    const { data, error } = await saveBarOne(a, id, seconds);
    expect(error).toBeNull();
    expect(data).toEqual({ id, bar_one_seconds: seconds });
  });

  it.each([
    ['before the video’s start', -0.001],
    ['past twelve hours', 43200.001],
  ])('refuses a time %s, and keeps the one it had', async (_name, seconds) => {
    const id = await insertLink(a, songA);
    expect((await saveBarOne(a, id, 30)).error).toBeNull();
    const { error } = await saveBarOne(a, id, seconds);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(30);
  });

  it('refuses a new link whose time is out of range, leaving no row', async () => {
    const row = linkRow(a, songA, { bar_one_seconds: -5 });
    const { error } = await a.client.from('song_links').insert(row);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect(await linkAsAdmin(row.id)).toBeNull();
  });

  it('a link pointed at another address loses its line-up; one saved again as it was keeps it', async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
    expect((await saveBarOne(a, id, 7.25)).error).toBeNull();

    // The recordings form's update, this build's and the one before it: it never names the column.
    const same = await a.client
      .from('song_links')
      .update({ provider: 'youtube', url: WATCH })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(same.error).toBeNull();
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(7.25);

    const moved = await a.client
      .from('song_links')
      .update({ provider: 'youtube', url: `${WATCH}&t=30s` })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(moved.error).toBeNull();
    expect(await linkAsAdmin(id)).toMatchObject({ url: `${WATCH}&t=30s`, bar_one_seconds: null });
  });

  it('a write that points the link elsewhere and lines it up in one keeps the new line-up', async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
    expect((await saveBarOne(a, id, 7.25)).error).toBeNull();
    const { error } = await a.client
      .from('song_links')
      .update({ url: `${WATCH}&t=45s`, bar_one_seconds: 3 })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(error).toBeNull();
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(3);
  });

  // 19 QA issue 6: the app's save is for the video the line-up was made on, matched by `url`.
  describe('a line-up sent for the address the link had', () => {
    /** `saveBarOne` in songLinksApi.ts: the same write, filtered on the address the page knew. */
    const saveFor = (user: TestUser, id: string, url: string, barOneSeconds: number | null) =>
      user.client
        .from('song_links')
        .update({ bar_one_seconds: barOneSeconds })
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('url', url)
        .select('id, bar_one_seconds')
        .maybeSingle();

    it('is saved while the link still has that address, whatever characters it holds', async () => {
      // A start time and a query: characters a filter in the request's address must carry whole.
      const url = `${WATCH}&t=30s&list=PL_a-b.c~d`;
      const id = await insertLink(a, songA, { provider: 'youtube', url });
      const saved = await saveFor(a, id, url, 5.58);
      expect(saved.error).toBeNull();
      expect(saved.data).toEqual({ id, bar_one_seconds: 5.58 });
    });

    it('matches nothing once the link points at another video, and leaves the new one not lined up', async () => {
      const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
      expect((await saveFor(a, id, WATCH, 5.58)).data).toEqual({ id, bar_one_seconds: 5.58 });
      // Another device points the link elsewhere: its line-up is cleared.
      const moved = await a.client
        .from('song_links')
        .update({ provider: 'youtube', url: `${WATCH}&t=30s` })
        .eq('id', id)
        .eq('user_id', a.id);
      expect(moved.error).toBeNull();

      // The page that hasn't heard nudges the old video's line-up.
      const late = await saveFor(a, id, WATCH, 5.83);
      // No error and no row: the app then looks the link up to say "changed" or "removed".
      expect(late.error).toBeNull();
      expect(late.data).toBeNull();
      expect(await linkAsAdmin(id)).toMatchObject({
        url: `${WATCH}&t=30s`,
        bar_one_seconds: null,
      });
      const still = await a.client
        .from('song_links')
        .select('id')
        .eq('id', id)
        .eq('user_id', a.id)
        .maybeSingle();
      expect(still.error).toBeNull();
      expect(still.data).toEqual({ id });
    });
  });

  it('adds nothing else to what a client may update: the song, the kind and the timestamps stay refused', async () => {
    const id = await insertLink(a, songA);
    const other = await insertSong(a);
    const refused: TablesUpdate<'song_links'>[] = [
      { bar_one_seconds: 5, song_id: other },
      { bar_one_seconds: 5, kind: 'original' },
      { bar_one_seconds: 5, updated_at: new Date().toISOString() },
    ];
    for (const change of refused) {
      const { error } = await a.client
        .from('song_links')
        .update(change)
        .eq('id', id)
        .eq('user_id', a.id);
      expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    }
    expect(await linkAsAdmin(id)).toMatchObject({
      song_id: songA,
      kind: 'other',
      bar_one_seconds: null,
    });
  });

  it("B's line-up of A's link changes no row, and tells B so by the row not coming back", async () => {
    const id = await insertLink(a, songA);
    expect((await saveBarOne(a, id, 9)).error).toBeNull();
    // As B would have to send it to reach the row at all: without the user_id filter.
    const { data, error } = await b.client
      .from('song_links')
      .update({ bar_one_seconds: 1 })
      .eq('id', id)
      .select('id, bar_one_seconds')
      .maybeSingle();
    // RLS, not a missing grant: no error, and no row.
    expect(error).toBeNull();
    expect(data).toBeNull();
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(9);
  });

  it('a line-up of a link removed since is no error and no row: the app says it has gone', async () => {
    const id = await insertLink(a, songA);
    const removed = await a.client.from('song_links').delete().eq('id', id).eq('user_id', a.id);
    expect(removed.error).toBeNull();
    const { data, error } = await saveBarOne(a, id, 4);
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('signed-out clients can’t write it', async () => {
    const id = await insertLink(a, songA);
    const { error } = await anonClient()
      .from('song_links')
      .update({ bar_one_seconds: 4 })
      .eq('id', id);
    expect(error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBeNull();
  });

  it('two nudges sent one after the other end on the later one, whichever read comes between', async () => {
    const id = await insertLink(a, songA);
    expect((await saveBarOne(a, id, 4.25)).data).toEqual({ id, bar_one_seconds: 4.25 });
    expect((await saveBarOne(a, id, 4.5)).data).toEqual({ id, bar_one_seconds: 4.5 });
    const { data, error } = await a.client
      .from('song_links')
      .select(SONG_LINK_SELECT)
      .eq('id', id)
      .single();
    expect(error).toBeNull();
    expect(data?.bar_one_seconds).toBe(4.5);
  });

  // 19 Test: the check's edges, what the trigger leaves alone, and who can read the column.
  it.each([
    ['a millisecond in', 0.001],
    ['a millisecond short of twelve hours', 43199.999],
    ['a nudge’s quarter second', 0.25],
  ])('keeps %s exactly as sent', async (_name, seconds) => {
    const id = await insertLink(a, songA);
    const { data, error } = await saveBarOne(a, id, seconds);
    expect(error).toBeNull();
    expect(data).toEqual({ id, bar_one_seconds: seconds });
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(seconds);
  });

  it.each([
    // PostgREST reads these words into the numeric column; the range check is what stops them.
    ['not a number', 'NaN'],
    ['without end', 'Infinity'],
    ['without end the other way', '-Infinity'],
  ])('refuses a time that is %s, and keeps the one it had', async (_name, word) => {
    const id = await insertLink(a, songA);
    expect((await saveBarOne(a, id, 30)).error).toBeNull();
    const { error } = await saveBarOne(a, id, word as never);
    expect(error?.code).toBe(PG.CHECK_VIOLATION);
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(30);
  });

  it('refuses words that aren’t a number at all, and keeps the one it had', async () => {
    const id = await insertLink(a, songA);
    expect((await saveBarOne(a, id, 30)).error).toBeNull();
    const { error } = await saveBarOne(a, id, 'soon' as never);
    expect(error?.code).toBe(PG.INVALID_TEXT_REPRESENTATION);
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(30);
  });

  it('a nudge moves nothing but the line-up and updated_at: the address, the kind and created_at stay', async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: `${WATCH}&t=30s` });
    expect((await saveBarOne(a, id, 7)).error).toBeNull();
    const before = await linkAsAdmin(id);
    await waitForClockTick();
    expect((await saveBarOne(a, id, 7.25)).error).toBeNull();
    const after = await linkAsAdmin(id);
    expect(after).toEqual({
      ...before,
      bar_one_seconds: 7.25,
      updated_at: after?.updated_at,
    });
    expect(Date.parse(after!.updated_at)).toBeGreaterThan(Date.parse(before!.updated_at));
  });

  it('the trigger clears a line-up only for a new address: other edits of the row leave it', async () => {
    const song = await insertSong(a);
    const id = await insertLink(a, song, { provider: 'youtube', url: WATCH });
    expect((await saveBarOne(a, id, 7.25)).error).toBeNull();

    // An edit only the service role can make (the kind), and the client's own provider-and-address
    // write with the address unchanged: neither is a new video.
    const kind = await admin.from('song_links').update({ kind: 'original' }).eq('id', id);
    expect(kind.error).toBeNull();
    expect(await linkAsAdmin(id)).toMatchObject({ kind: 'original', bar_one_seconds: 7.25 });
    const same = await a.client
      .from('song_links')
      .update({ url: WATCH })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(same.error).toBeNull();
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(7.25);

    // Pointed at Spotify, then back at the video: the line-up doesn't come back with the address.
    const away = await a.client
      .from('song_links')
      .update({ provider: 'spotify', url: SPOTIFY })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(away.error).toBeNull();
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBeNull();
    const back = await a.client
      .from('song_links')
      .update({ provider: 'youtube', url: WATCH })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(back.error).toBeNull();
    expect(await linkAsAdmin(id)).toMatchObject({ url: WATCH, bar_one_seconds: null });
  });

  it('a new address on a link that was never lined up changes only the address', async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
    const { error } = await a.client
      .from('song_links')
      .update({ url: `${WATCH}&t=10s` })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(error).toBeNull();
    expect(await linkAsAdmin(id)).toMatchObject({ url: `${WATCH}&t=10s`, bar_one_seconds: null });
  });

  it('a write that points the link elsewhere and clears the line-up in one leaves it cleared', async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
    expect((await saveBarOne(a, id, 7.25)).error).toBeNull();
    const { error } = await a.client
      .from('song_links')
      .update({ url: `${WATCH}&t=45s`, bar_one_seconds: null })
      .eq('id', id)
      .eq('user_id', a.id);
    expect(error).toBeNull();
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBeNull();
  });

  it('only its owner reads it: B and a signed-out client get no row', async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
    expect((await saveBarOne(a, id, 12)).error).toBeNull();
    // The owner's read finds it, so the empty answers below are RLS and not a wrong id.
    const own = await a.client.from('song_links').select('id, bar_one_seconds').eq('id', id);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ id, bar_one_seconds: 12 }]);

    const others = await b.client.from('song_links').select('id, bar_one_seconds').eq('id', id);
    expect(others.error).toBeNull();
    expect(others.data).toEqual([]);
    const signedOut = await anonClient().from('song_links').select('bar_one_seconds').eq('id', id);
    expect(signedOut.error?.code).toBe(PG.INSUFFICIENT_PRIVILEGE);
  });

  it("B can't put a lined-up link on A's song, and can't take A's line-up away by deleting or clearing it", async () => {
    const id = await insertLink(a, songA, { provider: 'youtube', url: WATCH });
    expect((await saveBarOne(a, id, 12)).error).toBeNull();

    const planted = linkRow(b, songA, { bar_one_seconds: 3 });
    const insert = await b.client.from('song_links').insert(planted);
    // The link names its own user and another user's song: no such (song, user) pair.
    expect(insert.error?.code).toBe(PG.FOREIGN_KEY_VIOLATION);
    expect(await linkAsAdmin(planted.id)).toBeNull();

    const cleared = await b.client
      .from('song_links')
      .update({ bar_one_seconds: null })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    expect(cleared.error).toBeNull();
    expect(cleared.data).toBeNull();
    const removed = await b.client.from('song_links').delete().eq('id', id).select('id');
    expect(removed.error).toBeNull();
    expect(removed.data).toEqual([]);
    expect((await linkAsAdmin(id))?.bar_one_seconds).toBe(12);
  });
});
