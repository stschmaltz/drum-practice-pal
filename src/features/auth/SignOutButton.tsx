import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { buttonClass } from '@/components/styles';
import { isOnline, useOnline } from '@/lib/network';
import { useSignOut } from './useAuthActions';

/**
 * RequireAuth redirects to /login once the SIGNED_OUT event lands. Off while
 * offline: signing out empties the device, practice queued for the server
 * included, so it waits until that has had a chance to go.
 */
export function SignOutButton({ className = buttonClass }: { className?: string }) {
  const signOut = useSignOut();
  const online = useOnline();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={signOut.isPending || !online}
        onClick={() => {
          if (isOnline()) signOut.mutate();
        }}
      >
        {signOut.isPending ? 'Signing out…' : 'Sign out'}
      </button>
      {!online && <OfflineNote>You can sign out once you're back online.</OfflineNote>}
      {signOut.error && <ErrorAlert>Couldn't sign out: {signOut.error.message}</ErrorAlert>}
    </div>
  );
}
