/**
 * The app's mark, a snare drum with two crossed sticks, as data on a 512 grid,
 * so the wordmark (`Brand.tsx`) and the app icons (`scripts/generate-icons.ts`)
 * draw the same shapes. Colours are token names; each caller turns them into
 * a value (a CSS variable in the page, the hex from index.css in the script).
 */
export type BrandMarkColor = 'ink' | 'brand' | 'brand-hover' | 'on-brand';

export interface BrandMarkShape {
  tag: 'line' | 'path' | 'ellipse';
  attrs: Record<string, string | number>;
  fill?: BrandMarkColor;
  stroke?: BrandMarkColor;
}

const STICK = { 'stroke-width': 24, 'stroke-linecap': 'round' } as const;

export const BRAND_MARK_SHAPES: readonly BrandMarkShape[] = [
  { tag: 'line', attrs: { x1: 140, y1: 84, x2: 268, y2: 236, ...STICK }, stroke: 'ink' },
  { tag: 'line', attrs: { x1: 372, y1: 84, x2: 244, y2: 236, ...STICK }, stroke: 'ink' },
  {
    tag: 'path',
    attrs: { d: 'M100 256v100a156 56 0 0 0 312 0V256a156 56 0 0 1-312 0z' },
    fill: 'brand',
  },
  // The hoops at the top and bottom of the shell.
  {
    tag: 'path',
    attrs: { d: 'M100 356a156 56 0 0 0 312 0', 'stroke-width': 14, fill: 'none' },
    stroke: 'on-brand',
  },
  { tag: 'ellipse', attrs: { cx: 256, cy: 256, rx: 156, ry: 56 }, fill: 'brand-hover' },
  {
    tag: 'ellipse',
    attrs: { cx: 256, cy: 256, rx: 156, ry: 56, 'stroke-width': 14, fill: 'none' },
    stroke: 'on-brand',
  },
];

/** The mark as SVG markup, for the icon script. */
export function brandMarkMarkup(color: (name: BrandMarkColor) => string): string {
  return BRAND_MARK_SHAPES.map((shape) => {
    const attrs: Record<string, string | number> = { ...shape.attrs };
    if (shape.fill) attrs.fill = color(shape.fill);
    if (shape.stroke) attrs.stroke = color(shape.stroke);
    const text = Object.entries(attrs)
      .map(([name, value]) => `${name}="${value}"`)
      .join(' ');
    return `<${shape.tag} ${text}/>`;
  }).join('\n  ');
}
