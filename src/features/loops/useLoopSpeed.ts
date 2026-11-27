import { canChangeOptions } from '@/features/player/controlGates';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { useOnline } from '@/lib/network';
import type { Loop } from './loopForm';
import { useUpdateLoop } from './useLoops';

/**
 * The playing loop's speed: what the player plays now against what the loop
 * has saved, and the two ways to change it. Shared by the loop panel's speed
 * control and the practice screen's (`PracticeSpeed`), so both go by the same
 * gate and the same save.
 */
export function useLoopSpeed(
  songId: string,
  loop: Loop,
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
) {
  const update = useUpdateLoop(songId);
  const online = useOnline();
  const canSetSpeed = canChangeOptions(player, snapshot);
  // Offline a save waits for the connection; another may be saved behind it (loop edits
  // go in order). One that is being sent locks the button, so two never race.
  const sending = update.isPending && !update.isPaused;
  // Null until the score has loaded; the BPM field waits for it.
  const tempo = player?.tempoAtBar(loop.start_bar) ?? null;
  const ratio = snapshot.speedRatio;
  const unsaved = ratio !== loop.speed_ratio;

  const setSpeed = (next: number | null) => {
    if (next === null || !canChangeOptions(player, snapshot)) return;
    // A failed save's message is about the old speed. Not while one is in flight:
    // reset() would forget it, and Save speed would be offered again alongside it.
    if (update.isError) update.reset();
    player.setSpeed(next);
  };

  const save = () => {
    if (!unsaved || sending) return;
    update.mutate({ loopId: loop.id, changes: { speed_ratio: ratio } });
  };

  return { update, online, canSetSpeed, sending, tempo, ratio, unsaved, setSpeed, save };
}
