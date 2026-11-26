import { Icon } from '@/components/icons';
import { primaryButtonClass } from '@/components/styles';
import { useOnline } from '@/lib/network';
import { applyWaitingUpdate, useUpdateWaiting } from './appUpdate';

/**
 * The app-wide line about the connection and the app itself, at the top of
 * every signed-in screen: offline, what still works; with a new build
 * waiting, the reload that brings it in.
 */
export function OfflineBanner() {
  const online = useOnline();
  const updateWaiting = useUpdateWaiting();
  if (online && !updateWaiting) return null;

  return (
    <div className="mb-4 flex flex-col gap-2" data-testid="app-banner">
      {!online && (
        <p
          role="status"
          className="flex items-start gap-3 rounded-card border border-warning-line bg-warning-soft px-4 py-3 text-sm text-ink"
        >
          <Icon name="offline" className="mt-0.5 size-5 text-warning" />
          You're offline. Songs opened on this device still play, and your practice, saved speeds
          and finished loops are sent when you're back online.
        </p>
      )}
      {updateWaiting && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-brand-line bg-brand-soft px-4 py-2 text-sm text-ink"
        >
          <p>A new version of the app is ready.</p>
          <button type="button" className={primaryButtonClass} onClick={applyWaitingUpdate}>
            Reload to update
          </button>
        </div>
      )}
    </div>
  );
}
