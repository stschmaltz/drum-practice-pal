import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { LoadingLine } from '@/components/StatusMessages';
import { linkClass } from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { FinishPrompt } from '@/features/loops/FinishPrompt';
import { barsLabel, shouldAskToFinish, type Loop } from '@/features/loops/loopForm';
import { PracticeSpeed } from '@/features/loops/PracticeSpeed';
import { useLoopPractice } from '@/features/loops/useLoopPractice';
import { useLoops } from '@/features/loops/useLoops';
import { useSaveLoopSpeed } from '@/features/loops/useSaveLoopSpeed';
import { useSpeedMovedSinceChosen } from '@/features/loops/useSpeedMovedSinceChosen';
import { canPlayLoopPractice, type PlayGate } from '@/features/player/controlGates';
import { PlayerControls, PlayPauseButton } from '@/features/player/PlayerControls';
import type { PlayerOptions } from '@/features/player/playerOptions';
import { isRunning } from '@/features/player/PlayerService';
import { usePlayer } from '@/features/player/usePlayer';
import { SessionComplete } from '@/features/practice/SessionComplete';
import { repeatsLabel } from '@/features/practice/sessions';
import { usePracticeTracker } from '@/features/practice/usePracticeTracker';
import { ShortcutOverlay } from '@/features/shortcuts/ShortcutOverlay';
import { clockLabel } from '@/features/stats/totals';
import { waitsForNetwork } from '@/lib/network';
import { loopPracticePath, songPath } from '@/lib/routes';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import {
  fullBleedBarClass,
  PlayerStatusLine,
  ScoreBox,
  SessionNotice,
  ShortcutsButton,
} from './playerScreen';
import { useHeightOf } from './useHeightOf';
import { lookUpPracticeLoop } from './practiceLoop';
import { SongFileGate } from './SongFileGate';
import { BackLink, OfflineMessage, SongGate } from './SongGate';
import { useJamMode } from './useJamMode';
import { useRequestedLoop } from './useRequestedLoop';
import { announcementText, useSongShortcuts } from './useSongShortcuts';

/**
 * /songs/:id/loops/:loopId, the practice screen (Unit 16). Lazy-loaded with
 * the player. One loop, set up as a link to it always has (its range,
 * looping and saved speed: `useLoopPractice.openLoop`), with the session's
 * play time and passes, the score, the speed and one big Play/Pause. The
 * count-in, metronome, drum toggles, keys and "Mark finished?" work as on the
 * whole song; the loop keys move to the song's other loops and the URL
 * follows (replaced, so Back still goes to the song).
 */
export function LoopPracticePage() {
  const { id = '', loopId = '' } = useParams();
  return (
    <SongGate songId={id}>{(song) => <PracticeScreen song={song} loopId={loopId} />}</SongGate>
  );
}

function PracticeScreen({ song, loopId }: { song: Song; loopId: string }) {
  const loops = useLoops(song.id);
  const lookup = lookUpPracticeLoop(loops, loopId);

  const back = <BackLink to={songPath(song.id)}>{song.title}</BackLink>;
  if (waitsForNetwork(loops)) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <OfflineMessage>This song's loops haven't been opened on this device yet.</OfflineMessage>
      </div>
    );
  }
  if (lookup.kind === 'waiting') return <LoadingLine>Loading the loop…</LoadingLine>;
  if (lookup.kind === 'error') {
    return (
      <LoadErrorAlert onRetry={() => void loops.refetch()}>
        Couldn't load this song's loops.
      </LoadErrorAlert>
    );
  }
  if (lookup.kind === 'missing') return <LoopNotFound songId={song.id} />;

  return (
    <div className="flex flex-col gap-4">
      {back}
      <PageHeader title={lookup.loop.name} />
      <SongFileGate song={song}>
        {({ fileBytes, initialOptions }) => (
          <PracticePlayer
            // Keyed by the song, not the loop: the loop keys move to another loop in the same player.
            key={song.id}
            song={song}
            loopId={loopId}
            loop={lookup.loop}
            loops={loops}
            fileBytes={fileBytes}
            initialOptions={initialOptions}
          />
        )}
      </SongFileGate>
    </div>
  );
}

function LoopNotFound({ songId }: { songId: string }) {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Loop not found">
        This loop isn't one of this song's loops. It may have been deleted.
      </PageHeader>
      <Link to={songPath(songId)} className={`${linkClass} self-start`}>
        Go to the song
      </Link>
    </div>
  );
}

/** Re-renders every second while `on`, for a clock read from a ref. */
function useEverySecond(on: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [on]);
}

/**
 * The URL names the loop playing: a loop key moves to another loop and the
 * address follows, replaced, so a reload opens the loop now on screen and
 * Back still goes to the song.
 */
function useUrlFollowsLoop(songId: string, routeLoopId: string, activeLoopId: string | null) {
  const navigate = useNavigate();
  useEffect(() => {
    if (activeLoopId === null || activeLoopId === routeLoopId) return;
    void navigate(loopPracticePath(songId, activeLoopId), { replace: true });
  }, [navigate, songId, routeLoopId, activeLoopId]);
}

/** Around the practice screen's Play/Pause, for the focus hand-overs that land on it. */
const PRACTICE_PLAY_ATTRIBUTES = { 'data-practice-play': '' } as const;
const findPracticePlay = () =>
  document.querySelector<HTMLElement>('[data-practice-play] button:not(:disabled)');

