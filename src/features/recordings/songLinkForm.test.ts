import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyLinkSave,
  draftOfPlan,
  EMPTY_LINK_DRAFT,
  isEmptyPlan,
  linkFields,
  planLinkSave,
  SONG_LINK_BAR_ONE_FIELDS,
  SONG_LINK_EDIT_FIELDS,
  SONG_LINK_FIELDS,
  SONG_LINK_INSERT_FIELDS,
  SONG_LINK_SELECT,
  type LinkDraft,
  type SongLinkRow,
} from './songLinkForm';

const SONG = 'song-1';
const NEW_IDS = { original: 'new-original', drumless: 'new-drumless' };
const WATCH = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

function linkRow(id: string, overrides: Partial<SongLinkRow> = {}): SongLinkRow {
  return {
    id,
    song_id: SONG,
    kind: 'other',
    provider: 'web',
    url: `https://example.com/${id}`,
    created_at: '2026-11-20T10:00:00Z',
    bar_one_seconds: null,
    ...overrides,
  };
}

const original = linkRow('o', { kind: 'original', provider: 'youtube', url: WATCH });
const draftOf = (texts: LinkDraft['texts'], added: string[] = []): LinkDraft => ({ texts, added });
const planOf = (saved: SongLinkRow[], draft: LinkDraft) => {
  const check = planLinkSave(linkFields(saved, draft, NEW_IDS));
  if (!check.ok) throw new Error(`refused: ${JSON.stringify(check.errors)}`);
  return check.plan;
};

describe('columns and grants', () => {
  it('SONG_LINK_SELECT names exactly SONG_LINK_FIELDS', () => {
    expect(SONG_LINK_SELECT.split(', ')).toEqual([...SONG_LINK_FIELDS]);
  });

  it('the insert and update fields are the two migrations’ column grants', () => {
    const migration = (name: string) =>
      readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
    const added = SONG_LINK_BAR_ONE_FIELDS as readonly string[];
    const first = (fields: readonly string[]) => fields.filter((field) => !added.includes(field));
    // Unit 14's table, then the column Unit 19 added to each grant.
    const links = migration('20261130000000_song_links.sql');
    expect(links).toContain(
      `grant insert (${first(SONG_LINK_INSERT_FIELDS).join(', ')}) on public.song_links to authenticated`,
    );
    expect(links).toContain(
      `grant update (${first(SONG_LINK_EDIT_FIELDS).join(', ')}) on public.song_links to authenticated`,
    );
    const barOne = migration('20261201000000_song_link_bar_one.sql');
    for (const verb of ['insert', 'update']) {
      expect(barOne).toContain(
        `grant ${verb} (${added.join(', ')}) on public.song_links to authenticated`,
      );
    }
    // Every field is in one grant or the other, and no migration grants more.
    expect([...first(SONG_LINK_INSERT_FIELDS), ...added]).toEqual([...SONG_LINK_INSERT_FIELDS]);
    expect([...first(SONG_LINK_EDIT_FIELDS), ...added]).toEqual([...SONG_LINK_EDIT_FIELDS]);
    const grants = [links, barOne].flatMap(
      (sql) => sql.match(/grant (insert|update) \([^)]*\) on public\.song_links/g) ?? [],
    );
    expect(grants).toHaveLength(4);
  });
});

