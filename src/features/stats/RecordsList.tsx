import type { ReactNode } from 'react';
import { smallHeadingClass, statValueClass } from '@/components/styles';
import { dateSpan, shortDate, weekdayDate } from './dateLabels';
import { practiceRecords } from './records';
import { daysLabel, minutesLabel } from './statLabels';
import type { StatsData } from './statsData';

/**
 * The bests: longest streak, most practice in a day, longest single session,
 * each with when. Drawn once `hasRecords` says there is more than one day to
 * choose between.
 */
export function RecordsList({ sessions, loops, now }: StatsData & { now: Date }) {
  const { longestStreak: streak, bestDay, longestSession } = practiceRecords(sessions);
  if (!streak || !bestDay || !longestSession) return null;
  const loopName = loops.find((loop) => loop.id === longestSession.loopId)?.name;
  const sessionDay = shortDate(longestSession.startedAt, now);
  return (
    <dl className="grid grid-cols-1 divide-y divide-line border-y border-line">
      <Record label="Longest streak" value={daysLabel(streak.days)} testId="record-streak">
        {dateSpan(streak.start, streak.end, now)}
      </Record>
      <Record label="Most in one day" value={minutesLabel(bestDay.seconds)} testId="record-day">
        {weekdayDate(bestDay.date, now)}
      </Record>
      <Record
        label="Longest session"
        value={minutesLabel(longestSession.seconds)}
        testId="record-session"
      >
        {loopName ? `${loopName}, ${sessionDay}` : sessionDay}
      </Record>
    </dl>
  );
}

function Record({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: string;
  testId: string;
  /** When it was set, and on what. */
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className={smallHeadingClass}>{label}</dt>
        <dd className="text-sm text-ink-muted wrap-anywhere" data-testid={`${testId}-when`}>
          {children}
        </dd>
      </div>
      <dd className={`${statValueClass} shrink-0`} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
