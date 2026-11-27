/**
 * The loops lists of the home page: what is on the go and what is finished,
 * across every song. Pure: the columns, the row type and the order. The speed
 * shows as a percent only there, because BPM needs the tempo at the loop's
 * first bar, which is in the song's file and not in a row.
 */
import type { LoopStatus } from '@/lib/schema';
import type { Loop } from './loopForm';

/**
 * LOOP_SELECT plus the song's name through the loops_song_fkey relation. A
 * literal, so supabase-js can type the row; a test keeps it in step with LOOP_SELECT.
 */
export const PRACTICE_LOOP_SELECT =
  'id, song_id, name, start_bar, end_bar, speed_ratio, status, finished_at, last_practiced_at, created_at, song:songs!loops_song_fkey(title, artist)';

/** A loop with the song it belongs to. */
export type PracticeLoop = Loop & { song: { title: string; artist: string } };

export const PRACTICE_TABS = ['active', 'finished'] as const satisfies readonly LoopStatus[];
export type PracticeTab = (typeof PRACTICE_TABS)[number];

/** For a tab taken from the URL: anything unknown is the first tab. */
export function practiceTabFrom(value: string | null): PracticeTab {
  return PRACTICE_TABS.find((tab) => tab === value) ?? 'active';
}

const time = (iso: string | null) => (iso === null ? null : Date.parse(iso));

/** Later first; a loop with no such time comes after every loop that has one. */
function byLatest(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return b - a;
}

type Sortable = Pick<Loop, 'id' | 'status' | 'finished_at' | 'last_practiced_at' | 'created_at'>;

/**
 * One tab's loops in the order it shows them. On the go: last practiced
 * first, then the never practiced, newest first. Finished: last finished
 * first; one finished a moment ago, whose time the server hasn't sent back
 * yet, leads.
 */
export function practiceLoopsFor<T extends Sortable>(loops: readonly T[], tab: PracticeTab): T[] {
  const newestFirst = (a: T, b: T) =>
    Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id);
  const listed = loops.filter((loop) => loop.status === tab);
  if (tab === 'active') {
    return listed.sort(
      (a, b) => byLatest(time(a.last_practiced_at), time(b.last_practiced_at)) || newestFirst(a, b),
    );
  }
  return listed.sort(
    (a, b) =>
      byLatest(time(a.finished_at) ?? Infinity, time(b.finished_at) ?? Infinity) ||
      newestFirst(a, b),
  );
}
