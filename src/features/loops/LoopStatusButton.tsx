import { ErrorAlert } from '@/components/ErrorAlert';
import { buttonClass } from '@/components/styles';
import type { Loop } from './loopForm';
import { useSetLoopStatus } from './useLoops';

/**
 * "Mark finished" on an active loop, "Reopen" on a finished one, for a row of
 * buttons in a `flex flex-wrap` box: the song page's loop list and the home
 * page's lists. A refused change says so on a line of its own under the row.
 * Finishing only flags the loop; its history and speeds stay.
 */
export function LoopStatusButton({
  loop,
}: {
  loop: Pick<Loop, 'id' | 'song_id' | 'name' | 'status'>;
}) {
  const status = useSetLoopStatus(loop.song_id, loop.id);
  const finished = loop.status === 'finished';

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        // Locked while any control is changing this loop's status, not only this one.
        disabled={status.isPending}
        onClick={() => status.setStatus(finished ? 'active' : 'finished')}
      >
        {finished ? 'Reopen' : 'Mark finished'}
        <span className="sr-only"> {loop.name}</span>
      </button>
      {status.error && (
        // After the row's other buttons, whatever the button's own place in it.
        <div className="order-last basis-full">
          <ErrorAlert>Couldn't change the loop: {status.error.message}</ErrorAlert>
        </div>
      )}
    </>
  );
}
