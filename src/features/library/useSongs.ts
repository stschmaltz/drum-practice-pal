import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { loopKeys } from '@/features/loops/loopKeys';
import type { PracticeLoop } from '@/features/loops/practiceList';
import { loadSongFile, removeStoredSongFile } from '@/features/offline/songFileStore';
import { sessionKeys } from '@/features/practice/sessionKeys';
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
import { revertSongEdit, type LibrarySong, type Song, type SongEdit } from './songForm';

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

const SONG_FILE_IN_MEMORY_MS = 5 * 60 * 1000;

/**
 * The song's Guitar Pro bytes: the copy kept on this device if there is one,
 * else a download that is kept for next time, so a song opened once plays
 * offline. A stored file never changes (its path is the song id), so it never
 * goes stale. In memory only while in use and a few minutes after: the copy on
 * the device is what lasts.
 */
export function useSongFile(songId: string) {
  const user = useSignedInUser();
  return useQuery({
    queryKey: songFileKeys.forSong(user.id, songId),
    queryFn: () => loadSongFile(user.id, songId, () => downloadSongFile(user.id, songId)),
    staleTime: Infinity,
    gcTime: SONG_FILE_IN_MEMORY_MS,
    // Runs offline too, since the copy on the device needs no network; with none
    // stored, the download fails and the retry waits for the connection (paused).
    networkMode: 'offlineFirst',
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
    // Online only (the control is off offline), so a dropped connection fails it rather than pausing it.
    networkMode: 'always',
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
    networkMode: 'always',
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
    onSuccess: (saved) => {
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.map((song) => (song.id === saved.id ? { ...song, ...saved } : song)),
      );
      // The song page reads its own entry; without this it would open with the old title.
      queryClient.setQueryData<Song | null>(songKeys.detail(user.id, saved.id), (song) =>
        song ? { ...song, ...saved } : song,
      );
      // The home page names each loop's song.
      queryClient.setQueryData<PracticeLoop[]>(loopKeys.practice(user.id), (loops) =>
        loops?.map((loop) =>
          loop.song_id === saved.id
            ? { ...loop, song: { title: saved.title, artist: saved.artist } }
            : loop,
        ),
      );
    },
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
    networkMode: 'always',
    mutationFn: (songId: string) => deleteSong(user.id, songId),
    onSuccess: (_result, songId) => {
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.filter((song) => song.id !== songId),
      );
      // Going back to the song's page must not open the player on its cached
      // row and bytes while the refetch that finds it gone is still on its way.
      queryClient.setQueryData<Song | null>(songKeys.detail(user.id, songId), null);
      queryClient.removeQueries({ queryKey: songFileKeys.forSong(user.id, songId) });
      void removeStoredSongFile(user.id, songId);
      // Its loops went with it (cascade); a cached list would outlive them.
      queryClient.removeQueries({ queryKey: loopKeys.forSong(user.id, songId) });
      queryClient.setQueryData<PracticeLoop[]>(loopKeys.practice(user.id), (loops) =>
        loops?.filter((loop) => loop.song_id !== songId),
      );
      // And their practice history with them. Every loop's, rather than finding
      // which were this song's: a history is cheap to fetch again.
      queryClient.removeQueries({ queryKey: sessionKeys.forUser(user.id) });
    },
    onSettled: () => invalidateWhenIdle(queryClient, user.id),
  });
}
