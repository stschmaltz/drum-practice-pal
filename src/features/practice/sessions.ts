/**
 * The practice_sessions columns the app reads and writes, and the wording of
 * a loop's history. No client import, so sessionsApi.ts, the components and
 * node tests share it. Working out a session is sessionTracker.ts.
 */
import { ratioToPercent } from '@/features/player/speed';
import { dateOfDayKey, dayKeyOf, dayKeyOfIso, type DayKey } from '@/features/stats/days';
import { COPY_LOCALE } from '@/lib/copyLocale';
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

/** "1 pass" / "12 passes" / "1,100 passes": grouped as the Stats page writes the same count. */
export function repeatsLabel(repeats: number): string {
  return repeats === 1 ? '1 pass' : `${repeats.toLocaleString(COPY_LOCALE)} passes`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * A date as a drummer would say it: "Today", "Yesterday", "3 days ago", then
 * the date itself ("Nov 12", with the year once it isn't this one), in English
 * like the words round it whatever the browser's locale (`COPY_LOCALE`; 20
 * batch 9 Review: "Last practised 8. Juni"). Days are the device's calendar
 * days. A time ahead of the clock reads as today. `locale` is for tests.
 */
export function practiceDateLabel(iso: string, now: Date, locale = COPY_LOCALE): string {
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

/** "Last practised today", "Last practised Nov 12", or "Not practised yet" for a loop with no session. */
export function lastPracticedLabel(iso: string | null, now: Date, locale = COPY_LOCALE): string {
  if (iso === null) return 'Not practised yet';
  return `Last practised ${practiceDayInSentence(iso, now, locale)}`;
}

/** practiceDateLabel for the middle of a sentence: "today" and "yesterday", while a date keeps its capital. */
export function practiceDayInSentence(iso: string, now: Date, locale = COPY_LOCALE): string {
  const day = practiceDateLabel(iso, now, locale);
  return day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day;
}

/** All play time in a history, in seconds. */
export function totalPracticeSeconds(
  sessions: readonly Pick<PracticeSession, 'duration_seconds'>[],
): number {
  return sessions.reduce((total, session) => total + session.duration_seconds, 0);
}

/**
 * The rule a day's speed follows, as the user is told it: under Loop progress
 * on the Stats page and in a loop's History, which draw the same days. One
 * string, so the two can't come to say different things.
 */
export const DAY_SPEED_NOTE =
  "Each day counts at the speed you spent the most time at, so a quick try at full speed isn't a day at full speed.";

/** One day of a loop's history: every session begun that day, added up. */
export interface HistoryDay {
  /** The device's calendar day, "2026-11-23". */
  key: DayKey;
  /** "Today", "Yesterday", "3 days ago", then the date. */
  label: string;
  /** The day's play time on the loop, at any speed. */
  seconds: number;
  repeats: number;
  /** The speed with the most play time that day. */
  speedRatio: number;
}

/**
 * A loop's sessions as its history shows them: one row per day practised,
 * newest first (D4 of docs/loose-ends.md). Every stop of 30 seconds is a
 * session, so one sitting with pauses is several of them; the question the
 * history answers is whether the loop is getting faster over days.
 *
 * A day's speed is the one with the most play time, the slower on a tie: the
 * Stats chart's rule (dailySpeeds in stats/loopProgress.ts; a test keeps the
 * two equal). Speeds are told apart as the percent shown, and the day keeps
 * the exact ratio played last of that percent, so a typed BPM reads back as
 * typed. A session dated ahead of the clock counts for today, as
 * practiceDateLabel reads it.
 */
export function historyDays(
  sessions: readonly PracticeSession[],
  now: Date,
  locale = COPY_LOCALE,
): HistoryDay[] {
  const today = dayKeyOf(now);
  const days = new Map<
    DayKey,
    { seconds: number; repeats: number; speeds: Map<number, { seconds: number; ratio: number }> }
  >();
  // Oldest first, so the ratio left on each speed is the one played last.
  for (const session of sortSessions(sessions).reverse()) {
    const sessionDay = dayKeyOfIso(session.started_at);
    const key = sessionDay > today ? today : sessionDay;
    const day = days.get(key) ?? { seconds: 0, repeats: 0, speeds: new Map() };
    const percent = ratioToPercent(session.speed_ratio);
    day.seconds += session.duration_seconds;
    day.repeats += session.repeats;
    day.speeds.set(percent, {
      seconds: (day.speeds.get(percent)?.seconds ?? 0) + session.duration_seconds,
      ratio: session.speed_ratio,
    });
    days.set(key, day);
  }
  return [...days]
    .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
    .map(([key, day]) => {
      const [main] = [...day.speeds].sort(
        ([percentA, a], [percentB, b]) => b.seconds - a.seconds || percentA - percentB,
      );
      return {
        key,
        label: practiceDateLabel(dateOfDayKey(key).toISOString(), now, locale),
        seconds: day.seconds,
        repeats: day.repeats,
        // A day only exists for a session in it, so it always has a speed.
        speedRatio: main?.[1].ratio ?? 1,
      };
    });
}
