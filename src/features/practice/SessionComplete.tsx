import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { buttonClass, ghostButtonClass } from '@/components/styles';
import { usePracticeLoops } from '@/features/loops/useLoops';
import { ratioToPercent } from '@/features/player/speed';
import { sessionSummaryExtras } from '@/features/stats/sessionSummary';
import { daysLabel } from '@/features/stats/streak';
import { durationLabel, repeatsLabel, sessionFromRecord } from './sessions';
import type { CompletedSession } from './usePracticeTracker';
import { useAllSessions } from './useSessions';

/**
 * Sums up a session logged while the practice screen stayed (Unit 16), in
 * place of the "Practice logged" line, as a sheet over the foot of the window
 * so nothing on the page moves: play time, passes, the speed it began
 * and ended at, the streak, and any badge it just earned. The streak and the
 * badges wait for every session and loop to be read (offline, on a device
 * that never read them, they are left out). Focus goes to it, so a screen
 * reader hears it and Tab reaches "Keep going" and "Done" first.
 */
export function SessionComplete({
  completed,
  loopName,
  onKeepGoing,
  onDone,
}: {
  completed: CompletedSession;
  loopName: string | undefined;
  onKeepGoing: () => void;
  onDone: () => void;
}) {
  const { record, startSpeedRatio } = completed;
  const sessions = useAllSessions();
  const loops = usePracticeLoops();
  const extras =
    sessions.data && loops.data
      ? sessionSummaryExtras(sessionFromRecord(record), sessions.data, loops.data, new Date())
      : null;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), [record.id]);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="session-complete-heading"
      data-testid="session-complete"
      // A sheet at the foot of the window, not a block above the score (16 QA issue 4): in the
      // page's flow it pushed the score down about 215 px on a phone as it came, so a bar
      // tapped then was the one below the finger. Placed as the loop sheet is: above the
      // phone's tab bar, and right of the sidebar from 768 px.
      className="fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-20 flex max-h-[70dvh] flex-col gap-3 overflow-y-auto rounded-t-card border-t border-success-line bg-surface p-4 shadow-sheet focus:outline-none motion-safe:animate-fade-in md:right-gutter md:bottom-[env(safe-area-inset-bottom)] md:left-[calc(var(--spacing-sidebar)+var(--spacing-gutter))] md:border-x"
    >
      <h2 id="session-complete-heading" className="flex items-center gap-2 text-lg font-bold">
        <Icon name="check" className="text-success" />
        Session complete
        {loopName !== undefined && <span className="sr-only">: {loopName}</span>}
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <SummaryValue label="Time">{durationLabel(record.durationSeconds)}</SummaryValue>
        <SummaryValue label="Passes">{repeatsLabel(record.repeats)}</SummaryValue>
        <SummaryValue label="Speed">
          {ratioToPercent(startSpeedRatio)}% → {ratioToPercent(record.speedRatio)}%
        </SummaryValue>
        {extras && (
          <SummaryValue label="Streak">
            <Icon name="flame" className="mr-1 inline-block size-4 align-[-0.2em] text-warning" />
            {daysLabel(extras.streakDays)}
          </SummaryValue>
        )}
      </dl>
      {extras && extras.earned.length > 0 && (
        <ul aria-label="Badges earned" className="flex flex-wrap gap-2">
          {extras.earned.map((badge) => (
            <li
              key={badge.id}
              className="flex items-center gap-1.5 rounded-full border border-success-line bg-success-soft px-3 py-1 text-sm font-medium text-ink"
            >
              <Icon name="trophy" className="size-4 text-success" />
              {badge.label}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={onDone}>
          Done
        </button>
        <button type="button" className={ghostButtonClass} onClick={onKeepGoing}>
          Keep going
        </button>
      </div>
    </section>
  );
}

function SummaryValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{label}</dt>
      <dd className="font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}
