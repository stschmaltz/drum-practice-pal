import { ErrorAlert } from '@/components/ErrorAlert';
import { buttonClass } from '@/components/styles';
import { useSignOut } from './useAuthActions';

/** RequireAuth redirects to /login once the SIGNED_OUT event lands. */
export function SignOutButton({ className = buttonClass }: { className?: string }) {
  const signOut = useSignOut();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {signOut.isPending ? 'Signing out…' : 'Sign out'}
      </button>
      {signOut.error && <ErrorAlert>Couldn't sign out: {signOut.error.message}</ErrorAlert>}
    </div>
  );
}
