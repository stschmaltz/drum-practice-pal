import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import { focusRing, linkClass, sectionHeadingClass } from '@/components/styles';
import type { PracticeLoop } from '@/features/loops/practiceList';
import { usePracticeLoops } from '@/features/loops/useLoops';
import type { PracticeSession } from '@/features/practice/sessions';
import { useAllSessions } from '@/features/practice/useSessions';
import { failureCopy } from '@/lib/errorCopy';
import { waitsForNetwork } from '@/lib/network';
import { songPath, SONGS_PATH } from '@/lib/routes';
import { badgeProgress } from './badges';
import { BadgeSection } from './BadgeSection';
import { DailyMinutesChart, PracticeHeatmap } from './charts';
import { dateSpan, shortDate, weekdayDate } from './dateLabels';
import { LoopProgressList } from './LoopProgressList';
import { practiceRecords } from './records';
import { timeBySong } from './songTime';
import { currentStreak, daysLabel, longestStreak } from './streak';
import {
  dailyPractice,
  hasPracticeHistory,
  minutesLabel,
  practiceHeatmap,
  previousTotals,
  statsRangeFrom,
  statsTotals,
  totalChange,
  STATS_RANGE_LABELS,
  STATS_RANGES,
  type StatsRange,
  type StatsTotals,
} from './totals';

/** The URL's parameter for the range on show, so Back and a reload keep it. */
const RANGE_PARAM = 'range';

/**
 * /stats (Units 16 and 17). Every number answers one of three questions: am I
 * showing up (totals against the period before, the streak, the last two
 * weeks, the practice days), is each loop getting faster (loop progress), and
 * what have I been neglecting (where the time went). All worked out here from
 * every session and loop the user has (nothing is stored), read like any
 * other list, so it shows offline from the cache.
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

/** The chosen period in words: the totals' heading, and what "Where the time went" covers. */
const RANGE_HEADINGS: Record<StatsRange, string> = {
  week: 'Last 7 days',
  month: 'Last 30 days',
  all: 'All time',
};

/** Two sections side by side from `lg`, one under the other below. */
const pairClass = 'grid gap-8 lg:grid-cols-2 lg:gap-x-12';

interface StatsData {
  sessions: readonly PracticeSession[];
  loops: readonly PracticeLoop[];
}

