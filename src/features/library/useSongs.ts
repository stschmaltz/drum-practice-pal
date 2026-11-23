import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSignedInUser } from '@/lib/auth';
import {
  deleteSong,
  downloadSongFile,
  fetchSong,
  fetchSongs,
  updateSong,
  uploadSong,
  type UploadOptions,
} from './songsApi';
import { revertSongEdit, type LibrarySong, type SongEdit } from './songForm';

/** Keyed by user id, so switching accounts never shows the previous user's cache. */
export const songKeys = {
  all: ['songs'] as const,
  forUser: (userId: string) => [...songKeys.all, userId] as const,
  /** Shared by every mutation that writes this user's songs; see invalidateWhenIdle. */
  writes: (userId: string) => [...songKeys.forUser(userId), 'write'] as const,
  detail: (userId: string, songId: string) =>
    [...songKeys.forUser(userId), 'detail', songId] as const,
};

/**
 * Song files, kept apart from songKeys so a song edit's invalidation (which
 * covers every songKeys.forUser key) never re-downloads a file.
 */
export const songFileKeys = {
  all: ['song-file'] as const,
  forSong: (userId: string, songId: string) => [...songFileKeys.all, userId, songId] as const,
};

/**
 * Refetches the list once the last song write settles. A refetch while
 * another write is still pending would replace that write's optimistic value
 * with the old server row. Called from onSettled, where the settling mutation
 * still counts as pending, so more than one means another write is in flight.
 */
function invalidateWhenIdle(queryClient: QueryClient, userId: string) {
  if (queryClient.isMutating({ mutationKey: songKeys.writes(userId) }) > 1) return;
  return queryClient.invalidateQueries({ queryKey: songKeys.forUser(userId) });
}

export function useSongs() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: songKeys.forUser(user.id),
    queryFn: () => fetchSongs(user.id),
  });
}

/** One song's row, for the song page. Null data means no such song. */
export function useSong(songId: string, { enabled = true } = {}) {
  const user = useSignedInUser();
  return useQuery({
    queryKey: songKeys.detail(user.id, songId),
    queryFn: () => fetchSong(user.id, songId),
    enabled,
  });
}

/**
 * The song's Guitar Pro bytes. A stored file never changes (its path is the
 * song id), so it never goes stale and only leaves the cache when unused.
 */
export function useSongFile(songId: string) {
  const user = useSignedInUser();
  return useQuery({
    queryKey: songFileKeys.forSong(user.id, songId),
    queryFn: () => downloadSongFile(user.id, songId),
    staleTime: Infinity,
  });
}

export interface UploadInput extends UploadOptions {
  file: File;
}

/** Not optimistic: there's no row to show until the file has been read and stored. */
export function useUploadSong() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = songKeys.forUser(user.id);

  return useMutation({
    mutationKey: songKeys.writes(user.id),
    mutationFn: ({ file, ...options }: UploadInput) => uploadSong(user.id, file, options),
    onSuccess: (result) => {
      if (result.kind !== 'uploaded') return;
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs ? [result.song, ...songs.filter((song) => song.id !== result.song.id)] : songs,
      );
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}

export interface SongUpdate {
  songId: string;
  changes: Partial<SongEdit>;
}

/** Optimistic: shows the edit at once and rolls back only that song's fields on error. */
export function useUpdateSong() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = songKeys.forUser(user.id);

  return useMutation({
    mutationKey: songKeys.writes(user.id),
    mutationFn: ({ songId, changes }: SongUpdate) => updateSong(user.id, songId, changes),
    onMutate: async ({ songId, changes }) => {
      // A refetch landing after this would overwrite the optimistic value.
      await queryClient.cancelQueries({ queryKey });
      const before = queryClient
        .getQueryData<LibrarySong[]>(queryKey)
        ?.find((s) => s.id === songId);
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.map((song) => (song.id === songId ? { ...song, ...changes } : song)),
      );
      return { before };
    },
    // Only this song's sent fields, not a snapshot of the whole list: other
    // songs may have been edited, deleted or uploaded since onMutate.
    onError: (_error, { songId, changes }, context) => {
      const before = context?.before;
      if (!before) return;
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.map((song) => (song.id === songId ? revertSongEdit(song, before, changes) : song)),
      );
    },
    onSuccess: (saved) =>
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.map((song) => (song.id === saved.id ? { ...song, ...saved } : song)),
      ),
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}

/**
 * Not optimistic: deleting can't be undone, so the song stays listed (as
 * "Deleting…") until the server confirms, and a failure leaves it there.
 */
export function useDeleteSong() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = songKeys.forUser(user.id);

  return useMutation({
    mutationKey: songKeys.writes(user.id),
    mutationFn: (songId: string) => deleteSong(user.id, songId),
    onSuccess: (_result, songId) =>
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.filter((song) => song.id !== songId),
      ),
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}
