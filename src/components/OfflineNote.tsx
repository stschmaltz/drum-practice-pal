import type { ReactNode } from 'react';

/**
 * Why a control that needs the network is disabled. Shown beside the control
 * while offline (`useOnline()` is false); the control's handler refuses on
 * `isOnline()` too.
 */
export function OfflineNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-amber-300" data-testid="offline-note">
      {children}
    </p>
  );
}
