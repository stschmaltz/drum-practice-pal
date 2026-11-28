import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import type { Song } from '@/features/library/songForm';
import { useMarkSongPlayed } from '@/features/library/songPlayed';
import type { Loop } from '@/features/loops/loopForm';
import { findLoopSpeed } from '@/features/loops/loopFocus';
import { LoopPanel, type LoopFormOutcome } from '@/features/loops/LoopPanel';
import { panelShowsLoopSpeed } from '@/features/loops/loopPanelContent';
import { useLoopPanelOpen } from '@/features/loops/useLoopPanelOpen';
import { useLoopPractice, type LoopPractice } from '@/features/loops/useLoopPractice';
import { useLoops } from '@/features/loops/useLoops';
import { useSaveLoopSpeed } from '@/features/loops/useSaveLoopSpeed';
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
import { useSittingRecorder } from '@/features/practice/useVisitSittings';
import { RecordingBox } from '@/features/recordings/RecordingBox';
import {
  chooseSource,
  RECORDING_NOTE,
  SONG_LINK_KIND_LABELS,
  videoSources,
  type PlaySource,
  type SourceChoice,
} from '@/features/recordings/songLinks';
import { useSongLinks, useUsableLinks } from '@/features/recordings/useSongLinks';
import { ShortcutOverlay } from '@/features/shortcuts/ShortcutOverlay';
import { useOnline } from '@/lib/network';
import { isUuid } from '@/lib/randomUuid';
import { EDIT_LOOP_PARAM, NEW_LOOP_PARAM, songPath, SOURCE_PARAM } from '@/lib/routes';
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
 * count-in (Unit 07) counted over the score. Loops (Unit 08) are a sheet over it: a
 * saved bar range plays on repeat at its saved speed, and while the loop form
 * is open a tap on the score picks a bar instead of seeking. Time spent
 * playing a loop is logged as practice sessions (Unit 09). Keys and pedals
 * (Unit 10) work the player and switch loops; `?` lists them.
 *
 * `?new=1` (the song overview's "New loop") opens the loop form for a new
 * loop, and its save goes on to that loop's practice screen; `?edit=<id>`
 * (a loop's Edit on the overview) opens it on that loop, and its save or
 * Cancel goes back to the song (Unit 16).
 *
 * A song with a YouTube link for its Original or Drumless recording (Unit 14)
 * has a source switch: Tab, Original, Drumless. `?source=original|drumless`
 * opens on one. On a recording the video sits in a box that stays on screen,
 * with the score under it, silent and scrolled by hand: the tab's player is
 * paused, and its Play, speed, metronome, count-in, mixer, loop panel and
 * keys are not offered, since none of them acts on the video.
 */
export function SongPage() {
  const { id = '' } = useParams();
  return <SongGate songId={id}>{(song) => <SongScreen song={song} />}</SongGate>;
}

function SongScreen({ song }: { song: Song }) {
  const sources = useSongSources(song.id);
  const recording = sources.choice.state !== 'tab';
  return (
    <div className="flex flex-col gap-4">
      <BackLink to={songPath(song.id)}>{song.title}</BackLink>
      <PageHeader title={song.title}>{song.artist || null}</PageHeader>
      {sources.options.length > 1 && (
        <SegmentedControl
          label="Play along with"
          className="self-start"
          options={sources.options}
          value={sources.shown}
          onChange={sources.choose}
        />
      )}
      {sources.choice.state !== 'tab' && (
        <>
          {/* Sticky like the jam bar it stands in for, so the video stays on screen over the score. */}
          <div
            data-testid="recording-bar"
            className={`sticky top-0 ${fullBleedBarClass} flex flex-col gap-1 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] lg:flex-row-reverse lg:items-start lg:justify-between lg:gap-6 lg:pb-3`}
          >
            <RecordingBox
              songTitle={song.title}
              video={sources.choice.state === 'recording' ? sources.choice.video : null}
            />
          </div>
          {/* From 1024 px the same words sit in the bar, beside the video (RecordingBox). */}
          <p className="text-sm text-ink-muted lg:hidden" data-testid="recording-note">
            {RECORDING_NOTE}
          </p>
        </>
      )}
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
            recording={recording}
          />
        )}
      </SongFileGate>
    </div>
  );
}

