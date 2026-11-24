/**
 * The practice_sessions columns the app reads and writes, and the wording of
 * a loop's history. No client import, so sessionsApi.ts, the components and
 * node tests share it. Working out a session is sessionTracker.ts.
 */
import type { Database } from '@/lib/database.types';
import type { SessionRecord } from './sessionTracker';

type SessionRow = Database['public']['Tables']['practice_sessions']['Row'];
type SessionInsert = Database['public']['Tables']['practice_sessions']['Insert'];

export const SESSION_FIELDS = [
  'id',
  'loop_id',
  'started_at',
  'duration_seconds',
  'speed_ratio',
  'repeats',
] as const satisfies readonly (keyof SessionRow)[];

/** A literal, so supabase-js can type the selected row. Tested against SESSION_FIELDS. */
export const SESSION_SELECT = 'id, loop_id, started_at, duration_seconds, speed_ratio, repeats';

export type PracticeSession = Pick<SessionRow, (typeof SESSION_FIELDS)[number]>;

/**
 * The columns a client may insert (the practice_sessions insert grant).
 * created_at is the server's.
 */
export const SESSION_INSERT_FIELDS = [
  'id',
  'user_id',
  'loop_id',
  'started_at',
  'duration_seconds',
  'speed_ratio',
  'repeats',
] as const satisfies readonly (keyof SessionInsert)[];

export type NewSession = Required<Pick<SessionInsert, (typeof SESSION_INSERT_FIELDS)[number]>>;

/** A tracked session as the row to insert. The id is the tracker's, so a retry is a duplicate. */
export function sessionInsert(userId: string, record: SessionRecord): NewSession {
  return {
    id: record.id,
    user_id: userId,
    loop_id: record.loopId,
    started_at: record.startedAt,
    duration_seconds: record.durationSeconds,
    speed_ratio: record.speedRatio,
    repeats: record.repeats,
  };
}

/** The row a just-logged session will read back as, for the history cache until the refetch. */
export function sessionFromRecord(record: SessionRecord): PracticeSession {
  return {
    id: record.id,
    loop_id: record.loopId,
    started_at: record.startedAt,
    duration_seconds: record.durationSeconds,
    speed_ratio: record.speedRatio,
    repeats: record.repeats,
  };
}

/** Newest first, which is how a history reads. */
export function sortSessions<T extends Pick<PracticeSession, 'started_at' | 'id'>>(
  sessions: readonly T[],
): T[] {
  return [...sessions].sort(
    (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at) || a.id.localeCompare(b.id),
  );
}

/** "45 s", "1 min 5 s", "12 min", "1 h 4 min". Seconds are dropped from an hour up. */
export function durationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${rest} s`;
}

/** "1 pass" / "12 passes". */
export function repeatsLabel(repeats: number): string {
  return repeats === 1 ? '1 pass' : `${repeats} passes`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * A date as a drummer would say it: "Today", "Yesterday", "3 days ago", then
 * the date itself ("12 Nov", with the year once it isn't this one). Days are
 * the device's calendar days. A time ahead of the clock reads as today.
 */
export function practiceDateLabel(iso: string, now: Date, locale?: string): string {
  const date = new Date(iso);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** "Last practiced today", "Last practiced 12 Nov", or "Not practiced yet" for a loop with no session. */
export function lastPracticedLabel(iso: string | null, now: Date, locale?: string): string {
  if (iso === null) return 'Not practiced yet';
  return `Last practiced ${practiceDayInSentence(iso, now, locale)}`;
}

/** practiceDateLabel for the middle of a sentence: "today" and "yesterday", while a date keeps its capital. */
export function practiceDayInSentence(iso: string, now: Date, locale?: string): string {
  const day = practiceDateLabel(iso, now, locale);
  return day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day;
}

/** The clock time a session started, "19:42" or "7:42 PM" as the device has it. */
export function practiceTimeLabel(iso: string, locale?: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** All play time in a history, in seconds. */
export function totalPracticeSeconds(
  sessions: readonly Pick<PracticeSession, 'duration_seconds'>[],
): number {
  return sessions.reduce((total, session) => total + session.duration_seconds, 0);
}
