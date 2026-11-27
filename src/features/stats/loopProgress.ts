/**
 * How each loop's speed has moved over the days it was practised: the Stats
 * page's "Loop progress" list and the chart under a row (Unit 17). Pure.
 */
import { ratioToPercent } from '@/features/player/speed';
import { dateOfDayKey, dayKeyOfIso, type DayKey } from './days';
import { latestSessionTimes, type StatsLoop, type StatsSession } from './totals';

export interface SpeedDay {
  key: DayKey;
  /** Midnight, local time. */
  date: Date;
  /** The speed that had the most play time that day, as the whole percent the app shows. */
  percent: number;
  /** All of the day's play time on the loop, at any speed. */
  seconds: number;
}

/**
 * One loop's working speed on each day it was practised, oldest first. A
 * day's speed is the one with the most play time (as the whole percent the
 * app shows), not the last or the fastest: a minute's try at 100% to see how
 * far off it is must not read as a day at 100%. A tie goes to the slower
 * speed, for the same reason.
 */
export function dailySpeeds(sessions: readonly StatsSession[], loopId: string): SpeedDay[] {
  const days = new Map<DayKey, { total: number; byPercent: Map<number, number> }>();
  for (const session of sessions) {
    if (session.loop_id !== loopId) continue;
    const key = dayKeyOfIso(session.started_at);
    const day = days.get(key) ?? { total: 0, byPercent: new Map<number, number>() };
    const percent = ratioToPercent(session.speed_ratio);
    day.total += session.duration_seconds;
    day.byPercent.set(percent, (day.byPercent.get(percent) ?? 0) + session.duration_seconds);
    days.set(key, day);
  }
  return [...days]
    .map(([key, day]) => {
      const [percent] = [...day.byPercent].sort(
        ([percentA, secondsA], [percentB, secondsB]) => secondsB - secondsA || percentA - percentB,
      )[0] ?? [100];
      return { key, date: dateOfDayKey(key), percent, seconds: day.total };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface LoopProgress<L> {
  loop: L;
  /** Each practice day's working speed, oldest first; never empty. */
  days: SpeedDay[];
  /** The first practice day's working speed, in percent. */
  startPercent: number;
  /** The latest practice day's. */
  nowPercent: number;
  /** Percentage points gained since the first day; negative when slower. */
  change: number;
  /** All play time on the loop. */
  seconds: number;
  /** When its latest session began, epoch ms. */
  lastPractised: number;
}

/**
 * Every loop that has a session, with where its speed started and where it is
 * now: active loops first, then finished ones, each last practised first. A
 * loop never practised has no progress to show and is left out. "Now" is the
 * latest practice day's working speed, the chart's last point, not the saved
 * speed, which a try at full speed moves.
 */
export function loopProgress<L extends Pick<StatsLoop, 'id' | 'status'>>(
  sessions: readonly StatsSession[],
  loops: readonly L[],
): LoopProgress<L>[] {
  const latest = latestSessionTimes(sessions);
  return loops
    .flatMap((loop) => {
      const days = dailySpeeds(sessions, loop.id);
      const first = days[0];
      const last = days[days.length - 1];
      if (!first || !last) return [];
      return [
        {
          loop,
          days,
          startPercent: first.percent,
          nowPercent: last.percent,
          change: last.percent - first.percent,
          seconds: days.reduce((total, day) => total + day.seconds, 0),
          lastPractised: latest.get(loop.id) ?? 0,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.loop.status === 'finished') - Number(b.loop.status === 'finished') ||
        b.lastPractised - a.lastPractised ||
        a.loop.id.localeCompare(b.loop.id),
    );
}

/**
 * A row's speed line in the two parts the row draws apart: the speeds
 * ("70% → 85%") and how far they moved ("up 15", "down 10", "no change").
 * After one practice day it is the one speed ("80%") and `moved` is null:
 * there is nothing yet to compare.
 */
export function speedChange({
  days,
  startPercent,
  nowPercent,
  change,
}: Pick<LoopProgress<unknown>, 'days' | 'startPercent' | 'nowPercent' | 'change'>): {
  span: string;
  moved: string | null;
} {
  if (days.length < 2) return { span: `${nowPercent}%`, moved: null };
  return {
    span: `${startPercent}% → ${nowPercent}%`,
    moved: change === 0 ? 'no change' : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}`,
  };
}

/** How many rows the list shows before "Show all". */
export const LOOP_PROGRESS_SHOWN = 6;
