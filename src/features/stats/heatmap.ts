/**
 * The Stats page's practice-day map: weeks as columns of days shaded by play
 * time, with its summary, its month names and its text alternative. Pure:
 * whatever needs today takes `now`.
 */
import { addDays, dayKeyOf, daysBetween, startOfDay } from './days';
import { daysLabel } from './statLabels';
import { secondsByDay, type PracticeDay, type StatsSession } from './totals';

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

/** The map's fewest and most weeks. */
export const HEATMAP_MIN_WEEKS = 12;
export const HEATMAP_MAX_WEEKS = 26;

/** The Monday that begins the date's week, at midnight. */
function mondayOf(date: Date): Date {
  // getDay(): 0 is Sunday. Days since this week's Monday.
  return addDays(date, -((date.getDay() + 6) % 7));
}

/**
 * How many weeks the map spans: from the week of the first session to this
 * one, but never fewer than twelve nor more than twenty-six (17 QA issue 7:
 * three weeks of practice were a corner of colour in 160 empty squares).
 */
export function heatmapWeekCount(
  sessions: readonly Pick<StatsSession, 'started_at'>[],
  now: Date,
): number {
  if (sessions.length === 0) return HEATMAP_MIN_WEEKS;
  const first = Math.min(...sessions.map((session) => Date.parse(session.started_at)));
  const weeks = daysBetween(mondayOf(new Date(first)), mondayOf(now)) / 7 + 1;
  return Math.min(Math.max(weeks, HEATMAP_MIN_WEEKS), HEATMAP_MAX_WEEKS);
}

/**
 * The last `weeks` weeks (`heatmapWeekCount` unless told) as columns of seven
 * days, Monday first, oldest week first. The last column is this week, with
 * the days after today marked `future`.
 */
export function practiceHeatmap(
  sessions: readonly StatsSession[],
  now: Date,
  weeks = heatmapWeekCount(sessions, now),
): HeatmapDay[][] {
  const byDay = secondsByDay(sessions);
  const today = startOfDay(now);
  const todayKey = dayKeyOf(now);
  const firstMonday = addDays(mondayOf(today), -(weeks - 1) * 7);
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

/** One calendar week of the map, Monday to Sunday. */
export interface HeatmapWeek {
  /** Its Monday, at midnight. */
  start: Date;
  /** Days of it that were practised. */
  days: number;
  seconds: number;
}

/**
 * The map week by week, oldest first: its text alternative (17 QA issue 3), a
 * row a week rather than 180 day rows.
 */
export function heatmapWeekRows(weeks: readonly (readonly HeatmapDay[])[]): HeatmapWeek[] {
  return weeks.flatMap((week) => {
    const monday = week[0];
    if (!monday) return [];
    return [
      {
        start: monday.date,
        days: week.filter((day) => day.seconds > 0).length,
        seconds: week.reduce((total, day) => total + day.seconds, 0),
      },
    ];
  });
}

export interface HeatmapSummary {
  /** Weeks drawn, this one included. */
  weeksShown: number;
  daysPractised: number;
  /**
   * The calendar week with the most play time (the earlier one on a tie).
   * Null until two days of the map were practised: the best week of one day
   * is that day again (17 QA issue 7).
   */
  bestWeek: HeatmapWeek | null;
}

/** Practised days it takes before a best week says more than the day itself. */
const BEST_WEEK_FROM_DAYS = 2;

/** The heatmap's numbers: how many of its days were practised, and its best week. */
export function heatmapSummary(weeks: readonly (readonly HeatmapDay[])[]): HeatmapSummary {
  const rows = heatmapWeekRows(weeks);
  const daysPractised = rows.reduce((total, week) => total + week.days, 0);
  let bestWeek: HeatmapWeek | null = null;
  for (const week of rows) {
    if (week.seconds > (bestWeek?.seconds ?? 0)) bestWeek = week;
  }
  return {
    weeksShown: weeks.length,
    daysPractised,
    bestWeek: daysPractised >= BEST_WEEK_FROM_DAYS ? bestWeek : null,
  };
}

/**
 * The map's one-line summary. In weeks, which the map is made of: a count of
 * days shown moved through the week (17 QA issue 8).
 */
export function heatmapLine({
  daysPractised,
  weeksShown,
}: Pick<HeatmapSummary, 'daysPractised' | 'weeksShown'>): string {
  return `Practised on ${daysLabel(daysPractised)} in the last ${weeksShown} weeks.`;
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
