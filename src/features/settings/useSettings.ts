import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSignedInUser } from '@/lib/auth';
import { fetchSettings, updateSettings } from './settingsApi';
import type { Settings } from './settingsForm';

/** Keyed by user id, so switching accounts never shows the previous user's cache. */
export const settingsKeys = {
  all: ['settings'] as const,
  forUser: (userId: string) => [...settingsKeys.all, userId] as const,
};

export function useSettings() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: settingsKeys.forUser(user.id),
    queryFn: () => fetchSettings(user.id),
  });
}

/**
 * Optimistic: the cache shows the new values at once, rolls back if the write
 * fails, and is refetched either way so it ends up matching the DB.
 */
export function useUpdateSettings() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const queryKey = settingsKeys.forUser(user.id);

  return useMutation({
    mutationFn: (changes: Partial<Settings>) => updateSettings(user.id, changes),
    onMutate: async (changes) => {
      // A refetch landing after this would overwrite the optimistic value.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Settings>(queryKey);
      if (previous) queryClient.setQueryData<Settings>(queryKey, { ...previous, ...changes });
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (saved) => queryClient.setQueryData(queryKey, saved),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
