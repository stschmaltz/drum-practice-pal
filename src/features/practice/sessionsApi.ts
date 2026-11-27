/**
 * Supabase calls for practice sessions. Plain async functions; the hooks in
 * useSessions.ts and the tracker (usePracticeTracker.ts) are the only callers.
 */
import { fetchAllPages } from '@/lib/fetchAllPages';
import { keepaliveInsert } from '@/lib/keepaliveInsert';
import { PG } from '@/lib/postgresCodes';
import { supabase } from '@/lib/supabase';
import { throwIfError, unwrap } from '@/lib/supabaseResult';
import { sessionInsert, SESSION_SELECT, type PracticeSession } from './sessions';
import type { SessionRecord } from './sessionTracker';

/**
 * `logged`: the row is there (now, or from an earlier send of the same id).
 * `loopGone`: the loop was deleted, and its history with it, so there is
 * nothing to log to. Neither is a failure.
 */
export type LogSessionResult = 'logged' | 'loopGone';

/** Every session of one loop, newest first. */
export async function fetchLoopSessions(
  userId: string,
  loopId: string,
): Promise<PracticeSession[]> {
  return fetchAllPages(async (from, to) =>
    unwrap(
      await supabase
        .from('practice_sessions')
        .select(SESSION_SELECT)
        .eq('user_id', userId)
        .eq('loop_id', loopId)
        // A total order, so pages don't overlap or skip rows.
        .order('started_at', { ascending: false })
        .order('id')
        .range(from, to),
      'practice sessions',
    ),
  );
}

/** Every session of the user, oldest first: the Stats page works everything out from these. */
export async function fetchAllSessions(userId: string): Promise<PracticeSession[]> {
  return fetchAllPages(async (from, to) =>
    unwrap(
      await supabase
        .from('practice_sessions')
        .select(SESSION_SELECT)
        .eq('user_id', userId)
        // A total order, so pages don't overlap or skip rows.
        .order('started_at')
        .order('id')
        .range(from, to),
      'practice sessions',
    ),
  );
}

/**
 * Logs a session. The id is the tracker's, and a row that already has it is
 * left alone ("on conflict do nothing"), so a retry after a lost response
 * never logs twice. The database moves the loop's last_practiced_at itself.
 */
export async function logSession(userId: string, record: SessionRecord): Promise<LogSessionResult> {
  const result = await supabase
    .from('practice_sessions')
    .upsert(sessionInsert(userId, record), { onConflict: 'id', ignoreDuplicates: true });
  if (result.error?.code === PG.FOREIGN_KEY_VIOLATION) return 'loopGone';
  throwIfError(result);
  return 'logged';
}

/**
 * The same insert for when the page is hidden or going away: sent with
 * `keepalive`, so the browser finishes it after the page has gone. Resolves
 * to `failed` instead of throwing; whoever is still there to see it can send
 * the record again through logSession.
 */
export async function logSessionOnExit(
  accessToken: string,
  userId: string,
  record: SessionRecord,
): Promise<LogSessionResult | 'failed'> {
  const result = await keepaliveInsert(
    'practice_sessions',
    sessionInsert(userId, record),
    accessToken,
  );
  if (result.ok) return 'logged';
  return result.code === PG.FOREIGN_KEY_VIOLATION ? 'loopGone' : 'failed';
}
