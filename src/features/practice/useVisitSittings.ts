import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { sessionMinPlaySeconds } from './debugPractice';
import type { SittingProgress } from './sittings';
import {
  clearVisitSittingsOf,
  keepVisitSittingsOf,
  readVisitSittings,
  recordVisitSitting,
  subscribeVisitSittings,
} from './visitSittings';

/**
 * Tells the visit's store of each sitting as it ends: when another loop
 * becomes the one open, and when the screen goes. `readSitting` is the
 * tracker's `sitting`, read at that moment.
 *
 * In a layout effect's cleanup on purpose. It runs while the screen is being
 * taken off the page, before the tracker's own (passive) effects end the open
 * session or start the next loop's tally, and before the song overview that
 * replaces the screen is painted: the overview's summary is there in its
 * first frame, so it never arrives late and pushes a loop out from under a tap.
 */
export function useSittingRecorder(
  songId: string,
  loop: { id: string; name: string } | null,
  readSitting: () => SittingProgress | null,
): void {
  const loopId = loop?.id ?? null;
  // The name as last drawn. Set after the cleanup below has run (effects of one
  // component clean up before any of them runs again), so the cleanup reads the
  // name of the loop being left, not of the one arriving.
  const loopName = useRef(loop?.name ?? '');
  useLayoutEffect(() => {
    if (loopId === null) return;
    return () => {
      const sitting = readSitting();
      // The tracker hasn't heard of the loop yet (left in the render that opened it).
      if (sitting?.loopId !== loopId) return;
      recordVisitSitting(
        { ...sitting, songId, loopName: loopName.current },
        sessionMinPlaySeconds(),
      );
    };
  }, [songId, loopId, readSitting]);
  useLayoutEffect(() => {
    loopName.current = loop?.name ?? '';
  });
}

// The overview on show now. A token per mount, so a mount that was only StrictMode's
// rehearsal (cleaned up and mounted again at once) doesn't empty the store as it "leaves".
let showing: object | null = null;

/**
 * This visit's sittings on one song, for its overview: read from the first
 * render (the store is synchronous), emptied by `dismiss` and when the
 * overview is left, and rid of other songs' sittings once this one shows.
 */
export function useVisitSittings(songId: string) {
  const all = useSyncExternalStore(subscribeVisitSittings, readVisitSittings);
  const sittings = useMemo(() => all.filter((sitting) => sitting.songId === songId), [all, songId]);

  useEffect(() => {
    const token = {};
    showing = token;
    keepVisitSittingsOf(songId);
    return () => {
      // Not at once: StrictMode cleans up and mounts again in the same task.
      queueMicrotask(() => {
        if (showing !== token) return;
        showing = null;
        clearVisitSittingsOf(songId);
      });
    };
  }, [songId]);

  const dismiss = useCallback(() => clearVisitSittingsOf(songId), [songId]);
  return { sittings, dismiss };
}
