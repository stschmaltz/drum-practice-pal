import { useState } from 'react';
import { buttonClass } from '@/components/styles';
import { speedLabel } from '@/features/loops/loopLabels';
import {
  durationLabel,
  practiceDateLabel,
  practiceTimeLabel,
  repeatsLabel,
  sortSessions,
  totalPracticeSeconds,
  type PracticeSession,
} from './sessions';
import { SESSION_MIN_PLAY_SECONDS } from './sessionTracker';
import { useLoopSessions } from './useSessions';

/** Sessions on show before "Show all": a few weeks of regular practice. */
export const HISTORY_PREVIEW_COUNT = 10;

/**
 * One loop's practice history, newest first: when, for how long, at what
 * speed. Fetched when shown, so a list of loops costs nothing until a history
 * is opened.
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

  if (sessions.isPending) return <p className="text-sm text-neutral-400">Loading history…</p>;
  // isLoadingError, not isError: a failed background refetch keeps the history that is showing.
  if (sessions.isLoadingError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-red-300">Couldn't load this loop's history.</p>
        <button type="button" className={buttonClass} onClick={() => void sessions.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (sessions.data.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No practice logged yet. A session is logged once you've played the loop for{' '}
        {SESSION_MIN_PLAY_SECONDS} seconds.
      </p>
    );
  }

  const sorted = sortSessions(sessions.data);
  const shown = showAll ? sorted : sorted.slice(0, HISTORY_PREVIEW_COUNT);
  const now = new Date();

  return (
    <section aria-label={`History of ${loopName}`} className="flex flex-col gap-2">
      <p className="text-sm text-neutral-300" data-testid="loop-history-summary">
        {sorted.length === 1 ? '1 session' : `${sorted.length} sessions`} ·{' '}
        {durationLabel(totalPracticeSeconds(sorted))} in all
      </p>
      <ol className="flex flex-col gap-1">
        {shown.map((session) => (
          <HistoryItem key={session.id} session={session} tempo={tempo} now={now} />
        ))}
      </ol>
      {sorted.length > shown.length && (
        <button type="button" className={buttonClass} onClick={() => setShowAll(true)}>
          Show all {sorted.length} sessions
        </button>
      )}
    </section>
  );
}

function HistoryItem({
  session,
  tempo,
  now,
}: {
  session: PracticeSession;
  tempo: number | null;
  now: Date;
}) {
  return (
    <li className="text-sm text-neutral-400 tabular-nums">
      <time dateTime={session.started_at}>
        {practiceDateLabel(session.started_at, now)}, {practiceTimeLabel(session.started_at)}
      </time>{' '}
      · {durationLabel(session.duration_seconds)} · {speedLabel(session.speed_ratio, tempo)} ·{' '}
      {repeatsLabel(session.repeats)}
    </li>
  );
}