describe('linkFields', () => {
  it('is Original and Drumless, empty, for a song with no links', () => {
    expect(linkFields([], EMPTY_LINK_DRAFT, NEW_IDS)).toEqual([
      { slot: 'original', kind: 'original', id: 'new-original', saved: null, text: '' },
      { slot: 'drumless', kind: 'drumless', id: 'new-drumless', saved: null, text: '' },
    ]);
  });

  it('shows saved links, the others oldest first, then the ones being added', () => {
    const later = linkRow('b', { created_at: '2026-11-22T10:00:00Z' });
    const earlier = linkRow('a', { created_at: '2026-11-21T10:00:00Z' });
    const fields = linkFields([later, original, earlier], draftOf({}, ['x']), NEW_IDS);
    expect(fields.map((field) => [field.slot, field.id, field.text])).toEqual([
      ['original', 'o', WATCH],
      ['drumless', 'new-drumless', ''],
      ['other:a', 'a', 'https://example.com/a'],
      ['other:b', 'b', 'https://example.com/b'],
      ['other:x', 'x', ''],
    ]);
  });

  it('shows what was typed over what is saved, and a refetched link under an untouched field', () => {
    const draft = draftOf({ drumless: 'typed' });
    const before = linkFields([original], draft, NEW_IDS);
    expect(before[1]).toMatchObject({ text: 'typed', id: 'new-drumless' });
    const moved = { ...original, url: `${WATCH}&t=30s` };
    const drumless = linkRow('d', { kind: 'drumless', provider: 'spotify', url: SPOTIFY });
    const after = linkFields([moved, drumless], draft, NEW_IDS);
    expect(after[0]).toMatchObject({ text: `${WATCH}&t=30s` });
    // Saved on another device meanwhile: the field now writes that row, and keeps the typing.
    expect(after[1]).toMatchObject({ text: 'typed', id: 'd', saved: drumless });
  });

  it('lists an added link once, after its save got through with the answer lost', () => {
    const draft = draftOf({ 'other:x': 'https://example.com/new' }, ['x']);
    const landed = linkRow('x', { url: 'https://example.com/new' });
    const fields = linkFields([landed], draft, NEW_IDS);
    expect(fields.filter((field) => field.slot === 'other:x')).toHaveLength(1);
    expect(planOf([landed], draft)).toEqual({ removals: [], updates: [], inserts: [] });
  });
});

