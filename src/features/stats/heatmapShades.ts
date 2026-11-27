/**
 * The heatmap's fill for a day by its heat level (16 QA issue 6): a quiet
 * `raised` cell for none, then four steps of the brand, each at least 3:1
 * against the page and against an empty cell, so a practised day never reads
 * as an empty one. No imports, so tests/unit/designTokens.test.ts can check
 * `HEATMAP_BRAND_ALPHAS`; heatmapShades.test.ts keeps the classes equal to it.
 */
export const HEATMAP_BRAND_ALPHAS = [0.7, 0.8, 0.9, 1] as const;

/** By heat level, 0 to 4 (`heatLevel` in totals.ts). Written out so Tailwind finds each class. */
export const HEAT_CLASSES = [
  'fill-raised',
  'fill-brand/70',
  'fill-brand/80',
  'fill-brand/90',
  'fill-brand',
] as const;
