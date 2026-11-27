// @vitest-environment node
/**
 * The design tokens in src/index.css (Unit 12): the colour pairs the app draws
 * meet WCAG AA, nothing in src/ uses a colour that isn't a token, and the
 * copies of token values outside the stylesheet (the score's colours, the
 * manifest's and index.html's theme colour) match it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCORE_COLORS } from '../../src/features/player/scoreTheme';
import { HEATMAP_BRAND_ALPHAS } from '../../src/features/stats/heatmapShades';
import {
  AA_NON_TEXT,
  AA_TEXT,
  colorToken,
  contrastRatio,
  parseColorTokens,
} from '../../src/lib/themeTokens';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const css = read('src/index.css');
const tokens = parseColorTokens(css);
const hex = (name: string) => colorToken(tokens, name);

/**
 * Text and the surfaces it is drawn on. Each line is a pairing the screens
 * use: change a screen to put text on a new surface and add the pair here.
 */
const TEXT_PAIRS: [text: string, on: string[]][] = [
  [
    'ink',
    [
      'canvas',
      'surface',
      'raised',
      'raised-hover',
      'brand-soft',
      'danger-soft',
      'warning-soft',
      'success-soft',
      'selected',
    ],
  ],
  ['ink-soft', ['canvas', 'surface', 'raised', 'raised-hover', 'brand-soft', 'selected']],
  ['ink-muted', ['canvas', 'surface', 'raised', 'brand-soft', 'selected']],
  ['selected-line', ['canvas', 'surface', 'raised', 'selected']],
  ['brand', ['canvas', 'surface', 'raised', 'brand-soft']],
  ['brand-hover', ['canvas', 'surface']],
  ['on-brand', ['brand', 'brand-hover']],
  ['on-danger', ['danger-solid', 'danger-solid-hover']],
  // raised-hover: a destructive item in an overflow menu, hovered or focused.
  ['danger', ['canvas', 'surface', 'raised', 'raised-hover', 'danger-soft', 'brand-soft']],
  ['warning', ['canvas', 'surface', 'warning-soft', 'brand-soft']],
  ['success', ['canvas', 'surface', 'success-soft']],
  ['score-ink', ['score-paper']],
  ['score-muted', ['score-paper']],
  ['score-accent', ['score-paper']],
];

/**
 * Parts of controls and states that aren't text (WCAG 1.4.11, 3:1): a field's
 * edge, the focus ring, a pressed toggle's ring, the brand fill of a primary
 * button against the page.
 */
const NON_TEXT_PAIRS: [part: string, on: string[]][] = [
  ['field-line', ['canvas', 'surface']],
  ['focus', ['canvas', 'surface', 'raised', 'brand-soft']],
  ['brand', ['canvas', 'surface', 'raised', 'brand-soft']],
  ['danger-solid', ['canvas', 'surface']],
  ['score-accent', ['score-paper']],
  // A toggle that is on: its ring and its check against the tile and the page around it.
  ['selected-line', ['canvas', 'surface', 'raised', 'selected']],
  // The loop range's dashed edge on the score.
  ['score-range', ['score-paper']],
  // The focus ring on a toggle that is on.
  ['focus', ['selected']],
  // Unit 14's progress marks and charts: a mastered ring or full bar, today's bar, the
  // full-speed line, against the page and the track they sit on.
  ['success', ['canvas', 'surface', 'line']],
  ['selected-line', ['line']],
  // The heatmap's ring round today, drawn in the gap beside the cells (14 QA issue 6).
  ['ink', ['canvas', 'surface']],
];

