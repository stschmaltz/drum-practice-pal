import { buttonClass } from '@/components/styles';
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
          className="rounded-md border border-amber-700 bg-amber-950/60 px-3 py-2 text-sm text-amber-100"
        >
          You're offline. Songs opened on this device still play, and your practice, saved speeds
          and finished loops are sent when you're back online.
        </p>
      )}
      {updateWaiting && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-sky-800 bg-sky-950/60 px-3 py-2 text-sm"
        >
          <p>A new version of the app is ready.</p>
          <button type="button" className={buttonClass} onClick={applyWaitingUpdate}>
            Reload to update
          </button>
        </div>
      )}
    </div>
  );
}
