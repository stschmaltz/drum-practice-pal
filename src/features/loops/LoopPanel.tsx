import { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import {
  buttonClass,
  dangerButtonClass,
  pressedButtonClass,
  primaryButtonClass,
} from '@/components/styles';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { barsLabel, sortLoops, type Loop } from './loopForm';
import { LoopEditorForm } from './LoopEditorForm';
import { speedLabel } from './loopLabels';
import { LoopSpeedControl } from './LoopSpeedControl';
import { loopPanelIsSheet, playLoopClosesPanel } from './useLoopPanelOpen';
import { useDeleteLoop, useLoops } from './useLoops';
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
  /** For the `aria-controls` of a toggle the page places elsewhere (the sticky bar, from 768 px). */
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

  return (
    <aside
      aria-label="Loops"
      data-testid="loop-panel"
      // Phone: fixed just above the tab bar (3.5rem plus its border). From md: a
      // column beside the score that stays put while the page scrolls.
      className={`fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 border-t border-neutral-800 bg-neutral-950 md:sticky md:inset-x-auto md:top-20 md:bottom-auto md:z-auto md:max-h-[calc(100dvh-6rem)] md:w-64 md:shrink-0 md:self-start md:overflow-y-auto md:rounded-lg md:border lg:w-80 ${
        open ? '' : 'md:hidden'
      }`}
    >
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left font-medium md:hidden"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onOpenChange(!open)}
      >
        <span className="truncate">
          {practice.activeLoop ? `Loop: ${practice.activeLoop.name}` : `Loops (${count})`}
        </span>
        <span className="shrink-0 text-sm text-sky-400">{open ? 'Close' : 'Open'}</span>
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
          onPlayLoop={(loop) => {
            // The sheet lies over the score and the count-in number; the press that starts
            // a loop gives them back. Its header goes on naming the loop.
            if (playLoopClosesPanel(loopPanelIsSheet(), snapshot.status)) onOpenChange(false);
            practice.playLoop(loop);
          }}
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

  if (editor && barCount !== null) {
    if (editor.loopId !== null && !editedLoop) {
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-neutral-300">This loop has been deleted.</p>
          <button type="button" className={buttonClass} onClick={practice.closeEditor}>
            Back to loops
          </button>
        </div>
      );
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
        onSaved={(saved) => {
          practice.closeEditor();
          // A new loop is what the user wants to practice next; an edit leaves playback as it is.
          if (!editedLoop) practice.selectLoop(saved.id);
        }}
        onCancel={practice.closeEditor}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Loops</h2>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={barCount === null}
          onClick={() => practice.openEditor(null)}
        >
          New loop
        </button>
      </div>
      {activeLoop && (
        <section
          aria-label={`Practicing ${activeLoop.name}`}
          className="flex flex-col gap-3 rounded-lg border border-sky-800 bg-sky-950/40 p-3"
        >
          <div className="flex flex-col gap-1">
            <p className="font-semibold break-words">{activeLoop.name}</p>
            <p className="text-sm text-neutral-300">
              {barsLabel(activeLoop.start_bar, activeLoop.end_bar)}, repeating
            </p>
          </div>
          <LoopSpeedControl songId={songId} loop={activeLoop} player={player} snapshot={snapshot} />
          <button type="button" className={buttonClass} onClick={practice.exitLoop}>
            Back to whole song
          </button>
        </section>
      )}
      <LoopList
        songId={songId}
        player={player}
        snapshot={snapshot}
        practice={practice}
        loops={loops}
        onPlayLoop={onPlayLoop}
      />
    </div>
  );
}

function LoopList({ songId, player, snapshot, practice, loops, onPlayLoop }: LoopPanelBodyProps) {
  if (loops.isPending) return <p className="text-neutral-400">Loading loops…</p>;
  // isLoadingError, not isError: a failed background refetch keeps the list (and a playing loop).
  if (loops.isLoadingError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-red-300">Couldn't load this song's loops.</p>
        <button type="button" className={buttonClass} onClick={() => void loops.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (loops.data.length === 0) {
    return (
      <p className="text-neutral-400">
        No loops yet. Choose New loop, then pick the bars you want to practice.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {sortLoops(loops.data).map((loop) => (
        <LoopListItem
          key={loop.id}
          songId={songId}
          loop={loop}
          active={loop.id === practice.activeLoop?.id}
          // Null until the score loads: the item then shows the percent alone.
          tempo={player?.tempoAtBar(loop.start_bar) ?? null}
          canPlay={player !== null && snapshot.barCount !== null && snapshot.status !== 'error'}
          onPlay={() => onPlayLoop(loop)}
          onEdit={() => practice.openEditor(loop)}
        />
      ))}
    </ul>
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
}: {
  songId: string;
  loop: Loop;
  active: boolean;
  /** The file's tempo at the loop's first bar, for the BPM. */
  tempo: number | null;
  canPlay: boolean;
  onPlay: () => void;
  onEdit: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const named = <span className="sr-only"> {loop.name}</span>;

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border p-3 ${
        active ? 'border-sky-700' : 'border-neutral-800'
      }`}
    >
      <div className="flex flex-col gap-1">
        <p className="font-semibold break-words">{loop.name}</p>
        <p className="text-sm text-neutral-400">
          {barsLabel(loop.start_bar, loop.end_bar)} · {speedLabel(loop.speed_ratio, tempo)}
          {loop.target_ratio !== null && ` · target ${speedLabel(loop.target_ratio, tempo)}`}
        </p>
      </div>
      {confirmingDelete ? (
        <ConfirmDelete songId={songId} loop={loop} onCancel={() => setConfirmingDelete(false)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={active ? pressedButtonClass : primaryButtonClass}
            disabled={!canPlay}
            // No await before the player is told to play: iOS only starts audio inside the tap.
            onClick={onPlay}
          >
            {active ? 'Restart loop' : 'Play loop'}
            {named}
          </button>
          <button type="button" className={buttonClass} onClick={onEdit}>
            Edit{named}
          </button>
          <button type="button" className={buttonClass} onClick={() => setConfirmingDelete(true)}>
            Delete{named}
          </button>
        </div>
      )}
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

  return (
    <div role="group" aria-label={`Delete ${loop.name}`} className="flex flex-col gap-2">
      <p className="text-neutral-200">
        Delete “{loop.name}”? Its practice history is deleted too. This can't be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButtonClass}
          disabled={remove.isPending}
          onClick={() => remove.mutate(loop.id)}
        >
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
      {remove.isError && <ErrorAlert>Couldn't delete the loop: {remove.error.message}</ErrorAlert>}
    </div>
  );
}
