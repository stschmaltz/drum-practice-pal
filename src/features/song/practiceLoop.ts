/**
 * Which loop the practice screen is for, from the route's id and the song's
 * loops query. Pure, so the waiting rules are tested on their own.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import type { Loop } from '@/features/loops/loopForm';
import { isUuid } from '@/lib/randomUuid';

export type PracticeLoopLookup =
  | { kind: 'found'; loop: Loop }
  /** The list is on its way, or a list without the loop is being read again. */
  | { kind: 'waiting' }
  /** Not one of this song's loops: never was, deleted, or not an id at all. */
  | { kind: 'missing' }
  /** Nothing to go by: the first read failed. */
  | { kind: 'error' };

export type LoopsQueryState = Pick<
  UseQueryResult<Loop[]>,
  'data' | 'fetchStatus' | 'isLoadingError'
>;

/**
 * A cached list that lacks the loop is only believed once no read is on its
 * way: the loop may have been saved on another device since that list was
 * read, and opening the screen reads the list again. Offline (the read is
 * paused) or after a failed read, the cached list is all there is.
 */
export function lookUpPracticeLoop(loops: LoopsQueryState, loopId: string): PracticeLoopLookup {
  if (!isUuid(loopId)) return { kind: 'missing' };
  if (loops.data === undefined)
    return loops.isLoadingError ? { kind: 'error' } : { kind: 'waiting' };
  const loop = loops.data.find((listed) => listed.id === loopId);
  if (loop) return { kind: 'found', loop };
  return loops.fetchStatus === 'fetching' ? { kind: 'waiting' } : { kind: 'missing' };
}
