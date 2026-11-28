import { useEffect, useMemo, useSyncExternalStore, type RefObject } from 'react';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import {
  canDriveRecording,
  type RecordingPlayer,
  type RecordingState,
} from '@/features/recordings/recordingPlayer';
import {
  barAtVideoSeconds,
  barTimesInPlayOrder,
  videoSecondsOfBar,
  type BarTime,
} from '@/features/recordings/videoSync';
import { windowScrollToShow } from './followScroll';

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

/**
 * The tab's bars timed in play order, for a recording's clock to be placed
 * in. Read from the player when its status changes: the ticks are in before
 * the status leaves `loading`, and nothing changes them afterwards.
 */
function useBarTimes(player: PlayerService | null, snapshot: PlayerSnapshot): readonly BarTime[] {
  const timed = snapshot.barCount !== null && snapshot.status !== 'loading';
  return useMemo(
    () =>
      player && timed
        ? barTimesInPlayOrder(player.playedBars(), (barNumber) => player.tempoAtBar(barNumber))
        : [],
    [player, timed],
  );
}

/**
 * The bar a state of the video falls in, or null when there is none to mark:
 * the video hasn't started (its clock may be an advert's), bar 1 hasn't come
 * yet, or the tab has run out.
 */
function barOf(
  state: RecordingState,
  barTimes: readonly BarTime[],
  barOneSeconds: number,
): number | null {
  if (!canDriveRecording(state)) return null;
  const position = barAtVideoSeconds(barTimes, barOneSeconds, state.seconds);
  return position?.at === 'bar' ? position.barNumber : null;
}

/**
 * The bar a lined-up video is on, re-rendering only when it changes (the
 * clock is heard a few times a second). Null when nothing is followed: no
 * frame, a link not lined up, the tab not timed yet.
 */
function useVideoBar(
  recording: RecordingSession | null,
  barTimes: readonly BarTime[],
): number | null {
  const video = recording?.player ?? null;
  const barOneSeconds = recording?.barOneSeconds ?? null;
  const store = useMemo(() => {
    const following = video !== null && barOneSeconds !== null && barTimes.length > 0;
    const place = (state: RecordingState) =>
      following ? barOf(state, barTimes, barOneSeconds) : null;
    let current = video ? place(video.getState()) : null;
    return {
      subscribe: (onChange: () => void) => {
        if (!video || !following) return () => {};
        // Where the video got to between the render and this subscription.
        current = place(video.getState());
        // The cleanup is the unsubscribe: nothing is heard from a player once
        // the screen has let go of it, late or not.
        return video.subscribe((state) => {
          const bar = place(state);
          if (bar === current) return;
          current = bar;
          onChange();
        });
      },
      get: () => current,
    };
  }, [video, barOneSeconds, barTimes]);
  return useSyncExternalStore(store.subscribe, store.get);
}

/** The part of the window the score can be read in: under the sticky video, above a phone's tab bar. */
function readableView(barRef: RefObject<HTMLElement | null>) {
  const top = barRef.current?.getBoundingClientRect().bottom ?? 0;
  // Fixed along the bottom below 768 px (AppShell); not drawn at all from there up.
  const tabBar = document.querySelector('[data-bottom-tabs]')?.getBoundingClientRect();
  const bottom = tabBar && tabBar.height > 0 ? tabBar.top : window.innerHeight;
  return { top, bottom };
}

/** Where a lined-up video is in the tab. */
export interface VideoFollow {
  /** The bar the video is on, or null when there is none to mark. */
  bar: number | null;
  /** The tab's bars timed in play order; empty until the player has them. */
  barTimes: readonly BarTime[];
}

/**
 * The tab follows a lined-up video (Unit 19):
 *
 * - Returns the bar the video is on, for the screen to mark (through
 *   `useLoopPractice`'s `mark`, the one owner of the score's highlight).
 * - With `follow` on, brings that bar on show whenever it changes: the score
 *   box by `player.showBar` (a bar already on show moves nothing), then the
 *   window when the bar still isn't in the part of it the score is read in.
 *
 * It reads the video's own clock and nothing else: a pause, a seek in
 * YouTube's controls, buffering and a change of speed all arrive as the
 * clock. The tab's player isn't played or moved.
 */
export function useVideoFollow(
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
  recording: RecordingSession | null,
): VideoFollow {
  const barTimes = useBarTimes(player, snapshot);
  const bar = useVideoBar(recording, barTimes);
  const follow = recording?.follow ?? false;
  const barRef = recording?.barRef;

  useEffect(() => {
    if (!player || bar === null || !follow || !barRef) return;
    player.showBar(bar);
    const rect = player.barRectInWindow(bar);
    if (!rect) return;
    const distance = windowScrollToShow(rect, readableView(barRef));
    // At once, not animated: the bar is being played now. jsdom has no scrollBy.
    if (distance !== null) window.scrollBy?.({ top: distance, behavior: 'instant' });
  }, [player, bar, follow, barRef]);

  return { bar, barTimes };
}

/**
 * A tap on a bar moves a lined-up video to that bar's start, on the
 * playthrough nearest where the video is. Before the video has been tapped
 * once it can't be driven, and the screen says so (`onNeedsFirstTap`).
 * `enabled` false while taps mean something else on the screen (a loop
 * form's bars): one use of `barTapped` at a time.
 */
export function useTapSeeksVideo(
  player: PlayerService | null,
  recording: RecordingSession | null,
  barTimes: readonly BarTime[],
  enabled: boolean,
): void {
  const video = recording?.player ?? null;
  const barOneSeconds = recording?.barOneSeconds ?? null;
  const onNeedsFirstTap = recording?.onNeedsFirstTap;
  useEffect(() => {
    if (!player || !video || barOneSeconds === null || !enabled) return;
    return player.on('barTapped', ({ barNumber }) => {
      // The video's clock at the tap, for which playthrough of a repeated bar is meant.
      const state = video.getState();
      if (state.status !== 'ready') return;
      if (!canDriveRecording(state)) {
        onNeedsFirstTap?.();
        return;
      }
      const target = videoSecondsOfBar(barTimes, barOneSeconds, barNumber, state.seconds);
      if (target !== null) video.seekTo(target);
    });
  }, [player, video, barOneSeconds, barTimes, enabled, onNeedsFirstTap]);
}

/**
 * Space on a recording: plays or pauses the video. False while its player
 * hasn't answered, so the key stays the browser's; before the video has been
 * tapped once the key is taken and the screen says what to do.
 */
export function toggleRecording(recording: RecordingSession): boolean {
  const state = recording.player?.getState();
  if (!recording.player || state?.status !== 'ready') return false;
  if (!canDriveRecording(state)) {
    recording.onNeedsFirstTap();
    return true;
  }
  if (state.playing) recording.player.pause();
  else recording.player.play();
  return true;
}
