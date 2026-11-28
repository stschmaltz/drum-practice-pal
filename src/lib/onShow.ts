/**
 * Whether an element is drawn on the page: neither it nor anything it sits in
 * carries `hidden`. For a component that stays mounted while a parent hides
 * it, and so can't tell from its own props and state (the loop sheet under a
 * recording, which keeps its `open`). Read it in an effect or a handler, never
 * while rendering: it is the page as committed.
 *
 * It knows `hidden` only, which is how this app takes mounted things off the
 * page; something hidden by a class of its own (`display: none`) needs its
 * own answer.
 */
export function isOnShow(element: Element | null): boolean {
  return element !== null && element.isConnected && element.closest('[hidden]') === null;
}
