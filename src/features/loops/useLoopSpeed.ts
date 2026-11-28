import { canChangeOptions, type SpeedGate } from '@/features/player/controlGates';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import type { Loop } from './loopForm';
import { useLoopSpeedSaves } from './useLoops';

/**
 * The playing loop's speed: what the player plays now, the one way to change
 * it, and how its saves are going. The screen saves every change to the loop
 * as it happens (`useSaveLoopSpeed`); there is no "Save speed". Shared by the
 * loop panel's speed control and the practice screen's (`PracticeSpeed`), so
 * both go by the same gate: `canChangeOptions`, or the stricter one a screen
 * gives (the practice screen's, which the speed keys take too).
 */
export function useLoopSpeed(
  loop: Loop,
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
  gate: SpeedGate = canChangeOptions,
) {
  const saves = useLoopSpeedSaves(loop.id);
  const canSetSpeed = gate(player, snapshot);
  // Null until the score has loaded; the BPM field waits for it.
  const tempo = player?.tempoAtBar(loop.start_bar) ?? null;
  const ratio = snapshot.speedRatio;

  const setSpeed = (next: number | null) => {
    if (next === null || !player || !gate(player, snapshot)) return;
    player.setSpeed(next);
  };

  return { saves, canSetSpeed, tempo, ratio, setSpeed };
}
