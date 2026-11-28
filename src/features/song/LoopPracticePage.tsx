import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { LoadingLine } from '@/components/StatusMessages';
import {
  linkClass,
  primaryButtonClass,
  quietButtonClass,
  quietPressedButtonClass,
} from '@/components/styles';
import { Icon } from '@/components/icons';
import type { Song } from '@/features/library/songForm';
import { FinishPrompt } from '@/features/loops/FinishPrompt';
import { LoopEditorForm } from '@/features/loops/LoopEditorForm';
import { LoopSavedChoice } from '@/features/loops/LoopSavedChoice';
import { barsLabel, shouldAskToFinish, type Loop } from '@/features/loops/loopForm';
import { PracticeSpeed } from '@/features/loops/PracticeSpeed';
import {
  hasPickedBars,
  useLoopPractice,
  type LoopPractice,
} from '@/features/loops/useLoopPractice';
import { useLoops } from '@/features/loops/useLoops';
import { useSaveLoopSpeed } from '@/features/loops/useSaveLoopSpeed';
import { useSpeedMovedSinceChosen } from '@/features/loops/useSpeedMovedSinceChosen';
import {
  canPickBars,
  canPlayLoopPractice,
  canSetLoopPracticeSpeed,
  type PlayGate,
  type SpeedGate,
} from '@/features/player/controlGates';
import { PlayerControls, PlayPauseButton } from '@/features/player/PlayerControls';
import type { PlayerOptions } from '@/features/player/playerOptions';
import {
  isRunning,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';
import { usePlayer } from '@/features/player/usePlayer';
import { repeatsLabel } from '@/features/practice/sessions';
import { usePracticeTracker } from '@/features/practice/usePracticeTracker';
import { useSittingRecorder } from '@/features/practice/useVisitSittings';
import { ShortcutOverlay } from '@/features/shortcuts/ShortcutOverlay';
import { clockLabel } from '@/features/stats/statLabels';
import { waitsForNetwork } from '@/lib/network';
import { loopPracticePath, songPath } from '@/lib/routes';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import {
  fullBleedBarClass,
  PlayerStatusLine,
  PlayerStatusText,
  ScoreBox,
  SessionNotice,
  ShortcutsButton,
} from './playerScreen';
import { useHeightOf } from './useHeightOf';
import { lookUpPracticeLoop } from './practiceLoop';
import { barsAroundLoop } from './practiceView';
import { SongFileGate } from './SongFileGate';
import { BackLink, OfflineMessage, SongGate } from './SongGate';
import { useJamMode } from './useJamMode';
import { useRequestedLoop } from './useRequestedLoop';
import { announcementText, useSongShortcuts } from './useSongShortcuts';

/**
 * /songs/:id/loops/:loopId, the practice screen (Unit 16). Lazy-loaded with
 * the player. One loop, set up as a link to it always has (its range,
 * looping and saved speed: `useLoopPractice.openLoop`), with the sitting's
 * play time and passes (every session since the loop was opened here; nothing
 * appears at a pause, and the song's overview sums the sitting up afterwards),
 * the score, the speed and one big Play/Pause. The
 * count-in, metronome, drum toggles, keys and "Mark finished?" work as on the
 * whole song; the loop keys move to the song's other loops and the URL
 * follows (replaced, so Back still goes to the song).
 *
 * The score draws only the loop and a bar either side, so nothing else
 * invites a tap. "Show whole song" draws all of it, and there taps and drags
 * pick a new loop's bars for the "Save as loop" sheet; a save opens the new
 * loop here (replaced). The whole-song view is the loop form being open
 * (`practice.editor`): one state, so the drawing, the taps and the sheet
 * can't disagree.
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
      {/* The player draws the name in its own header band; until it opens, here. */}
      <SongFileGate
        song={song}
        header={
          <>
            {back}
            <PageHeader title={lookup.loop.name} />
          </>
        }
      >
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
            back={back}
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

