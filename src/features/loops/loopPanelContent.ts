import type { PlayerSnapshot } from '@/features/player/PlayerService';
import type { LoopEditor, LoopPractice } from './useLoopPractice';

/**
 * The loop form the panel shows in place of its list, or null for the list: a
 * new loop or an edit is open, and the score's bars are in to check its range
 * against.
 */
export function editorOnPanel(
  practice: Pick<LoopPractice, 'editor'>,
  snapshot: Pick<PlayerSnapshot, 'barCount'>,
): { editor: LoopEditor; barCount: number } | null {
  const { editor } = practice;
  const { barCount } = snapshot;
  return editor !== null && barCount !== null ? { editor, barCount } : null;
}

/**
 * The panel has the playing loop's speed control on it (in the loop's item):
 * there is a loop playing, and the list, not the form, is showing. The
 * controls bar's "Loop speed" leads there, so it stands in for the speed
 * slider only while this holds; otherwise it would have nothing to show
 * (Copilot review on #18).
 */
export function panelShowsLoopSpeed(
  practice: Pick<LoopPractice, 'editor' | 'activeLoop'>,
  snapshot: Pick<PlayerSnapshot, 'barCount'>,
): boolean {
  return practice.activeLoop !== null && editorOnPanel(practice, snapshot) === null;
}
