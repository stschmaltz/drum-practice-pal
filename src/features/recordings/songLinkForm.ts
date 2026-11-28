/**
 * The song_links columns the app reads, and the "Manage recordings" form's
 * rules: its fields, what a Save sends, and what the cache holds afterwards.
 * Pure, with no client import, so songLinksApi.ts, the form and node tests
 * share it. What a link is lives in songLinks.ts.
 */
import type { Database } from '@/lib/database.types';
import type { SongLinkKind, SongLinkProvider } from '@/lib/schema';
import { oldestFirst, parseSongLink, type LinkRefusal, type RecordingSource } from './songLinks';

type SongLinkTableRow = Database['public']['Tables']['song_links']['Row'];

export const SONG_LINK_FIELDS = [
  'id',
  'song_id',
  'kind',
  'provider',
  'url',
  'created_at',
  'bar_one_seconds',
] as const satisfies readonly (keyof SongLinkTableRow)[];

/** A literal, so supabase-js can type the selected row. Tested against SONG_LINK_FIELDS. */
export const SONG_LINK_SELECT = 'id, song_id, kind, provider, url, created_at, bar_one_seconds';

export type SongLinkRow = Pick<SongLinkTableRow, (typeof SONG_LINK_FIELDS)[number]>;

/**
 * The update grants: a saved link's song and kind never change, only where it
 * points (20261130000000_song_links.sql) and where its video's bar 1 is
 * (20261201000000_song_link_bar_one.sql, Unit 19). A test checks them against
 * the two migrations.
 */
export const SONG_LINK_EDIT_FIELDS = ['provider', 'url', 'bar_one_seconds'] as const;
/** The insert grants, likewise. */
export const SONG_LINK_INSERT_FIELDS = [
  'id',
  'user_id',
  'song_id',
  'kind',
  'provider',
  'url',
  'bar_one_seconds',
] as const;
/** What each of those lists gained in Unit 19's migration. */
export const SONG_LINK_BAR_ONE_FIELDS = ['bar_one_seconds'] as const;

/** A field's place in the form: the two single links, a saved other link, or one being added. */
export type LinkSlot = RecordingSource | `other:${string}`;

/** The slot of the other link with this id, saved or being added. */
export const otherLinkSlot = (id: string): LinkSlot => `other:${id}`;

/**
 * What the user has typed, by slot, and nothing else: an untouched field
 * shows the saved link, so one changed on another device shows through.
 */
export interface LinkDraft {
  texts: Partial<Record<LinkSlot, string>>;
  /** Ids of other links added in this form, in the order they were added. */
  added: readonly string[];
}

export const EMPTY_LINK_DRAFT: LinkDraft = { texts: {}, added: [] };

/** The ids a form's new Original and Drumless take, made once when it opens. */
export type NewLinkIds = Record<RecordingSource, string>;

export interface LinkField {
  slot: LinkSlot;
  kind: SongLinkKind;
  /**
   * The row this field writes: the saved link's, or the id its new row will
   * take. The same at every press of Save, so a save whose answer was lost
   * can be pressed again without adding the link twice.
   */
  id: string;
  saved: SongLinkRow | null;
  text: string;
}

/** The form's fields: Original, Drumless, the saved other links oldest first, then the ones being added. */
export function linkFields(
  saved: readonly SongLinkRow[],
  draft: LinkDraft,
  newIds: NewLinkIds,
): LinkField[] {
  const single = (kind: RecordingSource): LinkField => {
    const row = saved.find((link) => link.kind === kind) ?? null;
    return {
      slot: kind,
      kind,
      id: row?.id ?? newIds[kind],
      saved: row,
      text: draft.texts[kind] ?? row?.url ?? '',
    };
  };
  const others = saved.filter((link) => link.kind === 'other').sort(oldestFirst);
  const savedIds = new Set(others.map((link) => link.id));
  return [
    single('original'),
    single('drumless'),
    ...others.map((row): LinkField => {
      const slot = otherLinkSlot(row.id);
      return { slot, kind: 'other', id: row.id, saved: row, text: draft.texts[slot] ?? row.url };
    }),
    // One whose save got through with its answer lost is among the saved ones by now.
    ...draft.added
      .filter((id) => !savedIds.has(id))
      .map((id): LinkField => {
        const slot = otherLinkSlot(id);
        return { slot, kind: 'other', id, saved: null, text: draft.texts[slot] ?? '' };
      }),
  ];
}

export interface LinkInsert {
  id: string;
  kind: SongLinkKind;
  provider: SongLinkProvider;
  url: string;
}

