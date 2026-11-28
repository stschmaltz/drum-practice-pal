import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { Icon } from '@/components/icons';
import { OverflowMenu } from '@/components/OverflowMenu';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import {
  activeCardClass,
  buttonClass,
  focusRing,
  ghostButtonClass,
  primaryButtonClass,
  sectionHeadingClass,
} from '@/components/styles';
import { canPickBars, canPlay } from '@/features/player/controlGates';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { LoopHistory } from '@/features/practice/LoopHistory';
import { lastPracticedLabel } from '@/features/practice/sessions';
import {
  findItemControl,
  isItemListed,
  itemAttributes,
  itemControlAttributes,
  itemMenuAttributes,
  neighbourAfterLeaving,
} from '@/lib/itemFocus';
import { waitsForNetwork } from '@/lib/network';
import { loopPracticePath } from '@/lib/routes';
import type { LoopStatus } from '@/lib/schema';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import {
  editButtonAttributes,
  findFormOpener,
  findLoopSpeed,
  findStatusButton,
  NEW_LOOP_BUTTON_ATTRIBUTES,
  type LoopFormOpener,
} from './loopFocus';
import {
  barsLabel,
  shouldAskToFinish,
  loopsByStatus,
  loopsInPanelOrder,
  type Loop,
} from './loopForm';
import { ConfirmDeleteLoop } from './ConfirmDeleteLoop';
import { FinishPrompt } from './FinishPrompt';
import { LoopEditorForm } from './LoopEditorForm';
import { LoopSavedChoice } from './LoopSavedChoice';
import { speedLabel } from './loopLabels';
import { editorOnPanel } from './loopPanelContent';
import { LoopSpeedControl } from './LoopSpeedControl';
import { LoopStatusButton } from './LoopStatusButton';
import { playLoopClosesPanel } from './useLoopPanelOpen';
import type { useLoops } from './useLoops';
import { hasPickedBars, type LoopPractice } from './useLoopPractice';
import { useSpeedMovedSinceChosen } from './useSpeedMovedSinceChosen';

interface LoopPanelProps {
  songId: string;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
  practice: LoopPractice;
  /** The song's loops query, held by the page (the practice hook reads it too). */
  loops: ReturnType<typeof useLoops>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For the `aria-controls` of a toggle the page places elsewhere (beside the status line, from 1024 px). */
  bodyId: string;
  /** What a save or Cancel of the loop form leads to, when not the panel's own default. */
  outcome?: LoopFormOutcome;
}

/**
 * Where the app goes after the loop form saves or is cancelled. Without these
 * a new loop becomes the loop playing here, and an edit or a Cancel leaves the
 * page as it was.
 */
export interface LoopFormOutcome {
  /**
   * A new loop was saved. With `keepsAdding` the form stays, emptied, for the
   * next loop, and says which one it just saved (several loops are made in one
   * go, then practised: Shane, 2026-11-27); this is then only told about it.
   */
  onCreated?: (loop: Loop) => void;
  keepsAdding?: boolean;
  onEdited?: (loop: Loop) => void;
  onCancelled?: () => void;
}

/**
 * The song's loops: a bottom sheet below 1024 px, so on a phone and a tablet
 * in portrait (fixed at the foot of the window, its header always on show and
 * opening the rest), a column beside the score from 1024 px (shown or hidden
 * by the page's own toggle). The width rule is `loopPanelLayout.ts`, which is
 * the CSS's `lg`. One component and one `open` state for both; only the
 * classes differ.
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
  outcome,
}: LoopPanelProps) {
  const count = loops.data?.length ?? 0;

  const playLoop = (loop: Loop) => {
    // The sheet lies over the score and the count-in number; the press that starts
    // a loop gives them back. Its header goes on naming the loop.
    if (playLoopClosesPanel(snapshot.status)) onOpenChange(false);
    practice.playLoop(loop);
  };

  return (
    <aside
      aria-label="Loops"
      data-testid="loop-panel"
      // A sheet over the score at every size, so the score always has the whole
      // width. Phone: fixed just above the tab bar (3.5rem plus its border). From md:
      // no tab bar, so on the safe area, and as wide as the content column to the
      // right of the sidebar (the page's gutter each side), not under it. From lg:
      // the bottom-right corner only, so most of the score stays readable beside it.
      className="fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 rounded-t-card border-t border-line bg-surface shadow-sheet md:right-gutter md:bottom-[env(safe-area-inset-bottom)] md:left-[calc(var(--spacing-sidebar)+var(--spacing-gutter))] md:border-x lg:left-auto lg:w-[26rem]"
    >
      <button
        type="button"
        className={`flex min-h-touch w-full items-center justify-between gap-3 rounded-t-card px-4 text-left font-semibold ${focusRing} focus-visible:-outline-offset-2`}
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
        // The sheet stops well short of the top so the score stays in reach above it;
        // on a tall tablet or a laptop less of the window, so the score stays readable.
        className="max-h-[45dvh] overflow-y-auto p-4 pt-1 md:max-h-[min(40dvh,30rem)]"
      >
        <LoopPanelBody
          songId={songId}
          player={player}
          snapshot={snapshot}
          practice={practice}
          loops={loops}
          onPlayLoop={playLoop}
          outcome={outcome}
        />
      </div>
    </aside>
  );
}

type LoopPanelBodyProps = Pick<
  LoopPanelProps,
  'songId' | 'player' | 'snapshot' | 'practice' | 'loops' | 'outcome'
> & {
  /** "Play loop" or "Restart loop" was pressed. Runs inside the tap: iOS only starts audio there. */
  onPlayLoop: (loop: Loop) => void;
};

