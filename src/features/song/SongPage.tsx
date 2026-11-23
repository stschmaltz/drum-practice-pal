import { Link, useParams } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { buttonClass } from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { useSong, useSongFile } from '@/features/library/useSongs';
import { PlayerControls } from '@/features/player/PlayerControls';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
import {
  DEFAULT_PLAYER_OPTIONS,
  playerOptionsFromSettings,
  type PlayerOptions,
} from '@/features/player/playerOptions';
import { usePlayer } from '@/features/player/usePlayer';
import { useSettings } from '@/features/settings/useSettings';
import { isUuid } from '@/lib/randomUuid';

/**
 * /songs/:id. Lazy-loaded from App.tsx with the player. Unit 05 wires the
 * player in; jam mode (06), count-in (07) and loops (08) build on this page.
 */
export function SongPage() {
  const { id = '' } = useParams();
  const validId = isUuid(id);
  const song = useSong(id, { enabled: validId });

  if (!validId || song.data === null) return <SongNotFound />;
  if (song.isPending) return <p className="text-neutral-400">Loading song…</p>;
  if (song.isLoadingError) {
    return <LoadFailed message="Couldn't load this song." onRetry={() => void song.refetch()} />;
  }

  return <SongScreen song={song.data} />;
}

function SongScreen({ song }: { song: Song }) {
  const file = useSongFile(song.id);
  const settings = useSettings();

  let body;
  if (file.isError) {
    body = (
      <LoadFailed
        message="Couldn't download this song's file. Check your connection and try again."
        onRetry={() => void file.refetch()}
      />
    );
  } else if (file.isPending || settings.isPending) {
    body = <p className="text-neutral-400">Downloading the song…</p>;
  } else {
    body = (
      <>
        {settings.isLoadingError && (
          <p className="text-sm text-amber-300">
            Couldn't load your settings, so the player is using the defaults.
          </p>
        )}
        <SongPlayer
          // A new song means a new player: usePlayer reads its inputs once.
          key={song.id}
          fileBytes={file.data}
          drumTrackIndex={song.drum_track_index}
          initialOptions={
            settings.data ? playerOptionsFromSettings(settings.data) : DEFAULT_PLAYER_OPTIONS
          }
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={song.title}>{song.artist || null}</PageHeader>
      {body}
    </div>
  );
}

function SongPlayer({
  fileBytes,
  drumTrackIndex,
  initialOptions,
}: {
  fileBytes: Uint8Array;
  drumTrackIndex: number | null;
  initialOptions: PlayerOptions;
}) {
  const { scoreRef, scrollRef, player, snapshot } = usePlayer({
    fileBytes,
    drumTrackIndex,
    initialOptions,
  });
  // A soundfont failure still leaves readable notation; these leave an empty white box.
  const nothingToShow = snapshot.error === 'score' || snapshot.error === 'engine';

  return (
    <div className="flex flex-col gap-3">
      <PlayerControls player={player} snapshot={snapshot} />
      {snapshot.status === 'error' && snapshot.error ? (
        <ErrorAlert>{PLAYER_ERROR_MESSAGES[snapshot.error]}</ErrorAlert>
      ) : (
        <p className="text-sm text-neutral-400" aria-live="polite" data-testid="player-status">
          {snapshot.status === 'loading'
            ? 'Loading the score and sounds…'
            : `Bar ${snapshot.barNumber ?? 1} of ${snapshot.barCount ?? '?'}`}
        </p>
      )}
      {/* Both layouts scroll inside this box, so the cursor's auto-scroll is one code path. */}
      <div
        ref={scrollRef}
        data-testid="score-viewport"
        // Hidden, not unmounted: alphaTab keeps its elements until the player is disposed.
        hidden={nothingToShow}
        className="relative h-[60dvh] overflow-auto rounded-lg bg-white text-black"
      >
        <div ref={scoreRef} />
      </div>
    </div>
  );
}

function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-red-300">{message}</p>
      <button type="button" className={buttonClass} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function SongNotFound() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Song not found">
        This song isn't in your library. It may have been deleted.
      </PageHeader>
      <Link to="/library" className="text-sky-400 underline">
        Go to Library
      </Link>
    </div>
  );
}
