import { useRef, type ReactNode, type Ref } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { buttonClass } from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { useSong, useSongFile } from '@/features/library/useSongs';
import { CountInCounter } from '@/features/player/CountInCounter';
import { PlayerControls, PlayPauseButton } from '@/features/player/PlayerControls';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
import {
  DEFAULT_PLAYER_OPTIONS,
  playerOptionsFromSettings,
  type PlayerOptions,
} from '@/features/player/playerOptions';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { ratioToPercent } from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import { usePlayer } from '@/features/player/usePlayer';
import { useSettings } from '@/features/settings/useSettings';
import { isUuid } from '@/lib/randomUuid';
import { useJamMode } from './useJamMode';

/**
 * /songs/:id. Lazy-loaded from App.tsx with the player. Opens in jam mode
 * (Unit 06): the whole song with a following cursor, tap a bar to go there,
 * and the speed and BPM at the current bar, with the count-in (Unit 07)
 * counted over the score. Loops (08) build on this page.
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
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={song.title}>{song.artist || null}</PageHeader>
      <SongBody song={song} />
    </div>
  );
}

/** Waits for the file and settings, then opens the player. */
function SongBody({ song }: { song: Song }) {
  const file = useSongFile(song.id);
  const settings = useSettings();

  // isLoadingError, not isError: a failed background refetch keeps the bytes, so a playing song stays mounted.
  if (file.isLoadingError) {
    return (
      <LoadFailed
        message="Couldn't download this song's file. Check your connection and try again."
        onRetry={() => void file.refetch()}
      />
    );
  }
  if (file.isPending || settings.isPending) {
    return <p className="text-neutral-400">Downloading the song…</p>;
  }

  return (
    <>
      {settings.isLoadingError && (
        <p className="text-sm text-amber-300">
          Couldn't load your settings, so the player is using the defaults.
        </p>
      )}
      <SongPlayer
        // A new song means a new player: usePlayer reads its inputs once. That
        // also opens every song at 100%, whatever speed the last one was at.
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
  const stickyBarRef = useRef<HTMLDivElement>(null);
  // The count-in counter sits over the score, so the score comes on screen for it too.
  const running = snapshot.status === 'playing' || snapshot.status === 'countingIn';
  useJamMode(player, { scrollRef, stickyBarRef }, running);
  // A soundfont failure still leaves readable notation; these leave an empty white box.
  const nothingToShow = snapshot.error === 'score' || snapshot.error === 'engine';

  return (
    <div className="flex flex-col gap-3">
      <JamBar ref={stickyBarRef} player={player} snapshot={snapshot} />
      <PlayerControls player={player} snapshot={snapshot} showPlayButton={false} />
      <PlayerStatusLine snapshot={snapshot} />
      {/* The counter covers the score box without scrolling with what's inside it. */}
      <div className="relative">
        <CountInCounter snapshot={snapshot} />
        {/* Both layouts scroll inside this box, so the cursor's auto-scroll is one code path. */}
        <div
          ref={scrollRef}
          data-testid="score-viewport"
          // Hidden, not unmounted: alphaTab keeps its elements until the player is disposed.
          hidden={nothingToShow}
          // jam-score: the cursor and tap styles in index.css. The bottom scroll margin keeps
          // the box clear of the phone's fixed tab bar when playback scrolls it into view
          // (useJamMode sets the top one from the sticky bar's height).
          className="jam-score relative h-[60dvh] scroll-mb-[calc(4.5rem+env(safe-area-inset-bottom))] overflow-auto rounded-lg bg-white text-black md:scroll-mb-4"
        >
          <div ref={scoreRef} />
        </div>
      </div>
    </div>
  );
}

/**
 * The readout and Play/Pause, sticky at the top of the window so both stay on
 * screen when Play scrolls the page to the score: on a phone the header,
 * controls and score don't all fit. Full-bleed over the page gutter.
 */
function JamBar({
  ref,
  player,
  snapshot,
}: {
  ref: Ref<HTMLDivElement>;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
}) {
  return (
    <div
      ref={ref}
      data-testid="jam-bar"
      className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-neutral-950 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:-mx-8 md:px-8"
    >
      <JamReadout snapshot={snapshot} />
      <PlayPauseButton player={player} snapshot={snapshot} />
    </div>
  );
}

/**
 * Speed and the BPM it gives at the current bar, big enough to read from the
 * throne. BPM follows the bar, so it changes as playback crosses a tempo change.
 */
function JamReadout({ snapshot }: { snapshot: PlayerSnapshot }) {
  const { speedRatio, barTempo } = snapshot;
  return (
    <dl aria-label="Tempo" className="flex items-baseline gap-6 tabular-nums">
      <ReadoutValue label="Speed" testId="jam-speed">
        {ratioToPercent(speedRatio)}%
      </ReadoutValue>
      <ReadoutValue label="BPM" testId="jam-bpm">
        {barTempo === null ? '–' : bpmAtSpeed(barTempo, speedRatio)}
      </ReadoutValue>
    </dl>
  );
}

function ReadoutValue({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-sm text-neutral-400">{label}</dt>
      <dd className="text-3xl font-semibold" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

/** The player's error as fixed copy, otherwise where playback is. */
function PlayerStatusLine({ snapshot }: { snapshot: PlayerSnapshot }) {
  if (snapshot.status === 'error' && snapshot.error) {
    return <ErrorAlert>{PLAYER_ERROR_MESSAGES[snapshot.error]}</ErrorAlert>;
  }
  return (
    <p className="text-sm text-neutral-400" aria-live="polite" data-testid="player-status">
      {snapshot.status === 'loading'
        ? 'Loading the score and sounds…'
        : `Bar ${snapshot.barNumber ?? 1} of ${snapshot.barCount ?? '?'}`}
      {snapshot.status === 'countingIn' && ' · Counting in…'}
    </p>
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
