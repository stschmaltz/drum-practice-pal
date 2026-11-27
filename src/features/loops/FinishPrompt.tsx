import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import { ghostButtonClass, inlineIconClass, primaryButtonClass } from '@/components/styles';
import { failureCopy } from '@/lib/errorCopy';
import type { Loop } from './loopForm';
import { useSetLoopStatus } from './useLoops';

/**
 * Asks whether a loop that has reached full speed is done. It only
 * asks: a loop is never finished for the user, and "Not yet" leaves it as it is.
 */
export function FinishPrompt({
  songId,
  loop,
  onDecline,
  onFinished,
}: {
  songId: string;
  loop: Loop;
  onDecline: () => void;
  onFinished: () => void;
}) {
  const status = useSetLoopStatus(songId, loop.id);
  return (
    <div
      role="group"
      aria-label="Mark finished?"
      data-testid="finish-prompt"
      className="flex flex-col gap-2 rounded-control border border-success-line bg-success-soft p-3 motion-safe:animate-fade-in"
    >
      <p className="text-sm text-ink">
        <Icon name="check" className={`${inlineIconClass} size-4 text-success`} />
        You're playing it at full speed. Mark this loop finished?
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          // Locked like the list's status button (`LoopStatusButton`), which says why.
          aria-disabled={status.isPending || undefined}
          onClick={() => {
            if (status.setStatus('finished')) onFinished();
          }}
        >
          <Icon name="check" />
          Mark finished
        </button>
        <button type="button" className={ghostButtonClass} onClick={onDecline}>
          Not yet
        </button>
      </div>
      {status.error && (
        <ErrorAlert>Couldn't mark the loop finished. {failureCopy(status.error)}</ErrorAlert>
      )}
    </div>
  );
}
