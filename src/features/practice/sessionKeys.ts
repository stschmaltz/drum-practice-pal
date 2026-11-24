/**
 * Query keys for practice sessions. In its own module, with no imports, so the
 * loop and song hooks can drop a deleted loop's history without importing the
 * session hooks. Keyed by user id, like every other cache.
 */
export const sessionKeys = {
  all: ['practice-sessions'] as const,
  forUser: (userId: string) => [...sessionKeys.all, userId] as const,
  /** Every session log being sent: the mutations, not a query. */
  logs: (userId: string) => [...sessionKeys.forUser(userId), 'log'] as const,
  /** One loop's history. */
  forLoop: (userId: string, loopId: string) =>
    [...sessionKeys.forUser(userId), 'loop', loopId] as const,
};
