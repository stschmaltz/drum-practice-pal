import { useId, useState } from 'react';
import { Icon } from '@/components/icons';
import { ProgressBar } from '@/components/ProgressMarks';
import { smallHeadingClass } from '@/components/styles';
import { nextUpBadges, type BadgeProgress } from './badges';
import { ExpandButton } from './ExpandButton';

/**
 * Badges without the wall (Unit 17): the earned ones in a line, then "Next
 * up", the three unearned ones closest to done with their progress, and the
 * rest behind "Show all badges".
 */
export function BadgeSection({ badges }: { badges: readonly BadgeProgress[] }) {
  const earned = badges.filter((badge) => badge.earned);
  const { nextUp, rest } = nextUpBadges(badges);
  const [showingAll, setShowingAll] = useState(false);
  const restId = useId();

  return (
    <div className="flex flex-col gap-4">
      {earned.length > 0 ? (
        <ul aria-label="Badges earned" className="flex flex-wrap gap-x-6 gap-y-2">
          {earned.map((badge) => (
            <li
              key={badge.id}
              className="flex items-center gap-2 font-semibold text-ink"
              data-testid="badge"
              data-earned="true"
            >
              <Icon name="trophy" className="shrink-0 text-success" />
              {badge.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted">None earned yet. The first ones aren&apos;t far off.</p>
      )}

      {nextUp.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 id={`${restId}-next`} className={smallHeadingClass}>
            Next up
          </h3>
          <LockedBadges badges={nextUp} labelledBy={`${restId}-next`} />
        </div>
      )}

      {rest.length > 0 && (
        <>
          <ExpandButton
            expanded={showingAll}
            controls={restId}
            onToggle={() => setShowingAll((all) => !all)}
          >
            {showingAll ? 'Show fewer badges' : 'Show all badges'}
          </ExpandButton>
          <div id={restId} hidden={!showingAll}>
            {showingAll && <LockedBadges badges={rest} label="More badges" />}
          </div>
        </>
      )}
    </div>
  );
}

/** Unearned badges with how far along each is: plain items in a row of three from `md`. */
function LockedBadges({
  badges,
  label,
  labelledBy,
}: {
  badges: readonly BadgeProgress[];
  label?: string;
  labelledBy?: string;
}) {
  return (
    <ul
      aria-label={label}
      aria-labelledby={labelledBy}
      className="grid gap-x-8 max-md:divide-y max-md:divide-line md:grid-cols-3 md:gap-y-5"
    >
      {badges.map((badge) => (
        <li key={badge.id} className="flex items-start gap-3 max-md:py-3" data-testid="badge">
          <Icon name="trophy" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-medium text-ink-soft">
              {badge.label}
              <span className="sr-only">, not earned yet</span>
            </p>
            <p className="text-sm text-ink-muted">{badge.progressLabel}</p>
            <ProgressBar fraction={badge.current / badge.target} className="max-w-48" />
          </div>
        </li>
      ))}
    </ul>
  );
}
