import { useEffect, type RefObject } from 'react';
import type { PlayerService } from '@/features/player/PlayerService';

/**
 * Jam mode's behaviour on top of the player: a tapped bar is where playback
 * goes next (playing or paused), and the score box comes on screen when
 * playback starts. alphaTab keeps the cursor in view inside the box
 * (scrollElement); this makes sure the box itself is in the window, which on
 * a short screen it may not be.
 */
export function useJamMode(
  player: PlayerService | null,
  scrollRef: RefObject<HTMLElement | null>,
  playing: boolean,
): void {
  useEffect(() => {
    if (!player) return;
    return player.on('barTapped', ({ barNumber }) => {
      player.seekToBar(barNumber);
    });
  }, [player]);

  useEffect(() => {
    if (!playing) return;
    // 'nearest' leaves the page alone when the box is already fully visible,
    // and only once per start, so it never fights the user scrolling the page.
    // jsdom has no scrollIntoView.
    scrollRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [playing, scrollRef]);
}
