/**
 * The Stats page's periods, totals and day-by-day play time, worked out from
 * the user's sessions and loops. Pure: nothing here is stored (docs/plan.md,
 * Units 16 and 17), and every function takes `now` so tests pick the day.
 * The practice-day map is heatmap.ts; how a time or a count is written,
 * statLabels.ts.
 */
import type { PracticeSession } from '@/features/practice/sessions';
import type { Loop } from '@/features/loops/loopForm';
import { addDays, dayKeyOf, dayKeyOfIso, type DayKey } from './days';
import { countLabel, minutesLabel, wholeMinutes } from './statLabels';

export type StatsSession = Pick<
  PracticeSession,
  'id' | 'loop_id' | 'started_at' | 'duration_seconds' | 'speed_ratio' | 'repeats'
>;
export type StatsLoop = Pick<Loop, 'id' | 'song_id' | 'status' | 'finished_at'>;

export const STATS_RANGES = ['week', 'month', 'all'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
/** A range that has a period before it to compare with. */
export type ComparedRange = Exclude<StatsRange, 'all'>;

export const STATS_RANGE_LABELS: Record<StatsRange, string> = {
  week: 'Week',
  month: 'Month',
  all: 'All time',
};

/**
 * A period in words: the totals' heading, and the aside beside the heading of
 * a section, which says the time the section covers whether or not the
 * Period choice sets it.
 */
export const STATS_RANGE_HEADINGS: Record<StatsRange, string> = {
  week: 'Last 7 days',
  month: 'Last 30 days',
  all: 'All time',
};

/** For a range taken from the URL: anything unknown is the week. */
export function statsRangeFrom(value: string | null): StatsRange {
  return STATS_RANGES.find((range) => range === value) ?? 'week';
}

/** Days a range covers, today included; null for all time. */
const RANGE_DAYS: Record<StatsRange, number | null> = { week: 7, month: 30, all: null };

/** Midnight on the first day the range counts, or null for all time. */
export function rangeStart(range: StatsRange, now: Date): Date | null {
  const days = RANGE_DAYS[range];
  return days === null ? null : addDays(now, -(days - 1));
}

/**
 * The period of the same length just before a range: the seven days before
 * this week's seven, the thirty before this month's. Null for all time, which
 * has nothing before it. `end` is the first instant not counted.
 */
export function previousRange(range: StatsRange, now: Date): { start: Date; end: Date } | null {
  const days = RANGE_DAYS[range];
  const end = rangeStart(range, now);
  return days === null || end === null ? null : { start: addDays(end, -days), end };
}

/** From `start` (null: the beginning) up to, not including, `end` (null: no end). */
export function inRange(iso: string, start: Date | null, end: Date | null = null): boolean {
  const time = Date.parse(iso);
  return (start === null || time >= start.getTime()) && (end === null || time < end.getTime());
}

export interface StatsTotals {
  /** Play time, in seconds. */
  seconds: number;
  /** Local days with at least one session. */
  days: number;
  /** Loops finished in the range (all of them, for all time). */
  mastered: number;
}

function totalsBetween(
  sessions: readonly StatsSession[],
  loops: readonly StatsLoop[],
  start: Date | null,
  end: Date | null,
  now: Date,
): StatsTotals {
  const counted = sessions.filter((session) => inRange(session.started_at, start, end));
  return {
    seconds: counted.reduce((total, session) => total + session.duration_seconds, 0),
    days: new Set(counted.map((session) => dayKeyOfIso(session.started_at))).size,
    mastered: loops.filter(
      (loop) =>
        loop.status === 'finished' &&
        // Finished a moment ago, the server's time not back yet: it was now.
        inRange(loop.finished_at ?? now.toISOString(), start, end),
    ).length,
  };
}

export function statsTotals(
  sessions: readonly StatsSession[],
  loops: readonly StatsLoop[],
  range: StatsRange,
  now: Date,
): StatsTotals {
  return totalsBetween(sessions, loops, rangeStart(range, now), null, now);
}

/** The same totals for the period before (`previousRange`); null for all time. */
export function previousTotals(
  sessions: readonly StatsSession[],
  loops: readonly StatsLoop[],
  range: StatsRange,
  now: Date,
): StatsTotals | null {
  const previous = previousRange(range, now);
  return previous === null
    ? null
    : totalsBetween(sessions, loops, previous.start, previous.end, now);
}

/** What a period is compared with, as the line under a total ends. */
const PERIOD_BEFORE: Record<ComparedRange, string> = {
  week: 'the week before',
  month: 'the month before',
};

export interface TotalChange {
  direction: 'up' | 'down' | 'same';
  /** "12 min more than the week before", "1 h 5 min less than the month before", "3 fewer than the month before", "Same as the week before". */
  label: string;
}

/**
 * Whether the period before has anything to compare with: a session. Against
 * a period with no practice at all every line is "n more than the week
 * before", which only repeats the total (17 QA issue 7), so the page draws no
 * line then, under any total.
 */
export function periodBeforeHasPractice(previous: StatsTotals | null): boolean {
  return previous !== null && previous.days > 0;
}

/**
 * How one total compares with the period before. Play time is compared as
 * what both totals show (checklist 4): whole minutes, so 59 s against 61 s is
 * "<1 min" against "1 min" and 1 min more; and under a minute against nothing
 * is "<1 min more", since those two don't read the same. Counts are compared
 * as they are. Null when both show nothing: "0, same as the week before" says
 * nothing worth a line.
 */
export function totalChange(
  kind: keyof StatsTotals,
  current: StatsTotals,
  previous: StatsTotals,
  range: ComparedRange,
  locale?: string,
): TotalChange | null {
  const before = PERIOD_BEFORE[range];
  const change = (difference: number, words: (amount: number) => string): TotalChange => {
    if (difference === 0) return { direction: 'same', label: `Same as ${before}` };
    const up = difference > 0;
    return {
      direction: up ? 'up' : 'down',
      label: `${words(Math.abs(difference))} ${up ? 'more' : kind === 'seconds' ? 'less' : 'fewer'} than ${before}`,
    };
  };
  if (kind !== 'seconds') {
    if (current[kind] === 0 && previous[kind] === 0) return null;
    return change(current[kind] - previous[kind], (amount) => countLabel(amount, locale));
  }
  if (current.seconds <= 0 && previous.seconds <= 0) return null;
  const minutes = wholeMinutes(current.seconds) - wholeMinutes(previous.seconds);
  if (minutes !== 0) return change(minutes, (amount) => minutesLabel(amount * 60));
  // The same whole minutes. Only "<1 min" against "0 min" still reads differently.
  const some = (seconds: number) => Number(seconds > 0);
  return change(some(current.seconds) - some(previous.seconds), () => minutesLabel(1));
}

/**
 * Whether there is anything to show: a session, or a loop marked finished
 * (which can happen without one). Without either every number is 0 and every
 * chart empty, and the page says so instead (16 QA issue 5).
 */
export function hasPracticeHistory(
  sessions: readonly StatsSession[],
  loops: readonly StatsLoop[],
): boolean {
  return sessions.length > 0 || loops.some((loop) => loop.status === 'finished');
}

/** When each loop's latest session began, in epoch ms, by loop id. */
export function latestSessionTimes(
  sessions: readonly Pick<StatsSession, 'loop_id' | 'started_at'>[],
): Map<string, number> {
  const latest = new Map<string, number>();
  for (const session of sessions) {
    const time = Date.parse(session.started_at);
    latest.set(session.loop_id, Math.max(latest.get(session.loop_id) ?? -Infinity, time));
  }
  return latest;
}

/** Play time per local day. */
export function secondsByDay(
  sessions: readonly Pick<StatsSession, 'started_at' | 'duration_seconds'>[],
): Map<DayKey, number> {
  const byDay = new Map<DayKey, number>();
  for (const session of sessions) {
    const key = dayKeyOfIso(session.started_at);
    byDay.set(key, (byDay.get(key) ?? 0) + session.duration_seconds);
  }
  return byDay;
}

export interface PracticeDay {
  key: DayKey;
  /** Midnight, local time. */
  date: Date;
  seconds: number;
  today: boolean;
}

/** The last `days` days, oldest first and ending today, with each one's play time. */
export function dailyPractice(
  sessions: readonly StatsSession[],
  now: Date,
  days = 14,
): PracticeDay[] {
  const byDay = secondsByDay(sessions);
  const todayKey = dayKeyOf(now);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(now, index - (days - 1));
    const key = dayKeyOf(date);
    return { key, date, seconds: byDay.get(key) ?? 0, today: key === todayKey };
  });
}

/** The daily chart's caption: all the play time on show, and on how many of its days. */
export function dailySummary(days: readonly PracticeDay[]): { seconds: number; practised: number } {
  return {
    seconds: days.reduce((total, day) => total + day.seconds, 0),
    practised: days.filter((day) => day.seconds > 0).length,
  };
}
