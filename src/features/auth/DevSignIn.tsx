import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { signInFailureCopy, UserFacingError } from '@/lib/errorCopy';
import { throwIfError } from '@/lib/supabaseResult';
import { ErrorAlert } from '@/components/ErrorAlert';
import { ghostButtonClass } from '@/components/styles';
import { DEV_DEFAULT_EMAIL, DEV_PASSWORD } from './devPassword';
import { DEV_TARGET_IS_LOCAL } from './devTarget';
import { normalizeEmail } from './signInInput';

/**
 * Local testing only: signs in as the typed address (or the demo user) with no email,
 * by password, creating the account on first use. `LoginPage` renders it only under the
 * Vite dev server (`import.meta.env.DEV`), so no build (production, previews, the e2e
 * build) has it.
 */
export function DevSignIn({ email }: { email: string }) {
  const signIn = useMutation({
    networkMode: 'always',
    mutationFn: async (address: string) => {
      // Checked here too, not only where the button is drawn: the password is public.
      if (!DEV_TARGET_IS_LOCAL) {
        throw new UserFacingError('Dev sign-in only works against the local Supabase stack.');
      }
      const attempt = await supabase.auth.signInWithPassword({
        email: address,
        password: DEV_PASSWORD,
      });
      if (!attempt.error) return;
      if (attempt.error.code !== 'invalid_credentials') throw attempt.error;
      // No such account yet, or one first made by email, which has no password.
      const created = await supabase.auth.signUp({ email: address, password: DEV_PASSWORD });
      if (created.error?.code !== 'user_already_exists') throwIfError(created);
      if (!created.data.session) {
        throw new UserFacingError(
          'That account was made by email, so it has no dev password. Run npm run db:reset, or sign in with the emailed code.',
        );
      }
    },
  });
  const address = normalizeEmail(email) ?? DEV_DEFAULT_EMAIL;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <button
        type="button"
        className={ghostButtonClass}
        disabled={signIn.isPending}
        onClick={() => signIn.mutate(address)}
      >
        Dev: sign in as {address}
      </button>
      {signIn.error && <ErrorAlert>Couldn't sign in. {signInFailureCopy(signIn.error)}</ErrorAlert>}
    </div>
  );
}
