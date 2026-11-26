import type { ReactNode } from 'react';
import { Icon } from './icons';
import { inlineIconClass } from './styles';

/**
 * Why a control that needs the network is disabled. Shown beside the control
 * while offline (`useOnline()` is false); the control's handler refuses on
 * `isOnline()` too.
 */
export function OfflineNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-warning" data-testid="offline-note">
      <Icon name="offline" className={`${inlineIconClass} size-4`} />
      {children}
    </p>
  );
}
