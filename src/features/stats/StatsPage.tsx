import { useId, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressMarks';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import { inputClass, labelClass, sectionHeadingClass } from '@/components/styles';
import type { PracticeLoop } from '@/features/loops/practiceList';
import { usePracticeLoops } from '@/features/loops/useLoops';
import type { PracticeSession } from '@/features/practice/sessions';
import { useAllSessions } from '@/features/practice/useSessions';
import { failureCopy } from '@/lib/errorCopy';
import { waitsForNetwork } from '@/lib/network';
import { badgeProgress, type BadgeProgress } from './badges';
import { DailyMinutesChart, PracticeHeatmap, SpeedChart } from './charts';
import { currentStreak, daysLabel } from './streak';
import {
  dailyPractice,
  minutesLabel,
  practiceHeatmap,
  speedHistory,
  statsRangeFrom,
  statsTotals,
  STATS_RANGE_LABELS,
  STATS_RANGES,
  type StatsRange,
} from './totals';

/** The URL's parameter for the range on show, so Back and a reload keep it. */
const RANGE_PARAM = 'range';

/**
 * /stats (Unit 14): practice time, days, passes and loops mastered over the
 * week, the month or all time; minutes a day for two weeks; a heatmap of
 * practice days for half a year; one loop's speed over time; and the badges.
 * All worked out here from every session and loop the user has (nothing is
 * stored), read like any other list, so it shows offline from the cache.
 */
export function StatsPage() {
  const sessions = useAllSessions();
  const loops = usePracticeLoops();

  let body: ReactNode;
  if (waitsForNetwork(sessions) || waitsForNetwork(loops)) {
    body = (
      <EmptyState icon="offline">
        You're offline, and your stats haven't been opened on this device yet. They show once you're
        back online.
      </EmptyState>
    );
  } else if (sessions.isLoadingError || loops.isLoadingError) {
    body = (
      <LoadErrorAlert
        onRetry={() => {
          if (sessions.isLoadingError) void sessions.refetch();
          if (loops.isLoadingError) void loops.refetch();
        }}
      >
        Couldn't load your stats. {failureCopy(sessions.error ?? loops.error)}
      </LoadErrorAlert>
    );
  } else if (!sessions.data || !loops.data) {
    body = <LoadingLine>Loading your stats…</LoadingLine>;
  } else {
    body = <Stats sessions={sessions.data} loops={loops.data} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Stats" />
      {body}
    </div>
  );
}

function useStatsRange(): [StatsRange, (range: StatsRange) => void] {
  const [params, setParams] = useSearchParams();
  const range = statsRangeFrom(params.get(RANGE_PARAM));
  const setRange = (next: StatsRange) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        // The default leaves the URL bare.
        if (next === 'week') updated.delete(RANGE_PARAM);
        else updated.set(RANGE_PARAM, next);
        return updated;
      },
      { replace: true },
    );
  return [range, setRange];
}

function Stats({
  sessions,
  loops,
}: {
  sessions: readonly PracticeSession[];
  loops: readonly PracticeLoop[];
}) {
  const [range, setRange] = useStatsRange();
  const now = new Date();
  const totals = statsTotals(sessions, loops, range, now);
  const streak = currentStreak(sessions, now);

  return (
    <>
      <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="totals-heading" className={sectionHeadingClass}>
            Totals
          </h2>
          <SegmentedControl
            label="Period"
            options={STATS_RANGES.map((value) => ({ value, label: STATS_RANGE_LABELS[value] }))}
            value={range}
            onChange={setRange}
          />
        </div>
        <dl
          className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4"
          data-testid="stats-totals"
        >
          <Total label="Practice time" testId="total-time">
            {minutesLabel(totals.seconds)}
          </Total>
          <Total label="Days practised" testId="total-days">
            {totals.days}
          </Total>
          <Total label="Loop passes" testId="total-passes">
            {totals.passes.toLocaleString()}
          </Total>
          <Total label="Loops mastered" testId="total-mastered">
            {totals.mastered}
          </Total>
        </dl>
        {streak > 0 && (
          <p className="flex items-center gap-2 text-ink-soft">
            <Icon name="flame" className="text-warning" />
            On a {daysLabel(streak)} streak.
          </p>
        )}
      </section>

      <section aria-labelledby="daily-heading" className="flex flex-col gap-3">
        <h2 id="daily-heading" className={sectionHeadingClass}>
          Last two weeks
        </h2>
        <DailyMinutesChart days={dailyPractice(sessions, now)} />
      </section>

      <section aria-labelledby="heatmap-heading" className="flex flex-col gap-3">
        <h2 id="heatmap-heading" className={sectionHeadingClass}>
          Practice days
        </h2>
        <PracticeHeatmap weeks={practiceHeatmap(sessions, now)} />
      </section>

      <SpeedOverTime sessions={sessions} loops={loops} />

      <section aria-labelledby="badges-heading" className="flex flex-col gap-3">
        <h2 id="badges-heading" className={sectionHeadingClass}>
          Badges
        </h2>
        <BadgeList badges={badgeProgress({ sessions, loops })} />
      </section>
    </>
  );
}

function Total({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

/** "Groove · Verse", the loop's song first, for the loop picker. */
const loopChoiceLabel = (loop: PracticeLoop) => `${loop.song.title} · ${loop.name}`;

function SpeedOverTime({
  sessions,
  loops,
}: {
  sessions: readonly PracticeSession[];
  loops: readonly PracticeLoop[];
}) {
  const selectId = useId();
  // Only loops with a session: a loop never practised has nothing to draw.
  const practised = loops
    .filter((loop) => sessions.some((session) => session.loop_id === loop.id))
    .sort((a, b) => loopChoiceLabel(a).localeCompare(loopChoiceLabel(b)));
  const latest = [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  // The loop practised last, until another is chosen; a chosen loop deleted since falls back.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen =
    practised.find((loop) => loop.id === chosenId) ??
    practised.find((loop) => loop.id === latest?.loop_id) ??
    practised[0];

  return (
    <section aria-labelledby="speed-heading" className="flex flex-col gap-3">
      <h2 id="speed-heading" className={sectionHeadingClass}>
        Speed over time
      </h2>
      {chosen ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={selectId} className={labelClass}>
              Loop
            </label>
            <select
              id={selectId}
              className={`${inputClass} max-w-md`}
              value={chosen.id}
              onChange={(event) => setChosenId(event.target.value)}
            >
              {practised.map((loop) => (
                <option key={loop.id} value={loop.id}>
                  {loopChoiceLabel(loop)}
                </option>
              ))}
            </select>
          </div>
          <SpeedChart points={speedHistory(sessions, chosen.id)} loopName={chosen.name} />
        </>
      ) : (
        <p className="text-ink-muted">Practise a loop to see its speed over time.</p>
      )}
    </section>
  );
}

function BadgeList({ badges }: { badges: readonly BadgeProgress[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line" aria-label="Badges">
      {badges.map((badge) => (
        <li
          key={badge.id}
          className="flex items-center gap-3 py-3"
          data-testid="badge"
          data-earned={badge.earned || undefined}
        >
          <Icon
            name="trophy"
            className={`size-6 ${badge.earned ? 'text-success' : 'text-ink-muted opacity-50'}`}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className={badge.earned ? 'font-semibold text-ink' : 'font-medium text-ink-soft'}>
              {badge.label}
              <span className="sr-only">{badge.earned ? ', earned' : ', not earned yet'}</span>
            </p>
            {badge.earned ? (
              <p className="text-sm text-success">Earned</p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">{badge.progressLabel}</p>
                <ProgressBar fraction={badge.current / badge.target} className="max-w-48" />
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
