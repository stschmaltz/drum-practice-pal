/**
 * Whether the sign-in email carries a 6-digit code, so the login page should ask for it.
 * The hosted project still sends Supabase's default email (link only) until it has a custom
 * SMTP sender and our template (docs/release.md), so `.env.production` turns the code off.
 * Read at each call, not once, so tests can switch it with `vi.stubEnv`.
 */
export function signInCodeOffered(): boolean {
  return import.meta.env.VITE_SIGN_IN_CODE !== 'off';
}
