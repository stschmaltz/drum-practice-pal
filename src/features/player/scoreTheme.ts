/**
 * The score's colours and size, for alphaTab's rendering settings. alphaTab
 * draws into its own SVG and takes colours as values, not CSS variables, so
 * these repeat the `--color-score-*` tokens in `src/index.css`;
 * tests/unit/designTokens.test.ts fails if the two drift.
 */
export const SCORE_COLORS = {
  paper: '#fbf8f2',
  ink: '#1b1e26',
  muted: '#5b6272',
  accent: '#c2410c',
} as const;

/**
 * alphaTab's `display.resources` colours: notes, rests and clefs in ink,
 * staff lines and bar lines a step lighter so the notes stand out, bar numbers
 * in the accent so a bar is easy to find when picking a loop.
 */
export const SCORE_RESOURCES = {
  mainGlyphColor: SCORE_COLORS.ink,
  secondaryGlyphColor: SCORE_COLORS.muted,
  scoreInfoColor: SCORE_COLORS.ink,
  staffLineColor: SCORE_COLORS.muted,
  barSeparatorColor: SCORE_COLORS.ink,
  barNumberColor: SCORE_COLORS.accent,
} as const;

/**
 * alphaTab's `display.scale`. Left at its default: the engine's tap hit-test,
 * highlight and scroll maths read alphaTab's bounds as page pixels, and at 1.15
 * taps in the phone's horizontal layout missed their bar (12 Build). Raising
 * it needs those to divide by the scale first; see Unit 13's carried forward list.
 */
export const NOTATION_SCALE = 1;