describe('planLinkSave', () => {
  it('sends nothing for a form nobody touched', () => {
    const plan = planOf([original, linkRow('a')], EMPTY_LINK_DRAFT);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('adds a first link in the parser’s form, under the form’s own id', () => {
    expect(planOf([], draftOf({ original: ' https://youtu.be/dQw4w9WgXcQ?si=abc ' }))).toEqual({
      removals: [],
      updates: [],
      inserts: [{ id: 'new-original', kind: 'original', provider: 'youtube', url: WATCH }],
    });
  });

  it('adds a second kind beside the first without touching it', () => {
    expect(planOf([original], draftOf({ drumless: SPOTIFY }))).toEqual({
      removals: [],
      updates: [],
      inserts: [{ id: 'new-drumless', kind: 'drumless', provider: 'spotify', url: SPOTIFY }],
    });
  });

  it('points a saved link elsewhere by updating its row', () => {
    expect(planOf([original], draftOf({ original: SPOTIFY }))).toEqual({
      removals: [],
      updates: [{ id: 'o', provider: 'spotify', url: SPOTIFY }],
      inserts: [],
    });
  });

  it('removes a saved link whose field was emptied', () => {
    expect(planOf([original, linkRow('a')], draftOf({ 'other:a': '  ' }))).toEqual({
      removals: ['a'],
      updates: [],
      inserts: [],
    });
  });

  it('adds other links and skips the ones left empty', () => {
    const draft = draftOf({ 'other:x': 'example.com/lesson' }, ['x', 'y']);
    expect(planOf([], draft).inserts).toEqual([
      { id: 'x', kind: 'other', provider: 'web', url: 'https://example.com/lesson' },
    ]);
  });

  it('sends nothing for a field retyped as the same link in another form', () => {
    const draft = draftOf({ original: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(isEmptyPlan(planOf([original], draft))).toBe(true);
  });

  it('never rewrites a saved link that wasn’t touched, even one not in the parser’s form', () => {
    const odd = linkRow('a', { url: 'https://example.com/x?utm_source=share' });
    // Another field changes; the untouched one stays as it is stored.
    const plan = planOf([odd], draftOf({ original: WATCH }));
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
  });

  it('refuses the whole save when any field isn’t a link it takes, naming each', () => {
    const fields = linkFields(
      [original],
      draftOf({ original: 'javascript:alert(1)', drumless: SPOTIFY, 'other:x': 'hello' }, ['x']),
      NEW_IDS,
    );
    expect(planLinkSave(fields)).toEqual({
      ok: false,
      errors: { original: 'notHttps', 'other:x': 'notALink' },
    });
  });
});

describe('applyLinkSave', () => {
  it('shows the saved links as the plan left them', () => {
    const rows = [original, linkRow('a'), linkRow('b')];
    const plan = {
      removals: ['a'],
      updates: [{ id: 'o', provider: 'spotify' as const, url: SPOTIFY }],
      inserts: [{ id: 'n', kind: 'drumless' as const, provider: 'youtube' as const, url: WATCH }],
    };
    expect(applyLinkSave(rows, SONG, plan, '2026-11-27T09:00:00Z')).toEqual([
      { ...original, provider: 'spotify', url: SPOTIFY },
      linkRow('b'),
      {
        id: 'n',
        song_id: SONG,
        kind: 'drumless',
        provider: 'youtube',
        url: WATCH,
        created_at: '2026-11-27T09:00:00Z',
        bar_one_seconds: null,
      },
    ]);
  });

  it('a link pointed at another address loses its line-up, as the database’s trigger does', () => {
    const lined = { ...original, bar_one_seconds: 7.25 };
    const other = linkRow('a', { bar_one_seconds: 3 });
    const moved = {
      removals: [],
      updates: [{ id: 'o', provider: 'spotify' as const, url: SPOTIFY }],
      inserts: [],
    };
    expect(applyLinkSave([lined, other], SONG, moved, '2026-11-27T09:00:00Z')).toEqual([
      { ...original, provider: 'spotify', url: SPOTIFY, bar_one_seconds: null },
      other,
    ]);
    // The same address again (a save pressed twice) keeps it.
    const same = {
      removals: [],
      updates: [{ id: 'o', provider: 'youtube' as const, url: WATCH }],
      inserts: [],
    };
    expect(applyLinkSave([lined], SONG, same, '2026-11-27T09:00:00Z')).toEqual([lined]);
  });

  it('doesn’t list a link twice when the list already has the row a plan added', () => {
    const plan = {
      removals: [],
      updates: [],
      inserts: [
        { id: 'a', kind: 'other' as const, provider: 'web' as const, url: 'https://x.test/' },
      ],
    };
    expect(applyLinkSave([linkRow('a')], SONG, plan, '2026-11-27T09:00:00Z')).toHaveLength(1);
  });

  // Copilot review on #34: an insert whose answer was lost is sent again with a changed
  // address, and a read in between cached the row the first send made. The server then holds
  // the new address; skipping the listed row left the old one cached if the next read failed.
  it('gives a row the list already has the address the plan added it with', () => {
    const listed = linkRow('a', { kind: 'drumless', provider: 'youtube', url: WATCH });
    const plan = {
      removals: [],
      updates: [],
      inserts: [{ id: 'a', kind: 'drumless' as const, provider: 'spotify' as const, url: SPOTIFY }],
    };
    expect(applyLinkSave([listed], SONG, plan, '2026-11-27T09:00:00Z')).toEqual([
      { ...listed, provider: 'spotify', url: SPOTIFY },
    ]);
  });
});

// 14 Review: a form opened again while a save is on its way shows what that save is sending.
describe('draftOfPlan', () => {
  const saved = [original, linkRow('a'), linkRow('b', { created_at: '2026-11-20T10:00:01Z' })];

  it('gives the fields the plan’s values: a change, a removal, a first Drumless and an added link', () => {
    const typed = draftOf(
      {
        original: 'youtu.be/aaaaaaaaaaa?si=abc',
        drumless: `${SPOTIFY}?si=abc`,
        'other:a': '',
        'other:new': 'example.com/new',
      },
      ['new'],
    );
    const plan = planOf(saved, typed);
    // A form opened later has ids of its own for a new Original and Drumless.
    const shown = linkFields(saved, draftOfPlan(saved, plan), { original: 'x', drumless: 'y' });
    expect(shown.map(({ slot, text }) => [slot, text])).toEqual([
      ['original', 'https://www.youtube.com/watch?v=aaaaaaaaaaa'],
      ['drumless', SPOTIFY],
      ['other:a', ''],
      // Left alone by the plan: shown as it is saved.
      ['other:b', 'https://example.com/b'],
      ['other:new', 'https://example.com/new'],
    ]);
  });

  it('is empty for a plan that changes nothing, and leaves out a change to a link no longer saved', () => {
    expect(draftOfPlan(saved, { removals: [], updates: [], inserts: [] })).toEqual(
      EMPTY_LINK_DRAFT,
    );
    const gone = {
      removals: ['zz'],
      updates: [{ id: 'yy', provider: 'web' as const, url: WATCH }],
      inserts: [],
    };
    expect(draftOfPlan(saved, gone)).toEqual(EMPTY_LINK_DRAFT);
  });
});
