import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { Icon } from '@/components/icons';
import { buttonClass, pressedButtonClass } from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import type { Loop } from '@/features/loops/loopForm';
import { findLoopSpeed } from '@/features/loops/loopFocus';
import { LoopPanel, type LoopFormOutcome } from '@/features/loops/LoopPanel';
import { panelShowsLoopSpeed } from '@/features/loops/loopPanelContent';
import { useLoopPanelOpen } from '@/features/loops/useLoopPanelOpen';
import { useLoopPractice, type LoopPractice } from '@/features/loops/useLoopPractice';
import { useLoops } from '@/features/loops/useLoops';
import { canPickBars } from '@/features/player/controlGates';
import { PlayerControls, PlayPauseButton } from '@/features/player/PlayerControls';
import type { PlayerOptions } from '@/features/player/playerOptions';
import {
  isRunning,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';
import { ratioToPercent } from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import { usePlayer } from '@/features/player/usePlayer';
import { usePracticeTracker } from '@/features/practice/usePracticeTracker';
import { ShortcutOverlay } from '@/features/shortcuts/ShortcutOverlay';
import { isUuid } from '@/lib/randomUuid';
import { EDIT_LOOP_PARAM, loopPracticePath, NEW_LOOP_PARAM, songPath } from '@/lib/routes';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import {
  fullBleedBarClass,
  PlayerStatusLine,
  ScoreBox,
  SessionNotice,
  ShortcutsButton,
} from './playerScreen';
import { useHeightOf } from './useHeightOf';
import { SongFileGate } from './SongFileGate';
import { BackLink, SongGate } from './SongGate';
import { useControlsFold } from './useControlsFold';
import { useJamMode } from './useJamMode';
import { announcementText, useSongShortcuts } from './useSongShortcuts';
import { useStaysOnScreen } from './useStaysOnScreen';

/**
 * /songs/:id/play, "Play whole song". Lazy-loaded from App.tsx with the
 * player. Jam mode (Unit 06): the whole song with a following cursor, tap a
 * bar to go there, and the speed and BPM at the current bar, with the
 * count-in (Unit 07) counted over the score. Loops (Unit 08) sit beside it: a
 * saved bar range plays on repeat at its saved speed, and while the loop form
 * is open a tap on the score picks a bar instead of seeking. Time spent
 * playing a loop is logged as practice sessions (Unit 09). Keys and pedals
 * (Unit 10) work the player and switch loops; `?` lists them.
 *
 * `?new=1` (the song overview's "New loop") opens the loop form for a new
 * loop, and its save goes on to that loop's practice screen; `?edit=<id>`
 * (a loop's Edit on the overview) opens it on that loop, and its save or
 * Cancel goes back to the song (Unit 14).
 */
export function SongPage() {
  const { id = '' } = useParams();
  return <SongGate songId={id}>{(song) => <SongScreen song={song} />}</SongGate>;
}

function SongScreen({ song }: { song: Song }) {
  return (
    <div className="flex flex-col gap-4">
      <BackLink to={songPath(song.id)}>{song.title}</BackLink>
      <PageHeader title={song.title}>{song.artist || null}</PageHeader>
      <SongFileGate song={song}>
        {({ fileBytes, initialOptions }) => (
          <SongPlayer
            // A new song means a new player: usePlayer reads its inputs once. That
            // also opens every song at 100%, whatever speed the last one was at.
            key={song.id}
            songId={song.id}
            fileBytes={fileBytes}
            drumTrackIndex={song.drum_track_index}
            initialOptions={initialOptions}
          />
        )}
      </SongFileGate>
    </div>
  );
}

/** The loop form a link asked for: a new loop, or an edit of one. */
type LinkedLoopForm = { kind: 'new' } | { kind: 'edit'; loopId: string };

function linkedLoopFormOf(params: URLSearchParams): LinkedLoopForm | null {
  if (params.get(NEW_LOOP_PARAM) !== null) return { kind: 'new' };
  const loopId = params.get(EDIT_LOOP_PARAM);
  return loopId !== null && isUuid(loopId) ? { kind: 'edit', loopId } : null;
}

/**
 * Opens the loop form a link asked for, once the score's bars are known (and,
 * for an edit, the song's loops), and says where its save and Cancel lead.
 * Read once, when the page opens: the parameters stay in the URL, but a form
 * the user closes isn't opened again.
 */
function useLinkedLoopForm(
  songId: string,
  snapshot: PlayerSnapshot,
  practice: LoopPractice,
  loops: readonly Loop[] | undefined,
): LoopFormOutcome | undefined {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [linked] = useState(() => linkedLoopFormOf(params));
  const opened = useRef(false);
  const ready = canPickBars(snapshot);
  const { openEditor } = practice;

  const formOpen = practice.editor !== null;
  useEffect(() => {
    if (!linked || opened.current || !ready) return;
    // The user got there first (a drag across bars opens the form): theirs stays.
    if (formOpen) {
      opened.current = true;
      return;
    }
    if (linked.kind === 'new') {
      opened.current = openEditor(null);
      return;
    }
    if (!loops) return;
    opened.current = true;
    const loop = loops.find((listed) => listed.id === linked.loopId);
    // Not one of this song's loops (deleted since, say): jam mode as it is.
    if (loop) openEditor(loop);
  }, [linked, ready, loops, openEditor, formOpen]);

  if (!linked) return undefined;
  const backToSong = () => void navigate(songPath(songId), { replace: true });
  return {
    // Replaced, so Back from the practice screen goes to the song, not to the form.
    onCreated: (loop) => void navigate(loopPracticePath(songId, loop.id), { replace: true }),
    onEdited: backToSong,
    onCancelled: backToSong,
  };
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
  const controlsRef = useRef<HTMLDivElement>(null);
  const stickyBarHeight = useHeightOf(stickyBarRef);
  const fold = useControlsFold(isRunning(snapshot.status));
  const focusWhenReady = useFocusWhenReady();
  // The controls fold and unfold above the score at Play and Pause: the score stays where it
  // is on screen, so a bar tapped just after a Pause is the bar that was under the finger.
  // What the window can't scroll back is held as room under the controls.
  useStaysOnScreen(scrollRef, controlsRef, fold.folded);
  const loops = useLoops(songId);
  const practice = useLoopPractice(player, snapshot, loops.data);
  const tracker = usePracticeTracker(player, snapshot, practice.activeLoop?.id ?? null);
  const linkedForm = useLinkedLoopForm(songId, snapshot, practice, loops.data);
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
    { scrollRef, stickyBarRef, stickyControlsRef: controlsRef },
    {
      seekOnTap: !pickingBars,
      // The count-in counter sits over the score, so the score comes on screen for it too. Keyed on
      // the fold rather than on running, so Hide controls brings it back as well: the user had
      // scrolled up to that button, and in phone landscape kept still the score was off the window.
      scoreOnScreen: pickingBars ? 'picking-bars' : fold.folded ? 'playing' : null,
    },
  );
  // A soundfont failure still leaves readable notation; these leave an empty white box.
  const nothingToShow = snapshot.error === 'score' || snapshot.error === 'engine';
  // A loop's BPM is its speed times the tempo at its first bar, wherever playback is inside it.
  const readoutTempo = practice.activeLoop
    ? (player?.tempoAtBar(practice.activeLoop.start_bar) ?? snapshot.barTempo)
    : snapshot.barTempo;
  // The controls bar's slider gives way to the playing loop's own speed control: this shows it.
  const showLoopSpeed = () => {
    // Open already (the column), nothing re-renders to run a hand-over: focus it now.
    if (loopPanel.open) {
      findLoopSpeed()?.focus();
      return;
    }
    setLoopPanelOpen(true);
    focusWhenReady(findLoopSpeed);
  };

  return (
    // The bottom padding keeps the end of the page clear of the loop sheet's header and,
    // while the sheet is open, leaves room to scroll the score up above it: below 768 px the
    // score box is one line of music, so the page alone is too short to bring it clear.
    <div
      className={`flex flex-col gap-3 lg:pb-0 ${
        loopPanel.open ? 'pb-[calc(45dvh+4rem)] md:pb-[calc(min(40dvh,30rem)+4rem)]' : 'pb-12'
      }`}
      style={{ '--jam-bar-height': `${stickyBarHeight}px` } as CSSProperties}
    >
      <JamBar ref={stickyBarRef} player={player} snapshot={snapshot} tempo={readoutTempo} />
      {/* Above the two columns: beside the panel the controls would be squeezed. Folded
          while playing, it is a strip that sticks under the sticky bar. */}
      <div
        ref={controlsRef}
        // No style prop: useStaysOnScreen writes the room it holds as this element's bottom margin.
        data-testid="controls-slot"
        className={
          fold.folded ? `sticky top-(--jam-bar-height) -mt-3 ${fullBleedBarClass}` : undefined
        }
      >
        <PlayerControls
          player={player}
          snapshot={snapshot}
          showPlayButton={false}
          fold={fold}
          // Only while the panel has the loop's speed on it: the loop form takes its place.
          onShowLoopSpeed={panelShowsLoopSpeed(practice, snapshot) ? showLoopSpeed : null}
        />
      </div>
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
          outcome={linkedForm}
        />
      </div>
      <ShortcutOverlay open={shortcuts.helpOpen} onClose={shortcuts.closeHelp} />
      {/* On the page from the start: a live region added with its text is often not read. */}
      <p role="status" className="sr-only" data-testid="shortcut-announcement">
        {announcementText(shortcuts.announcement)}
      </p>
    </div>
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

/**
 * The readout and Play/Pause, sticky at the top of the window so both stay on
 * screen when Play scrolls the page to the score: on a phone the header,
 * controls and score don't all fit.
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
      className={`sticky top-0 ${fullBleedBarClass} flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]`}
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
