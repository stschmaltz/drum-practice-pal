import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import {
  activeCardClass,
  buttonClass,
  dangerCardClass,
  ghostButtonClass,
  inlineIconClass,
  linkClass,
  pressedButtonClass,
} from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { useSong, useSongFile } from '@/features/library/useSongs';
import { barsLabel, type Loop } from '@/features/loops/loopForm';
import { LoopPanel } from '@/features/loops/LoopPanel';
import { useLoopPanelOpen } from '@/features/loops/useLoopPanelOpen';
import { useLoopPractice } from '@/features/loops/useLoopPractice';
import { useLoops } from '@/features/loops/useLoops';
import { CountInCounter } from '@/features/player/CountInCounter';
import { PlayerControls, PlayPauseButton } from '@/features/player/PlayerControls';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
import {
  DEFAULT_PLAYER_OPTIONS,
  playerOptionsFromSettings,
  type PlayerOptions,
} from '@/features/player/playerOptions';
import {
  isRunning,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';
import { ratioToPercent } from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import { usePlayer } from '@/features/player/usePlayer';
import { durationLabel } from '@/features/practice/sessions';
import { usePracticeTracker, type PracticeTracker } from '@/features/practice/usePracticeTracker';
import { ShortcutOverlay } from '@/features/shortcuts/ShortcutOverlay';
import { useSettings } from '@/features/settings/useSettings';
import { useOnline, waitsForNetwork } from '@/lib/network';
import { isUuid } from '@/lib/randomUuid';
import { useJamMode } from './useJamMode';
import { useRequestedLoop } from './useRequestedLoop';
import { useSongShortcuts } from './useSongShortcuts';

/**
 * /songs/:id. Lazy-loaded from App.tsx with the player. Opens in jam mode
 * (Unit 06): the whole song with a following cursor, tap a bar to go there,
 * and the speed and BPM at the current bar, with the count-in (Unit 07)
 * counted over the score. Loops (Unit 08) sit beside it: a saved bar range
 * plays on repeat at its saved speed, and while the loop form is open a tap
 * on the score picks a bar instead of seeking. Time spent playing a loop is
 * logged as practice sessions (Unit 09), and `?loop=<id>` opens the page on
 * that loop, which is how the home page's lists link here. Keys and pedals
 * (Unit 10) work the player and switch loops; `?` lists them.
 */
export function SongPage() {
  const { id = '' } = useParams();
  const validId = isUuid(id);
  const song = useSong(id, { enabled: validId });

  if (!validId || song.data === null) return <SongNotFound />;
  if (waitsForNetwork(song)) {
    return (
      <OfflineMessage>
        This song hasn't been opened on this device yet, so it can't be played offline.
      </OfflineMessage>
    );
  }
  if (song.isPending) return <LoadingLine>Loading song…</LoadingLine>;
  if (song.isLoadingError) {
    return (
      <LoadErrorAlert onRetry={() => void song.refetch()}>Couldn't load this song.</LoadErrorAlert>
    );
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
      <SongPlayer
        // A new song means a new player: usePlayer reads its inputs once. That
        // also opens every song at 100%, whatever speed the last one was at.
        key={song.id}
        songId={song.id}
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
  songId,
  fileBytes,
  drumTrackIndex,
  initialOptions,
}: {
  songId: string;
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
  const loops = useLoops(songId);
  const practice = useLoopPractice(player, snapshot, loops.data);
  const tracker = usePracticeTracker(player, snapshot, practice.activeLoop?.id ?? null);
  useRequestedLoop(
    player !== null && snapshot.barCount !== null,
    loops,
    practice.openLoop,
    practice.activeLoop !== null,
  );
  const shortcuts = useSongShortcuts({ player, practice, loops: loops.data });
  const loopPanel = useLoopPanelOpen();
  const { setOpen: setLoopPanelOpen } = loopPanel;
  const pickingBars = practice.editor !== null;
  // The loop form lives in the panel, however it was opened (a drag on the score opens it too).
  useEffect(() => {
    if (pickingBars) setLoopPanelOpen(true);
  }, [pickingBars, setLoopPanelOpen]);

  useJamMode(
    player,
    { scrollRef, stickyBarRef },
    {
      seekOnTap: !pickingBars,
      // The count-in counter sits over the score, so the score comes on screen for it too.
      scoreOnScreen: pickingBars ? 'picking-bars' : isRunning(snapshot.status) ? 'playing' : null,
    },
  );
  // A soundfont failure still leaves readable notation; these leave an empty white box.
  const nothingToShow = snapshot.error === 'score' || snapshot.error === 'engine';
  // A loop's BPM is its speed times the tempo at its first bar, wherever playback is inside it.
  const readoutTempo = practice.activeLoop
    ? (player?.tempoAtBar(practice.activeLoop.start_bar) ?? snapshot.barTempo)
    : snapshot.barTempo;

  return (
    // The bottom padding keeps the end of the page clear of the loop sheet's header.
    <div className="flex flex-col gap-3 pb-12 lg:pb-0">
      <JamBar ref={stickyBarRef} player={player} snapshot={snapshot} tempo={readoutTempo} />
      {/* Above the two columns: beside the panel the controls would be squeezed. */}
      <PlayerControls player={player} snapshot={snapshot} showPlayButton={false} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <PlayerStatusLine snapshot={snapshot} />
            <div className="flex gap-2">
              <ShortcutsButton onOpen={shortcuts.openHelp} />
              <LoopPanelToggle
                open={loopPanel.open}
                panelBodyId={loopPanel.bodyId}
                onOpenChange={setLoopPanelOpen}
              />
            </div>
          </div>
          {practice.activeLoop && (
            <ActiveLoopLine loop={practice.activeLoop} onExit={practice.exitLoop} />
          )}
          <SessionNotice tracker={tracker} loops={loops.data} />
          <ScoreBox
            scrollRef={scrollRef}
            scoreRef={scoreRef}
            snapshot={snapshot}
            hidden={nothingToShow}
          />
        </div>
        <LoopPanel
          songId={songId}
          player={player}
          snapshot={snapshot}
          practice={practice}
          loops={loops}
          open={loopPanel.open}
          onOpenChange={setLoopPanelOpen}
          bodyId={loopPanel.bodyId}
        />
      </div>
      <ShortcutOverlay open={shortcuts.helpOpen} onClose={shortcuts.closeHelp} />
    </div>
  );
}

/**
 * Opens the shortcut overlay, which `?` also does. From 768 px only: a tablet
 * or laptop is where a keyboard is likely, and the phone's row has no room.
 */
function ShortcutsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`max-md:hidden ${ghostButtonClass} whitespace-nowrap`}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <Icon name="keyboard" />
      Shortcuts
    </button>
  );
}