export interface LinkUpdate {
  id: string;
  provider: SongLinkProvider;
  url: string;
}

/** What one press of Save sends: links to remove, to point elsewhere, and to add. */
export interface LinkSavePlan {
  removals: string[];
  updates: LinkUpdate[];
  inserts: LinkInsert[];
}

export type LinkSaveCheck =
  { ok: true; plan: LinkSavePlan } | { ok: false; errors: Partial<Record<LinkSlot, LinkRefusal>> };

/** What the parser makes of a field, for the line under it; null while it is empty. */
export function fieldReading(field: Pick<LinkField, 'text'>) {
  return field.text.trim() === '' ? null : parseSongLink(field.text);
}

/**
 * What Save would send, or the fields it can't save. A saved link whose text
 * is as it was saved is left alone (never rewritten in the parser's form); an
 * emptied one is removed; anything else must be a link the parser takes, and
 * is saved in the parser's form.
 */
export function planLinkSave(fields: readonly LinkField[]): LinkSaveCheck {
  const plan: LinkSavePlan = { removals: [], updates: [], inserts: [] };
  const errors: Partial<Record<LinkSlot, LinkRefusal>> = {};
  for (const field of fields) {
    if (field.saved && field.text === field.saved.url) continue;
    if (field.text.trim() === '') {
      if (field.saved) plan.removals.push(field.saved.id);
      continue;
    }
    const parsed = parseSongLink(field.text);
    if (!parsed.ok) {
      errors[field.slot] = parsed.reason;
      continue;
    }
    const { provider, url } = parsed.link;
    if (!field.saved) plan.inserts.push({ id: field.id, kind: field.kind, provider, url });
    else if (url !== field.saved.url || provider !== field.saved.provider) {
      plan.updates.push({ id: field.saved.id, provider, url });
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, plan };
}

/**
 * A save still on its way, as a draft: what its fields hold, in the form each
 * link is saved in. For a form opened again while that save is pending (the
 * page's links can take the first form away mid-save): it has no draft of its
 * own and is locked, and shows this, not the links as they were before the
 * save under "Saving…". A link the plan leaves alone isn't in it, so its
 * field shows the saved link as always.
 */
export function draftOfPlan(saved: readonly SongLinkRow[], plan: LinkSavePlan): LinkDraft {
  const slotOf = (kind: SongLinkKind, id: string): LinkSlot =>
    kind === 'other' ? otherLinkSlot(id) : kind;
  const texts: LinkDraft['texts'] = {};
  const added: string[] = [];
  for (const row of saved) {
    if (plan.removals.includes(row.id)) texts[slotOf(row.kind, row.id)] = '';
  }
  for (const update of plan.updates) {
    const row = saved.find((link) => link.id === update.id);
    if (row) texts[slotOf(row.kind, row.id)] = update.url;
  }
  for (const insert of plan.inserts) {
    texts[slotOf(insert.kind, insert.id)] = insert.url;
    if (insert.kind === 'other') added.push(insert.id);
  }
  return { texts, added };
}

export function isEmptyPlan(plan: LinkSavePlan): boolean {
  return plan.removals.length + plan.updates.length + plan.inserts.length === 0;
}

/** The cached links after a save that went through, before the list is read again. */
export function applyLinkSave(
  rows: readonly SongLinkRow[],
  songId: string,
  plan: LinkSavePlan,
  savedAt: string,
): SongLinkRow[] {
  const removed = new Set(plan.removals);
  // An added link the list already has (a read between a lost answer and its retry cached
  // the row the first send made) takes the plan's address too: the server holds that one.
  const updates = new Map(
    [...plan.updates, ...plan.inserts].map(({ id, provider, url }) => [id, { provider, url }]),
  );
  const kept = rows
    .filter((row) => !removed.has(row.id))
    .map((row) => {
      const update = updates.get(row.id);
      if (!update) return row;
      return {
        ...row,
        provider: update.provider,
        url: update.url,
        // Where bar 1 falls belongs to the video it was lined up on: the database
        // clears it when a link is pointed somewhere else (song_links_before_write).
        bar_one_seconds: update.url === row.url ? (row.bar_one_seconds ?? null) : null,
      };
    });
  const listed = new Set(kept.map((row) => row.id));
  const added = plan.inserts
    .filter((insert) => !listed.has(insert.id))
    .map((insert): SongLinkRow => ({
      ...insert,
      song_id: songId,
      created_at: savedAt,
      bar_one_seconds: null,
    }));
  return [...kept, ...added];
}