/**
 * Which of the song's sources the play screen is on, from `?source=` and the
 * song's links (`chooseSource` has the rules), and the switch between them.
 * The source lives in the URL, replaced at each change, so Back leaves the
 * screen and never steps through the sources. Not offered on a visit that
 * came for the loop form (`?new=1`, `?edit=`): that visit ends with the form.
 *
 * Opening a recording counts as playing the song (`last_played_at`), once per
 * source per visit, and only when its video can show.
 */
function useSongSources(songId: string) {
  const [params, setParams] = useSearchParams();
  const links = useSongLinks(songId);
  const usable = useUsableLinks(links);
  const online = useOnline();
  const markPlayed = useMarkSongPlayed();
  const forLoopForm = linkedLoopFormOf(params) !== null;

  const choice: SourceChoice = forLoopForm
    ? { state: 'tab', dropRequest: false }
    : chooseSource(params.get(SOURCE_PARAM), {
        data: usable,
        fetching: links.fetchStatus === 'fetching',
        fetchedAfterMount: links.isFetchedAfterMount,
      });
  const videos = forLoopForm ? [] : videoSources(usable ?? []);
  const shown: PlaySource =
    choice.state === 'recording'
      ? choice.video.source
      : choice.state === 'waiting'
        ? choice.source
        : 'tab';

  const setSource = useCallback(
    (source: PlaySource) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (source === 'tab') next.delete(SOURCE_PARAM);
          else next.set(SOURCE_PARAM, source);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // The URL named a recording the song doesn't have (settled on a read made since the page
  // opened): it is the tab, and the URL says so, so a link saved later can't switch the
  // source under someone already playing the tab.
  const dropRequest = choice.state === 'tab' && choice.dropRequest;
  useEffect(() => {
    if (dropRequest) setSource('tab');
  }, [dropRequest, setSource]);

  // Kept across StrictMode's second run of the effect, so one opening is one write.
  const marked = useRef<PlaySource | null>(null);
  const playing = choice.state === 'recording' && online ? choice.video.source : null;
  useEffect(() => {
    if (playing === null) {
      // Back on the tab: opening the recording again is another opening.
      if (shown === 'tab') marked.current = null;
      return;
    }
    if (marked.current === playing) return;
    marked.current = playing;
    markPlayed(songId);
  }, [playing, shown, songId, markPlayed]);

  return {
    choice,
    shown,
    choose: setSource,
    /** Tab and each video the song has; a switch is drawn only when there is a choice. */
    options: [
      { value: 'tab' as PlaySource, label: 'Tab' },
      ...videos.map((video) => ({
        value: video.source as PlaySource,
        label: SONG_LINK_KIND_LABELS[video.source],
      })),
    ],
  };
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
    // "New loop" from the song: the form stays for the next loop, and "Done" (or the note's
    // link to the loop just saved) is the way on. Only an edit goes straight back.
    keepsAdding: linked.kind === 'new',
    onEdited: backToSong,
    onCancelled: backToSong,
  };
}

