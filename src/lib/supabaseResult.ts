/**
 * Turns supabase-js `{ data, error }` results into values or thrown errors, so
 * query and mutation functions can't forget the error and TanStack Query sees
 * failures as failures.
 */

interface SupabaseResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Returns `data`, throwing the result's error, or an error when no data came back. */
export function unwrap<T>(result: SupabaseResult<T>, what: string): T {
  throwIfError(result);
  if (result.data === null) throw new Error(`No ${what} returned`);
  return result.data;
}

/** For calls whose data you don't need (deletes, sign-out). */
export function throwIfError(result: { error: { message: string } | null }): void {
  if (result.error) throw result.error;
}
