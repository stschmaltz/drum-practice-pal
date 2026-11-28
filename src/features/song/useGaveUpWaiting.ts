import { useEffect, useState } from 'react';

/**
 * How long a screen waits for a fresh read before it goes by what the device
 * already holds. Long enough that a working connection answers first (so the
 * screen opens on what another device saved), short enough that one that
 * hangs never keeps the sticks waiting: Play needs no network.
 */
export const FRESH_READ_WAIT_MS = 2000;

/**
 * True once `FRESH_READ_WAIT_MS` have passed since `waitingFor` became what it
 * is; false again as soon as it is anything else, and always for null (nothing
 * is waited for). The caller decides what giving up means; this only keeps
 * time, from the render that first names the thing, so time the screen spends
 * loading something else counts towards the wait.
 */
export function useGaveUpWaiting(waitingFor: string | null, ms = FRESH_READ_WAIT_MS): boolean {
  const [wait, setWait] = useState({ waitingFor, over: false });
  // Reset during render (React's "state from the previous render"), so no render of a new
  // thing ever sees the last one's answer.
  if (wait.waitingFor !== waitingFor) setWait({ waitingFor, over: false });
  useEffect(() => {
    if (waitingFor === null) return;
    const timer = window.setTimeout(
      () =>
        setWait((current) =>
          current.waitingFor === waitingFor ? { ...current, over: true } : current,
        ),
      ms,
    );
    return () => window.clearTimeout(timer);
  }, [waitingFor, ms]);
  return waitingFor !== null && wait.waitingFor === waitingFor && wait.over;
}
