import { useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { buttonClass } from '@/components/styles';
import {
  hasUnsentWrites,
  hasUnsentWritesAnywhere,
  useHasUnsentWrites,
} from '@/features/offline/unsentWrites';
import { useSignedInUser } from '@/lib/auth';
import { isOnline, useOnline } from '@/lib/network';
import { useSignOut } from './useAuthActions';

/**
 * RequireAuth redirects to /login once the SIGNED_OUT event lands. Signing
 * out empties the device, practice queued for the server included, so it is
 * off while offline and while any write is still on its way (a request that
 * hangs, or one being tried again after the connection dropped it), this
 * tab's or another's (unsentWrites.ts).
 */
export function SignOutButton({ className = buttonClass }: { className?: string }) {
  const signOut = useSignOut();
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const online = useOnline();
  const unsent = useHasUnsentWrites(user.id);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={signOut.isPending || !online || unsent}
        onClick={() => {
          if (!isOnline()) return;
          // The outbox, which other tabs share, is read asynchronously; asked again after it.
          void hasUnsentWritesAnywhere(queryClient, user.id).then((unsentNow) => {
            if (unsentNow || !isOnline() || hasUnsentWrites(queryClient, user.id)) return;
            signOut.mutate();
          });
        }}
      >
        {signOut.isPending ? 'Signing out…' : 'Sign out'}
      </button>
      {!online ? (
        <OfflineNote>You can sign out once you're back online.</OfflineNote>
      ) : (
        unsent && (
          <OfflineNote>
            Your latest practice or changes are still on their way. You can sign out once they've
            arrived.
          </OfflineNote>
        )
      )}
      {signOut.error && <ErrorAlert>Couldn't sign out: {signOut.error.message}</ErrorAlert>}
    </div>
  );
}
