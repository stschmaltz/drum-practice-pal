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
const buttonShape = `inline-flex items-center justify-center rounded-control font-medium ${focusRing} ${motion} disabled:cursor-not-allowed aria-disabled:cursor-not-allowed`;

/** Off: faded. Every button but the primary one, whose off state is drawn on its own (`primaryButtonClass`). */
const dimmedWhenOff = 'disabled:opacity-50 aria-disabled:opacity-50';

const buttonBase = `${buttonShape} min-h-touch gap-2 px-4 py-2`;

const neutralColors = `bg-raised text-ink hover:bg-raised-hover ${dimmedWhenOff}`;

/**
 * Selected or on (a toggle, the current view): the quiet `selected` fill with
 * a ring, never the brand, which is kept for the main action and for what is
 * playing. The ring is the state, not only the fill (WCAG 1.4.11); a toggle
 * also draws a check (`ToggleMark`), so on and off differ in shape too (1.4.1).
 */
const selectedColors = `bg-selected text-ink ring-2 ring-inset ring-selected-line ${dimmedWhenOff}`;

export const buttonClass = `${buttonBase} ${neutralColors}`;

/** A toggle button (aria-pressed) while on; buttonClass while off. */
export const pressedButtonClass = `${buttonBase} ${selectedColors}`;

/**
 * A tool in the player's controls bar: icon over a short label in a tile, so
 * four share a row on a phone and in a tablet's column; icon beside the label
 * from lg, where a line of them fits. `relative`: a toggle's `ToggleMark` sits
 * in its corner. `inline` lays it out as a row whatever the width (the folded
 * controls' strip, 12 UX pass).
 */
export function toolButtonClass(pressed: boolean, { inline = false } = {}): string {
  const shape = inline
    ? 'min-h-touch flex-row gap-2 px-3 py-2 text-sm'
    : 'min-h-14 min-w-0 flex-col gap-1 px-1 py-1.5 max-[359px]:px-0.5 text-center text-xs max-[359px]:text-[0.6875rem] leading-tight hyphens-auto lg:min-h-touch lg:flex-row lg:gap-2 lg:px-3 lg:py-2 lg:text-sm';
  return `${buttonShape} relative ${shape} ${pressed ? selectedColors : neutralColors}`;
}

// Written out in full (not built from the variant name): Tailwind only finds whole class names.
const primaryOff =
  'disabled:border-dashed disabled:border-line-strong disabled:bg-transparent disabled:text-ink-muted aria-disabled:border-dashed aria-disabled:border-line-strong aria-disabled:bg-transparent aria-disabled:text-ink-muted';

/** The primary look's off state for a `<label>` that stands for a disabled input (the upload's file picker). */
export const primaryLabelOffClass =
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:border-dashed has-[:disabled]:border-line-strong has-[:disabled]:bg-transparent has-[:disabled]:text-ink-muted';

/**
 * The main action of an area. Off, it is drawn as off rather than as a faded
 * orange (12 UX pass, Nielsen's "visibility of system status": a dimmed
 * primary still reads as the thing to press): no fill, a dashed edge, muted text.
 */
export const primaryButtonClass = `${buttonBase} border border-transparent bg-brand text-on-brand hover:bg-brand-hover ${primaryOff}`;

/** A quieter button for actions beside a primary one: no fill until hovered. */
export const ghostButtonClass = `${buttonBase} text-ink-soft hover:bg-raised hover:text-ink ${dimmedWhenOff}`;

const quietBase = `${buttonShape} min-h-touch gap-1.5 px-3 py-2 text-sm`;

/** A list item's secondary actions (Edit, History, Delete): ghost, smaller text, still 44 px tall. */
export const quietButtonClass = `${quietBase} text-ink-soft hover:bg-raised hover:text-ink ${dimmedWhenOff}`;

/** quietButtonClass while its toggle is on. */
export const quietPressedButtonClass = `${quietBase} ${selectedColors}`;

export const dangerButtonClass = `${buttonBase} bg-danger-solid text-on-danger hover:bg-danger-solid-hover ${dimmedWhenOff}`;

/** One of a few views of the same list (the home page's tabs), in a `rounded-card` track. */
export const segmentOffClass = `${buttonBase} text-ink-muted hover:text-ink ${dimmedWhenOff}`;
export const segmentOnClass = `${buttonBase} ${selectedColors}`;

/**
 * A segmented control's option (`SegmentedControl`): a label over a visually
 * hidden radio. The label draws the radio's focus ring and its checked state,
 * so the focus audit measures the label (checklist 6, a hidden stand-in).
 */
export const segmentOptionClass = `inline-flex min-h-touch flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-control px-3 text-sm font-medium text-ink-soft ${motion} hover:text-ink has-[:checked]:bg-selected has-[:checked]:text-ink has-[:checked]:ring-2 has-[:checked]:ring-inset has-[:checked]:ring-selected-line has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`;

/** The track the options of a `SegmentedControl` sit in. */
export const segmentTrackClass = 'flex gap-1 rounded-control border border-line bg-canvas p-1';

export const inputClass = `min-h-touch rounded-control border border-field-line bg-canvas px-3 py-2 text-base text-ink placeholder:text-ink-muted ${focusRing}`;

/**
 * A list of cards (the home page's loops, the library's songs): one column,
 * then two from 1024 px and three from 1280 px. Text pages (Settings) keep
 * their measure instead.
 */
export const cardGridClass = 'grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3';

/** A panel or list item: a raised surface with a hairline edge. */
export const cardClass = 'rounded-card border border-line bg-surface shadow-card';

/** A card that is the one in play (the repeating loop, a loop's prompt). */
export const activeCardClass = 'rounded-card border border-brand-line bg-brand-soft/40 shadow-card';

const dangerSurface = 'border border-danger-solid/50 bg-danger-soft';

/** A destructive step's confirm, or an error, inside a card or a form. */
export const dangerPanelClass = `rounded-control ${dangerSurface} p-3`;

/** An error that is a card of its own on the page (a failed load, unsaved practice). */
export const dangerCardClass = `rounded-card ${dangerSurface}`;

/** A section's heading inside a page: an h2, or a fieldset's legend. */
export const sectionHeadingClass = 'text-lg font-bold tracking-tight';

/** A small heading inside a section (an h3), or the label over a figure: quiet capitals. */
export const smallHeadingClass = 'text-xs font-semibold tracking-wider text-ink-muted uppercase';

/** A figure worth its own line: a total, a record. */
export const statValueClass = 'text-2xl font-bold tabular-nums';

/**
 * An item's own name as the way to it (a loop's name to its practice screen,
 * a song's title to the song): plain ink, the brand on hover, and a 44 px
 * target however short the name. A name that may be one long word adds
 * `wrap-anywhere`; one that must stay on a line truncates inside it.
 */
export const nameLinkClass = `inline-flex min-h-touch max-w-full min-w-touch items-center rounded-sm text-ink hover:text-brand ${focusRing}`;

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
