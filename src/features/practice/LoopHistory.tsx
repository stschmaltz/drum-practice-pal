import { useState } from 'react';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { LoadingLine } from '@/components/StatusMessages';
import { buttonClass } from '@/components/styles';
import { speedLabel } from '@/features/loops/loopLabels';
import { waitsForNetwork } from '@/lib/network';
import {
  durationLabel,
  historyDays,
  repeatsLabel,
  totalPracticeSeconds,
  type HistoryDay,
} from './sessions';
import { SESSION_MIN_PLAY_SECONDS } from './sessionTracker';
import { useLoopSessions } from './useSessions';

/** Days on show before "Show all": a few weeks of regular practice. */
export const HISTORY_PREVIEW_COUNT = 10;

/**
 * One loop's practice history, a row per day practised, newest first: the
 * day, its play time, the speed most of it was played at and its passes
 * (historyDays in sessions.ts). Fetched when shown, so a list of loops costs
 * nothing until a history is opened.
 */
export function LoopHistory({
  loopId,
  loopName,
  tempo,
}: {
  loopId: string;
  loopName: string;
  /** The file's tempo at the loop's first bar, for the BPM; null shows the percent alone. */
  tempo: number | null;
}) {
  const sessions = useLoopSessions(loopId);
  const [showAll, setShowAll] = useState(false);

  if (waitsForNetwork(sessions)) {
    return (
      <p className="text-sm text-ink-muted">
        You're offline. This loop's history shows once you're back online.
      </p>
    );
  }
  if (sessions.isPending) return <LoadingLine small>Loading history…</LoadingLine>;
  // isLoadingError, not isError: a failed background refetch keeps the history that is showing.
  if (sessions.isLoadingError) {
    return (
      <LoadErrorAlert compact onRetry={() => void sessions.refetch()}>
        Couldn't load this loop's history.
      </LoadErrorAlert>
    );
  }
  if (sessions.data.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No practice logged yet. A session is logged once you've played the loop for{' '}
        {SESSION_MIN_PLAY_SECONDS} seconds.
      </p>
    );
  }

  const days = historyDays(sessions.data, new Date());
  const shown = showAll ? days : days.slice(0, HISTORY_PREVIEW_COUNT);

  return (
    <section
      aria-label={`History of ${loopName}`}
      className="flex flex-col gap-2 rounded-control border border-line bg-surface p-3"
    >
      <p className="text-sm font-semibold text-ink-soft" data-testid="loop-history-summary">
        {days.length === 1 ? '1 day' : `${days.length} days`} ·{' '}
        {durationLabel(totalPracticeSeconds(sessions.data))} in all
      </p>
      <ol className="flex flex-col divide-y divide-line">
        {shown.map((day) => (
          <HistoryItem key={day.key} day={day} tempo={tempo} />
        ))}
      </ol>
      {days.length > shown.length && (
        <button type="button" className={buttonClass} onClick={() => setShowAll(true)}>
          Show all {days.length} days
        </button>
      )}
    </section>
  );
}

function HistoryItem({ day, tempo }: { day: HistoryDay; tempo: number | null }) {
  return (
    <li className="py-1.5 text-sm text-ink-muted tabular-nums">
      <time dateTime={day.key}>{day.label}</time> · {durationLabel(day.seconds)} ·{' '}
      {speedLabel(day.speedRatio, tempo)} ·{' '}
      {/* One piece, so a narrow row never leaves "passes" alone on a line (20 batch 5 QA). */}
      <span className="whitespace-nowrap">{repeatsLabel(day.repeats)}</span>
    </li>
  );
}
