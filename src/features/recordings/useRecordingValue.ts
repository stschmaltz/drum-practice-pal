import { useMemo, useSyncExternalStore } from 'react';
import type { RecordingPlayer, RecordingState } from './recordingPlayer';

/**
 * Something read from a recording player's state (Unit 19), re-rendering
 * only when it changes: the player says where its clock is a few times a
 * second, and almost none of those readings change what is drawn. Never put
 * the polled clock itself in React state.
 *
 * `read` and `same` must keep their identity while they mean the same thing
 * (a module-level function, or `useCallback`): a new one is a new
 * subscription. `idle` is the value while there is no player.
 */
export function useRecordingValue<T>(
  player: RecordingPlayer | null,
  read: (state: RecordingState) => T,
  idle: T,
  same: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useMemo(() => {
    let current = player ? read(player.getState()) : idle;
    /** Takes a state in; true when what is read from it changed. */
    const take = (state: RecordingState) => {
      const next = read(state);
      if (same(current, next)) return false;
      current = next;
      return true;
    };
    return {
      subscribe: (onChange: () => void) => {
        if (!player) return () => {};
        // What changed between the render and this subscription: React reads `get` again
        // once it has subscribed, and re-renders if it differs.
        take(player.getState());
        // The cleanup is the unsubscribe: nothing is heard from a player once the screen
        // has let go of it, late or not.
        return player.subscribe((state) => {
          if (take(state)) onChange();
        });
      },
      get: () => current,
    };
  }, [player, read, idle, same]);
  return useSyncExternalStore(store.subscribe, store.get);
}
