/**
 * The Stats page's numbers and chart data, worked out from the user's
 * sessions and loops. Pure: nothing here is stored (docs/plan.md, Unit 14),
 * and every function takes `now` so tests pick the day.
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

function inRange(iso: string, start: Date | null): boolean {
  return start === null || Date.parse(iso) >= start.getTime();
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

export function statsTotals(
  sessions: readonly StatsSession[],
  loops: readonly StatsLoop[],
  range: StatsRange,
  now: Date,
): StatsTotals {
  const start = rangeStart(range, now);
  const counted = sessions.filter((session) => inRange(session.started_at, start));
  return {
    seconds: counted.reduce((total, session) => total + session.duration_seconds, 0),
    days: new Set(counted.map((session) => dayKeyOfIso(session.started_at))).size,
    passes: counted.reduce((total, session) => total + session.repeats, 0),
    mastered: loops.filter(
      (loop) =>
        loop.status === 'finished' &&
        // Finished a moment ago, the server's time not back yet: it was now.
        inRange(loop.finished_at ?? now.toISOString(), start),
    ).length,
  };
}

/**
 * Whether there is anything to show: a session, or a loop marked finished
 * (which can happen without one). Without either every number is 0 and every
 * chart empty, and the page says so instead (14 QA issue 5).
 */
export function hasPracticeHistory(
  sessions: readonly StatsSession[],
  loops: readonly StatsLoop[],
): boolean {
  return sessions.length > 0 || loops.some((loop) => loop.status === 'finished');
}

/** Play time per local day. */
function secondsByDay(sessions: readonly StatsSession[]): Map<DayKey, number> {
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

export interface SpeedPoint {
  sessionId: string;
  /** Epoch ms. */
  time: number;
  speedRatio: number;
}

/** One loop's session speeds, oldest first: the speed-over-time chart. */
export function speedHistory(sessions: readonly StatsSession[], loopId: string): SpeedPoint[] {
  return sessions
    .filter((session) => session.loop_id === loopId)
    .map((session) => ({
      sessionId: session.id,
      time: Date.parse(session.started_at),
      speedRatio: session.speed_ratio,
    }))
    .sort((a, b) => a.time - b.time || a.sessionId.localeCompare(b.sessionId));
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
