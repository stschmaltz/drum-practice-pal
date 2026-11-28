import { Icon } from '@/components/icons';
import { ghostButtonClass } from '@/components/styles';
import { usePracticeLoops } from '@/features/loops/useLoops';
import { daysLabel } from '@/features/stats/statLabels';
import { visitSummaryExtras } from '@/features/stats/visitSummary';
import { sittingFacts, sittingLines, type Sitting } from './sittings';
import { useAllSessions } from './useSessions';
import { VISIT_SUMMARY_ATTRIBUTES } from './visitSummaryFocus';

/**
 * What was practised on this song in this visit, on its overview: one line
 * per loop (time, and the speed it was opened at and left at), then the
 * streak and any badge earned since the first sitting began. It takes the
 * place of the Session complete sheet, which came up at every pause (Shane,
 * 2026-11-27): nothing is said while practising, this once on the way out.
 *
 * Its size is settled in its first render, from the sittings alone: the
 * streak and the badges wait for every session and loop to be read, and fill
 * a line that is already there, so the loops below never move under a tap.
 * Offline on a device that never read them, that line stays empty.
 */
export function VisitSummary({
  sittings,
  onDismiss,
}: {
  /** This song's sittings; the summary is nothing without one. */
  sittings: readonly Sitting[];
  onDismiss: () => void;
}) {
  const first = sittings.reduce<number | null>(
    (earliest, sitting) =>
      earliest === null ? sitting.beganAt : Math.min(earliest, sitting.beganAt),
    null,
  );
  // Its own component, so an overview with nothing to sum up reads no sessions.
  if (first === null) return null;
  return <Summary sittings={sittings} beganAt={first} onDismiss={onDismiss} />;
}

function Summary({
  sittings,
  beganAt,
  onDismiss,
}: {
  sittings: readonly Sitting[];
  /** When the first sitting began: badges earned since then are named. */
  beganAt: number;
  onDismiss: () => void;
}) {
  const sessions = useAllSessions();
  const loops = usePracticeLoops();
  const extras =
    sessions.data && loops.data
      ? visitSummaryExtras(beganAt, sessions.data, loops.data, new Date())
      : null;

  return (
    <section
      role="status"
      aria-label="Practice summary"
      data-testid="visit-summary"
      className="flex items-start gap-3 border-y border-line py-2"
      {...VISIT_SUMMARY_ATTRIBUTES}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1 text-sm text-ink-soft">
        <ul className="flex flex-col gap-1">
          {sittingLines(sittings).map((line) => (
            <li key={line.loopId} className="flex items-start gap-2">
              <Icon name="check" className="mt-0.5 size-4 shrink-0 text-success" />
              <span className="min-w-0 wrap-anywhere">
                <span className="font-semibold text-ink">{line.loopName}</span>:{' '}
                <span className="tabular-nums">{sittingFacts(line)}</span>
              </span>
            </li>
          ))}
        </ul>
        {/* Always a line high, empty until the sessions and loops are read. */}
        <p
          className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1"
          data-testid="visit-extras"
        >
          {extras && (
            <span className="inline-flex items-center gap-1">
              <Icon name="flame" className="size-4 text-warning" />
              Streak: {daysLabel(extras.streakDays)}
            </span>
          )}
          {extras?.earned.map((badge) => (
            <span key={badge.id} className="inline-flex items-center gap-1">
              <Icon name="trophy" className="size-4 text-success" />
              Badge earned: {badge.label}
            </span>
          ))}
        </p>
      </div>
      <button type="button" className={`${ghostButtonClass} shrink-0`} onClick={onDismiss}>
        Dismiss
        <span className="sr-only"> practice summary</span>
      </button>
    </section>
  );
}
