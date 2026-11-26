/**
 * Reading the design tokens in `src/index.css` and checking their contrast.
 * Pure: the token test and `scripts/generate-icons.ts` pass it the file's text.
 */

/** Every `--color-<name>: #rrggbb;` in the stylesheet, by name. */
export function parseColorTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/--color-([a-z][a-z0-9-]*):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const [, name, hex] = match;
    if (name && hex) tokens.set(name, hex.toLowerCase());
  }
  return tokens;
}

/** One colour token's hex, throwing when the stylesheet lacks it. */
export function colorToken(tokens: ReadonlyMap<string, string>, name: string): string {
  const hex = tokens.get(name);
  if (hex === undefined) throw new Error(`No --color-${name} token`);
  return hex;
}

function channels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
  return [match[1], match[2], match[3]].map((part) => parseInt(part ?? '0', 16) / 255) as [
    number,
    number,
    number,
  ];
}

/** WCAG 2's relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2's contrast ratio between two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG AA: 4.5:1 for text, 3:1 for large text and for the parts of a control (1.4.11). */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;
