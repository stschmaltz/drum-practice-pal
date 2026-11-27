import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { LoadingLine } from '@/components/StatusMessages';
import type { Song } from '@/features/library/songForm';
import { useSongFile } from '@/features/library/useSongs';
import {
  DEFAULT_PLAYER_OPTIONS,
  playerOptionsFromSettings,
  type PlayerOptions,
} from '@/features/player/playerOptions';
import { useSettings } from '@/features/settings/useSettings';
import { waitsForNetwork } from '@/lib/network';
import { OfflineMessage } from './SongGate';

export interface SongPlayerInputs {
  fileBytes: Uint8Array;
  initialOptions: PlayerOptions;
}

/**
 * Waits for the song's file and the user's settings, then renders the player
 * (`children`). For every screen that plays a song: the whole song and a
 * loop's practice screen.
 */
export function SongFileGate({
  song,
  children,
}: {
  song: Song;
  children: (inputs: SongPlayerInputs) => ReactNode;
}) {
  const file = useSongFile(song.id);
  const settings = useSettings();
  // Settings are waited for only before the player first opens: usePlayer reads them
  // once. Opened offline on the defaults, the settings read that starts on reconnect
  // (pending, now fetching) must not take the playing song off the page.
  const [playerOpenedFor, setPlayerOpenedFor] = useState<string | null>(null);
  const playerOpened = playerOpenedFor === song.id;

  // isLoadingError, not isError: a failed background refetch keeps the bytes, so a playing song stays mounted.
  if (file.isLoadingError) {
    return (
      <LoadErrorAlert onRetry={() => void file.refetch()}>
        Couldn't download this song's file. Check your connection and try again.
      </LoadErrorAlert>
    );
  }
  if (waitsForNetwork(file)) {
    return (
      <OfflineMessage>
        This song's file isn't on this device yet. Open the song once while online to play it
        offline.
      </OfflineMessage>
    );
  }
  // Settings that can't be fetched offline give way to the defaults, like a failed fetch.
  if (file.isPending || (settings.isPending && !waitsForNetwork(settings) && !playerOpened)) {
    return <LoadingLine>Downloading the song…</LoadingLine>;
  }
  // Remembered during render, so the next render already knows (React's "state from
  // the previous render" pattern); per song, since another song's file is waited for again.
  if (!playerOpened) setPlayerOpenedFor(song.id);

  return (
    <>
      {settings.isLoadingError && (
        <p className="flex items-start gap-2 text-sm text-warning">
          <Icon name="alert" className="mt-0.5 size-4" />
          Couldn't load your settings, so the player is using the defaults.
        </p>
      )}
      {children({
        fileBytes: file.data,
        initialOptions: settings.data
          ? playerOptionsFromSettings(settings.data)
          : DEFAULT_PLAYER_OPTIONS,
      })}
    </>
  );
}
