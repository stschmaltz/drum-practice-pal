/**
 * Query keys for loops. In its own module, with no imports, so the library's
 * song hooks can drop a deleted song's loops without importing the loop hooks.
 * Keyed by user id, so switching accounts never shows the previous user's cache.
 */
export const loopKeys = {
  all: ['loops'] as const,
  forUser: (userId: string) => [...loopKeys.all, userId] as const,
  /** Shared by every mutation that writes this user's loops; see invalidateWhenIdle in useLoops.ts. */
  writes: (userId: string) => [...loopKeys.forUser(userId), 'write'] as const,
  /** One song's loops: the list the song page shows. */
  forSong: (userId: string, songId: string) =>
    [...loopKeys.forUser(userId), 'song', songId] as const,
};
