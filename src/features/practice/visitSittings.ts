/**
 * The sittings of this visit to the app, for the song overview's summary
 * (sittings.ts has the rules). In memory only: a reload forgets them, and
 * nothing here is sent anywhere; the sessions behind them are logged as
 * always. One owner: the player screens tell it of a sitting that ended, the
 * overview reads its song's and empties it.
 */
import { keepsSitting, withSitting, type Sitting } from './sittings';

const NONE: readonly Sitting[] = [];

// Replaced, never changed in place: useSyncExternalStore compares snapshots by identity.
let sittings: readonly Sitting[] = NONE;
const listeners = new Set<() => void>();

function set(next: readonly Sitting[]): void {
  if (next.length === sittings.length && next.every((sitting, i) => sitting === sittings[i])) {
    return;
  }
  sittings = next.length === 0 ? NONE : next;
  for (const listener of [...listeners]) listener();
}

export function readVisitSittings(): readonly Sitting[] {
  return sittings;
}

/** Keeps a sitting that ended, if it has the play time a session needs. Told twice, kept once. */
export function recordVisitSitting(sitting: Sitting, minPlaySeconds: number): void {
  if (!keepsSitting(sitting, minPlaySeconds)) return;
  set(withSitting(sittings, sitting));
}

/** Another song's sittings are never summed up once this song's overview shows. */
export function keepVisitSittingsOf(songId: string): void {
  set(sittings.filter((sitting) => sitting.songId === songId));
}

/** The summary was dismissed, or the song's overview left. */
export function clearVisitSittingsOf(songId: string): void {
  set(sittings.filter((sitting) => sitting.songId !== songId));
}

export function clearVisitSittings(): void {
  set(NONE);
}

export function subscribeVisitSittings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
