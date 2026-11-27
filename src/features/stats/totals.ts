/**
 * The Stats page's totals and day-by-day chart data, worked out from the
 * user's sessions and loops. Pure: nothing here is stored (docs/plan.md,
 * Units 16 and 17), and every function takes `now` so tests pick the day.
 */
import type { PracticeSession } from '@/features/practice/sessions';
import type { Loop } from '@/features/loops/loopForm';
import { addDays, dayKeyOf, dayKeyOfIso, startOfDay, type DayKey } from './days';

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
  /** Loop passes. */
  passes: number;
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
    passes: counted.reduce((total, session) => total + session.repeats, 0),
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
 * How one total compares with the period before. Play time is compared as the
 * whole minutes both totals show (checklist 4: 59 s against 61 s is "0 min"
 * against "1 min", so 1 min more), counts as they are. Null when both show
 * nothing: "0, same as the week before" says nothing worth a line.
 */
export function totalChange(
  kind: keyof StatsTotals,
  current: StatsTotals,
  previous: StatsTotals,
  range: ComparedRange,
): TotalChange | null {
  const shown = (totals: StatsTotals) =>
    kind === 'seconds' ? Math.floor(totals.seconds / 60) : totals[kind];
  if (shown(current) === 0 && shown(previous) === 0) return null;
  const difference = shown(current) - shown(previous);
  const before = PERIOD_BEFORE[range];
  if (difference === 0) return { direction: 'same', label: `Same as ${before}` };
  const amount = Math.abs(difference);
  const up = difference > 0;
  const words =
    kind === 'seconds'
      ? `${minutesLabel(amount * 60)} ${up ? 'more' : 'less'}`
      : `${amount.toLocaleString('en')} ${up ? 'more' : 'fewer'}`;
  return { direction: up ? 'up' : 'down', label: `${words} than ${before}` };
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

export interface HeatmapDay extends PracticeDay {
  /** 0 for none, then 1 to 4 by play time (`heatLevel`). */
  level: HeatLevel;
  /** After today: drawn empty, so the last column ends on the right weekday. */
  future: boolean;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** Minutes at which a day reaches each shade, past none. */
const HEAT_STEPS_MINUTES = [10, 20, 40] as const;

export function heatLevel(seconds: number): HeatLevel {
  if (seconds <= 0) return 0;
  const minutes = seconds / 60;
  const step = HEAT_STEPS_MINUTES.findIndex((limit) => minutes < limit);
  return (step === -1 ? 4 : step + 1) as HeatLevel;
}

/**
 * The last `weeks` weeks as columns of seven days, Monday first, oldest week
 * first. The last column is this week, with the days after today marked
 * `future`.
 */
export function practiceHeatmap(
  sessions: readonly StatsSession[],
  now: Date,
  weeks = 26,
): HeatmapDay[][] {
  const byDay = secondsByDay(sessions);
  const today = startOfDay(now);
  const todayKey = dayKeyOf(now);
  // getDay(): 0 is Sunday. Days since this week's Monday.
  const sinceMonday = (today.getDay() + 6) % 7;
  const firstMonday = addDays(today, -sinceMonday - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = addDays(firstMonday, week * 7 + weekday);
      const key = dayKeyOf(date);
      const future = date.getTime() > today.getTime();
      const seconds = future ? 0 : (byDay.get(key) ?? 0);
      return { key, date, seconds, today: key === todayKey, future, level: heatLevel(seconds) };
    }),
  );
}

export interface HeatmapSummary {
  /** Days drawn: every day of the weeks up to today. */
  daysShown: number;
  daysPractised: number;
  /** The week with the most play time (the earlier one on a tie); null with none. */
  bestWeek: { start: Date; seconds: number; days: number } | null;
}

/** The heatmap's numbers: how many of its days were practised, and its best week. */
export function heatmapSummary(weeks: readonly (readonly HeatmapDay[])[]): HeatmapSummary {
  const shown = weeks.flat().filter((day) => !day.future);
  let bestWeek: HeatmapSummary['bestWeek'] = null;
  for (const week of weeks) {
    const seconds = week.reduce((total, day) => total + day.seconds, 0);
    const monday = week[0];
    if (!monday || seconds === 0 || (bestWeek && seconds <= bestWeek.seconds)) continue;
    bestWeek = {
      start: monday.date,
      seconds,
      days: week.filter((day) => day.seconds > 0).length,
    };
  }
  return {
    daysShown: shown.length,
    daysPractised: shown.filter((day) => day.seconds > 0).length,
    bestWeek,
  };
}

/** How close two month names over the heatmap may come, in columns, before the first is dropped. */
const MONTH_LABEL_MIN_COLUMNS = 3;

/**
 * Where the heatmap names a month: the column of the first week that starts
 * in it. The part-month the map opens on is named at column 0 only when the
 * next month's name is far enough along not to run into it.
 */
export function heatmapMonths(
  weeks: readonly (readonly HeatmapDay[])[],
): { column: number; date: Date }[] {
  const labels: { column: number; date: Date }[] = [];
  weeks.forEach((week, column) => {
    const monday = week[0]?.date;
    const before = weeks[column - 1]?.[0]?.date;
    if (!monday) return;
    if (column === 0 || (before && before.getMonth() !== monday.getMonth())) {
      labels.push({ column, date: monday });
    }
  });
  const [first, second] = labels;
  if (first && second && second.column - first.column < MONTH_LABEL_MIN_COLUMNS) labels.shift();
  return labels;
}

/** "4:12" for minutes and seconds, "1:04:12" from an hour up: the practice screen's live time. */
export function clockLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** "45 min", "2 h 5 min", "0 min": a total of play time, to the minute. */
export function minutesLabel(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
