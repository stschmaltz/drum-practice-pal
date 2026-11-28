/**
 * Focus in the line-up under a video (Unit 19), as loopFocus.ts is for the
 * loop panel. Its controls stand in for one another ("Bar 1 starts now" gives
 * way to "Line up again", "Type a time" to its field), so a press hands focus
 * to the control that takes the pressed one's place (`useFocusWhenReady`).
 * Those controls are locked with `aria-disabled`, never `disabled`: a
 * disabled button can't take the focus handed to it.
 */
export type LineUpHandOver = 'now' | 'again' | 'typed';

export const handOverAttributes = (control: LineUpHandOver) => ({ 'data-line-up': control });

export const findHandOver = (control: LineUpHandOver) => () =>
  document.querySelector<HTMLElement>(`[data-line-up="${control}"]`);
