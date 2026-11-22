/** Mirrors `[auth.email] otp_length` in supabase/config.toml. */
export const SIGN_IN_CODE_LENGTH = 6;

/** Trimmed and lowercased, or null when it can't be an address. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

/**
 * For the code input's `pattern`: exactly the code length in digits, with the
 * spaces and hyphens `normalizeSignInCode` strips, so the browser's own
 * validation rejects what the normalizer would. `\-` because browsers compile
 * `pattern` with the `v` flag.
 */
export const SIGN_IN_CODE_PATTERN = String.raw`[\s\-]*(?:[0-9][\s\-]*){${SIGN_IN_CODE_LENGTH}}`;

/** Digits only (codes get pasted with spaces), or null unless exactly the code length. */
export function normalizeSignInCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`).test(code) ? code : null;
}
