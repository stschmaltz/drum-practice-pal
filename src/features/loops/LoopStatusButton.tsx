import { useRef, type ReactNode } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import { quietButtonClass } from '@/components/styles';
import { failureCopy } from '@/lib/errorCopy';
import type { LoopStatus } from '@/lib/schema';
import { statusButtonAttributes } from './loopFocus';
import type { Loop } from './loopForm';
import { statusRefusalCopy } from './loopLabels';
import { useSetLoopStatus } from './useLoops';

/**
 * "Mark finished" on an active loop, "Reopen" on a finished one, for a row of
 * buttons in a `flex flex-wrap` box: the song page's loop list and the home
 * page's lists. A refused change says so on a line of its own under the row.
 * Finishing only flags the loop; its history and speeds stay.
 *
 * The press moves the loop to another list, which unmounts this button:
 * `onSet` is for the list to say where focus goes (`loopFocus.ts`). It runs
 * only when the change was sent.
 */
export function LoopStatusButton({
  loop,
  onSet,
  showError = true,
}: {
  loop: Pick<Loop, 'id' | 'song_id' | 'name' | 'status'>;
  onSet?: (status: LoopStatus) => void;
  /** False while another control of the same write says why it failed (the "Mark finished?" prompt). */
  showError?: boolean;
}) {
  const status = useSetLoopStatus(loop.song_id, loop.id);
  const finished = loop.status === 'finished';
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={quietButtonClass}
        // Locked while any control is changing this loop's status, not only this one. Locked,
        // not disabled: focus follows the loop to this button while the write is still on its
        // way, and a disabled button can't take it. `setStatus` ignores the press meanwhile.
        aria-disabled={status.isPending || undefined}
        {...statusButtonAttributes(loop)}
        onClick={() => {
          const next = finished ? 'active' : 'finished';
          // Nothing else happens for a press that sent nothing. React renders the change
          // after this handler, so the list hears of it in time to look on that render.
          if (status.setStatus(next)) onSet?.(next);
        }}
      >
        <Icon name={finished ? 'reopen' : 'check'} className="size-4" />
        {finished ? 'Reopen' : 'Mark finished'}
        <span className="sr-only"> {loop.name}</span>
      </button>
      {showError && status.error && status.refused && (
        // After the row's other buttons, whatever the button's own place in it.
        <div className="order-last basis-full">
          <StatusRefusal
            loopName={loop.name}
            onDismiss={() => {
              // "Dismiss" goes with the message: the button it was about takes focus first.
              button.current?.focus();
              status.dismissError();
            }}
          >
            {statusRefusalCopy(status.refused)} {failureCopy(status.error)}
          </StatusRefusal>
        </div>
      )}
    </>
  );
}

/**
 * Why a loop's status change was refused, with "Dismiss" to put the message
 * away (13.35c): it is read from the failed write, which the mutation cache
 * keeps for minutes. `onDismiss` also says where focus goes, since the button
 * leaves with the message.
 */
export function StatusRefusal({
  loopName,
  onDismiss,
  children,
}: {
  loopName: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <ErrorAlert>{children}</ErrorAlert>
      <button type="button" className={quietButtonClass} onClick={onDismiss}>
        Dismiss<span className="sr-only"> the message about {loopName}</span>
      </button>
    </div>
  );
}
