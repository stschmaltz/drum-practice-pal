/**
 * Keyboard shortcuts and page-turner pedals (Unit 10), as pure rules: which
 * key press means what, where the focus leaves a key to the control that has
 * it, and the small sums the actions need. No React or DOM: the song page's
 * hook (`useSongShortcuts`) feeds it each `keydown` and does what it says.
 */
import { COUNT_IN_BAR_OPTIONS, type CountInBars } from '@/lib/schema';

export const SHORTCUT_ACTIONS = [
  'togglePlay',
  'speedUp',
  'speedDown',
  'previousLoop',
  'nextLoop',
  'metronome',
  'drumsMuted',
  'drumsOnly',
  'countIn',
  'help',
] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/**
 * `KeyboardEvent.key` to action. Letters are matched in lower case, so Caps
 * Lock doesn't matter. Page-turner pedals send PageUp/PageDown or the left
 * and right arrows, so both pairs switch loops.
 */
export const KEY_BINDINGS: Readonly<Record<string, ShortcutAction>> = {
  ' ': 'togglePlay',
  ArrowUp: 'speedUp',
  ArrowDown: 'speedDown',
  ArrowLeft: 'previousLoop',
  PageUp: 'previousLoop',
  ArrowRight: 'nextLoop',
  PageDown: 'nextLoop',
  m: 'metronome',
  d: 'drumsMuted',
  s: 'drumsOnly',
  c: 'countIn',
  '?': 'help',
};

/**
 * A key that types one printable character other than Space: a letter,
 * number, punctuation mark or symbol. WCAG 2.1.4 (Character Key Shortcuts)
 * asks that a shortcut on such a key can be turned off, because speech input
 * types them with the focus anywhere ("question mark" is a `?`), so the
 * device's "Single-letter shortcuts" switch covers these: M, D, S, C and `?`.
 * Space, the arrows and the page keys aren't characters 2.1.4 names, and a
 * page-turner pedal needs them, so they stay on.
 */
export function isCharacterKey(key: string): boolean {
  return key.length === 1 && key !== ' ';
}

/** The bound keys the "Single-letter shortcuts" switch turns off. */
export const CHARACTER_KEYS: readonly string[] = Object.keys(KEY_BINDINGS).filter(isCharacterKey);

/** "M, D, S, C and ?": the keys the switch covers, for the copy in Settings and the overlay. */
export function characterKeysLabel(): string {
  const shown = CHARACTER_KEYS.map((key) => key.toUpperCase());
  return shown.length < 2 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

/** How each bound key is written in the overlay. */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ' ': 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

/** Holding the key down goes on nudging; every other action happens once per press. */
const REPEATABLE: ReadonlySet<ShortcutAction> = new Set(['speedUp', 'speedDown']);

/** The keys a focused range slider moves itself with. */
const SLIDER_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
]);

/** The keys a focused radio (a segmented control) or menu item moves the choice with. */
const ARROW_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/**
 * What the focused element does with keys of its own. `typing`: every key
 * (text fields, selects with their type-ahead, contenteditable). `slider`: the
 * arrows and page keys. `choice`: the arrows (a radio in a segmented control
 * moves to the next option, a menu item to the next item); the page keys still
 * switch loops, as a pedal on a focused count-in must. `other`: none that a shortcut uses, buttons included:
 * Space is play/pause wherever the focus is, so a loop's "Play loop" pressed
 * with the mouse (which leaves it focused) isn't pressed again by Space, and
 * "Mark finished" can't be answered by it. Enter still presses a button.
 */
export type FocusKind = 'typing' | 'slider' | 'choice' | 'other';

/** The parts of an element the guard looks at, so it can be tested without a DOM. */
export interface FocusedElement {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
  /** `getAttribute('role')`: a menu item takes its arrows. */
  role?: string | null;
}

/** The roles whose arrows move within a group of choices. */
const CHOICE_ROLES: ReadonlySet<string> = new Set([
  'menuitem',
  'menuitemradio',
  'menuitemcheckbox',
  'radio',
]);

/** Input types that take no typed text. Everything else (text, number, search, email…) types. */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'reset',
  'submit',
]);

export function focusKindOf(element: FocusedElement | null): FocusKind {
  if (!element) return 'other';
  if (element.isContentEditable) return 'typing';
  if (element.role && CHOICE_ROLES.has(element.role)) return 'choice';
  const tag = element.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return 'typing';
  if (tag !== 'INPUT') return 'other';
  const type = (element.type ?? 'text').toLowerCase();
  if (type === 'range') return 'slider';
  if (type === 'radio') return 'choice';
  return NON_TEXT_INPUT_TYPES.has(type) ? 'other' : 'typing';
}

/** The parts of a `KeyboardEvent` the rules look at. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  /** Something on the way (a field's own Enter, the overlay's Escape) has handled it already. */
  defaultPrevented: boolean;
}

