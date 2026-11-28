import { useCallback, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import type { RecordingPlayer } from '@/features/recordings/recordingPlayer';
import { useRecordingPlayer } from '@/features/recordings/useRecordingPlayer';

/** What the play screen hands its player while it is on a recording (Unit 19). */
export interface RecordingSession {
  /** The video's player; null while there is no frame (the links still read, offline). */
  player: RecordingPlayer | null;
  /** The second of the video at which bar 1 starts, or null while the link isn't lined up. */
  barOneSeconds: number | null;
  /** Whether the page is kept on the bar the video is on. The mark is drawn either way. */
  follow: boolean;
  /** The sticky bar the video sits in: the score is on show below it. */
  barRef: RefObject<HTMLElement | null>;
  /** A press that can't act until the video has been started by a tap on it. */
  onNeedsFirstTap: () => void;
}

/** The play screen's state for a recording: what its video's bar draws, and the session its player follows. */
export interface RecordingPageState {
  /** Null on the tab. */
  session: RecordingSession | null;
  /** Goes on the sticky bar the video sits in. */
  barRef: Ref<HTMLDivElement>;
  /** Goes on the video's frame: the player is made for it (`useRecordingPlayer`). */
  frameRef: Ref<HTMLIFrameElement>;
  player: RecordingPlayer | null;
  follow: boolean;
  setFollow: (follow: boolean) => void;
  /**
   * How many times Space or a tap on a bar has tried to work this video before
   * it was started by a tap on it: said under the video, and again at each try.
   */
  firstTapAsks: number;
}

/**
 * What the play screen keeps for a recording (Unit 19): the video's player,
 * whether the page follows it, and the asks for the video's first tap. Page
 * state, none of it saved: following is on whenever a lined-up video is
 * opened.
 *
 * `onRecording`: the screen is on a recording, its links read or not.
 * `barOneSeconds`: where bar 1 falls in the video on show, null while its
 * link isn't lined up.
 */
export function useRecordingSession(
  onRecording: boolean,
  barOneSeconds: number | null,
): RecordingPageState {
  const barRef = useRef<HTMLDivElement>(null);
  const { frameRef, player } = useRecordingPlayer();
  const [follow, setFollow] = useState(true);
  // Kept per player, so another video doesn't open with the note about the last one.
  const [asked, setAsked] = useState<{ of: RecordingPlayer | null; times: number }>({
    of: null,
    times: 0,
  });
  const onNeedsFirstTap = useCallback(
    () => setAsked((last) => ({ of: player, times: last.of === player ? last.times + 1 : 1 })),
    [player],
  );
  const firstTapAsks = asked.of !== null && asked.of === player ? asked.times : 0;
  const session = useMemo(
    (): RecordingSession | null =>
      onRecording ? { player, barOneSeconds, follow, barRef, onNeedsFirstTap } : null,
    [onRecording, player, barOneSeconds, follow, onNeedsFirstTap],
  );
  return { session, barRef, frameRef, player, follow, setFollow, firstTapAsks };
}