/**
 * What the score draws: the loop and a bar either side, or every bar while
 * the whole song is on show. A change of drawing brings the loop's first
 * bar back on screen once it is drawn (the service waits for the drawing).
 */
function useDrawnBars(
  player: PlayerService | null,
  loop: Loop,
  barCount: number,
  wholeSong: boolean,
): void {
  const drawn = wholeSong
    ? null
    : barsAroundLoop({ startBar: loop.start_bar, endBar: loop.end_bar }, barCount);
  const drawnStart = drawn?.startBar ?? null;
  const drawnEnd = drawn?.endBar ?? null;
  const firstBar = loop.start_bar;
  useEffect(() => {
    if (!player) return;
    const wanted =
      drawnStart !== null && drawnEnd !== null ? { startBar: drawnStart, endBar: drawnEnd } : null;
    const before = player.getSnapshot().visibleBars;
    player.setVisibleBars(wanted);
    if (player.getSnapshot().visibleBars !== before) player.showBar(firstBar);
  }, [player, drawnStart, drawnEnd, firstBar]);
}

/** "Not yet" to "Mark finished?", for a loop at the speed it was asked about. */
const finishQuestionKey = (loop: Loop) => `${loop.id}:${loop.speed_ratio}`;

function PracticePlayer({
  song,
  loopId,
  loop: routeLoop,
  loops,
  fileBytes,
  initialOptions,
  back,
}: {
  song: Song;
  loopId: string;
  /** The loop the route names, as the list has it. */
  loop: Loop;
  loops: ReturnType<typeof useLoops>;
  fileBytes: Uint8Array;
  initialOptions: PlayerOptions;
  /** The way up to the song, at the start of the header band. */
  back: ReactNode;
}) {
  const { scoreRef, scrollRef, player, snapshot } = usePlayer({
    fileBytes,
    drumTrackIndex: song.drum_track_index,
    initialOptions,
    // Drawn as the loop from the start, never the whole song first.
    initialVisibleBars: barsAroundLoop(
      { startBar: routeLoop.start_bar, endBar: routeLoop.end_bar },
      song.bar_count,
    ),
  });
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const stickyBarHeight = useHeightOf(stickyBarRef);
  // A drag picks bars only in the whole song, where the form is already open.
  // There a whole range picked is what plays, so a new loop is heard before it is saved.
  const practice = useLoopPractice(player, snapshot, loops.data, {
    dragOpensForm: false,
    previewPickedBars: true,
  });
  const wholeSong = practice.editor !== null;
  const tracker = usePracticeTracker(player, snapshot, practice.activeLoop?.id ?? null);
  // Leaving the loop, for another or for the song, ends its sitting.
  useSittingRecorder(song.id, practice.activeLoop, tracker.sitting);
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
  // And one for the speed's stepper and keys: a change before the loop is open would be
  // played and then dropped, the loop opening at its saved speed over it.
  const speedGate = useCallback<SpeedGate>(
    (current, currentSnapshot) => canSetLoopPracticeSpeed(current, currentSnapshot, loopOpen),
    [loopOpen],
  );
  const shortcuts = useSongShortcuts({
    player,
    practice,
    loops: loops.data,
    playGate,
    speedGate,
  });
  const running = isRunning(snapshot.status);
  useJamMode(
    player,
    { scrollRef, stickyBarRef },
    // On the loop a tap seeks inside it (seekToBar refuses a bar outside its range); on the
    // whole song a tap picks a new loop's bars instead.
    {
      seekOnTap: !wholeSong,
      scoreOnScreen: wholeSong ? 'picking-bars' : running ? 'playing' : null,
    },
  );
  useEverySecond(running);
  const [declinedFinish, setDeclinedFinish] = useState<string | null>(null);
  const focusWhenReady = useFocusWhenReady();

  // Until the player has opened it, the loop the route names.
  const loop = practice.activeLoop ?? routeLoop;
  useDrawnBars(player, loop, song.bar_count, wholeSong);
  const sitting = tracker.sitting();
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
      {/* Only a session that couldn't be sent or is waiting offline: one that is logged
          says nothing here (a pause is silent), the song's overview sums the sitting up. */}
      <SessionNotice tracker={tracker} loops={loops.data} showLogged={false} />
      {/* One band, sticky. From 1024 px one row of three columns: the loop (back, name, what
          is going on) left, the speed stepper on the band's centre whatever the name's length,
          the whole-song toggle, Shortcuts and Play right. Below that, and on a tablet beside
          the sidebar where the three don't fit, the stepper is a centred row of its own under
          the name and Play. In a short window (a phone on its side) one row again. */}
      <div
        ref={stickyBarRef}
        data-testid="practice-bar"
        className={`sticky top-0 ${fullBleedBarClass} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] short:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          {back}
          <h1 className="truncate text-xl font-bold tracking-tight lg:text-2xl" title={loop.name}>
            {loop.name}
          </h1>
          {/* In a short window (a phone on its side) the line is only read out: with it the
              band was 105 px of a 390 px window, and the score needs the height more. */}
          <p className="truncate text-sm text-ink-muted tabular-nums short:sr-only">
            <span data-testid="practice-progress">
              {barsLabel(loop.start_bar, loop.end_bar)} · {clockLabel(sitting?.playedSeconds ?? 0)}{' '}
              · {repeatsLabel(sitting?.repeats ?? 0)}
            </span>{' '}
            · <PlayerStatusText snapshot={snapshot} />
          </p>
        </div>
        {/* Play sits with the speed, in the middle: the two things pressed while practising
            are one reach apart, not a screen's width (Shane, 2026-11-27). */}
        <div className="col-span-2 row-start-2 flex items-center justify-self-center gap-4 lg:col-span-1 lg:col-start-2 lg:row-start-1 short:col-span-1 short:col-start-2 short:row-start-1">
          <PracticeSpeed loop={loop} player={player} snapshot={snapshot} gate={speedGate} />
          <span className="contents" {...PRACTICE_PLAY_ATTRIBUTES}>
            <PlayPauseButton player={player} snapshot={snapshot} round gate={playGate} />
          </span>
        </div>
        <div className="col-start-2 row-start-1 flex items-center justify-self-end gap-1 lg:col-start-3 short:col-start-3">
          <WholeSongToggle practice={practice} snapshot={snapshot} />
          <ShortcutsButton onOpen={shortcuts.openHelp} compact />
        </div>
      </div>
      {snapshot.status === 'error' && <PlayerStatusLine snapshot={snapshot} />}
      <ScoreBox
        scrollRef={scrollRef}
        scoreRef={scoreRef}
        snapshot={snapshot}
        hidden={nothingToShow}
        fitsScore={!wholeSong}
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
      {practice.editor && snapshot.barCount !== null && (
        <SaveAsLoopSheet
          songId={song.id}
          barCount={snapshot.barCount}
          practice={practice}
          player={player}
          snapshot={snapshot}
          currentLoopName={loop.name}
          onPractise={(saved) => {
            practice.closeEditor();
            // The loop and its saved speed, as a link to it would open it: the speed
            // playing now is the loop being left's, nudged since the save or not.
            practice.openLoop(saved);
            // The button goes with its sheet: focus to Play, the next thing to press.
            focusWhenReady(findPracticePlay);
          }}
          onBack={() => {
            practice.closeEditor();
            // Whatever was pressed (Back to the loop, Cancel, Done) goes with the sheet too.
            focusWhenReady(findPracticePlay);
          }}
        />
      )}
    </div>
  );
}

/**
 * The whole song or the loop alone. Says what a press shows next: "Show
 * whole song" draws every bar, where taps pick a new loop's bars (and what is
 * picked plays); "Show the loop" goes back to the loop's bars and its range.
 * Off until the score's bars are in, and locked while a new loop's save is on
 * its way (the form is what it is).
 */
function WholeSongToggle({
  practice,
  snapshot,
}: {
  practice: LoopPractice;
  snapshot: PlayerSnapshot;
}) {
  const wholeSong = practice.editor !== null;
  return (
    <button
      type="button"
      className={wholeSong ? quietPressedButtonClass : quietButtonClass}
      disabled={!canPickBars(snapshot) || (practice.editor?.saving ?? false)}
      onClick={() => (wholeSong ? practice.closeEditor() : practice.openEditor(null))}
    >
      <Icon name={wholeSong ? 'loop' : 'music'} />
      {/* Words from 1024 px; beside the name and Play below that, the icon stands for them. */}
      <span className="max-lg:sr-only">{wholeSong ? 'Show the loop' : 'Show whole song'}</span>
    </button>
  );
}

/**
 * "Save as loop", as a sheet at the foot of the window (placed as the jam
 * page's loop sheet is) so nothing on the page moves while bars are tapped. The loop
 * form, in its bar layout: online only, one client id for its lifetime. The
 * new loop becomes the one practised, and the URL follows it (replaced).
 */
function SaveAsLoopSheet({
  songId,
  barCount,
  practice,
  player,
  snapshot,
  onPractise,
  onBack,
  currentLoopName,
}: {
  songId: string;
  barCount: number;
  practice: LoopPractice;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
  /** "Practise it now" on the loop just saved. From the screen, which outlives the sheet. */
  onPractise: (saved: Loop) => void;
  /**
   * Back to the loop being practised, from the choice or from the form (Cancel, Done). From
   * the screen too: the control pressed goes with the sheet, so the screen hands focus on.
   */
  onBack: () => void;
  /** The loop being practised, for the way back to it. */
  currentLoopName: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetHeight = useHeightOf(sheetRef);
  // How many loops this sheet has saved: each makes the next form a new one.
  const [savedCount, setSavedCount] = useState(0);
  // The loop whose save the user hasn't answered yet: practise it now, or make another?
  const [justSaved, setJustSaved] = useState<Loop | null>(null);
  const { editor } = practice;
  if (!editor) return null;
  return (
    <>
      {/* Room at the page's end for the sheet, so the controls can scroll out from under it. */}
      <div aria-hidden="true" style={{ height: sheetHeight }} />
      <div
        ref={sheetRef}
        data-testid="save-as-loop"
        className="fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 max-h-[60dvh] overflow-y-auto rounded-t-card border-t border-line bg-surface p-4 shadow-sheet md:right-gutter md:bottom-[env(safe-area-inset-bottom)] md:left-[calc(var(--spacing-sidebar)+var(--spacing-gutter))] md:border-x"
      >
        {justSaved && !hasPickedBars(editor) ? (
          // A loop was just saved: the choice it leaves takes the form's place until one is
          // made. Bars picked on the score meanwhile are "make another": the form comes back
          // holding them.
          <LoopSavedChoice
            saved={justSaved}
            practise={
              // A button, not a link: this screen switches loop in place, and its URL follows.
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => onPractise(justSaved)}
              >
                <Icon name="play" />
                Practise it now
              </button>
            }
            onAnother={() => setJustSaved(null)}
            onDone={onBack}
            doneLabel={`Back to ${currentLoopName}`}
          />
        ) : (
          <LoopEditorForm
            // A new form for each loop saved: its own client id, an empty name.
            key={savedCount}
            layout="bar"
            songId={songId}
            barCount={barCount}
            loop={null}
            editor={editor}
            player={player}
            snapshot={snapshot}
            onBarsChange={practice.setEditorBars}
            onSavingChange={practice.setEditorSaving}
            onSaved={(saved) => {
              // The whole song stays for more loops: several are made in one go, then
              // practised (Shane, 2026-11-27). The loop being practised stays the loop.
              setSavedCount((count) => count + 1);
              setJustSaved(saved);
              practice.openEditor(null);
            }}
            onCancel={onBack}
            // Once a loop has been saved here there is nothing to cancel, only to finish.
            cancelLabel={savedCount > 0 ? 'Done' : undefined}
          />
        )}
      </div>
    </>
  );
}
