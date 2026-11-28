/**
 * Where focus goes when a loop's control leaves the page (Unit 10): the status
 * button that moves its loop to another list, and the buttons that open the
 * loop form, which the form replaces. The buttons carry data attributes so a
 * later render can find the one that stands in for the control pressed.
 */
import { isInItem } from '@/lib/itemFocus';
import type { LoopStatus } from '@/lib/schema';

/**
 * On a loop's "Mark finished" / "Reopen", wherever it is listed, or on the
 * "More" button whose menu holds it (the song's overview).
 */
export function statusButtonAttributes(loop: { id: string; status: LoopStatus }) {
  return { 'data-loop-status-of': loop.id, 'data-loop-status': loop.status };
}

/** The loop's status button, or with `status` only once the loop is listed with that status. */
export function findStatusButton(loopId: string, status?: LoopStatus): HTMLElement | null {
  const statusPart = status === undefined ? '' : `[data-loop-status="${status}"]`;
  return document.querySelector<HTMLElement>(`[data-loop-status-of="${loopId}"]${statusPart}`);
}

/**
 * A status change the server refused moves its loop back to the list it came
 * from, after focus followed it to the other one: the item it was on is taken
 * away and focus falls to `<body>` (13.21). This is the finder for
 * `useFocusWhenReady`, called when the refusal arrives: the loop's status
 * button once it is listed with its old status again.
 *
 * Null when focus is somewhere else on the page: a user who has moved on
 * keeps their place. Focus inside the loop's item moves only once what had it
 * has left the page, so an item that is already back, with the user in it, is
 * left alone too.
 */
export function findStatusButtonAfterRefusal(
  loopId: string,
  refused: LoopStatus,
): (() => HTMLElement | null) | null {
  const active = document.activeElement;
  const nowhere = active === null || active === document.body;
  if (!nowhere && !isInItem(loopId, active)) return null;
  const kept: LoopStatus = refused === 'finished' ? 'active' : 'finished';
  return () => (nowhere || !active.isConnected ? findStatusButton(loopId, kept) : null);
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
