/**
 * The loops columns the song page reads and edits, plus pure validation of the
 * loop form. No client import, so loopsApi.ts, the components and node tests
 * share it. Speed conversion lives in the player's speed.ts.
 */
import type { Database } from '@/lib/database.types';
import {
  isValidBarRange,
  LOOP_NAME_MAX_LENGTH,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
} from '@/lib/schema';
import { percentToRatio, ratioToPercent } from '@/features/player/speed';

type LoopRow = Database['public']['Tables']['loops']['Row'];

export const LOOP_FIELDS = [
  'id',
  'song_id',
  'name',
  'start_bar',
  'end_bar',
  'speed_ratio',
  'target_ratio',
  'status',
  'last_practiced_at',
  'created_at',
] as const satisfies readonly (keyof LoopRow)[];

/** A literal, so supabase-js can type the selected row. Tested against LOOP_FIELDS. */
export const LOOP_SELECT =
  'id, song_id, name, start_bar, end_bar, speed_ratio, target_ratio, status, last_practiced_at, created_at';

export type LoopField = (typeof LOOP_FIELDS)[number];
export type Loop = Pick<LoopRow, LoopField>;

/** The columns this unit's UI writes after a loop exists. Mirrors the loops update grant, minus status (Unit 09). */
export const LOOP_EDIT_FIELDS = [
  'name',
  'start_bar',
  'end_bar',
  'speed_ratio',
  'target_ratio',
] as const satisfies readonly LoopField[];

export type LoopEdit = Pick<Loop, (typeof LOOP_EDIT_FIELDS)[number]>;

/** What the form decides; the speed is saved from the player ("Save speed"), not typed here. */
export type LoopDetails = Pick<Loop, 'name' | 'start_bar' | 'end_bar' | 'target_ratio'>;

/** A new loop as the client sends it: the id is chosen here so a retry can't insert twice. */
export type NewLoop = LoopEdit & Pick<Loop, 'id' | 'song_id'>;

/** The form's fields as typed: text, so a half-typed number can be shown as is. */
export interface LoopFormValues {
  name: string;
  startBar: string;
  endBar: string;
  /** Whole percent, or empty for no target. */
  targetPercent: string;
}

export type LoopFormErrors = Partial<Record<'name' | 'bars' | 'targetPercent', string>>;

export const EMPTY_LOOP_FORM: LoopFormValues = {
  name: '',
  startBar: '',
  endBar: '',
  targetPercent: '',
};

export function loopFormValues(loop: LoopDetails): LoopFormValues {
  return {
    name: loop.name,
    startBar: String(loop.start_bar),
    endBar: String(loop.end_bar),
    targetPercent: loop.target_ratio === null ? '' : String(ratioToPercent(loop.target_ratio)),
  };
}

const codePoints = (text: string) => Array.from(text).length;

/** A typed whole number ("5", " 12 "), or null for anything else ("", "5.5", "five"). */
export function parseBarNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * The typed bars as a range, or null until both are numbers that make a range
 * in a song of `barCount` bars. What the score highlights while the form is open.
 */
export function formBarRange(
  values: Pick<LoopFormValues, 'startBar' | 'endBar'>,
  barCount: number,
): { startBar: number; endBar: number } | null {
  const startBar = parseBarNumber(values.startBar);
  const endBar = parseBarNumber(values.endBar);
  if (startBar === null || endBar === null) return null;
  return isValidBarRange(startBar, endBar, barCount) ? { startBar, endBar } : null;
}

export type ParsedLoopForm =
  { ok: true; details: LoopDetails } | { ok: false; errors: LoopFormErrors };

/** Checks the form against the same limits as the database and gives the row fields to save. */
export function parseLoopForm(values: LoopFormValues, barCount: number): ParsedLoopForm {
  const errors: LoopFormErrors = {};

  // Trimmed, so a name of spaces is no name (the DB refuses it too).
  const name = values.name.trim();
  if (name === '') errors.name = 'Give the loop a name.';
  else if (codePoints(name) > LOOP_NAME_MAX_LENGTH) {
    errors.name = `Keep the name to ${LOOP_NAME_MAX_LENGTH} characters or fewer.`;
  }

  const range = formBarRange(values, barCount);
  if (!range) errors.bars = barsError(values, barCount);

  const target = parseTargetPercent(values.targetPercent);
  if (target === 'invalid') {
    errors.targetPercent = `Enter a target from ${ratioToPercent(SPEED_RATIO_MIN)} to ${ratioToPercent(SPEED_RATIO_MAX)}%, or leave it empty.`;
  }

  if (!range || target === 'invalid' || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    details: { name, start_bar: range.startBar, end_bar: range.endBar, target_ratio: target },
  };
}

function barsError(values: LoopFormValues, barCount: number): string {
  const startBar = parseBarNumber(values.startBar);
  const endBar = parseBarNumber(values.endBar);
  if (startBar === null || endBar === null) return 'Choose the first and last bar.';
  if (startBar > endBar) return "The last bar can't come before the first.";
  return `Bars go from 1 to ${barCount} in this song.`;
}

/** Empty is no target (null). Anything that isn't a whole percent within the speed bounds is invalid. */
function parseTargetPercent(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(/%$/, '').trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const percent = Number(trimmed);
  const min = ratioToPercent(SPEED_RATIO_MIN);
  const max = ratioToPercent(SPEED_RATIO_MAX);
  return percent >= min && percent <= max ? percentToRatio(percent) : 'invalid';
}

/** Only the fields that differ, so a save never rewrites what another device just changed. */
export function changedLoopFields(saved: LoopEdit, edit: Partial<LoopEdit>): Partial<LoopEdit> {
  const changes: Partial<LoopEdit> = {};
  for (const field of LOOP_EDIT_FIELDS) {
    const value = edit[field];
    if (value !== undefined && value !== saved[field]) assign(changes, field, value);
  }
  return changes;
}

/**
 * Undoes a failed optimistic edit on the current cached loop: each sent field
 * goes back to its value before the edit, but only while it still holds the
 * optimistic value, so a newer edit or refetch of that field survives.
 */
export function revertLoopEdit<T extends LoopEdit>(
  current: T,
  before: LoopEdit,
  changes: Partial<LoopEdit>,
): T {
  const reverted = { ...current };
  for (const field of LOOP_EDIT_FIELDS) {
    const sent = changes[field];
    if (sent !== undefined && current[field] === sent) assign(reverted, field, before[field]);
  }
  return reverted;
}

/** Typed per field, which a loop over the field names can't express to TypeScript. */
function assign<K extends keyof LoopEdit>(target: Partial<LoopEdit>, field: K, value: LoopEdit[K]) {
  target[field] = value;
}

/** In the order the bars come in the song, which is how a drummer looks for a section. */
export function sortLoops<T extends Pick<Loop, 'start_bar' | 'end_bar' | 'created_at' | 'id'>>(
  loops: readonly T[],
): T[] {
  return [...loops].sort(
    (a, b) =>
      a.start_bar - b.start_bar ||
      a.end_bar - b.end_bar ||
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}

/** "Bar 5" or "Bars 5 to 8". */
export function barsLabel(startBar: number, endBar: number): string {
  return startBar === endBar ? `Bar ${startBar}` : `Bars ${startBar} to ${endBar}`;
}
