import type { ReactNode } from 'react';
import { buttonClass } from './styles';

/**
 * A first load that failed, with a way to read again. For `isLoadingError`
 * only: a failed background refetch keeps what is already on show.
 */
export function LoadErrorAlert({
  children,
  onRetry,
  compact = false,
}: {
  children: ReactNode;
  onRetry: () => void;
  /** Smaller text and gap, for a failure inside a list item. */
  compact?: boolean;
}) {
  return (
    <div role="alert" className={`flex flex-col items-start ${compact ? 'gap-2' : 'gap-3'}`}>
      <p className={compact ? 'text-sm text-red-300' : 'text-red-300'}>{children}</p>
      <button type="button" className={buttonClass} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
