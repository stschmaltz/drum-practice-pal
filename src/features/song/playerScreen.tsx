import type { Ref } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import {
  buttonClass,
  dangerCardClass,
  ghostButtonClass,
  inlineIconClass,
  quietButtonClass,
} from '@/components/styles';
import type { Loop } from '@/features/loops/loopForm';
import { CountInCounter } from '@/features/player/CountInCounter';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
import type { PlayerSnapshot } from '@/features/player/PlayerService';
import { ratioToPercent } from '@/features/player/speed';
import { durationLabel } from '@/features/practice/sessions';
import type { PracticeTracker } from '@/features/practice/usePracticeTracker';
import { useOnline } from '@/lib/network';

/*
 * The parts every screen that plays a song shares: the whole song (SongPage)
 * and a loop's practice screen (LoopPracticePage).
 */

/**
 * Opens the shortcut overlay, which `?` also does. From 768 px only: a tablet
 * or laptop is where a keyboard is likely, and the phone's row has no room.
 */
export function ShortcutsButton({
  onOpen,
  compact = false,
}: {
  onOpen: () => void;
  /**
   * In a header band beside Play (the practice screen): quiet, the icon alone
   * below 1024 px, and gone in a short window, a phone on its side.
   */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        compact
          ? `max-md:hidden short:hidden ${quietButtonClass} whitespace-nowrap`
          : `max-md:hidden ${ghostButtonClass} whitespace-nowrap`
      }
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <Icon name="keyboard" />
      {compact ? <span className="max-lg:sr-only">Shortcuts</span> : 'Shortcuts'}
    </button>
  );
}

/** The scrolling box alphaTab renders the score into, with the count-in counter over it. */
export function ScoreBox({
  scrollRef,
  scoreRef,
  snapshot,
  hidden,
  fitsScore = false,
}: {
  scrollRef: Ref<HTMLDivElement>;
  scoreRef: Ref<HTMLDivElement>;
  snapshot: PlayerSnapshot;
  hidden: boolean;
  /**
   * From 768 px the box is as tall as what is drawn, up to its usual height:
   * a loop's few bars, not a fixed 60% of the window of blank paper under them.
   */
  fitsScore?: boolean;
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
        // fixed tab bar under it) when playback scrolls it into view (useJamMode sets the
        // top one from the sticky bar's height).
        // Below 768 px the score is one line of music scrolling sideways, so the box is as tall
        // as that line (alphaTab sizes it) rather than a fixed height of blank paper under it.
        // At least as tall as the count-in number drawn over it.
        className={`jam-score relative min-h-44 scroll-mb-[calc(7.5rem+env(safe-area-inset-bottom))] overflow-auto rounded-card shadow-card ${fitsScore ? 'md:max-h-[60dvh]' : 'md:h-[60dvh]'} md:scroll-mb-[calc(4rem+env(safe-area-inset-bottom))]`}
      >
        <div ref={scoreRef} />
      </div>
    </div>
  );
}

/**
 * What became of the last practice session: logged, kept on the device until
 * the connection is back, or refused with a way to send it again. Above the
 * score, because the loop panel is a closed sheet while practising.
 */
export function SessionNotice({
  tracker,
  loops,
  showLogged = true,
}: {
  tracker: PracticeTracker;
  loops: readonly Loop[] | undefined;
  /** False where the Session complete summary says it instead (the practice screen). */
  showLogged?: boolean;
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
  if (!lastLogged || !showLogged) return null;
  const loopName = loops?.find((loop) => loop.id === lastLogged.loopId)?.name;
  // Deleted since (here or on another device): the notice would be about nothing on show.
  if (loops !== undefined && loopName === undefined) return null;
  return (
    <p role="status" className="text-sm text-ink-muted" data-testid="session-logged">
      <Icon name="check" className={`${inlineIconClass} size-4 text-success`} />
      Practice logged: {durationLabel(lastLogged.durationSeconds)}
      {loopName !== undefined && <> of {loopName}</>} at {ratioToPercent(lastLogged.speedRatio)}%.
    </p>
  );
}

/** The player's error as fixed copy, otherwise where playback is. */
export function PlayerStatusLine({ snapshot }: { snapshot: PlayerSnapshot }) {
  if (snapshot.status === 'error' && snapshot.error) {
    return <ErrorAlert>{PLAYER_ERROR_MESSAGES[snapshot.error]}</ErrorAlert>;
  }
  return (
    <p className="text-sm text-ink-muted" aria-live="polite" data-testid="player-status">
      {playerStatusText(snapshot)}
    </p>
  );
}

/**
 * The same words inline, for a line that says more (the practice screen's
 * meta line). A failure isn't said here: the screen shows `PlayerStatusLine`'s
 * alert for it.
 */
export function PlayerStatusText({ snapshot }: { snapshot: PlayerSnapshot }) {
  return (
    <span aria-live="polite" data-testid="player-status">
      {snapshot.status === 'error' ? "Can't play" : playerStatusText(snapshot)}
    </span>
  );
}

function playerStatusText(snapshot: PlayerSnapshot): string {
  const where =
    snapshot.status === 'loading'
      ? 'Loading the score and sounds…'
      : `Bar ${snapshot.barNumber ?? 1} of ${snapshot.barCount ?? '?'}`;
  return snapshot.status === 'countingIn' ? `${where} · Counting in…` : where;
}

/** A bar that sticks at the top of the window, full-bleed over the page gutter. */
export const fullBleedBarClass =
  'z-10 -mx-4 border-b border-line bg-canvas px-4 md:-mx-gutter md:px-gutter';
