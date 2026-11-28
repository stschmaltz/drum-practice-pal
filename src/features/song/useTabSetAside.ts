import { useEffect, useRef } from 'react';
import type { LoopPractice } from '@/features/loops/useLoopPractice';
import {
  isRunning,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';

/**
 * Sets the tab's player aside while the play screen is on a recording
 * (Unit 14), and brings it back as it was:
 *
 * - Switching to a recording stops the tab, whatever was sounding, a count-in
 *   included, and keeps it stopped (a Play the engine reports late is paused).
 * - It puts an idle loop form away, since its bars are picked on the score.
 *   Not one that is saving: its answer still finds it (the loop panel stays
 *   mounted, hidden), and closes it then.
 * - Back on the tab the score is laid out for the width again (one line on a
 *   phone), so the bar the paused player is at is brought back on show:
 *   alphaTab follows its cursor only while it plays. Asked while the score is
 *   still being drawn again, `showBar` keeps the bar for `rendered`.
 */
export function useTabSetAside(
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
  practice: Pick<LoopPractice, 'editor' | 'closeEditor'>,
  recording: boolean,
) {
  const running = isRunning(snapshot.status);
  useEffect(() => {
    if (recording && running) player?.pause();
  }, [recording, running, player]);

  const wasRecording = useRef(recording);
  useEffect(() => {
    if (wasRecording.current && !recording && player) {
      player.showBar(player.getSnapshot().barNumber ?? 1);
    }
    wasRecording.current = recording;
  }, [recording, player]);

  const { editor, closeEditor } = practice;
  const formOpenIdle = editor !== null && !editor.saving;
  useEffect(() => {
    if (recording && formOpenIdle) closeEditor();
  }, [recording, formOpenIdle, closeEditor]);
}
