import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
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
import { windowScrollToShow, type ReadableView } from './followScroll';

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
 * Where in the tab's play order (an index into `barTimes`) a state of the
 * video falls, or null when there is no bar to mark: the video hasn't started
 * (its clock may be an advert's), bar 1 hasn't come yet, or the tab has run
 * out.
 */
function barOf(
  state: RecordingState,
  barTimes: readonly BarTime[],
  barOneSeconds: number,
): number | null {
  if (!canDriveRecording(state)) return null;
  const position = barAtVideoSeconds(barTimes, barOneSeconds, state.seconds);
  return position?.at === 'bar' ? position.playIndex : null;
}

/**
 * Where a lined-up video is in the tab's play order, re-rendering only when
 * it moves to another bar (the clock is heard a few times a second). The
 * place, not the bar's number: a repeated bar is followed by a different bar
 * each time through. Null when nothing is followed: no frame, a link not
 * lined up, the tab not timed yet.
 */
function useVideoPlace(
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

/**
 * The part of the window the score can be read in: under the sticky video,
 * above a phone's tab bar. On a fresh load the video's bar hasn't stuck yet
 * and ends lower than it will (below the window's foot, in a phone on its
 * side): `stuckTop` is where it ends once it has, which is what a scroll is
 * aimed under (19 QA issue 1).
 */
function readableView(barRef: RefObject<HTMLElement | null>): ReadableView {
  const videoBar = barRef.current;
  const rect = videoBar?.getBoundingClientRect();
  // Where the bar sticks: its own `top` (0, or a safe-area inset), as the stylesheet has it.
  const stickyTop = videoBar ? Number.parseFloat(getComputedStyle(videoBar).top) || 0 : 0;
  // Fixed along the bottom below 768 px (AppShell); not drawn at all from there up.
  const tabBar = document.querySelector('[data-bottom-tabs]')?.getBoundingClientRect();
  const bottom = tabBar && tabBar.height > 0 ? tabBar.top : window.innerHeight;
  return { top: rect?.bottom ?? 0, bottom, stuckTop: rect ? stickyTop + rect.height : 0 };
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
 *   window when the bar isn't in the part of it the score is read in, or is
 *   the last bar on show there (`windowScrollToShow`: the page turns a line
 *   early). Between two bars the window is the reader's own, with two
 *   exceptions, both of them the page moving under the reader rather than
 *   the reader moving the page: a bar that couldn't be placed when it was
 *   marked (the score still drawing) is brought on show when it can be, and
 *   after the window's width changes (a rotation) the bar is brought back at
 *   once and again when the score has been drawn for the new width, playing
 *   or paused. A change of height alone (a phone's address bar) is nothing.
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
  const place = useVideoPlace(recording, barTimes);
  const bar = place === null ? null : (barTimes[place]?.barNumber ?? null);
  // The bar played after it, which is not always the next by number (a repeat).
  const nextBar = place === null ? null : (barTimes[place + 1]?.barNumber ?? null);
  const follow = recording?.follow ?? false;
  const barRef = recording?.barRef;
  // Kept across bars: a rotation's redraw can land after the mark has moved on.
  const layout = useRef({ width: 0, redrawAwaited: false });

  useEffect(() => {
    if (!player || bar === null || !follow || !barRef) return;
    /** Brings the bar on show; false when it couldn't be placed (the score not drawn yet). */
    const bringOnShow = () => {
      player.showBar(bar, nextBar);
      const rect = player.barRectInWindow(bar);
      if (!rect) return false;
      const next = nextBar === null ? null : player.barRectInWindow(nextBar);
      const distance = windowScrollToShow(rect, readableView(barRef), next);
      // At once, not animated: the bar is being played now. jsdom has no scrollBy.
      if (distance !== null) window.scrollBy?.({ top: distance, behavior: 'instant' });
      return true;
    };
    // A width that changed while nothing was followed is covered by this run's own look.
    layout.current.width = window.innerWidth;
    let unplaced = !bringOnShow();
    const onResize = () => {
      if (window.innerWidth === layout.current.width) return;
      layout.current = { width: window.innerWidth, redrawAwaited: true };
      bringOnShow();
    };
    const offRendered = player.on('rendered', () => {
      if (!unplaced && !layout.current.redrawAwaited) return;
      layout.current.redrawAwaited = false;
      unplaced = !bringOnShow();
    });
    window.addEventListener('resize', onResize);
    return () => {
      offRendered();
      window.removeEventListener('resize', onResize);
    };
  }, [player, bar, nextBar, follow, barRef]);

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