function Stats({ sessions, loops }: StatsData) {
  const [range, setRange] = useStatsRange();
  const now = new Date();

  return (
    <>
      <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="totals-heading" className={sectionHeadingClass}>
            {RANGE_HEADINGS[range]}
          </h2>
          <SegmentedControl
            label="Period"
            options={STATS_RANGES.map((value) => ({ value, label: STATS_RANGE_LABELS[value] }))}
            value={range}
            onChange={setRange}
          />
        </div>
        <Totals sessions={sessions} loops={loops} range={range} now={now} />
        <StreakLine sessions={sessions} now={now} />
      </section>

      <div className={pairClass}>
        <Section id="song-time-heading" title="Where the time went" aside={RANGE_HEADINGS[range]}>
          <SongTimeBars sessions={sessions} loops={loops} range={range} now={now} />
        </Section>
        <Section id="daily-heading" title="Last two weeks">
          <DailyMinutesChart days={dailyPractice(sessions, now)} now={now} />
        </Section>
      </div>

      <Section id="progress-heading" title="Loop progress">
        <p className="max-w-prose text-sm text-ink-muted">
          Each day counts at the speed you spent the most time at, so a quick try at full speed
          isn&apos;t a day at full speed.
        </p>
        <LoopProgressList sessions={sessions} loops={loops} now={now} />
      </Section>

      <div className={pairClass}>
        <Section id="heatmap-heading" title="Practice days">
          <PracticeHeatmap weeks={practiceHeatmap(sessions, now)} now={now} />
        </Section>
        <Section id="records-heading" title="Records">
          <Records sessions={sessions} loops={loops} now={now} />
        </Section>
      </div>

      <Section id="badges-heading" title="Badges">
        <BadgeSection badges={badgeProgress({ sessions, loops })} />
      </Section>
    </>
  );
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** Said quietly after the heading: what the section covers when that can change. */
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className={`${sectionHeadingClass} flex flex-wrap items-baseline gap-x-2`}>
        {title}
        {aside && <span className="text-sm font-normal text-ink-muted">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

const statLabelClass = 'text-xs font-semibold tracking-wider text-ink-muted uppercase';
const statValueClass = 'text-2xl font-bold tabular-nums';

const TOTALS: { kind: keyof StatsTotals; label: string; testId: string }[] = [
  { kind: 'seconds', label: 'Practice time', testId: 'total-time' },
  { kind: 'days', label: 'Days practised', testId: 'total-days' },
  { kind: 'passes', label: 'Loop passes', testId: 'total-passes' },
  { kind: 'mastered', label: 'Loops mastered', testId: 'total-mastered' },
];

/** The period's four totals, each with how it compares with the period before (none for all time). */
function Totals({ sessions, loops, range, now }: StatsData & { range: StatsRange; now: Date }) {
  const totals = statsTotals(sessions, loops, range, now);
  const before = previousTotals(sessions, loops, range, now);
  return (
    <dl
      className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4"
      data-testid="stats-totals"
    >
      {TOTALS.map(({ kind, label, testId }) => {
        const change =
          before === null || range === 'all' ? null : totalChange(kind, totals, before, range);
        return (
          <div key={kind} className="flex flex-col gap-0.5">
            <dt className={statLabelClass}>{label}</dt>
            <dd className={statValueClass} data-testid={testId}>
              {kind === 'seconds' ? minutesLabel(totals.seconds) : totals[kind].toLocaleString()}
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
function StreakLine({ sessions, now }: { sessions: readonly PracticeSession[]; now: Date }) {
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
        {current > 0 ? `On a ${current}-day streak.` : 'No streak running.'}{' '}
        {current === longest ? 'Your longest yet.' : `Your longest is ${daysLabel(longest)}.`}
      </span>
    </p>
  );
}

/** Play time per song in the period, as bars with their minutes, most first. */
function SongTimeBars({
  sessions,
  loops,
  range,
  now,
}: StatsData & { range: StatsRange; now: Date }) {
  const { songs, other } = timeBySong(sessions, loops, range, now);
  const longest = Math.max(...songs.map((song) => song.seconds), other?.seconds ?? 0);
  if (longest === 0) {
    return <p className="text-ink-muted">No practice in this period.</p>;
  }
  return (
    <ol aria-label="Practice time by song" className="flex flex-col">
      {songs.map((song) => (
        <SongTimeRow key={song.songId} seconds={song.seconds} longest={longest}>
          <Link
            to={songPath(song.songId)}
            title={song.title}
            className={`inline-flex min-h-touch max-w-full min-w-touch items-center rounded-sm text-ink hover:text-brand ${focusRing}`}
          >
            <span className="truncate">{song.title}</span>
          </Link>
        </SongTimeRow>
      ))}
      {other && (
        <SongTimeRow seconds={other.seconds} longest={longest}>
          <span className="inline-flex min-h-touch items-center text-ink-soft">
            {other.songs > 0
              ? `Other (${other.songs} ${other.songs === 1 ? 'song' : 'songs'})`
              : 'Other'}
          </span>
        </SongTimeRow>
      )}
    </ol>
  );
}

function SongTimeRow({
  seconds,
  longest,
  children,
}: {
  seconds: number;
  /** The longest bar's play time: the full width. */
  longest: number;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col pb-2" data-testid="song-time">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 font-medium">{children}</span>
        <span className="shrink-0 text-sm text-ink-soft tabular-nums">{minutesLabel(seconds)}</span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full min-w-1 rounded-full bg-selected-line"
          style={{ width: `${(seconds / longest) * 100}%` }}
        />
      </div>
    </li>
  );
}

/** The bests: longest streak, most practice in a day, longest single session, each with when. */
function Records({ sessions, loops, now }: StatsData & { now: Date }) {
  const { longestStreak: streak, bestDay, longestSession } = practiceRecords(sessions);
  if (!streak || !bestDay || !longestSession) {
    return <p className="text-ink-muted">Records start with your first session.</p>;
  }
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
        <dt className={statLabelClass}>{label}</dt>
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