/**
 * Shows or hides the loop panel from 1024 px, where it is a column beside the
 * score. Hidden below (a phone, a tablet in portrait): the sheet's own header
 * is the one toggle there.
 */
function LoopPanelToggle({
  open,
  panelBodyId,
  onOpenChange,
}: {
  open: boolean;
  panelBodyId: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`max-lg:hidden ${open ? pressedButtonClass : buttonClass} whitespace-nowrap`}
      aria-expanded={open}
      aria-controls={panelBodyId}
      onClick={() => onOpenChange(!open)}
    >
      <Icon name="loop" />
      {open ? 'Hide loops' : 'Show loops'}
    </button>
  );
}

/** The scrolling box alphaTab renders the score into, with the count-in counter over it. */
function ScoreBox({
  scrollRef,
  scoreRef,
  snapshot,
  hidden,
}: {
  scrollRef: Ref<HTMLDivElement>;
  scoreRef: Ref<HTMLDivElement>;
  snapshot: PlayerSnapshot;
  hidden: boolean;
}) {
  return (
    // The counter covers the score box without scrolling with what's inside it.
    <div className="relative">
      <CountInCounter snapshot={snapshot} />
      {/* Both layouts scroll inside this box, so the cursor's auto-scroll is one code path. */}
      <div
        ref={scrollRef}
        data-testid="score-viewport"
        // Hidden, not unmounted: alphaTab keeps its elements until the player is disposed.
        hidden={hidden}
        // jam-score: the cursor, highlight and tap styles in index.css. The bottom scroll
        // margin keeps the box clear of the loop sheet's header (and on a phone the
        // fixed tab bar under it) when playback scrolls it into view; the column from
        // lg covers nothing (useJamMode sets the top one from the sticky bar's height).
        className="jam-score relative h-[60dvh] scroll-mb-[calc(7.5rem+env(safe-area-inset-bottom))] overflow-auto rounded-card shadow-card md:scroll-mb-[calc(4rem+env(safe-area-inset-bottom))] lg:scroll-mb-4"
      >
        <div ref={scoreRef} />
      </div>
    </div>
  );
}

/**
 * Which loop is repeating, with the way back to the whole song. Above the
 * score rather than only in the panel, which below 1024 px is a closed sheet.
 */