function SongPlayer({
  songId,
  fileBytes,
  drumTrackIndex,
  initialOptions,
  recording,
}: {
  songId: string;
  fileBytes: Uint8Array;
  drumTrackIndex: number | null;
  initialOptions: PlayerOptions;
  /**
   * The page is on a recording (Unit 14): the score is only read, under the
   * video. The player is paused and stays so: no Play, no controls, no keys,
   * no taps or drags on the score, no loop panel.
   */
  recording: boolean;
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
  const practice = useLoopPractice(player, snapshot, loops.data, { dragOpensForm: !recording });
  const tracker = usePracticeTracker(player, snapshot, practice.activeLoop?.id ?? null);
  // A loop practised from the panel is summed up on the song's overview like any other.
  useSittingRecorder(songId, practice.activeLoop, tracker.sitting);
  // Every change of the playing loop's speed is saved as it is made (no "Save speed").
  useSaveLoopSpeed(songId, practice.activeLoop, snapshot.speedRatio);
  const linkedForm = useLinkedLoopForm(songId, snapshot, practice, loops.data);
  const shortcuts = useSongShortcuts({ player, practice, loops: loops.data, off: recording });
  const loopPanel = useLoopPanelOpen();
  const { setOpen: setLoopPanelOpen } = loopPanel;
  const pickingBars = practice.editor !== null;
  // The loop form lives in the panel, however it was opened (a drag on the score opens it too).
  useEffect(() => {
    if (pickingBars) setLoopPanelOpen(true);
  }, [pickingBars, setLoopPanelOpen]);

  // Switching to a recording stops the tab: whatever was sounding, a count-in included.
  const running = isRunning(snapshot.status);
  useEffect(() => {
    if (recording && running) player?.pause();
  }, [recording, running, player]);
  // And puts the loop form away, whose bars are picked on the score. Not one that is saving:
  // its answer still finds it (the panel stays mounted, hidden), and closes it then.
  const { editor, closeEditor } = practice;
  const formOpenIdle = editor !== null && !editor.saving;
  useEffect(() => {
    if (recording && formOpenIdle) closeEditor();
  }, [recording, formOpenIdle, closeEditor]);

  useJamMode(
    player,
    { scrollRef, stickyBarRef, stickyControlsRef: controlsRef },
    {
      seekOnTap: !pickingBars && !recording,
      // The count-in counter sits over the score, so the score comes on screen for it too. Keyed on
      // the fold rather than on running, so Hide controls brings it back as well: the user had
      // scrolled up to that button, and in phone landscape kept still the score was off the window.
      // Picking bars waits for the panel to be open: the open sheet's room at the page's end is
      // what lets the window scroll the score up above it (16 QA issue 1: a form opened by
      // `?new=1` opens the sheet in the next render, and a scroll before that went nowhere).
      scoreOnScreen: recording
        ? null
        : pickingBars && loopPanel.open
          ? 'picking-bars'
          : fold.folded
            ? 'playing'
            : null,
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
    // Open already, nothing re-renders to run a hand-over: focus it now.
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
      className={`flex flex-col gap-3 ${
        loopPanel.open && !recording
          ? 'pb-[calc(45dvh+4rem)] md:pb-[calc(min(40dvh,30rem)+4rem)]'
          : 'pb-12'
      }`}
      style={{ '--jam-bar-height': `${stickyBarHeight}px` } as CSSProperties}
    >
      {!recording && (
        <JamBar ref={stickyBarRef} player={player} snapshot={snapshot} tempo={readoutTempo} />
      )}
      {/* Folded while playing, the controls are a strip that sticks under the sticky bar. */}
      <div
        ref={controlsRef}
        // No style prop: useStaysOnScreen writes the room it holds as this element's bottom margin.
        data-testid="controls-slot"
        className={
          fold.folded ? `sticky top-(--jam-bar-height) -mt-3 ${fullBleedBarClass}` : undefined
        }
      >
        {!recording && (
          <PlayerControls
            player={player}
            snapshot={snapshot}
            showPlayButton={false}
            fold={fold}
            // Only while the panel has the loop's speed on it: the loop form takes its place.
            onShowLoopSpeed={panelShowsLoopSpeed(practice, snapshot) ? showLoopSpeed : null}
          />
        )}
      </div>
      {recording ? (
        // Where the tab's playback is says nothing about the video; a score that failed still does.
        snapshot.status === 'error' && <PlayerStatusLine snapshot={snapshot} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <PlayerStatusLine snapshot={snapshot} />
          <ShortcutsButton onOpen={shortcuts.openHelp} />
        </div>
      )}
      <SessionNotice tracker={tracker} loops={loops.data} />
      {/* The score has the page's whole width; the loop sheet lies over it when open. */}
      <ScoreBox
        scrollRef={scrollRef}
        scoreRef={scoreRef}
        snapshot={snapshot}
        hidden={nothingToShow}
      />
      {/* Hidden on a recording, not unmounted: a loop save still on its way keeps its form. */}
      <div hidden={recording} className="contents">
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
