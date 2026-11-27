import { Icon } from '@/components/icons';
import { useAllSessions } from '@/features/practice/useSessions';
import { currentStreak, daysLabel } from './streak';

/**
 * The practice streak in the Songs header (Unit 14): a flame and the number
 * of days, nothing at all at 0 or before the sessions have been read.
 */
export function StreakBadge() {
  const sessions = useAllSessions();
  if (!sessions.data) return null;
  const days = currentStreak(sessions.data, new Date());
  if (days === 0) return null;
  return (
    <p
      className="flex shrink-0 items-center gap-1 pt-1 text-lg font-bold text-ink tabular-nums"
      data-testid="streak"
      title={`Practice streak: ${daysLabel(days)}`}
    >
      <Icon name="flame" className="size-6 text-warning" />
      <span className="sr-only">Practice streak: </span>
      {days}
      <span className="sr-only">{days === 1 ? ' day' : ' days'}</span>
    </p>
  );
}
