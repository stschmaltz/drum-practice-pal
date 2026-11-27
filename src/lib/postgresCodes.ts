/**
 * The error codes the app acts on, as PostgREST passes them on in `error.code`.
 * `tests/db/helpers.ts` has its own `PG` with the codes the database tests assert.
 */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  /** For an insert: the row it names (a session's loop) doesn't exist any more. */
  FOREIGN_KEY_VIOLATION: '23503',
  /** PostgREST, not Postgres: `.single()` found no row. */
  NO_ROWS: 'PGRST116',
} as const;
