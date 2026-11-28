import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import { linkClass, sectionHeadingClass } from '@/components/styles';
import { usePracticeLoops } from '@/features/loops/useLoops';
import { DAY_SPEED_NOTE } from '@/features/practice/sessions';
import { useAllSessions } from '@/features/practice/useSessions';
import { failureCopy } from '@/lib/errorCopy';
import { waitsForNetwork } from '@/lib/network';
import { SONGS_PATH } from '@/lib/routes';
import { badgeProgress } from './badges';
import { BadgeSection } from './BadgeSection';
import { DailyMinutesChart } from './DailyMinutesChart';
import { practiceHeatmap } from './heatmap';
import { LoopProgressList } from './LoopProgressList';
import { NeglectedLoops } from './NeglectedLoops';
import { PeriodTotals, StreakLine } from './PeriodTotals';
import { PracticeHeatmap } from './PracticeHeatmap';
import { hasRecords } from './records';
import { RecordsList } from './RecordsList';
import { SongTimeBars } from './SongTimeBars';
import type { StatsData } from './statsData';
import { StatsSection } from './StatsSection';
import { useToday } from './useToday';
import {
  dailyPractice,
  hasPracticeHistory,
  statsRangeFrom,
  STATS_RANGE_HEADINGS,
  STATS_RANGE_LABELS,
  STATS_RANGES,
  type StatsRange,
} from './totals';

/** The URL's parameter for the range on show, so Back and a reload keep it. */
const RANGE_PARAM = 'range';

/**
 * /stats (Units 16 and 17). Every number answers one of three questions: am I
 * showing up (totals against the period before, the streak, the last two
 * weeks, the practice days), is each loop getting faster (loop progress), and
 * what have I been neglecting (where the time went, not practised lately).
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
        {/* The reason of the read with nothing to show: the other may hold an error from a
            refetch that failed over rows it still has (17 Review). */}
        Couldn't load your stats.{' '}
        {failureCopy(sessions.isLoadingError ? sessions.error : loops.error)}
      </LoadErrorAlert>
    );
  } else if (!sessions.data || !loops.data) {
    body = <LoadingLine>Loading your stats…</LoadingLine>;
  } else if (!hasPracticeHistory(sessions.data, loops.data)) {
    // 16 QA issue 5: not four zeros, empty charts and ten locked badges.
    body = (
      <EmptyState
        icon="chart"
        action={
          <Link to={SONGS_PATH} className={linkClass}>
            Go to Songs
          </Link>
        }
      >
        No practice yet. Your stats start with your first session: open a song and practise a loop.
      </EmptyState>
    );
  } else {
    body = <Stats sessions={sessions.data} loops={loops.data} />;
  }

  return (
    <div className="flex flex-col gap-8">
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

/** Two sections side by side from `lg`, one under the other below. */
const pairClass = 'grid gap-8 lg:grid-cols-2 lg:gap-x-12';

/** Beside the heading of a section that doesn't follow the Period choice (17 QA issue 5). */
const ALL_TIME = STATS_RANGE_HEADINGS.all;

/** The page once both lists are in and there is practice to show: its sections, top to bottom. */
function Stats({ sessions, loops }: StatsData) {
  const [range, setRange] = useStatsRange();
  // Drawn again when the local day changes, so a page left open has the right "today".
  const now = useToday();
  const heatmapWeeks = practiceHeatmap(sessions, now);

  return (
    <>
      <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="totals-heading" className={sectionHeadingClass}>
            {STATS_RANGE_HEADINGS[range]}
          </h2>
          <SegmentedControl
            label="Period"
            options={STATS_RANGES.map((value) => ({ value, label: STATS_RANGE_LABELS[value] }))}
            value={range}
            onChange={setRange}
          />
        </div>
        <PeriodTotals sessions={sessions} loops={loops} range={range} now={now} />
        <StreakLine sessions={sessions} now={now} />
      </section>

      <div className={pairClass}>
        <StatsSection
          id="song-time-heading"
          title="Where the time went"
          aside={STATS_RANGE_HEADINGS[range]}
        >
          <SongTimeBars sessions={sessions} loops={loops} range={range} now={now} />
        </StatsSection>
        <StatsSection id="daily-heading" title="Last two weeks">
          <DailyMinutesChart days={dailyPractice(sessions, now)} now={now} />
        </StatsSection>
      </div>

      <StatsSection id="progress-heading" title="Loop progress" aside={ALL_TIME}>
        <p className="max-w-prose text-sm text-ink-muted">{DAY_SPEED_NOTE}</p>
        <LoopProgressList sessions={sessions} loops={loops} now={now} />
        <NeglectedLoops sessions={sessions} loops={loops} now={now} />
      </StatsSection>

      <div className={pairClass}>
        <StatsSection
          id="heatmap-heading"
          title="Practice days"
          aside={`Last ${heatmapWeeks.length} weeks`}
        >
          <PracticeHeatmap weeks={heatmapWeeks} now={now} />
        </StatsSection>
        {/* Not on day one, when every record would be that day's one session (17 QA issue 7). */}
        {hasRecords(sessions) && (
          <StatsSection id="records-heading" title="Records" aside={ALL_TIME}>
            <RecordsList sessions={sessions} loops={loops} now={now} />
          </StatsSection>
        )}
      </div>

      <StatsSection id="badges-heading" title="Badges" aside={ALL_TIME}>
        <BadgeSection badges={badgeProgress({ sessions, loops })} />
      </StatsSection>
    </>
  );
}
