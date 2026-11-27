/**
 * The loops columns the song page reads and edits, plus pure validation of the
 * loop form. No client import, so loopsApi.ts, the components and node tests
 * share it. Speed conversion lives in the player's speed.ts.
 */
import type { Database } from '@/lib/database.types';
import { isValidBarRange, LOOP_NAME_MAX_LENGTH } from '@/lib/schema';
import { ratioToPercent } from '@/features/player/speed';

type LoopRow = Database['public']['Tables']['loops']['Row'];

export const LOOP_FIELDS = [
  'id',
  'song_id',
  'name',
  'start_bar',
  'end_bar',
  'speed_ratio',
  'status',
  'finished_at',
  'last_practiced_at',
  'created_at',
] as const satisfies readonly (keyof LoopRow)[];

/** A literal, so supabase-js can type the selected row. Tested against LOOP_FIELDS. */
export const LOOP_SELECT =
  'id, song_id, name, start_bar, end_bar, speed_ratio, status, finished_at, last_practiced_at, created_at';

export type LoopField = (typeof LOOP_FIELDS)[number];
export type Loop = Pick<LoopRow, LoopField>;

/**
 * The columns the app writes after a loop exists: the loops update grant.
 * `status` is flipped by "Mark finished" and "Reopen" (Unit 09); finished_at
 * follows it in a trigger and can't be sent.
 */
export const LOOP_EDIT_FIELDS = [
  'name',
  'start_bar',
  'end_bar',
  'speed_ratio',
  'status',
] as const satisfies readonly LoopField[];

export type LoopEdit = Pick<Loop, (typeof LOOP_EDIT_FIELDS)[number]>;

/** What the form decides; the speed follows what the loop is played at, not typed here. */
export type LoopDetails = Pick<Loop, 'name' | 'start_bar' | 'end_bar'>;

/**
 * A new loop as the client sends it: the id is chosen here so a retry can't
 * insert twice. No status: a loop starts active, the column's default.
 */
export type NewLoop = Omit<LoopEdit, 'status'> & Pick<Loop, 'id' | 'song_id'>;

/** The form's fields as typed: text, so a half-typed number can be shown as is. */
export interface LoopFormValues {
  name: string;
  startBar: string;
  endBar: string;
}

/** The two bar fields, which the score can fill in as well as the keyboard. */
export type LoopBarFields = Pick<LoopFormValues, 'startBar' | 'endBar'>;

export type LoopFormErrors = Partial<Record<'name' | 'bars', string>>;

export const EMPTY_LOOP_FORM: LoopFormValues = {
  name: '',
  startBar: '',
  endBar: '',
};

export function loopFormValues(loop: LoopDetails): LoopFormValues {
  return {
    name: loop.name,
    startBar: String(loop.start_bar),
    endBar: String(loop.end_bar),
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
  values: LoopBarFields,
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

  if (!range || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, details: { name, start_bar: range.startBar, end_bar: range.endBar } };
}

function barsError(values: LoopFormValues, barCount: number): string {
  const startBar = parseBarNumber(values.startBar);
  const endBar = parseBarNumber(values.endBar);
  if (startBar === null || endBar === null) return 'Choose the first and last bar.';
  if (startBar > endBar) return "The last bar can't come before the first.";
  return `Bars go from 1 to ${barCount} in this song.`;
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

/** What saving the edit form sends: the details that differ from the saved loop. */
export function changedLoopDetails(saved: LoopEdit, details: LoopDetails): Partial<LoopEdit> {
  return changedLoopFields(saved, details);
}

/**
 * The server's answer to an edit, taken for the fields that edit sent and no
 * others, and for each of those only while the cache still holds the value
 * this edit sent. For while another write is pending: the server's row may be
 * from before that write, so its other fields would undo the optimistic
 * values, and so would a field both edits sent (90% then 80%: the first
 * answer would show 90% while 80% is still on its way). The same rule as
 * `revertLoopEdit`.
 */
export function applySavedLoopEdit<T extends LoopEdit>(
  current: T,
  saved: LoopEdit,
  changes: Partial<LoopEdit>,
): T {
  const merged = { ...current };
  for (const field of LOOP_EDIT_FIELDS) {
    const sent = changes[field];
    if (sent !== undefined && current[field] === sent) assign(merged, field, saved[field]);
  }
  return merged;
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

/** The columns `sortLoops` orders by. */
type SortableLoop = Pick<Loop, 'start_bar' | 'end_bar' | 'created_at' | 'id'>;

/** In the order the bars come in the song, which is how a drummer looks for a section. */
export function sortLoops<T extends SortableLoop>(loops: readonly T[]): T[] {
  return [...loops].sort(
    (a, b) =>
      a.start_bar - b.start_bar ||
      a.end_bar - b.end_bar ||
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}

/** The columns the panel's sections are built from. */
type ListedLoop = SortableLoop & Pick<Loop, 'status'>;

/** The loop panel's two sections, each in song order: the loops on the go, then the finished ones. */
export function loopsByStatus<T extends ListedLoop>(
  loops: readonly T[],
): { active: T[]; finished: T[] } {
  const sorted = sortLoops(loops);
  return {
    active: sorted.filter((loop) => loop.status === 'active'),
    finished: sorted.filter((loop) => loop.status === 'finished'),
  };
}

/** Every loop in the order the panel lists them, which is the order the keys step through. */
export function loopsInPanelOrder<T extends ListedLoop>(loops: readonly T[]): T[] {
  const { active, finished } = loopsByStatus(loops);
  return [...active, ...finished];
}

/** "Bar 5" or "Bars 5 to 8". */
export function barsLabel(startBar: number, endBar: number): string {
  return startBar === endBar ? `Bar ${startBar}` : `Bars ${startBar} to ${endBar}`;
}

/**
 * Every loop aims at the song's own speed: 100%. Not stored, so it can't drift
 * per loop; the "Mark finished?" prompt and the home page's bar read it here.
 */
export const TARGET_SPEED_RATIO = 1;

/**
 * The loop's saved speed has reached full speed, so the app asks "Mark
 * finished?". It only asks: a loop is never finished for the user. Compares
 * the saved speed, the one the loop was last played at, as the whole percent
 * its line shows: a speed typed as a BPM (119 at a tempo of 120 is 0.991667)
 * shows as "99%", and 100% means it shows as "100%".
 */
export function hasReachedTarget(loop: Pick<Loop, 'status' | 'speed_ratio'>): boolean {
  return (
    loop.status === 'active' &&
    ratioToPercent(loop.speed_ratio) >= ratioToPercent(TARGET_SPEED_RATIO)
  );
}

/**
 * Whether the playing loop is worth asking about: at full speed, and either
 * its speed has moved since it was chosen (it was worked up to 100%) or it
 * was practised before. A loop just saved at 100% hasn't been worked on yet,
 * so it isn't asked about until it has been.
 */
export function shouldAskToFinish(
  loop: Pick<Loop, 'status' | 'speed_ratio' | 'last_practiced_at'>,
  speedMovedSinceChosen: boolean,
): boolean {
  if (!hasReachedTarget(loop)) return false;
  return speedMovedSinceChosen || loop.last_practiced_at !== null;
}