/** "Not yet" to "Mark finished?", for a loop at the speed it was asked about. */
const finishQuestionKey = (loop: Loop) => `${loop.id}:${loop.speed_ratio}`;

function PracticePlayer({
  song,
  loopId,
  loop: routeLoop,
  loops,
  fileBytes,
  initialOptions,
}: {
  song: Song;
  loopId: string;
  /** The loop the route names, as the list has it. */
  loop: Loop;
  loops: ReturnType<typeof useLoops>;
  fileBytes: Uint8Array;
  initialOptions: PlayerOptions;
}) {
  const { scoreRef, scrollRef, player, snapshot } = usePlayer({
    fileBytes,
    drumTrackIndex: song.drum_track_index,
    initialOptions,
  });
  const navigate = useNavigate();
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const stickyBarHeight = useHeightOf(stickyBarRef);
  const practice = useLoopPractice(player, snapshot, loops.data);
  const tracker = usePracticeTracker(player, snapshot, practice.activeLoop?.id ?? null);
  // Every change of the loop's speed is saved as it is made (no "Save speed").
  useSaveLoopSpeed(song.id, practice.activeLoop, snapshot.speedRatio);
  const speedMoved = useSpeedMovedSinceChosen(practice.activeLoop);
  useRequestedLoop(
    loopId,
    player !== null && snapshot.barCount !== null,
    loops,
    practice.openLoop,
    practice.activeLoop !== null,
  );
  useUrlFollowsLoop(song.id, loopId, practice.activeLoop?.id ?? null);
  const loopOpen = practice.activeLoop !== null;
  // One gate for the button and Space: until the loop is open a Play would play the whole song.
  const playGate = useCallback<PlayGate>(
    (current, currentSnapshot) => canPlayLoopPractice(current, currentSnapshot, loopOpen),
    [loopOpen],
  );
  const shortcuts = useSongShortcuts({ player, practice, loops: loops.data, playGate });
  const running = isRunning(snapshot.status);
  useJamMode(
    player,
    { scrollRef, stickyBarRef },
    // A tap seeks inside the loop (seekToBar refuses a bar outside its range).
    { seekOnTap: true, scoreOnScreen: running ? 'playing' : null },
  );
  useEverySecond(running);
  const [declinedFinish, setDeclinedFinish] = useState<string | null>(null);
  const focusWhenReady = useFocusWhenReady();

  // Until the player has opened it, the loop the route names.
  const loop = practice.activeLoop ?? routeLoop;
  const progress = tracker.progress();
  const { completed } = tracker;
  const completedLoopName = loops.data?.find((each) => each.id === completed?.record.loopId)?.name;
  const askToFinish =
    practice.activeLoop !== null &&
    shouldAskToFinish(practice.activeLoop, speedMoved) &&
    declinedFinish !== finishQuestionKey(practice.activeLoop);
  const nothingToShow = snapshot.error === 'score' || snapshot.error === 'engine';

  return (
    <div
      className="flex flex-col gap-3 pb-12"
      style={{ '--jam-bar-height': `${stickyBarHeight}px` } as CSSProperties}
    >
      <p className="-mt-3 text-sm text-ink-muted tabular-nums" data-testid="practice-progress">
        {barsLabel(loop.start_bar, loop.end_bar)} · {clockLabel(progress?.playedSeconds ?? 0)} ·{' '}
        {repeatsLabel(progress?.repeats ?? 0)}
      </p>
      {completed ? (
        <SessionComplete
          completed={completed}
          loopName={completedLoopName}
          // The summary goes, and focus with it: to Play, the next thing to press.
          onKeepGoing={() => {
            tracker.dismissCompleted();
            focusWhenReady(findPracticePlay);
          }}
          onDone={() => void navigate(songPath(song.id))}
        />
      ) : (
        <SessionNotice tracker={tracker} loops={loops.data} showLogged={false} />
      )}
      <div
        ref={stickyBarRef}
        data-testid="practice-bar"
        className={`sticky top-0 ${fullBleedBarClass} flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]`}
      >
        <PracticeSpeed loop={loop} player={player} snapshot={snapshot} />
        <span className="contents" {...PRACTICE_PLAY_ATTRIBUTES}>
          <PlayPauseButton player={player} snapshot={snapshot} round gate={playGate} />
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PlayerStatusLine snapshot={snapshot} />
        <ShortcutsButton onOpen={shortcuts.openHelp} />
      </div>
      <ScoreBox
        scrollRef={scrollRef}
        scoreRef={scoreRef}
        snapshot={snapshot}
        hidden={nothingToShow}
      />
      {/* Under the score, not above it: it comes with the first session of a loop played at
          full speed, and above the score it would push the bar under the finger down. */}
      {askToFinish && practice.activeLoop && (
        <FinishPrompt
          songId={song.id}
          loop={practice.activeLoop}
          onDecline={() => {
            setDeclinedFinish(finishQuestionKey(loop));
            focusWhenReady(findPracticePlay);
          }}
          // The prompt goes once the loop is finished: focus goes on to Play.
          onFinished={() => focusWhenReady(findPracticePlay)}
        />
      )}
      <PlayerControls
        player={player}
        snapshot={snapshot}
        showPlayButton={false}
        showSpeed={false}
      />
      <ShortcutOverlay open={shortcuts.helpOpen} onClose={shortcuts.closeHelp} />
      {/* On the page from the start: a live region added with its text is often not read. */}
      <p role="status" className="sr-only" data-testid="shortcut-announcement">
        {announcementText(shortcuts.announcement)}
      </p>
    </div>
  );
}
