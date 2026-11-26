// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_LAYOUT_MIN_WIDTH, PAGE_LAYOUT_QUERY } from '@/features/player/layout';
import { LOOP_COLUMN_MIN_WIDTH, LOOP_COLUMN_QUERY, loopPanelKindForWidth } from './loopPanelLayout';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.css'),
  'utf8',
);

/** A breakpoint from the stylesheet's theme, as written there ("64rem"). */
function breakpoint(name: string): string {
  const value = new RegExp(`--breakpoint-${name}:\\s*([\\d.]+rem);`).exec(css)?.[1];
  if (value === undefined) throw new Error(`No --breakpoint-${name} in rem in index.css`);
  return value;
}

/** The same in px at the browser's default 16 px font size. */
const breakpointPx = (name: string) => Number.parseFloat(breakpoint(name)) * 16;

describe('loopPanelKindForWidth', () => {
  it.each([
    // Phones.
    [320, 'sheet'],
    [390, 'sheet'],
    // Across the player's page layout breakpoint, still a sheet: a tablet in portrait.
    [767, 'sheet'],
    [768, 'sheet'],
    [820, 'sheet'],
    [1023, 'sheet'],
    // A tablet in landscape and up.
    [1024, 'column'],
    [1180, 'column'],
    [1440, 'column'],
  ] as const)('%i px: %s', (width, kind) => {
    expect(loopPanelKindForWidth(width)).toBe(kind);
  });

  it('is a query for the same width, in rem', () => {
    expect(LOOP_COLUMN_QUERY).toBe('(min-width: 64rem)');
  });
});

describe('the breakpoints the CSS and the code share', () => {
  it("the column starts at the stylesheet's lg, which LoopPanel's classes use", () => {
    expect(breakpointPx('lg')).toBe(LOOP_COLUMN_MIN_WIDTH);
  });

  it("the player's page layout is the stylesheet's md, and stays apart from the column", () => {
    expect(breakpointPx('md')).toBe(PAGE_LAYOUT_MIN_WIDTH);
    expect(LOOP_COLUMN_MIN_WIDTH).toBeGreaterThan(PAGE_LAYOUT_MIN_WIDTH);
  });

  // Copilot review on #18: a rem media query follows the browser's default font size, a px one
  // doesn't, so at 20 px a 1100 px window drew the sheet while the code took it for the column.
  it("the queries are the stylesheet's, units and all", () => {
    expect(LOOP_COLUMN_QUERY).toBe(`(min-width: ${breakpoint('lg')})`);
    expect(PAGE_LAYOUT_QUERY).toBe(`(min-width: ${breakpoint('md')})`);
  });
});