describe('token contrast', () => {
  it.each(TEXT_PAIRS.flatMap(([text, on]) => on.map((bg) => [text, bg] as const)))(
    '%s text on %s meets 4.5:1',
    (text, bg) => {
      expect(contrastRatio(hex(text), hex(bg))).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(NON_TEXT_PAIRS.flatMap(([part, on]) => on.map((bg) => [part, bg] as const)))(
    '%s against %s meets 3:1',
    (part, bg) => {
      expect(contrastRatio(hex(part), hex(bg))).toBeGreaterThanOrEqual(AA_NON_TEXT);
    },
  );
});

/** `top` at `alpha` over the opaque `under`, as hex: what a `bg-token/NN` class draws. */
function blend(top: string, alpha: number, under: string): string {
  const channels = (color: string) =>
    [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  const a = channels(top);
  const b = channels(under);
  return `#${a
    .map((c, i) =>
      Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Text on a see-through surface, against what shows through it. The playing
 * loop's card (`activeCardClass`, `brand-soft/40`) sits on the page or a
 * panel; the count-in number (`canvas/90`) sits over the score's paper.
 */
const BLENDED_TEXT_PAIRS: [text: string[], top: string, alpha: number, under: string][] = [
  [['ink', 'ink-soft', 'ink-muted', 'brand', 'danger'], 'brand-soft', 0.4, 'surface'],
  [['ink', 'ink-soft', 'ink-muted', 'brand', 'danger'], 'brand-soft', 0.4, 'canvas'],
  [['ink', 'ink-soft', 'brand'], 'canvas', 0.9, 'score-paper'],
];

describe('token contrast on see-through surfaces', () => {
  it.each(
    BLENDED_TEXT_PAIRS.flatMap(([texts, top, alpha, under]) =>
      texts.map((text) => [text, `${top}/${alpha * 100}`, under, top, alpha] as const),
    ),
  )('%s text on %s over %s meets 4.5:1', (text, _label, under, top, alpha) => {
    expect(contrastRatio(hex(text), blend(hex(top), alpha, hex(under)))).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  // 14 QA issue 6: every practised step of the heatmap (brand over the page) against the page
  // and the page's panels, and against an empty day's cell beside it.
  it.each(
    HEATMAP_BRAND_ALPHAS.flatMap((alpha) =>
      (['canvas', 'surface'] as const).flatMap((page) =>
        (['canvas', 'surface', 'raised'] as const).map(
          (against) => [alpha * 100, page, against, alpha] as const,
        ),
      ),
    ),
  )('heatmap brand/%s over %s against %s meets 3:1', (_label, page, against, alpha) => {
    const cell = blend(hex('brand'), alpha, hex(page));
    const next = against === 'raised' ? hex('raised') : hex(page);
    expect(contrastRatio(cell, next)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('blends as the browser does', () => {
    expect(blend('#000000', 0.5, '#ffffff')).toBe('#808080');
    expect(blend('#ff8a3d', 1, '#000000')).toBe('#ff8a3d');
  });
});

/** Every .ts and .tsx file under src/, as paths from the repo root. */
function sourceFiles(dir = join(root, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [relative(root, path)] : [];
  });
}

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITY =
  'bg|text|border|ring|outline|accent|fill|stroke|placeholder|decoration|divide|caret|from|via|to|shadow';

/** Utilities that share a colour utility's prefix but set something else. */
const NOT_COLORS = new Set([
  ...[
    'xs',
    'sm',
    'base',
    'lg',
    'xl',
    'left',
    'right',
    'center',
    'balance',
    'pretty',
    'wrap',
    'nowrap',
    'ellipsis',
    'clip',
  ].map((v) => `text-${v}`),
  ...['readout', 'count-in'].map((v) => `text-${v}`),
  ...['t', 'b', 'l', 'r', 'x', 'y', 'dashed', 'solid', 'none', 'collapse'].map(
    (v) => `border-${v}`,
  ),
  'ring-inset',
  'divide-x',
  'divide-y',
  'outline-none',
  'outline-offset',
  'outline-hidden',
  'shadow-card',
  'shadow-sheet',
  'shadow-dialog',
  'shadow-none',
  ...['current', 'transparent', 'inherit'].flatMap((v) =>
    COLOR_UTILITY.split('|').map((u) => `${u}-${v}`),
  ),
  'fill-none',
  'stroke-none',
  'decoration-none',
  'accent-auto',
]);

describe('only tokens', () => {
  const files = sourceFiles();

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files)('%s uses no palette colour, hex or rgb colour', (file) => {
    const text = read(file);
    const palette = new RegExp(
      `\\b(?:${COLOR_UTILITY})-(?:${PALETTE})-\\d{2,3}\\b|\\b(?:${COLOR_UTILITY})-(?:white|black)\\b`,
      'g',
    );
    expect(text.match(palette) ?? []).toEqual([]);
    // Arbitrary colours in a class (`bg-[#fff]`).
    expect(text.match(/-\[(?:#|rgb|hsl|oklch)[^\]]*\]/g) ?? []).toEqual([]);
    // Hex colours in code, apart from the score's copy of its tokens (checked below) and tests.
    if (!file.endsWith('scoreTheme.ts') && !/\.test\.tsx?$/.test(file)) {
      expect(text.match(/['"`]#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    }
  });

  it.each(
    files.filter(
      (file) =>
        (file.endsWith('.tsx') || file.endsWith('styles.ts')) && !/\.test\.tsx?$/.test(file),
    ),
  )('%s names only colour tokens that exist', (file) => {
    const used = read(file).matchAll(
      new RegExp(
        // `border-t-brand` is a colour too: one side's border.
        `(?<![\\w-])(?:[a-z-]+:)*((${COLOR_UTILITY})(?:-[trblxy])?-([a-z]+(?:-[a-z]+)*))(?:\\/\\d+)?(?![\\w-])`,
        'g',
      ),
    );
    const unknown = [...used]
      .map((match) => ({ utility: match[1] ?? '', name: match[3] ?? '' }))
      .filter(({ utility, name }) => !NOT_COLORS.has(utility) && !tokens.has(name))
      .map(({ utility }) => utility);
    expect(unknown).toEqual([]);
  });

  it('styles the stylesheet with tokens outside @theme', () => {
    const outsideTheme = css.replace(/@theme[^{]*\{[\s\S]*?\n\}/, '');
    expect(outsideTheme.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});

describe('copies of token values', () => {
  it('the score colours match the score tokens', () => {
    expect(SCORE_COLORS).toEqual({
      paper: hex('score-paper'),
      ink: hex('score-ink'),
      muted: hex('score-muted'),
      accent: hex('score-accent'),
    });
  });

  it('the manifest and index.html theme colour is the canvas', () => {
    const canvas = hex('canvas');
    const config = read('vite.config.ts');
    expect(config).toContain(`theme_color: '${canvas}'`);
    expect(config).toContain(`background_color: '${canvas}'`);
    expect(read('index.html')).toContain(`<meta name="theme-color" content="${canvas}" />`);
  });
});
