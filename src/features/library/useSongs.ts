import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSignedInUser } from '@/lib/auth';
import { deleteSong, fetchSongs, updateSong, uploadSong, type UploadOptions } from './songsApi';
import type { LibrarySong, SongEdit } from './songForm';

/** Keyed by user id, so switching accounts never shows the previous user's cache. */
export const songKeys = {
  all: ['songs'] as const,
  forUser: (userId: string) => [...songKeys.all, userId] as const,
};

export function useSongs() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: songKeys.forUser(user.id),
    queryFn: () => fetchSongs(user.id),
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
    mutationFn: ({ file, ...options }: UploadInput) => uploadSong(user.id, file, options),
    onSuccess: (result) => {
      if (result.kind !== 'uploaded') return;
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs ? [result.song, ...songs.filter((song) => song.id !== result.song.id)] : songs,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

export interface SongUpdate {
  songId: string;
  changes: Partial<SongEdit>;
}

/** Optimistic, like useUpdateSettings: shows the edit at once and rolls back on error. */
export function useUpdateSong() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = songKeys.forUser(user.id);

  return useMutation({
    mutationFn: ({ songId, changes }: SongUpdate) => updateSong(user.id, songId, changes),
    onMutate: async ({ songId, changes }) => {
      // A refetch landing after this would overwrite the optimistic value.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<LibrarySong[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<LibrarySong[]>(
          queryKey,
          previous.map((song) => (song.id === songId ? { ...song, ...changes } : song)),
        );
      }
      return { previous };
    },
    onError: (_error, _update, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (saved) =>
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.map((song) => (song.id === saved.id ? { ...song, ...saved } : song)),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
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
    mutationFn: (songId: string) => deleteSong(user.id, songId),
    onSuccess: (_result, songId) =>
      queryClient.setQueryData<LibrarySong[]>(queryKey, (songs) =>
        songs?.filter((song) => song.id !== songId),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