type LoopListProps = LoopPanelBodyProps & {
  onEdit: (loop: Loop) => void;
  /** A loop's status was changed from its item, which moves it to the other section. */
  onStatusSet: (loop: Loop, status: LoopStatus) => void;
  /** "Delete loop" was pressed: the item leaves once the server confirms, taking focus with it. */
  onDeletePressed: (loop: Loop) => void;
  /** The playing loop's saved speed has reached full speed and the user hasn't said "Not yet". */
  askToFinish: boolean;
  onDeclineFinish: () => void;
};

function LoopPanelBody({
  songId,
  player,
  snapshot,
  practice,
  loops,
  onPlayLoop,
  outcome,
}: LoopPanelBodyProps) {
  const { editedLoop, activeLoop } = practice;
  // "Not yet" to "Mark finished?", for the loop at the speed it was asked about:
  // saving a faster speed asks again. Here, not in the card, which the form replaces.
  const [declinedFinish, setDeclinedFinish] = useState<string | null>(null);
  const speedMoved = useSpeedMovedSinceChosen(activeLoop);
  // The form replaces the list, and with it the button that opened it; focus goes back there.
  const focusWhenReady = useFocusWhenReady();
  const formOpener = useRef<LoopFormOpener | null>(null);
  // The loops saved by a form that stays for more: each makes the next form a new one (its
  // own client id, an empty name).
  const [savedHere, setSavedHere] = useState<Loop[]>([]);
  const lastSaved = savedHere[savedHere.length - 1];
  // The loop whose save the user hasn't answered yet: practise it now, or make another?
  const [justSaved, setJustSaved] = useState<Loop | null>(null);

  const openForm = (loop: Loop | null) => {
    if (!practice.openEditor(loop)) return;
    formOpener.current = loop ? { kind: 'edit', loopId: loop.id } : { kind: 'new' };
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
  // A deleted loop takes its buttons with it: focus goes to the next loop's Delete (the one
  // before, for the last loop listed), or to "New loop" when no loop is left.
  const followDelete = (loop: Loop) => {
    const listed = loops.data ? loopsInPanelOrder(loops.data).map((each) => each.id) : [];
    const nextId = neighbourAfterLeaving(listed, loop.id);
    focusWhenReady(() => {
      if (isItemListed(loop.id)) return null;
      return (
        (nextId === null ? null : findItemControl(nextId, 'delete')) ??
        findFormOpener({ kind: 'new' })
      );
    });
  };

  // Loops need the score: its bar count checks a range, and a loop can't play before it.
  const form = editorOnPanel(practice, snapshot);
  if (form) {
    const { editor, barCount } = form;
    if (editor.loopId !== null && !editedLoop) {
      return <DeletedLoopNotice onBack={closeForm} />;
    }
    // A new loop was just saved by a form that stays for more: the choice it leaves takes
    // the form's place until one is made. Bars picked on the score meanwhile are a choice
    // too ("make another"): the form comes back holding them.
    const choosing = editedLoop ? null : justSaved;
    if (choosing && !hasPickedBars(editor)) {
      return (
        <LoopSavedChoice
          saved={choosing}
          practise={
            <Link to={loopPracticePath(songId, choosing.id)} className={primaryButtonClass}>
              <Icon name="play" />
              Practise it now
            </Link>
          }
          onAnother={() => setJustSaved(null)}
          onDone={() => {
            setJustSaved(null);
            closeForm();
            outcome?.onCancelled?.();
          }}
          doneLabel="Back to the song"
        />
      );
    }
    return (
      <div className="flex flex-col">
        <LoopEditorForm
          // A different loop is a different form: its typed name starts over.
          key={editor.loopId ?? `new-${savedHere.length}`}
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
            if (editedLoop) {
              outcome?.onEdited?.(saved);
              return;
            }
            if (outcome?.keepsAdding) {
              // The form stays for the next loop: nothing is selected, so the whole song is
              // still there to pick bars from.
              setSavedHere((loops) => [...loops, saved]);
              setJustSaved(saved);
              practice.openEditor(null);
              outcome.onCreated?.(saved);
              return;
            }
            // A new loop is what the user wants to practice next; an edit leaves playback as it is.
            if (outcome?.onCreated) outcome.onCreated(saved);
            else practice.selectLoop(saved.id);
          }}
          onCancel={() => {
            closeForm();
            outcome?.onCancelled?.();
          }}
          // Once a loop has been saved here there is nothing to cancel, only to finish.
          cancelLabel={!editedLoop && lastSaved ? 'Done' : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className={sectionHeadingClass}>Loops</h2>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!canPickBars(snapshot)}
          {...NEW_LOOP_BUTTON_ATTRIBUTES}
          onClick={() => openForm(null)}
        >
          <Icon name="plus" />
          New loop
        </button>
      </div>
      <LoopList
        songId={songId}
        player={player}
        snapshot={snapshot}
        practice={practice}
        loops={loops}
        onPlayLoop={onPlayLoop}
        onEdit={openForm}
        onStatusSet={followStatusButton}
        onDeletePressed={followDelete}
        askToFinish={
          activeLoop !== null &&
          shouldAskToFinish(activeLoop, speedMoved) &&
          declinedFinish !== finishQuestionKey(activeLoop)
        }
        onDeclineFinish={() => {
          if (activeLoop) setDeclinedFinish(finishQuestionKey(activeLoop));
        }}
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

function LoopList({
  songId,
  player,
  snapshot,
  practice,
  loops,
  onPlayLoop,
  onEdit,
  onStatusSet,
  onDeletePressed,
  askToFinish,
  onDeclineFinish,
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
          player={player}
          snapshot={snapshot}
          active={
            loop.id === practice.activeLoop?.id
              ? {
                  onExit: practice.exitLoop,
                  askToFinish,
                  onDeclineFinish,
                  // The prompt's "Mark finished" moves the loop, as its own status button does.
                  onFinished: () => onStatusSet(loop, 'finished'),
                }
              : null
          }
          // Null until the score loads: the item then shows the percent alone.
          tempo={player?.tempoAtBar(loop.start_bar) ?? null}
          // The same gate as playLoop itself and the loop keys.
          canPlay={canPlay(player, snapshot)}
          // The form needs the score's bars, as "New loop" does.
          canEdit={canPickBars(snapshot)}
          onPlay={() => onPlayLoop(loop)}
          onEdit={() => onEdit(loop)}
          onStatusSet={(status) => onStatusSet(loop, status)}
          onDeletePressed={() => onDeletePressed(loop)}
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

/** What the playing loop's item adds: its speed, "Mark finished?" and the way back to the whole song. */
interface ActiveLoopProps {
  onExit: () => void;
  /** The saved speed has reached the target, and the user hasn't said "Not yet" to it. */
  askToFinish: boolean;
  onDeclineFinish: () => void;
  /** "Mark finished" in the prompt was sent; focus follows the loop to the other section. */
  onFinished: () => void;
}

/**
 * One loop. The playing loop is marked in place rather than shown again in a
 * card of its own (12 UX pass: one presentation of it, where it was pressed):
 * its item opens out to hold its speed control, "Mark finished?" and "Exit
 * loop". Each item's main action stands alone (Play loop, or Restart loop
 * while it plays), beside its status button; Edit, History and Delete are in
 * its "More" menu, Delete last, away from the main action.
 *
 * The children keep their places whether the loop plays or not (each extra
 * part is a slot of its own), so "Play loop" stays the same element as it
 * turns into "Restart loop", and keeps focus.
 */
function LoopListItem({
  songId,
  loop,
  player,
  snapshot,
  active,
  tempo,
  canPlay,
  canEdit,
  onPlay,
  onEdit,
  onStatusSet,
  onDeletePressed,
}: {
  songId: string;
  loop: Loop;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
  /** Set while this is the loop playing. */
  active: ActiveLoopProps | null;
  /** The file's tempo at the loop's first bar, for the BPM. */
  tempo: number | null;
  canPlay: boolean;
  canEdit: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onStatusSet: (status: LoopStatus) => void;
  onDeletePressed: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const focusWhenReady = useFocusWhenReady();
  // "Keep it" brings back the row; focus goes to the "More" button whose menu held Delete.
  const keepIt = () => {
    setConfirmingDelete(false);
    focusWhenReady(() => findItemControl(loop.id, 'delete'));
  };
  // Exit loop goes with the loop's playing state; its Play loop, which stays, takes focus.
  const exitLoop = () => {
    if (!active) return;
    active.onExit();
    focusWhenReady(() => findItemControl(loop.id, 'play'));
  };
  // "Not yet" goes with its prompt; the loop's speed control, just above it, takes focus.
  const declineFinish = () => {
    if (!active) return;
    active.onDeclineFinish();
    focusWhenReady(findLoopSpeed);
  };
  const [showingHistory, setShowingHistory] = useState(false);
  const named = <span className="sr-only"> {loop.name}</span>;

  return (
    <li
      className={`flex flex-col gap-3 p-3 ${
        active ? activeCardClass : 'rounded-card border border-line bg-canvas'
      }`}
      {...itemAttributes(loop.id)}
      data-testid={active ? 'active-loop' : undefined}
    >
      <div className="flex flex-col gap-1">
        {active && (
          <span className="text-xs font-semibold tracking-wider text-brand uppercase">
            Now looping
          </span>
        )}
        <p className="flex items-start gap-2 font-semibold wrap-anywhere">
          {active && <Icon name="loop" className="mt-0.5 size-4 text-brand" />}
          {loop.name}
        </p>
        <p className="text-sm text-ink-muted">
          {barsLabel(loop.start_bar, loop.end_bar)} · {speedLabel(loop.speed_ratio, tempo)}
        </p>
        <p className="text-sm text-ink-muted" data-testid="loop-last-practiced">
          {lastPracticedLabel(loop.last_practiced_at, new Date())}
        </p>
      </div>
      {active && (
        <section aria-label={`Practising ${loop.name}`} className="flex flex-col gap-3">
          <LoopSpeedControl loop={loop} player={player} snapshot={snapshot} />
          {active.askToFinish && (
            <FinishPrompt
              songId={songId}
              loop={loop}
              onDecline={declineFinish}
              onFinished={active.onFinished}
            />
          )}
        </section>
      )}
      {confirmingDelete ? (
        <ConfirmDeleteLoop
          songId={songId}
          loop={loop}
          onCancel={keepIt}
          onDeletePressed={onDeletePressed}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            // Restart is a second action on a loop already playing: the brand stays with Play.
            className={`${active ? buttonClass : primaryButtonClass} mr-1`}
            disabled={!canPlay}
            {...itemControlAttributes(loop.id, 'play')}
            // No await before the player is told to play: iOS only starts audio inside the tap.
            onClick={onPlay}
          >
            <Icon name={active ? 'reopen' : 'play'} />
            {active ? 'Restart loop' : 'Play loop'}
            {named}
          </button>
          {/* The prompt says why its own refused "Mark finished" failed: once is enough. */}
          <LoopStatusButton loop={loop} onSet={onStatusSet} showError={!active?.askToFinish} />
          <OverflowMenu
            name={loop.name}
            // The button stands for what its menu holds: closing the edit form and "Keep it"
            // hand focus back to it, as they did to Edit and Delete.
            buttonAttributes={{ ...itemMenuAttributes(loop.id), ...editButtonAttributes(loop.id) }}
            items={[
              { id: 'edit', label: 'Edit', icon: 'edit', disabled: !canEdit, onSelect: onEdit },
              {
                id: 'history',
                label: showingHistory ? 'Hide history' : 'Show history',
                icon: 'history',
                onSelect: () => setShowingHistory((showing) => !showing),
              },
              {
                id: 'delete',
                label: 'Delete',
                icon: 'trash',
                danger: true,
                onSelect: () => setConfirmingDelete(true),
              },
            ]}
          />
        </div>
      )}
      {active && (
        <button type="button" className={`${ghostButtonClass} self-start`} onClick={exitLoop}>
          <Icon name="close" className="size-4" />
          Exit loop
        </button>
      )}
      {showingHistory && <LoopHistory loopId={loop.id} loopName={loop.name} tempo={tempo} />}
    </li>
  );
}
