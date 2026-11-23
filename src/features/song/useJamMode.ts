import { useEffect, type RefObject } from 'react';
import type { PlayerService } from '@/features/player/PlayerService';

/** Space left between the sticky bar and the score box after the scroll. */
const GAP_BELOW_STICKY_BAR_PX = 8;

interface JamModeRefs {
  /** The score box alphaTab scrolls inside. */
  scrollRef: RefObject<HTMLElement | null>;
  /** The sticky bar (readout and Pause) at the top of the window. */
  stickyBarRef: RefObject<HTMLElement | null>;
}

/**
 * When the score box is brought into the window. `playing`: as close as it
 * needs to move to be fully visible. `picking-bars`: its top right under the
 * sticky bar, because on a phone the loop sheet covers the lower part of the
 * window and the staff is at the top of the box.
 */
export type ScoreOnScreen = 'playing' | 'picking-bars' | null;

export interface JamModeOptions {
  /** False while taps mean something else: picking a loop's bars (useLoopPractice). */
  seekOnTap: boolean;
  scoreOnScreen: ScoreOnScreen;
}

/**
 * Jam mode's behaviour on top of the player: a tapped bar is where playback
 * goes next (playing or paused), and the score box comes on screen when
 * playback starts or the user is about to pick bars on it.
 */
export function useJamMode(
  player: PlayerService | null,
  refs: JamModeRefs,
  { seekOnTap, scoreOnScreen }: JamModeOptions,
): void {
  useSeekOnTap(player, seekOnTap);
  useScoreOnScreen(refs, scoreOnScreen);
}

function useSeekOnTap(player: PlayerService | null, enabled: boolean): void {
  useEffect(() => {
    if (!player || !enabled) return;
    return player.on('barTapped', ({ barNumber }) => {
      player.seekToBar(barNumber);
    });
  }, [player, enabled]);
}

/**
 * alphaTab keeps the cursor in view inside the box (scrollElement); this makes
 * sure the box itself is in the window, which on a short screen it may not
 * be, without sliding it under the sticky bar.
 */
function useScoreOnScreen({ scrollRef, stickyBarRef }: JamModeRefs, when: ScoreOnScreen): void {
  useEffect(() => {
    if (when === null) return;
    const box = scrollRef.current;
    if (!box) return;
    // Measured, not a fixed class: the bar's height depends on wrapping and the safe area.
    const barHeight = stickyBarRef.current?.getBoundingClientRect().height ?? 0;
    box.style.scrollMarginTop = `${Math.ceil(barHeight) + GAP_BELOW_STICKY_BAR_PX}px`;
    // 'nearest' leaves the page alone when the box is already fully visible,
    // and only once per start, so it never fights the user scrolling the page.
    // jsdom has no scrollIntoView.
    box.scrollIntoView?.({
      block: when === 'picking-bars' ? 'start' : 'nearest',
      behavior: 'smooth',
    });
  }, [when, scrollRef, stickyBarRef]);
}
