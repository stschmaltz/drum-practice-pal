/**
 * Width at and above which a full page of notation is readable (see
 * docs/units/01-spike.md): the stylesheet's `md`, in its unit.
 */
export const PAGE_LAYOUT_MIN_REM = 48;

/** In px at the browser's default 16 px font size, for code that only has a width (jsdom). */
export const PAGE_LAYOUT_MIN_WIDTH = PAGE_LAYOUT_MIN_REM * 16;

export type LayoutChoice = 'page' | 'horizontal';

export function layoutForWidth(width: number): LayoutChoice {
  return width >= PAGE_LAYOUT_MIN_WIDTH ? 'page' : 'horizontal';
}

/**
 * The same breakpoint as a media query, for watching it. In rem, as the
 * stylesheet's is, so a raised default font size moves both together.
 */
export const PAGE_LAYOUT_QUERY = `(min-width: ${PAGE_LAYOUT_MIN_REM}rem)`;

/**
 * The layout the score is drawn in. `readAlong`: the score is only read, by
 * hand, under something else that plays (a recording, Unit 14). It is then in
 * page layout at every width: lines that wrap down the page and scroll with
 * the window, since nothing moves a single horizontal line along for a
 * drummer with sticks in hand. Otherwise the layout for the width.
 */
export function layoutToDraw(forWidth: LayoutChoice, readAlong: boolean): LayoutChoice {
  return readAlong ? 'page' : forWidth;
}
