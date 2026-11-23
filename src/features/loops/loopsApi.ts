/**
 * Supabase calls for loops. Plain async functions that throw on error; the
 * hooks in useLoops.ts are the only callers.
 */
import { fetchAllPages } from '@/lib/fetchAllPages';
import { supabase } from '@/lib/supabase';
import { throwIfError, unwrap } from '@/lib/supabaseResult';
import { LOOP_SELECT, type Loop, type LoopEdit, type NewLoop } from './loopForm';

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

/** Returns the saved row, so the cache holds what the DB actually stored. */
export async function createLoop(userId: string, loop: NewLoop): Promise<Loop> {
  return unwrap(
    await supabase
      .from('loops')
      .insert({ ...loop, user_id: userId })
      .select(LOOP_SELECT)
      .single(),
    'loop',
  );
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
