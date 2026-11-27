import { useEffect, useRef } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import { OfflineNote } from '@/components/OfflineNote';
import { buttonClass, dangerButtonClass, dangerPanelClass } from '@/components/styles';
import { failureCopy } from '@/lib/errorCopy';
import { isOnline, useOnline } from '@/lib/network';
import type { Loop } from './loopForm';
import { useDeleteLoop } from './useLoops';

/** Inline, like deleting a song: no modal, and not optimistic. */
export function ConfirmDeleteLoop({
  songId,
  loop,
  onCancel,
  onDeletePressed,
}: {
  songId: string;
  loop: Loop;
  onCancel: () => void;
  onDeletePressed: () => void;
}) {
  const remove = useDeleteLoop(songId);
  const online = useOnline();
  // In place of the Delete button that asked: the question is read out, and Tab reaches its buttons.
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => groupRef.current?.focus({ preventScroll: true }), []);

  return (
    <div
      ref={groupRef}
      tabIndex={-1}
      role="group"
      aria-label={`Delete ${loop.name}`}
      className={`${dangerPanelClass} flex flex-col gap-2 focus:outline-none`}
    >
      <p className="text-ink">
        Delete “{loop.name}”? Its practice history is deleted too. This can't be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButtonClass}
          disabled={remove.isPending || !online}
          onClick={() => {
            if (!isOnline()) return;
            remove.mutate(loop.id);
            onDeletePressed();
          }}
        >
          <Icon name="trash" />
          {remove.isPending ? 'Deleting…' : 'Delete loop'}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={remove.isPending}
          onClick={onCancel}
        >
          Keep it
        </button>
      </div>
      {!online && (
        <OfflineNote>You're offline. Loops can be deleted once you're back online.</OfflineNote>
      )}
      {remove.isError && (
        <ErrorAlert>Couldn't delete the loop. {failureCopy(remove.error)}</ErrorAlert>
      )}
    </div>
  );
}