export interface ShortcutContext {
  focus: FocusKind;
  /** The shortcut overlay is open: only `?` and Escape mean anything then. */
  helpOpen: boolean;
  /** This device's "Single-letter shortcuts" switch: false leaves every `isCharacterKey` key alone. */
  characterKeys: boolean;
}

/**
 * What a key press asks for. `run` false means the key is a shortcut's but
 * this press does nothing (a held key auto-repeating): the page still keeps
 * the browser's default (scrolling) from happening, without acting twice.
 */
export interface ResolvedShortcut {
  action: ShortcutAction | 'closeHelp';
  run: boolean;
}

export function resolveShortcut(
  press: KeyPress,
  context: ShortcutContext,
): ResolvedShortcut | null {
  if (press.defaultPrevented || press.isComposing) return null;
  // The browser's and the system's own shortcuts (Ctrl+S, Cmd+←, Alt+D…) stay theirs.
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  // Turned off, the key is the browser's as if it were bound to nothing, the overlay's `?` included.
  if (!context.characterKeys && isCharacterKey(press.key)) return null;

  if (context.helpOpen) {
    if (press.key === 'Escape') return { action: 'closeHelp', run: true };
    if (press.key === '?') return { action: 'help', run: !press.repeat };
    // The overlay is modal: Tab and its button's own keys work as usual.
    return null;
  }

  if (context.focus === 'typing') return null;
  if (context.focus === 'slider' && SLIDER_KEYS.has(press.key)) return null;
  if (context.focus === 'choice' && ARROW_KEYS.has(press.key)) return null;

  const action = KEY_BINDINGS[press.key.length === 1 ? press.key.toLowerCase() : press.key];
  if (!action) return null;
  // Shift is how most layouts type `?`; anything else with Shift (Shift+Space scrolls up) is not ours.
  if (press.shiftKey && press.key !== '?') return null;
  return { action, run: !press.repeat || REPEATABLE.has(action) };
}

/** One row of the overlay: what it does and the keys that do it, from `KEY_BINDINGS`. */
export interface ShortcutHelpRow {
  label: string;
  keys: string[];
}

const HELP_ROWS: readonly { actions: ShortcutAction[]; label: string }[] = [
  { actions: ['togglePlay'], label: 'Play or pause' },
  { actions: ['speedUp', 'speedDown'], label: 'Speed up or down 5%' },
  {
    actions: ['previousLoop', 'nextLoop'],
    label: 'Previous or next loop (a bar back or on, when the song has no loops)',
  },
  { actions: ['metronome'], label: 'Metronome on or off' },
  { actions: ['drumsMuted'], label: 'Mute drums' },
  { actions: ['drumsOnly'], label: 'Drums only' },
  { actions: ['countIn'], label: 'Count-in: off, 1 bar, 2 bars' },
  { actions: ['help'], label: 'Show or hide these shortcuts' },
];

/**
 * The overlay's rows, in reading order. Every action has one (a test checks).
 * With the single-letter shortcuts off, only the keys that still work are
 * listed, and a row left with none is dropped.
 */
export function shortcutHelp({ characterKeys = true } = {}): ShortcutHelpRow[] {
  return HELP_ROWS.map(({ actions, label }) => ({
    label,
    keys: Object.entries(KEY_BINDINGS)
      .filter(
        ([key, action]) => actions.includes(action) && (characterKeys || !isCharacterKey(key)),
      )
      .map(([key]) => KEY_LABELS[key] ?? key.toUpperCase()),
  })).filter((row) => row.keys.length > 0);
}

/** The help rows' actions, for the test that no action is left out of the overlay. */
export const HELP_ROW_ACTIONS: readonly ShortcutAction[] = HELP_ROWS.flatMap((row) => row.actions);

/** C: off, 1 bar, 2 bars, then off again. */
export function nextCountInBars(bars: CountInBars): CountInBars {
  const index = COUNT_IN_BAR_OPTIONS.indexOf(bars);
  return COUNT_IN_BAR_OPTIONS[(index + 1) % COUNT_IN_BAR_OPTIONS.length] ?? 0;
}

export type Direction = 'previous' | 'next';

/**
 * The loop before or after the current one in `order` (the panel's order).
 * From no loop, or one not in the list, "next" is the first and "previous"
 * the last. It doesn't wrap: a pedal pressed at the end does nothing rather
 * than jump to the other end of the song.
 */
export function neighbourLoop<T extends { id: string }>(
  order: readonly T[],
  currentId: string | null,
  direction: Direction,
): T | null {
  const index = currentId === null ? -1 : order.findIndex((loop) => loop.id === currentId);
  if (index === -1) return (direction === 'next' ? order[0] : order.at(-1)) ?? null;
  return order[direction === 'next' ? index + 1 : index - 1] ?? null;
}

/** A bar back or on from `barNumber` (1-based), kept inside the song; null when there is none. */
export function steppedBar(
  barNumber: number,
  barCount: number,
  direction: Direction,
): number | null {
  const next = direction === 'next' ? barNumber + 1 : barNumber - 1;
  return next >= 1 && next <= barCount ? next : null;
}
