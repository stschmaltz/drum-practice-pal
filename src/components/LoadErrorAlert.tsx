import type { ReactNode } from 'react';
import { Icon } from './icons';
import { buttonClass, dangerCardClass, inlineIconClass } from './styles';

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
    <div
      role="alert"
      className={`flex flex-col items-start ${dangerCardClass} ${
        compact ? 'gap-2 p-3' : 'gap-3 p-4'
      }`}
    >
      <p className={`text-danger ${compact ? 'text-sm' : ''}`}>
        <Icon name="alert" className={`${inlineIconClass} ${compact ? 'size-4' : 'size-5'}`} />
        {children}
      </p>
      <button type="button" className={buttonClass} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
