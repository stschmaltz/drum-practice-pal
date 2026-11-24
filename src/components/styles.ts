/**
 * Shared Tailwind class strings, built only from the design tokens in
 * `src/index.css` (colours, `rounded-control` / `rounded-card`, `min-h-touch`,
 * the shadows). Touch targets stay at 44 px or more; every control shows the
 * focus ring on keyboard focus. Contrast of each pair is checked in
 * tests/unit/designTokens.test.ts.
 */

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Colour changes only: no movement, and nothing waits for it (index.css turns it off for reduced motion). */
const motion = 'transition-colors duration-150';

// inline-flex lines an icon up with its label. A button hidden below md takes
// `max-md:hidden`, which wins over it; plain `hidden` doesn't.
const buttonShape = `inline-flex items-center justify-center rounded-control font-medium ${focusRing} ${motion} disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50`;

const buttonBase = `${buttonShape} min-h-touch gap-2 px-4 py-2`;

const neutralColors = 'bg-raised text-ink hover:bg-raised-hover';

// The ring is the state, not only the fill (WCAG 1.4.11).
const pressedColors = 'bg-brand-soft text-ink ring-2 ring-inset ring-brand hover:bg-brand-soft';

export const buttonClass = `${buttonBase} ${neutralColors}`;

/** A toggle button (aria-pressed) while on; buttonClass while off. */
export const pressedButtonClass = `${buttonBase} ${pressedColors}`;

/**
 * A tool in the player's controls bar: icon over a short label in a tile, so
 * four share a row on a phone and in a tablet's column; icon beside the label
 * from lg, where a line of them fits.
 */
export function toolButtonClass(pressed: boolean): string {
  return `${buttonShape} min-h-14 min-w-0 flex-col gap-1 px-1 py-1.5 max-[359px]:px-0.5 text-center text-xs max-[359px]:text-[0.6875rem] leading-tight hyphens-auto lg:min-h-touch lg:flex-row lg:gap-2 lg:px-3 lg:py-2 lg:text-sm ${
    pressed ? pressedColors : neutralColors
  }`;
}

export const primaryButtonClass = `${buttonBase} bg-brand text-on-brand hover:bg-brand-hover`;

/** A quieter button for actions beside a primary one: no fill until hovered. */
export const ghostButtonClass = `${buttonBase} text-ink-soft hover:bg-raised hover:text-ink`;

/** A list item's secondary actions (Edit, History, Delete): ghost, smaller text, still 44 px tall. */
export const quietButtonClass = `${buttonShape} min-h-touch gap-1.5 px-3 py-2 text-sm text-ink-soft hover:bg-raised hover:text-ink`;

/** quietButtonClass while its toggle is on. */
export const quietPressedButtonClass = `${buttonShape} min-h-touch gap-1.5 px-3 py-2 text-sm ${pressedColors}`;

export const dangerButtonClass = `${buttonBase} bg-danger-solid text-on-danger hover:bg-danger-solid-hover`;

/** One of a few views of the same list (the home page's tabs), in a `rounded-card` track. */
export const segmentOffClass = `${buttonShape} min-h-touch gap-2 px-4 py-2 text-ink-muted hover:text-ink`;
export const segmentOnClass = `${buttonShape} min-h-touch gap-2 px-4 py-2 ${pressedColors}`;

export const inputClass = `min-h-touch rounded-control border border-field-line bg-canvas px-3 py-2 text-base text-ink placeholder:text-ink-muted ${focusRing}`;

export const selectClass = `${inputClass} py-1 disabled:cursor-not-allowed disabled:opacity-50`;

/** A panel or list item: a raised surface with a hairline edge. */
export const cardClass = 'rounded-card border border-line bg-surface shadow-card';

/** A card that is the one in play (the repeating loop, a loop's prompt). */
export const activeCardClass = 'rounded-card border border-brand-line bg-brand-soft/40 shadow-card';

/** A link to another page, on a line of its own (every use so far): a 44 px target like a button. */
export const linkClass = `inline-flex min-h-touch items-center rounded-sm font-medium text-brand underline underline-offset-4 hover:text-brand-hover ${focusRing}`;

/**
 * An icon at the start of a line of text, inline with it. Not a flex row: a
 * flex row makes each text node of `Couldn't save: {message}` its own item and
 * drops the spaces between them.
 */
export const inlineIconClass = 'mr-1.5 inline-block align-[-0.2em]';

/** A field's label above it. */
export const labelClass = 'text-sm font-medium text-ink-soft';
