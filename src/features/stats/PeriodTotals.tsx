import { Icon } from '@/components/icons';
import { smallHeadingClass, statValueClass } from '@/components/styles';
import { countLabel, dayCountAdjective, daysLabel, minutesLabel } from './statLabels';
import type { StatsData } from './statsData';
import { currentStreak, longestStreak } from './streak';
import {
  periodBeforeHasPractice,
  previousTotals,
  statsTotals,
  totalChange,
  type StatsRange,
  type StatsSession,
  type StatsTotals,
} from './totals';

/** No "Loop passes" (17 QA): a pass of one bar and of sixteen counted the same, so the total said nothing. */
const TOTALS: { kind: keyof StatsTotals; label: string; testId: string }[] = [
  { kind: 'seconds', label: 'Practice time', testId: 'total-time' },
  { kind: 'days', label: 'Days practised', testId: 'total-days' },
  { kind: 'mastered', label: 'Loops mastered', testId: 'total-mastered' },
];

/**
 * The period's three totals, each with how it compares with the period
 * before: none for all time, and none while the period before has no practice
 * to compare with.
 */
export function PeriodTotals({
  sessions,
  loops,
  range,
  now,
}: StatsData & { range: StatsRange; now: Date }) {
  const totals = statsTotals(sessions, loops, range, now);
  const before = previousTotals(sessions, loops, range, now);
  return (
    <dl
      className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-3"
      data-testid="stats-totals"
    >
      {TOTALS.map(({ kind, label, testId }) => {
        const change =
          before === null || range === 'all' || !periodBeforeHasPractice(before)
            ? null
            : totalChange(kind, totals, before, range);
        return (
          <div key={kind} className="flex flex-col gap-0.5">
            <dt className={smallHeadingClass}>{label}</dt>
            <dd className={statValueClass} data-testid={testId}>
              {kind === 'seconds' ? minutesLabel(totals.seconds) : countLabel(totals[kind])}
            </dd>
            {change && (
              <dd
                className={`text-sm ${change.direction === 'up' ? 'text-success' : 'text-ink-muted'}`}
                data-testid={`${testId}-change`}
              >
                {change.label}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}

/** The streak running now and the longest there has been. */
export function StreakLine({
  sessions,
  now,
}: {
  sessions: readonly Pick<StatsSession, 'started_at'>[];
  now: Date;
}) {
  const current = currentStreak(sessions, now);
  const longest = longestStreak(sessions);
  if (longest === 0) return null;
  return (
    <p className="flex items-center gap-2 text-ink-soft" data-testid="streak-line">
      <Icon
        name="flame"
        className={`shrink-0 ${current > 0 ? 'text-warning' : 'text-ink-muted'}`}
      />
      <span>
        {current > 0 ? `On a ${dayCountAdjective(current)} streak.` : 'No streak running.'}{' '}
        {current === longest ? 'Your longest yet.' : `Your longest is ${daysLabel(longest)}.`}
      </span>
    </p>
  );
}
