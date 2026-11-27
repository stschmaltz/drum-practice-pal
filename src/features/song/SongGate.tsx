import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import { linkClass } from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { useSong } from '@/features/library/useSongs';
import { waitsForNetwork } from '@/lib/network';
import { isUuid } from '@/lib/randomUuid';
import { SONGS_PATH } from '@/lib/routes';

/**
 * The song a route names, or why it can't be shown: not an id, not the
 * user's (or deleted), not on this device offline, loading, or a failed
 * load. Shared by the song's three screens (overview, practice, whole song).
 * Imports no player code, so the overview stays out of alphaTab's chunk.
 */
export function SongGate({
  songId,
  children,
}: {
  songId: string;
  children: (song: Song) => ReactNode;
}) {
  const validId = isUuid(songId);
  const song = useSong(songId, { enabled: validId });

  if (!validId || song.data === null) return <SongNotFound />;
  if (waitsForNetwork(song)) {
    return (
      <OfflineMessage>
        This song hasn't been opened on this device yet, so it can't be shown offline.
      </OfflineMessage>
    );
  }
  if (song.isPending) return <LoadingLine>Loading song…</LoadingLine>;
  if (song.isLoadingError) {
    return (
      <LoadErrorAlert onRetry={() => void song.refetch()}>Couldn't load this song.</LoadErrorAlert>
    );
  }
  return children(song.data);
}

export function OfflineMessage({ children }: { children: ReactNode }) {
  return (
    <EmptyState
      icon="offline"
      action={
        <Link to={SONGS_PATH} className={linkClass}>
          Go to Songs
        </Link>
      }
    >
      <span className="block font-semibold text-warning">You're offline.</span>
      {children}
    </EmptyState>
  );
}

function SongNotFound() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Song not found">
        This song isn't in your library. It may have been deleted.
      </PageHeader>
      <Link to={SONGS_PATH} className={`${linkClass} self-start`}>
        Go to Songs
      </Link>
    </div>
  );
}

/** "← Song title": the way up a level, above a screen's own title. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={`${linkClass} -mb-2 self-start text-sm no-underline hover:underline`}>
      <span aria-hidden="true" className="mr-1">
        ←
      </span>
      {children}
    </Link>
  );
}
