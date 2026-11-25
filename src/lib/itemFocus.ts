/**
 * Where focus goes when a control in a list item replaces itself (bug hunt
 * S4): Edit gives way to the edit form, Delete to its "Delete …?" question,
 * and Cancel, Save or "Keep it" bring the buttons back. Without a hand-over
 * focus falls to `<body>`, and a keyboard or screen reader user starts again
 * from the top of the page. The controls carry data attributes so the render
 * that brings one in can find it (`useFocusWhenReady`); a form or a question
 * that appears in place of a button focuses itself on mount (`tabIndex={-1}`).
 */

/**
 * The item's controls that stand in for one another, and its main action
 * (`play`: a loop's Play loop, which takes focus from its Exit loop as that goes).
 */
export type ItemControl = 'edit' | 'delete' | 'play';

export function itemControlAttributes(itemId: string, control: ItemControl) {
  return { 'data-item-control': `${control}:${itemId}` };
}

/**
 * On the "More" button of an item whose controls live in an overflow menu
 * (`OverflowMenu`): the button stands for them while the menu is closed.
 */
export function itemMenuAttributes(itemId: string) {
  return { 'data-item-menu': itemId };
}

/** The control, or the item's "More" button when the control is in its closed menu. */
export function findItemControl(itemId: string, control: ItemControl): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(`[data-item-control="${control}:${itemId}"]`) ??
    document.querySelector<HTMLElement>(`[data-item-menu="${itemId}"]`)
  );
}

/** On the item itself, so a hand-over can wait until it has left the list. */
export function itemAttributes(itemId: string) {
  return { 'data-item': itemId };
}

export function isItemListed(itemId: string): boolean {
  return document.querySelector(`[data-item="${itemId}"]`) !== null;
}

/**
 * The item focus moves to when `leavingId` leaves `ids` (a list on show): the
 * one after it, or the one before when it was last; null when it was alone.
 */
export function neighbourAfterLeaving(ids: readonly string[], leavingId: string): string | null {
  const index = ids.indexOf(leavingId);
  if (index === -1) return null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}
