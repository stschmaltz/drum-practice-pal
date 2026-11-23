import { useCallback, useEffect, useState } from 'react';
import {
  isSameBarRange,
  type BarRange,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';
import { isValidBarRange } from '@/lib/schema';
import { formBarRange, type Loop, type LoopFormValues } from './loopForm';
import { tapBar } from './rangeSelection';

type BarFields = Pick<LoopFormValues, 'startBar' | 'endBar'>;

/** The open loop form's state that the score takes part in: which loop, and its bars. */
export interface LoopEditor {
  /** The loop being edited; null for a new loop. */
  loopId: string | null;
  /**
   * The bars as picked on the score or typed. Only what the user touched, so
   * an edit keeps showing the saved value of the other field (editorBarFields).
   */
  bars: Partial<BarFields>;
  /** The first bar has been tapped; the next tap picks the other end. */
  awaitingEnd: boolean;
}

/** The form's bar fields: what the user touched over the saved loop's bars, or empty for a new loop. */
export function editorBarFields(editor: LoopEditor, loop: Loop | null): BarFields {
  return {
    startBar: editor.bars.startBar ?? (loop ? String(loop.start_bar) : ''),
    endBar: editor.bars.endBar ?? (loop ? String(loop.end_bar) : ''),
  };
}

const rangeOf = (loop: Loop): BarRange => ({ startBar: loop.start_bar, endBar: loop.end_bar });

const barFieldsOf = ({ startBar, endBar }: BarRange): BarFields => ({
  startBar: String(startBar),
  endBar: String(endBar),
});

/** Limits playback to the range, repeating, from its first bar; or back to the whole song for null. */
function applyLoopRange(player: PlayerService, range: BarRange | null): void {
  player.setRange(range);
  player.setLooping(range !== null);
  // alphaTab moves to the range start itself; this shows the bar at once and re-counts a count-in.
  if (range) player.seekToBar(range.startBar);
}

/**
 * Loop practice on top of the player, for the song page: which loop is
 * playing, and the loop form's bars as they are picked on the score.
 *
 * - `playLoop` sets the range, looping and the loop's saved speed, and starts
 *   playback. `selectLoop` does the same without touching speed or playback
 *   (a loop just saved from what was playing). `exitLoop` goes back to the
 *   whole song.
 * - While the form is open (`editor`), taps on the score pick bars instead of
 *   seeking; the screen turns jam mode's seek off for as long (`editor !== null`).
 * - A mouse drag across bars picks a range, opening the form for a new loop
 *   if none is open.
 * - The score highlights the form's bars while it is open, otherwise the
 *   playing loop's.
 */
export function useLoopPractice(
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
  loops: readonly Loop[] | undefined,
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

  const activeStart = activeLoop?.start_bar ?? null;
  const activeEnd = activeLoop?.end_bar ?? null;
  // Keeps the player on the active loop's saved bars: after an edit of its
  // range (here or on another device), a loop selected by id before its row
  // was in the list, and back to the whole song once it is deleted or exited.
  useEffect(() => {
    if (!player || barCount === null) return;
    const wanted =
      activeStart !== null && activeEnd !== null
        ? { startBar: activeStart, endBar: activeEnd }
        : null;
    if (isSameBarRange(player.getSnapshot().range, wanted)) return;
    if (wanted && !isValidBarRange(wanted.startBar, wanted.endBar, barCount)) return;
    applyLoopRange(player, wanted);
  }, [player, barCount, activeStart, activeEnd]);

  const playLoop = useCallback(
    (loop: Loop) => {
      if (!player || barCount === null) return;
      if (!isValidBarRange(loop.start_bar, loop.end_bar, barCount)) return;
      setActiveLoopId(loop.id);
      // All inside the tap, with nothing awaited: iOS only starts audio in the gesture.
      applyLoopRange(player, rangeOf(loop));
      player.setSpeed(loop.speed_ratio);
      player.play();
    },
    [player, barCount],
  );

  const selectLoop = useCallback((loopId: string) => setActiveLoopId(loopId), []);
  const exitLoop = useCallback(() => setActiveLoopId(null), []);

  // --- The loop form's bars ---

  const openEditor = useCallback((loop: Loop | null) => {
    setEditor({ loopId: loop?.id ?? null, bars: {}, awaitingEnd: false });
  }, []);

  const closeEditor = useCallback(() => setEditor(null), []);

  /** A typed bar field. Typing ends a half-made tap selection. */
  const setEditorBars = useCallback((bars: Partial<BarFields>) => {
    setEditor((current) =>
      current ? { ...current, bars: { ...current.bars, ...bars }, awaitingEnd: false } : current,
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
      setEditor((open) =>
        open ? { ...open, bars: barFieldsOf(next), awaitingEnd: next.awaitingEnd } : open,
      );
    });
  }, [player, editorOpen, awaitingEnd, selectedStart, selectedEnd]);

  // A mouse drag across bars is a range, with or without the form open.
  useEffect(() => {
    if (!player) return;
    return player.on('barsDragged', ({ startBar, endBar, done }) => {
      const range = { startBar, endBar };
      if (editorOpen) {
        setEditor((open) =>
          open ? { ...open, bars: barFieldsOf(range), awaitingEnd: false } : open,
        );
        return;
      }
      // The form opens on release: opening it mid-drag would move the score under the pointer.
      if (!done) {
        setDragPreview(range);
        return;
      }
      setDragPreview(null);
      // A wobble inside one bar while clicking is not a wish for a new loop.
      if (startBar === endBar) return;
      setEditor({ loopId: null, bars: barFieldsOf(range), awaitingEnd: false });
    });
  }, [player, editorOpen]);

  // --- The highlight ---

  const highlight = editorOpen
    ? editorRange
    : (dragPreview ?? (activeLoop ? rangeOf(activeLoop) : null));
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
    exitLoop,
    openEditor,
    closeEditor,
    setEditorBars,
  };
}

export type LoopPractice = ReturnType<typeof useLoopPractice>;
