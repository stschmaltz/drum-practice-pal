/**
 * Where the loop panel is drawn at a window width. Below this it is a bottom
 * sheet (a phone, and a tablet in portrait); from here it is a column beside
 * the score. It is Tailwind's `lg` breakpoint, which `src/index.css` states
 * outright and LoopPanel's and SongPage's `lg:` classes use, so this rule and
 * the CSS can't disagree (loopPanelLayout.test.ts checks the two).
 *
 * Why 1024: beside the 225 px sidebar, a 320 px column leaves a tablet in
 * portrait (820 px) about 260 px of score, one bar to a line. From 1024 px
 * the score beside the column still fits a few bars to a line. It is separate
 * from the player's page/horizontal layout breakpoint (768 px, `layout.ts`),
 * which is about how alphaTab lays out notation, not where the panel goes.
 */
export const LOOP_COLUMN_MIN_WIDTH = 1024;

export type LoopPanelKind = 'sheet' | 'column';

export function loopPanelKindForWidth(width: number): LoopPanelKind {
  return width >= LOOP_COLUMN_MIN_WIDTH ? 'column' : 'sheet';
}

/** The same breakpoint as a media query. */
export const LOOP_COLUMN_QUERY = `(min-width: ${LOOP_COLUMN_MIN_WIDTH}px)`;
