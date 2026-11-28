import { useCallback, useEffect, useState } from 'react';
import { canPickBars, canPlay } from '@/features/player/controlGates';
import {
  isSameBarRange,
  type BarRange,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';
import { isValidBarRange } from '@/lib/schema';
import { formBarRange, type Loop, type LoopBarFields } from './loopForm';
import { tapBar } from './rangeSelection';

/** The open loop form's state that the score takes part in: which loop, and its bars. */
export interface LoopEditor {
  /** The loop being edited; null for a new loop. */
  loopId: string | null;
  /**
   * The bars as picked on the score or typed. Only what the user touched, so
   * an edit keeps showing the saved value of the other field (editorBarFields).
   */
  bars: Partial<LoopBarFields>;
  /** The first bar has been tapped; the next tap picks the other end. */
  awaitingEnd: boolean;
  /**
   * The form's save is on its way. Its bars are then what was sent: the score
   * picks none until the save settles, as the form's own fields are locked.
   */
  saving: boolean;
}

/** The open form with bars picked on the score, or as it was while its save is on its way. */
function withPickedBars(
  editor: LoopEditor | null,
  range: BarRange,
  awaitingEnd: boolean,
): LoopEditor | null {
  if (!editor || editor.saving) return editor;
  return { ...editor, bars: barFieldsOf(range), awaitingEnd };
}

/**
 * Whether the open form has had a bar picked on the score or typed since it
 * opened (a first tap that still waits for its other end counts). A new
 * loop's form opens with none.
 */
export function hasPickedBars(editor: LoopEditor): boolean {
  return editor.awaitingEnd || Object.values(editor.bars).some((bar) => bar !== undefined);
}

/** The form's bar fields: what the user touched over the saved loop's bars, or empty for a new loop. */
export function editorBarFields(editor: LoopEditor, loop: Loop | null): LoopBarFields {
  return {
    startBar: editor.bars.startBar ?? (loop ? String(loop.start_bar) : ''),
    endBar: editor.bars.endBar ?? (loop ? String(loop.end_bar) : ''),
  };
}

const rangeOf = (loop: Loop): BarRange => ({ startBar: loop.start_bar, endBar: loop.end_bar });

const barFieldsOf = ({ startBar, endBar }: BarRange): LoopBarFields => ({
  startBar: String(startBar),
  endBar: String(endBar),
});

/** Limits playback to the range, repeating, from its first bar; or back to the whole song for null. */
function applyLoopRange(player: PlayerService, range: BarRange | null): void {
  player.setRange(range);
  player.setLooping(range !== null);
  if (!range) return;
  // alphaTab moves to the range start itself; this shows the bar at once and re-counts a count-in.
  player.seekToBar(range.startBar);
  // The loop came from the panel, not from a tap on the score: its bars may be off screen.
  player.showBar(range.startBar);
}

/**
 * Loop practice on top of the player, for the song page: which loop is
 * playing, and the loop form's bars as they are picked on the score.
 *
 * - `playLoop` sets the range, looping and the loop's saved speed, and starts
 *   playback (on the loop already playing it restarts it at the speed playing
 *   now). `selectLoop` does the same without touching speed or playback (a
 *   loop just saved from what was playing), `openLoop` with the saved speed
 *   but no playback (a link from the home page). `exitLoop` goes back to the
 *   whole song.
 * - While the form is open (`editor`), taps on the score pick bars instead of
 *   seeking; the screen turns jam mode's seek off for as long (`editor !== null`).
 * - A mouse drag across bars picks a range, opening the form for a new loop
 *   if none is open (unless `dragOpensForm` is false: the practice screen
 *   picks bars only once "Show whole song" has opened the form).
 * - The score highlights the form's bars while it is open, otherwise the
 *   playing loop's.
 */
export function useLoopPractice(
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
  loops: readonly Loop[] | undefined,
  {
    dragOpensForm = true,
    previewPickedBars = false,
  }: {
    dragOpensForm?: boolean;
    /**
     * While the form is open, a whole range picked on the score is what plays
     * (the practice screen's "Show whole song": hear a new loop before saving
     * it). Closing the form goes back to the active loop's bars.
     */
    previewPickedBars?: boolean;
  } = {},
) {
  const [activeLoopId, setActiveLoopId] = useState<string | null>(null);
  const [editor, setEditor] = useState<LoopEditor | null>(null);
  // A drag under way that hasn't opened the form yet: shown, but nothing else changes until release.
  const [dragPreview, setDragPreview] = useState<BarRange | null>(null);

  const { barCount } = snapshot;
  const activeLoop = loops?.find((loop) => loop.id === activeLoopId) ?? null;
  const editedLoop = loops?.find((loop) => loop.id === editor?.loopId) ?? null;
  const editorRange =
    editor && barCount !== null
      ? formBarRange(editorBarFields(editor, editedLoop), barCount)
      : null;

  // --- The playing loop ---

  // A whole range picked in the open form, played instead of the loop (previewPickedBars).
  const preview = previewPickedBars && editor !== null && !editor.awaitingEnd ? editorRange : null;
  const playedStart = preview?.startBar ?? activeLoop?.start_bar ?? null;
  const playedEnd = preview?.endBar ?? activeLoop?.end_bar ?? null;
  // Keeps the player on the active loop's saved bars (or the picked bars it
  // previews): after an edit of its range (here or on another device), a loop
  // selected by id before its row was in the list, and back to the whole song
  // once it is deleted or exited.
  useEffect(() => {
    if (!player || barCount === null) return;
    const wanted =
      playedStart !== null && playedEnd !== null
        ? { startBar: playedStart, endBar: playedEnd }
        : null;
    if (isSameBarRange(player.getSnapshot().range, wanted)) return;
    if (wanted && !isValidBarRange(wanted.startBar, wanted.endBar, barCount)) return;
    applyLoopRange(player, wanted);
  }, [player, barCount, playedStart, playedEnd]);

  const playLoop = useCallback(
    (loop: Loop) => {
      if (!player || barCount === null) return;
      // The gate "Play loop" and the loop keys go by, asked of the player at the press.
      if (!canPlay(player, player.getSnapshot())) return;
      if (!isValidBarRange(loop.start_bar, loop.end_bar, barCount)) return;
      setActiveLoopId(loop.id);
      // All inside the tap, with nothing awaited: iOS only starts audio in the gesture.
      applyLoopRange(player, rangeOf(loop));
      // "Restart loop" keeps the speed playing now. Going back to the saved speed
      // would throw away a nudge that hasn't been saved, without a word.
      if (loop.id !== activeLoopId) player.setSpeed(loop.speed_ratio);
      player.play();
    },
    [player, barCount, activeLoopId],
  );

  const selectLoop = useCallback((loopId: string) => setActiveLoopId(loopId), []);

  /**
   * Arriving at a loop from outside the page (the home page's link): the loop
   * and its saved speed, ready for Play. It can't start playback: that has to
   * happen inside a tap. The effect above sets the range and shows its bars.
   */
  const openLoop = useCallback(
    (loop: Loop) => {
      setActiveLoopId(loop.id);
      player?.setSpeed(loop.speed_ratio);
    },
    [player],
  );
  const exitLoop = useCallback(() => setActiveLoopId(null), []);

  // --- The loop form's bars ---

  /** Opens the loop form; false, and nothing opens, before the score's bars are known. */
  const openEditor = useCallback(
    (loop: Loop | null): boolean => {
      // Asked of the player at the press, as "New loop" and each "Edit" are gated on it.
      if (!player || !canPickBars(player.getSnapshot())) return false;
      setEditor({ loopId: loop?.id ?? null, bars: {}, awaitingEnd: false, saving: false });
      return true;
    },
    [player],
  );

  const closeEditor = useCallback(() => setEditor(null), []);

  /** A typed bar field. Typing ends a half-made tap selection. */
  const setEditorBars = useCallback((bars: Partial<LoopBarFields>) => {
    setEditor((current) =>
      current ? { ...current, bars: { ...current.bars, ...bars }, awaitingEnd: false } : current,
    );
  }, []);

  /** From the form, as its save starts and settles. */
  const setEditorSaving = useCallback((saving: boolean) => {
    // The same object when nothing changes: the form reports on every change of its callback too.
    setEditor((current) =>
      current && current.saving !== saving ? { ...current, saving } : current,
    );
  }, []);

  const editorOpen = editor !== null;
  const awaitingEnd = editor?.awaitingEnd ?? false;
  const selectedStart = editorRange?.startBar ?? null;
  const selectedEnd = editorRange?.endBar ?? null;

  // Taps pick the form's bars while it is open (jam mode's seek is off meanwhile).
  useEffect(() => {
    if (!player || !editorOpen) return;
    return player.on('barTapped', ({ barNumber }) => {
      const current =
        selectedStart !== null && selectedEnd !== null
          ? { startBar: selectedStart, endBar: selectedEnd, awaitingEnd }
          : null;
      const next = tapBar(current, barNumber);
      setEditor((open) => withPickedBars(open, next, next.awaitingEnd));
    });
  }, [player, editorOpen, awaitingEnd, selectedStart, selectedEnd]);

  // A mouse drag across bars is a range, with or without the form open.
  useEffect(() => {
    if (!player) return;
    return player.on('barsDragged', ({ startBar, endBar, done, cancelled }) => {
      const range = { startBar, endBar };
      // The browser took the press away: nothing was picked, and the preview goes.
      // An open form keeps the bars the drag had reached, as it does for each move.
      if (cancelled) {
        setDragPreview(null);
        return;
      }
      if (editorOpen) {
        setEditor((open) => withPickedBars(open, range, false));
        return;
      }
      // Here a drag only picks the bars of a form already open.
      if (!dragOpensForm) return;
      // The form opens on release: opening it mid-drag would move the score under the pointer.
      if (!done) {
        setDragPreview(range);
        return;
      }
      setDragPreview(null);
      // A wobble inside one bar while clicking is not a wish for a new loop.
      if (startBar === endBar) return;
      setEditor({ loopId: null, bars: barFieldsOf(range), awaitingEnd: false, saving: false });
    });
  }, [player, editorOpen, dragOpensForm]);

  // --- The highlight ---

  const activeRange = activeLoop ? rangeOf(activeLoop) : null;
  // An open form shows its bars; until any are picked, the loop playing stays marked.
  const highlight = editorOpen ? (editorRange ?? activeRange) : (dragPreview ?? activeRange);
  const highlightStart = highlight?.startBar ?? null;
  const highlightEnd = highlight?.endBar ?? null;
  useEffect(() => {
    if (!player) return;
    player.setHighlight(
      highlightStart !== null && highlightEnd !== null
        ? { startBar: highlightStart, endBar: highlightEnd }
        : null,
    );
  }, [player, highlightStart, highlightEnd]);

  return {
    activeLoop,
    editor,
    editedLoop,
    playLoop,
    selectLoop,
    openLoop,
    exitLoop,
    openEditor,
    closeEditor,
    setEditorBars,
    setEditorSaving,
  };
}

export type LoopPractice = ReturnType<typeof useLoopPractice>;
