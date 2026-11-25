/**
 * Supabase calls for loops. Plain async functions that throw on error; the
 * hooks in useLoops.ts are the only callers.
 */
import { fetchAllPages } from '@/lib/fetchAllPages';
import { supabase } from '@/lib/supabase';
import { throwIfError, unwrap } from '@/lib/supabaseResult';
import { LOOP_SELECT, type Loop, type LoopEdit, type NewLoop } from './loopForm';
import { PRACTICE_LOOP_SELECT, type PracticeLoop } from './practiceList';

/** Every loop of one song, oldest first. */
export async function fetchLoops(userId: string, songId: string): Promise<Loop[]> {
  return fetchAllPages(async (from, to) =>
    unwrap(
      await supabase
        .from('loops')
        .select(LOOP_SELECT)
        .eq('user_id', userId)
        .eq('song_id', songId)
        // A total order, so pages don't overlap or skip rows.
        .order('created_at')
        .order('id')
        .range(from, to),
      'loops',
    ),
  );
}

/** Every loop of every song, each with its song's name, oldest first: the home page's lists. */
export async function fetchPracticeLoops(userId: string): Promise<PracticeLoop[]> {
  return fetchAllPages(async (from, to) =>
    unwrap(
      await supabase
        .from('loops')
        .select(PRACTICE_LOOP_SELECT)
        .eq('user_id', userId)
        // A total order, so pages don't overlap or skip rows.
        .order('created_at')
        .order('id')
        .range(from, to),
      'loops',
    ),
  );
}

/** Postgres unique_violation: for a loops insert, an id already taken. */
const UNIQUE_VIOLATION = '23505';

/**
 * Returns the saved row, so the cache holds what the DB actually stored. The
 * id is the form's, the same at every press: a press after a lost answer
 * finds its loop already saved (23505) and takes that row rather than failing
 * or inserting a second loop.
 */
export async function createLoop(userId: string, loop: NewLoop): Promise<Loop> {
  const inserted = await supabase
    .from('loops')
    .insert({ ...loop, user_id: userId })
    .select(LOOP_SELECT)
    .single();
  if (inserted.error?.code === UNIQUE_VIOLATION) {
    const saved = await supabase
      .from('loops')
      .select(LOOP_SELECT)
      .eq('id', loop.id)
      .eq('user_id', userId)
      .maybeSingle();
    throwIfError(saved);
    if (saved.data) return saved.data;
  }
  return unwrap(inserted, 'loop');
}

export async function updateLoop(
  userId: string,
  loopId: string,
  changes: Partial<LoopEdit>,
): Promise<Loop> {
  return unwrap(
    await supabase
      .from('loops')
      .update(changes)
      .eq('id', loopId)
      .eq('user_id', userId)
      .select(LOOP_SELECT)
      .single(),
    'loop',
  );
}

/** The loop's practice sessions go with it (cascade). */
export async function deleteLoop(userId: string, loopId: string): Promise<void> {
  throwIfError(await supabase.from('loops').delete().eq('id', loopId).eq('user_id', userId));
}