function ActiveLoopLine({ loop, onExit }: { loop: Loop; onExit: () => void }) {
  return (
    <div
      data-testid="active-loop"
      className={`${activeCardClass} flex items-center justify-between gap-3 py-1 pr-1 pl-3`}
    >
      <Icon name="loop" className="size-5 text-brand" />
      {/* Two lines at most: a long unbroken name is cut short, not stacked a letter per line. */}
      <p className="line-clamp-2 min-w-0 flex-1 text-sm break-words" title={loop.name}>
        Looping <span className="font-semibold">{loop.name}</span> ·{' '}
        {barsLabel(loop.start_bar, loop.end_bar)}
      </p>
      <button type="button" className={`${ghostButtonClass} shrink-0`} onClick={onExit}>
        Exit loop
      </button>
    </div>
  );
}

/**
 * What became of the last practice session: logged, kept on the device until
 * the connection is back, or refused with a way to send it again. Above the
 * score, because below 1024 px the loop panel is a closed sheet while practising.
 */
function SessionNotice({
  tracker,
  loops,
}: {
  tracker: PracticeTracker;
  loops: readonly Loop[] | undefined;
}) {
  const { lastLogged, unsaved, waiting, retryUnsaved } = tracker;
  const online = useOnline();
  if (unsaved.length > 0) {
    return (
      <div
        role="alert"
        className={`${dangerCardClass} flex flex-wrap items-center gap-x-4 gap-y-2 py-1 pr-1 pl-3`}
      >
        <p className="flex flex-1 items-start gap-2 text-sm text-danger">
          <Icon name="alert" className="mt-0.5 size-4" />
          {unsaved.length === 1
            ? "Couldn't save your last practice session."
            : `Couldn't save your last ${unsaved.length} practice sessions.`}
        </p>
        <button type="button" className={buttonClass} onClick={retryUnsaved}>
          Try again
        </button>
      </div>
    );
  }
  if (waiting.length > 0 && !online) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 text-sm text-ink-muted"
        data-testid="session-waiting"
      >
        <Icon name="offline" className="mt-0.5 size-4 text-warning" />
        Practice saved on this device. It's logged when you're back online.
      </p>
    );
  }
  if (!lastLogged) return null;
  const loopName = loops?.find((loop) => loop.id === lastLogged.loopId)?.name;
  return (
    <p role="status" className="text-sm text-ink-muted" data-testid="session-logged">
      <Icon name="check" className={`${inlineIconClass} size-4 text-success`} />
      Practice logged: {durationLabel(lastLogged.durationSeconds)}
      {loopName !== undefined && <> of {loopName}</>} at {ratioToPercent(lastLogged.speedRatio)}%.
    </p>
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
  tempo,
}: {
  ref: Ref<HTMLDivElement>;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
  /** The file's tempo the BPM is worked out from: the current bar's, or a loop's first bar's. */
  tempo: number | null;
}) {
  return (
    <div
      ref={ref}
      data-testid="jam-bar"
      className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-canvas px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:-mx-gutter md:px-gutter"
    >
      <JamReadout speedRatio={snapshot.speedRatio} tempo={tempo} />
      <PlayPauseButton player={player} snapshot={snapshot} />
    </div>
  );
}

/**
 * Speed and the BPM it gives, big enough to read from the throne. In jam mode
 * BPM follows the current bar, so it changes as playback crosses a tempo
 * change; in a loop it is the BPM at the loop's first bar.
 */
function JamReadout({ speedRatio, tempo }: { speedRatio: number; tempo: number | null }) {
  return (
    <dl aria-label="Tempo" className="flex items-baseline gap-4 tabular-nums md:gap-6">
      <ReadoutValue label="Speed" testId="jam-speed">
        {ratioToPercent(speedRatio)}%
      </ReadoutValue>
      <ReadoutValue label="BPM" testId="jam-bpm">
        {tempo === null ? '–' : bpmAtSpeed(tempo, speedRatio)}
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
      <dt className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{label}</dt>
      <dd className="text-readout md:text-4xl md:font-bold" data-testid={testId}>
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
    <p className="text-sm text-ink-muted" aria-live="polite" data-testid="player-status">
      {snapshot.status === 'loading'
        ? 'Loading the score and sounds…'
        : `Bar ${snapshot.barNumber ?? 1} of ${snapshot.barCount ?? '?'}`}
      {snapshot.status === 'countingIn' && ' · Counting in…'}
    </p>
  );
}

function OfflineMessage({ children }: { children: ReactNode }) {
  return (
    <EmptyState
      icon="offline"
      action={
        <Link to="/library" className={linkClass}>
          Go to Library
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
      <Link to="/library" className={`${linkClass} self-start`}>
        Go to Library
      </Link>
    </div>
  );
}
