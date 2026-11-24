// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_LAYOUT_MIN_WIDTH } from '@/features/player/layout';
import { LOOP_COLUMN_MIN_WIDTH, LOOP_COLUMN_QUERY, loopPanelKindForWidth } from './loopPanelLayout';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.css'),
  'utf8',
);

/** A breakpoint from the stylesheet's theme, in px (1rem = 16px). */
function breakpointPx(name: string): number {
  const rem = new RegExp(`--breakpoint-${name}:\\s*([\\d.]+)rem;`).exec(css)?.[1];
  if (rem === undefined) throw new Error(`No --breakpoint-${name} in index.css`);
  return Number(rem) * 16;
}

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

  it('is a query for the same width', () => {
    expect(LOOP_COLUMN_QUERY).toBe('(min-width: 1024px)');
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
});
