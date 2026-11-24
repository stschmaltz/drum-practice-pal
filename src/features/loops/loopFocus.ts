/**
 * Where focus goes when a loop's control leaves the page (Unit 10): the status
 * button that moves its loop to another list, and the buttons that open the
 * loop form, which the form replaces. The buttons carry data attributes so a
 * later render can find the one that stands in for the control pressed.
 */
import type { LoopStatus } from '@/lib/schema';

/** On a loop's "Mark finished" / "Reopen", wherever it is listed. */
export function statusButtonAttributes(loop: { id: string; status: LoopStatus }) {
  return { 'data-loop-status-of': loop.id, 'data-loop-status': loop.status };
}

/** The loop's status button, or with `status` only once the loop is listed with that status. */
export function findStatusButton(loopId: string, status?: LoopStatus): HTMLElement | null {
  const statusPart = status === undefined ? '' : `[data-loop-status="${status}"]`;
  return document.querySelector<HTMLElement>(`[data-loop-status-of="${loopId}"]${statusPart}`);
}

/** What opened the loop form, for focus to go back to: "New loop", or a loop's "Edit". */
export type LoopFormOpener = { kind: 'new' } | { kind: 'edit'; loopId: string };

export const NEW_LOOP_BUTTON_ATTRIBUTES = { 'data-loop-form-opener': 'new' } as const;

/** On what opens the loop's form: its "More" button, whose menu holds Edit (12 UX pass). */
export function editButtonAttributes(loopId: string) {
  return { 'data-loop-form-opener': `edit:${loopId}` };
}

/** The opener's button, or "New loop" when it is gone (the loop was deleted meanwhile). */
export function findFormOpener(opener: LoopFormOpener): HTMLElement | null {
  const find = (value: string) =>
    document.querySelector<HTMLElement>(`[data-loop-form-opener="${value}"]`);
  return (opener.kind === 'edit' ? find(`edit:${opener.loopId}`) : null) ?? find('new');
}

/** On the playing loop's speed control, for the controls bar's "Loop speed" to hand focus to. */
export const LOOP_SPEED_ATTRIBUTES = { 'data-loop-speed': '' } as const;

export function findLoopSpeed(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-loop-speed]');
}
