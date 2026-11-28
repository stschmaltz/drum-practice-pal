/**
 * Supabase calls for a song's links. Plain async functions that throw on
 * error; the hooks in useSongLinks.ts are the only callers.
 */
import { UserFacingError } from '@/lib/errorCopy';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { PG } from '@/lib/postgresCodes';
import { supabase } from '@/lib/supabase';
import { throwIfError, unwrap } from '@/lib/supabaseResult';
import { LINE_UP_COPY } from './lineUpCopy';
import {
  SONG_LINK_SELECT,
  type BarOneSave,
  type LinkInsert,
  type LinkSavePlan,
  type LinkUpdate,
  type SongLinkRow,
} from './songLinkForm';

/** Every link of one song, oldest first (a song can have any number of Other links). */
export async function fetchSongLinks(userId: string, songId: string): Promise<SongLinkRow[]> {
  return fetchAllPages(async (from, to) =>
    unwrap(
      await supabase
        .from('song_links')
        .select(SONG_LINK_SELECT)
        .eq('user_id', userId)
        .eq('song_id', songId)
        // A total order, so pages don't overlap or skip rows.
        .order('created_at')
        .order('id')
        .range(from, to),
      'song links',
    ),
  );
}

/**
 * Carries out one press of Save: removals, then changed links, then new ones,
 * stopping at the first step the server refuses (the caller reads the list
 * again either way, so the form shows what did get through). Each step is
 * safe to send again: a removal of a link already gone removes nothing, an
 * update sets values, and an insert whose id is already saved becomes an update.
 */
export async function saveSongLinks(
  userId: string,
  songId: string,
  plan: LinkSavePlan,
): Promise<void> {
  if (plan.removals.length > 0) {
    throwIfError(
      await supabase.from('song_links').delete().in('id', plan.removals).eq('user_id', userId),
    );
  }
  for (const update of plan.updates) await updateSongLink(userId, update);
  for (const insert of plan.inserts) await insertSongLink(userId, songId, insert);
}

async function updateSongLink(userId: string, update: LinkUpdate): Promise<void> {
  // No row: the link was removed on another device since the form read it. Say so (14 Test,
  // bug 3), or the form closes as if it had saved and the link is gone at the next read.
  // Pressed again, the field adds it anew.
  if (!(await pointLinkAt(userId, update))) {
    throw Object.assign(new Error('No such song link'), { code: PG.NO_ROWS });
  }
}

/**
 * The id is the form's, the same at every press: after a save whose answer
 * was lost, the next press finds its row already there (23505 on the id) and
 * points it at what the field holds now. A 23505 with no such row is the
 * other unique rule (the song already has an Original, saved on another
 * device since the form opened), which is a refusal.
 */
async function insertSongLink(userId: string, songId: string, link: LinkInsert): Promise<void> {
  const inserted = await supabase
    .from('song_links')
    .insert({ ...link, song_id: songId, user_id: userId });
  if (inserted.error?.code !== PG.UNIQUE_VIOLATION) return throwIfError(inserted);
  if (!(await pointLinkAt(userId, link))) throw inserted.error;
}

/**
 * Points a saved link somewhere else, and says whether its row was there to
 * point: PostgREST answers an update that matched no row as a success, so the
 * row is asked for back.
 */
async function pointLinkAt(userId: string, { id, provider, url }: LinkUpdate): Promise<boolean> {
  const updated = await supabase
    .from('song_links')
    .update({ provider, url })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  throwIfError(updated);
  return updated.data !== null;
}

/** The link a line-up was made for now points at another video: the save was not made. */
export class LinkChangedError extends UserFacingError {
  override name = 'LinkChangedError';
  constructor() {
    super(LINE_UP_COPY.changed);
  }
}

/**
 * Saves where bar 1 of the tab falls in a link's video (Unit 19), and returns
 * what the database now holds. The write is for the video the line-up was
 * made on: it matches the row only while the link still has the address the
 * page knew at the press (`url`), so a page that hasn't heard the link was
 * pointed at another video on another device can't put the old video's
 * line-up on the new one (19 QA issue 6). The row is asked for back, as
 * `pointLinkAt` does, since PostgREST answers an update that matched nothing
 * as a success; then the link is looked up to say which it was: removed
 * (`PG.NO_ROWS`) or changed (`LinkChangedError`).
 */
export async function saveBarOne(
  userId: string,
  { linkId, url, barOneSeconds }: BarOneSave,
): Promise<number | null> {
  const updated = await supabase
    .from('song_links')
    .update({ bar_one_seconds: barOneSeconds })
    .eq('id', linkId)
    .eq('user_id', userId)
    .eq('url', url)
    .select('id, bar_one_seconds')
    .maybeSingle();
  throwIfError(updated);
  if (updated.data !== null) return updated.data.bar_one_seconds;
  const still = await supabase
    .from('song_links')
    .select('id')
    .eq('id', linkId)
    .eq('user_id', userId)
    .maybeSingle();
  throwIfError(still);
  if (still.data !== null) throw new LinkChangedError();
  throw Object.assign(new Error('No such song link'), { code: PG.NO_ROWS });
}
