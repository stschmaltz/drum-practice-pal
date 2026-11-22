import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { throwIfError } from '@/lib/supabaseResult';

/**
 * Emails a sign-in link that also carries a 6-digit code. The link returns to
 * `redirectTo`; the code is for when the link can't open the app, e.g. a phone
 * testing the dev server over the LAN, or an installed PWA on iOS, where links
 * open in Safari instead.
 */
export function useSendSignInEmail() {
  return useMutation({
    mutationFn: async ({ email, redirectTo }: { email: string; redirectTo: string }) => {
      throwIfError(
        await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
        }),
      );
    },
  });
}

export function useVerifySignInCode() {
  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      // 'email' covers both first-time sign-up and returning-user codes.
      throwIfError(await supabase.auth.verifyOtp({ email, token: code, type: 'email' }));
    },
  });
}

export function useSignOut() {
  return useMutation({
    // Local scope: signing out on the laptop shouldn't sign the phone out too.
    // AuthProvider clears the query cache on the SIGNED_OUT event.
    mutationFn: async () => throwIfError(await supabase.auth.signOut({ scope: 'local' })),
  });
}
