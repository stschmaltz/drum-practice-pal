/**
 * The round trip through /login: where to send a signed-out visitor, where to
 * send them back to once signed in (`?next=`), and why a magic link failed.
 */

const LOGIN_PATH = '/login';
const HOME_PATH = '/';

/** Router state RequireAuth hands to /login along with the redirect. */
export interface LoginRedirectState {
  linkError: string | null;
}

/**
 * Only same-origin app paths are allowed, so a crafted login link can't bounce
 * a freshly signed-in user to another site (`//evil.example`, `/\evil.example`).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return HOME_PATH;
  }
  // Control characters (tabs, newlines) are stripped by URL parsers and can hide a `//`.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return HOME_PATH;
  // A fragment would break the magic link: GoTrue appends `#access_token=...` to the
  // redirect, and `/settings#frag#access_token=...` can't be parsed, so drop it.
  const path = raw.split('#')[0] ?? '';
  const pathname = path.split('?')[0];
  if (pathname === LOGIN_PATH || pathname?.startsWith(`${LOGIN_PATH}/`)) return HOME_PATH;
  return path;
}

/** The /login URL that returns to `path` after sign-in. */
export function loginPathFor(path: string): string {
  const next = safeNextPath(path);
  return next === HOME_PATH ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

export const EXPIRED_LINK_MESSAGE = 'That sign-in link is invalid or has expired.';
export const FAILED_LINK_MESSAGE = 'That sign-in link did not work.';

/**
 * An expired or reused magic link comes back as `#error=...&error_code=otp_expired`.
 * Returns fixed copy for /login to show. The URL's own `error_description` is never
 * shown, since anyone can craft a link that puts any sentence in the alert.
 */
export function linkErrorFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('error') && !params.has('error_code')) return null;
  return params.get('error_code') === 'otp_expired' ? EXPIRED_LINK_MESSAGE : FAILED_LINK_MESSAGE;
}
