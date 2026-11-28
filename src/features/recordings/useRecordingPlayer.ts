import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  RECORDING_NOT_READY,
  sameButForClock,
  type RecordingPlayer,
  type RecordingState,
} from './recordingPlayer';
import { createYouTubePlayer } from './youTubePlayer';

/**
 * The player of the video frame on the page (Unit 19). `frameRef` goes on the
 * `<iframe>` (RecordingBox): the player is made when the frame is mounted and
 * disposed when it leaves (another video, offline, another source, the
 * screen), so nothing is asked of YouTube's API until a recording is on show.
 * `player` is null in between.
 *
 * StrictMode mounts the frame's ref twice: the first player is disposed and
 * the second takes over the same frame (youTubePlayer.ts keeps one YouTube
 * player per frame element).
 */
export function useRecordingPlayer() {
  const [player, setPlayer] = useState<RecordingPlayer | null>(null);
  const frameRef = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) return;
    const made = createYouTubePlayer(frame);
    setPlayer(made);
    return () => {
      made.dispose();
      // Only if a later frame's player hasn't taken its place already.
      setPlayer((current) => (current === made ? null : current));
    };
  }, []);
  return { frameRef, player };
}

/**
 * The player's state without its clock, for what is drawn from it (which
 * controls are on): it re-renders when the player becomes ready, starts,
 * plays, pauses or changes rate, and not at each reading of the clock. The
 * `seconds` in it are from the last such change; a press reads the clock
 * itself (`player.getState()`).
 */
export function useRecordingStatus(player: RecordingPlayer | null): RecordingState {
  const store = useMemo(() => {
    let current = player ? player.getState() : RECORDING_NOT_READY;
    return {
      subscribe: (onChange: () => void) => {
        if (!player) return () => {};
        const hear = (next: RecordingState) => {
          if (sameButForClock(current, next)) return;
          current = next;
          onChange();
        };
        // What changed between the render and this subscription: React reads `get` again
        // once it has subscribed, and re-renders if it differs.
        const now = player.getState();
        if (!sameButForClock(current, now)) current = now;
        return player.subscribe(hear);
      },
      get: () => current,
    };
  }, [player]);
  return useSyncExternalStore(store.subscribe, store.get);
}
