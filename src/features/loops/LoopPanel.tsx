import { useRef, useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { Icon } from '@/components/icons';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import {
  activeCardClass,
  buttonClass,
  dangerButtonClass,
  focusRing,
  ghostButtonClass,
  inlineIconClass,
  pressedButtonClass,
  primaryButtonClass,
  quietButtonClass,
  quietPressedButtonClass,
} from '@/components/styles';
import { canPlay } from '@/features/player/controlGates';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { ratioToPercent } from '@/features/player/speed';
import { LoopHistory } from '@/features/practice/LoopHistory';
import { lastPracticedLabel } from '@/features/practice/sessions';
import { isOnline, useOnline, waitsForNetwork } from '@/lib/network';
import type { LoopStatus } from '@/lib/schema';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import {
  editButtonAttributes,
  findFormOpener,
  findStatusButton,
  NEW_LOOP_BUTTON_ATTRIBUTES,
  type LoopFormOpener,
} from './loopFocus';
import { barsLabel, hasReachedTarget, loopsByStatus, type Loop } from './loopForm';
import { LoopEditorForm } from './LoopEditorForm';
import { speedLabel } from './loopLabels';
import { LoopSpeedControl } from './LoopSpeedControl';
import { LoopStatusButton } from './LoopStatusButton';
import { loopPanelIsSheet, playLoopClosesPanel } from './useLoopPanelOpen';
import { useDeleteLoop, useLoops, useSetLoopStatus } from './useLoops';
import type { LoopPractice } from './useLoopPractice';

interface LoopPanelProps {
  songId: string;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
  practice: LoopPractice;
  /** The song's loops query, held by the page (the practice hook reads it too). */
  loops: ReturnType<typeof useLoops>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For the `aria-controls` of a toggle the page places elsewhere (beside the status line, from 768 px). */
  bodyId: string;
}

/**
 * The song's loops: a bottom sheet on a phone (fixed above the tab bar, its
 * header always on show and opening the rest), a side panel from 768 px (in
 * the page beside the score, shown or hidden by the page's own toggle). One
 * component and one `open` state for both; only the classes differ.
 */
export function LoopPanel({
  songId,
  player,
  snapshot,
  practice,
  loops,
  open,
  onOpenChange,
  bodyId,
}: LoopPanelProps) {
  const count = loops.data?.length ?? 0;

  const playLoop = (loop: Loop) => {
    // The sheet lies over the score and the count-in number; the press that starts
    // a loop gives them back. Its header goes on naming the loop.
    if (playLoopClosesPanel(loopPanelIsSheet(), snapshot.status)) onOpenChange(false);
    practice.playLoop(loop);
  };

  return (
    <aside
      aria-label="Loops"
      data-testid="loop-panel"
      // Phone: fixed just above the tab bar (3.5rem plus its border). From md: a
      // column beside the score that stays put while the page scrolls.
      className={`fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 rounded-t-card border-t border-line bg-surface shadow-sheet md:sticky md:inset-x-auto md:top-20 md:bottom-auto md:z-auto md:max-h-[calc(100dvh-6rem)] md:w-64 md:shrink-0 md:self-start md:overflow-y-auto md:rounded-card md:border md:shadow-card lg:w-80 ${
        open ? '' : 'md:hidden'
      }`}
    >
      <button
        type="button"
        className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-t-card px-4 text-left font-semibold md:hidden ${focusRing} focus-visible:-outline-offset-2`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onOpenChange(!open)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            name="loop"
            className={`size-5 ${practice.activeLoop ? 'text-brand' : 'text-ink-muted'}`}
          />
          <span className="truncate">
            {practice.activeLoop ? `Loop: ${practice.activeLoop.name}` : `Loops (${count})`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand">
          {open ? 'Close' : 'Open'}
          <Icon name={open ? 'chevronDown' : 'chevronUp'} className="size-4" />
        </span>
      </button>
      <div
        id={bodyId}
        hidden={!open}
        // The sheet stops well short of the top so the score stays in reach above it.
        className="max-h-[45dvh] overflow-y-auto p-4 pt-1 md:max-h-none md:overflow-visible md:pt-4"
      >
        <LoopPanelBody
          songId={songId}
          player={player}
          snapshot={snapshot}
          practice={practice}
          loops={loops}
          onPlayLoop={playLoop}
        />
      </div>
    </aside>
  );
}

type LoopPanelBodyProps = Pick<
  LoopPanelProps,
  'songId' | 'player' | 'snapshot' | 'practice' | 'loops'
> & {
  /** "Play loop" or "Restart loop" was pressed. Runs inside the tap: iOS only starts audio there. */
  onPlayLoop: (loop: Loop) => void;
};

type LoopListProps = LoopPanelBodyProps & {
  onEdit: (loop: Loop) => void;
  /** A loop's status was changed from its item, which moves it to the other section. */
  onStatusSet: (loop: Loop, status: LoopStatus) => void;
};

function LoopPanelBody({
  songId,
  player,
  snapshot,
  practice,
  loops,
  onPlayLoop,
}: LoopPanelBodyProps) {
  const { editor, editedLoop, activeLoop } = practice;
  // Loops need the score: its bar count checks a range, and a loop can't play before it.
  const { barCount } = snapshot;
  // "Not yet" to "Mark finished?", for the loop at the speed it was asked about:
  // saving a faster speed asks again. Here, not in the card, which the form replaces.
  const [declinedFinish, setDeclinedFinish] = useState<string | null>(null);
  // The form replaces the list, and with it the button that opened it; focus goes back there.
  const focusWhenReady = useFocusWhenReady();
  const formOpener = useRef<LoopFormOpener | null>(null);

  const openForm = (loop: Loop | null) => {
    formOpener.current = loop ? { kind: 'edit', loopId: loop.id } : { kind: 'new' };
    practice.openEditor(loop);
  };
  const closeForm = () => {
    // A form a drag opened goes back to "New loop", if focus was in the form.
    const opener = formOpener.current ?? { kind: 'new' };
    formOpener.current = null;
    focusWhenReady(() => findFormOpener(opener));
    practice.closeEditor();
  };
  // The loop now has its button in the other section; focus follows it there.
  const followStatusButton = (loop: Loop, status: LoopStatus) =>
    focusWhenReady(() => findStatusButton(loop.id, status));

  if (editor && barCount !== null) {
    if (editor.loopId !== null && !editedLoop) {
      return <DeletedLoopNotice onBack={closeForm} />;
    }
    return (
      <LoopEditorForm
        // A different loop is a different form: its typed name and target start over.
        key={editor.loopId ?? 'new'}
        songId={songId}
        barCount={barCount}
        loop={editedLoop}
        editor={editor}
        player={player}
        snapshot={snapshot}
        onBarsChange={practice.setEditorBars}
        onSavingChange={practice.setEditorSaving}
        onSaved={(saved) => {
          closeForm();
          // A new loop is what the user wants to practice next; an edit leaves playback as it is.
          if (!editedLoop) practice.selectLoop(saved.id);
        }}
        onCancel={closeForm}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">Loops</h2>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={barCount === null}
          {...NEW_LOOP_BUTTON_ATTRIBUTES}
          onClick={() => openForm(null)}
        >
          <Icon name="plus" />
          New loop
        </button>
      </div>
      {activeLoop && (
        <ActiveLoopCard
          songId={songId}
          loop={activeLoop}
          player={player}
          snapshot={snapshot}
          onExit={practice.exitLoop}
          askToFinish={
            hasReachedTarget(activeLoop) && declinedFinish !== finishQuestionKey(activeLoop)
          }
          onDeclineFinish={() => setDeclinedFinish(finishQuestionKey(activeLoop))}
          onFinished={() => followStatusButton(activeLoop, 'finished')}
        />
      )}
      <LoopList
        songId={songId}
        player={player}
        snapshot={snapshot}
        practice={practice}
        loops={loops}
        onPlayLoop={onPlayLoop}
        onEdit={openForm}
        onStatusSet={followStatusButton}
      />
    </div>
  );
}

/** One asking of "Mark finished?": a loop at a saved speed. */
const finishQuestionKey = (loop: Loop) => `${loop.id}:${loop.speed_ratio}`;

/** In place of the edit form when another device deleted the loop it was opened for. */
function DeletedLoopNotice({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="flex items-center gap-2 text-ink-soft">
        <Icon name="alert" className="text-warning" />
        This loop has been deleted.
      </p>
      <button type="button" className={buttonClass} onClick={onBack}>
        Back to loops
      </button>
    </div>
  );
}

/** The loop that is repeating, with its speed control and the way back to the whole song. */
function ActiveLoopCard({
  songId,
  loop,
  player,
  snapshot,
  onExit,
  askToFinish,
  onDeclineFinish,
  onFinished,
}: Pick<LoopPanelProps, 'songId' | 'player' | 'snapshot'> & {
  loop: Loop;
  onExit: () => void;
  /** The saved speed has reached the target, and the user hasn't said "Not yet" to it. */
  askToFinish: boolean;
  onDeclineFinish: () => void;
  /** "Mark finished" in the prompt was sent; the prompt goes with the loop's move. */
  onFinished: () => void;
}) {
  return (
    <section
      aria-label={`Practicing ${loop.name}`}
      className={`${activeCardClass} flex flex-col gap-3 p-3`}
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wider text-brand uppercase">Now looping</p>
        <p className="font-semibold break-words">{loop.name}</p>
        <p className="text-sm text-ink-soft">
          {barsLabel(loop.start_bar, loop.end_bar)}, repeating
        </p>
      </div>
      <LoopSpeedControl songId={songId} loop={loop} player={player} snapshot={snapshot} />
      {askToFinish && (
        <FinishPrompt
          songId={songId}
          loop={loop}
          onDecline={onDeclineFinish}
          onFinished={onFinished}
        />
      )}
      <button type="button" className={ghostButtonClass} onClick={onExit}>
        Back to whole song
      </button>
    </section>
  );
}

/**
 * Asks whether a loop that has reached its target speed is done. It only
 * asks: a loop is never finished for the user, and "Not yet" leaves it as it is.
 */
function FinishPrompt({
  songId,
  loop,
  onDecline,
  onFinished,
}: {
  songId: string;
  loop: Loop;
  onDecline: () => void;
  onFinished: () => void;
}) {
  const status = useSetLoopStatus(songId, loop.id);
  return (
    <div
      role="group"
      aria-label="Mark finished?"
      data-testid="finish-prompt"
      className="flex flex-col gap-2 rounded-control border border-success-line bg-success-soft p-3 motion-safe:animate-fade-in"
    >
      <p className="text-sm text-ink">
        <Icon name="check" className={`${inlineIconClass} size-4 text-success`} />
        You've reached your target of {ratioToPercent(loop.target_ratio ?? loop.speed_ratio)}%. Mark
        this loop finished?
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          // Locked like the list's status button (`LoopStatusButton`), which says why.
          aria-disabled={status.isPending || undefined}
          onClick={() => {
            if (status.setStatus('finished')) onFinished();
          }}
        >
          <Icon name="check" />
          Mark finished
        </button>
        <button type="button" className={ghostButtonClass} onClick={onDecline}>
          Not yet
        </button>
      </div>
      {status.error && (
        <ErrorAlert>Couldn't mark the loop finished: {status.error.message}</ErrorAlert>
      )}
    </div>
  );
}

function LoopList({
  songId,
  player,
  snapshot,
  practice,
  loops,
  onPlayLoop,
  onEdit,
  onStatusSet,
}: LoopListProps) {
  if (waitsForNetwork(loops)) {
    return (
      <EmptyState icon="offline">
        You're offline, and this song's loops haven't been opened on this device yet.
      </EmptyState>
    );
  }
  if (loops.isPending) return <LoadingLine>Loading loops…</LoadingLine>;
  // isLoadingError, not isError: a failed background refetch keeps the list (and a playing loop).
  if (loops.isLoadingError) {
    return (
      <LoadErrorAlert onRetry={() => void loops.refetch()}>
        Couldn't load this song's loops.
      </LoadErrorAlert>
    );
  }
  if (loops.data.length === 0) {
    return (
      <EmptyState icon="loop">
        No loops yet. Choose New loop, then pick the bars you want to practice.
      </EmptyState>
    );
  }
  const { active, finished } = loopsByStatus(loops.data);
  const items = (listed: Loop[]) => (
    <ul className="flex flex-col gap-3">
      {listed.map((loop) => (
        <LoopListItem
          key={loop.id}
          songId={songId}
          loop={loop}
          active={loop.id === practice.activeLoop?.id}
          // Null until the score loads: the item then shows the percent alone.
          tempo={player?.tempoAtBar(loop.start_bar) ?? null}
          // The same gate as playLoop itself and the loop keys.
          canPlay={canPlay(player, snapshot)}
          onPlay={() => onPlayLoop(loop)}
          onEdit={() => onEdit(loop)}
          onStatusSet={(status) => onStatusSet(loop, status)}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      {active.length > 0 ? (
        items(active)
      ) : (
        <p className="flex items-center gap-2 text-ink-muted">
          <Icon name="check" className="text-success" />
          Every loop of this song is finished.
        </p>
      )}
      {finished.length > 0 && (
        <section aria-label="Finished loops" className="flex flex-col gap-3">
          <h3 className="border-t border-line pt-4 text-sm font-semibold tracking-wider text-ink-muted uppercase">
            Finished ({finished.length})
          </h3>
          {items(finished)}
        </section>
      )}
    </div>
  );
}

function LoopListItem({
  songId,
  loop,
  active,
  tempo,
  canPlay,
  onPlay,
  onEdit,
  onStatusSet,
}: {
  songId: string;
  loop: Loop;
  active: boolean;
  /** The file's tempo at the loop's first bar, for the BPM. */
  tempo: number | null;
  canPlay: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onStatusSet: (status: LoopStatus) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const named = <span className="sr-only"> {loop.name}</span>;

  return (
    <li
      className={`flex flex-col gap-3 rounded-card border bg-canvas p-3 ${
        active ? 'border-brand-line' : 'border-line'
      }`}
    >
      <div className="flex flex-col gap-1">
        <p className="flex items-start gap-2 font-semibold break-words">
          {active && <Icon name="loop" className="mt-0.5 size-4 text-brand" />}
          {loop.name}
        </p>
        <p className="text-sm text-ink-muted">
          {barsLabel(loop.start_bar, loop.end_bar)} · {speedLabel(loop.speed_ratio, tempo)}
          {loop.target_ratio !== null && ` · target ${speedLabel(loop.target_ratio, tempo)}`}
        </p>
        <p className="text-sm text-ink-muted" data-testid="loop-last-practiced">
          {lastPracticedLabel(loop.last_practiced_at, new Date())}
        </p>
      </div>
      {confirmingDelete ? (
        <ConfirmDelete songId={songId} loop={loop} onCancel={() => setConfirmingDelete(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className={`${active ? pressedButtonClass : primaryButtonClass} mr-1`}
            disabled={!canPlay}
            // No await before the player is told to play: iOS only starts audio inside the tap.
            onClick={onPlay}
          >
            <Icon name={active ? 'reopen' : 'play'} />
            {active ? 'Restart loop' : 'Play loop'}
            {named}
          </button>
          <button
            type="button"
            className={quietButtonClass}
            {...editButtonAttributes(loop.id)}
            onClick={onEdit}
          >
            <Icon name="edit" className="size-4" />
            Edit{named}
          </button>
          <button
            type="button"
            className={showingHistory ? quietPressedButtonClass : quietButtonClass}
            aria-expanded={showingHistory}
            onClick={() => setShowingHistory((showing) => !showing)}
          >
            <Icon name="history" className="size-4" />
            History{named}
          </button>
          <LoopStatusButton loop={loop} onSet={onStatusSet} />
          <button
            type="button"
            className={quietButtonClass}
            onClick={() => setConfirmingDelete(true)}
          >
            <Icon name="trash" className="size-4" />
            Delete{named}
          </button>
        </div>
      )}
      {showingHistory && <LoopHistory loopId={loop.id} loopName={loop.name} tempo={tempo} />}
    </li>
  );
}

/** Inline, like deleting a song: no modal, and not optimistic. */
function ConfirmDelete({
  songId,
  loop,
  onCancel,
}: {
  songId: string;
  loop: Loop;
  onCancel: () => void;
}) {
  const remove = useDeleteLoop(songId);
  const online = useOnline();

  return (
    <div
      role="group"
      aria-label={`Delete ${loop.name}`}
      className="flex flex-col gap-2 rounded-control border border-danger-solid/50 bg-danger-soft p-3"
    >
      <p className="text-ink">
        Delete “{loop.name}”? Its practice history is deleted too. This can't be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButtonClass}
          disabled={remove.isPending || !online}
          onClick={() => {
            if (isOnline()) remove.mutate(loop.id);
          }}
        >
          <Icon name="trash" />
          {remove.isPending ? 'Deleting…' : 'Delete loop'}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={remove.isPending}
          onClick={onCancel}
        >
          Keep it
        </button>
      </div>
      {!online && (
        <OfflineNote>You're offline. Loops can be deleted once you're back online.</OfflineNote>
      )}
      {remove.isError && <ErrorAlert>Couldn't delete the loop: {remove.error.message}</ErrorAlert>}
    </div>
  );
}
