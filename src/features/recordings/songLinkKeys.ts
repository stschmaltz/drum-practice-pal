/**
 * Query keys for a song's links. In its own module, with no imports, so the
 * library's song hooks can drop a deleted song's links without importing the
 * recordings hooks. Keyed by user id, so switching accounts never shows the
 * previous user's cache.
 */
export const songLinkKeys = {
  all: ['song-links'] as const,
  forUser: (userId: string) => [...songLinkKeys.all, userId] as const,
  /** Shared by every mutation that writes this user's links, so sign-out can see one pending. */
  writes: (userId: string) => [...songLinkKeys.forUser(userId), 'write'] as const,
  /**
   * One song's saves, under `writes`: how the latest went is read from the mutation cache
   * by this key, so it outlives the form that sent it (`useSongLinkSaves`).
   */
  savesOf: (userId: string, songId: string) => [...songLinkKeys.writes(userId), songId] as const,
  /** One song's links: its overview's Play along block and its play screen's sources. */
  forSong: (userId: string, songId: string) =>
    [...songLinkKeys.forUser(userId), 'song', songId] as const,
};
