/** Width at and above which a full page of notation is readable (see docs/units/01-spike.md). */
export const PAGE_LAYOUT_MIN_WIDTH = 768;

export type LayoutChoice = 'page' | 'horizontal';

export function layoutForWidth(width: number): LayoutChoice {
  return width >= PAGE_LAYOUT_MIN_WIDTH ? 'page' : 'horizontal';
}

/** The same breakpoint as a media query, for watching it. */
export const PAGE_LAYOUT_QUERY = `(min-width: ${PAGE_LAYOUT_MIN_WIDTH}px)`;
