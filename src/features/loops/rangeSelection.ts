/**
 * Picking a loop's bars on the score: tap the first bar, then the last. Pure,
 * so the tap rules are tested without a player. Bar numbers are 1-based.
 */

export interface RangeSelection {
  startBar: number;
  endBar: number;
  /** The first bar has been tapped and the next tap picks the other end. */
  awaitingEnd: boolean;
}

/**
 * The selection after a tap on `barNumber`. The first tap picks that bar
 * alone (a one-bar loop is a loop) and waits for the other end; the second
 * makes the range, in ascending order whichever end was tapped first. A tap
 * on a finished selection starts again from that bar.
 */
export function tapBar(selection: RangeSelection | null, barNumber: number): RangeSelection {
  if (!selection?.awaitingEnd) {
    return { startBar: barNumber, endBar: barNumber, awaitingEnd: true };
  }
  return {
    startBar: Math.min(selection.startBar, barNumber),
    endBar: Math.max(selection.startBar, barNumber),
    awaitingEnd: false,
  };
}

/** What to tell the user to do next, for the hint above the form's bar fields. */
export function selectionHint(selection: RangeSelection | null, canDrag: boolean): string {
  if (selection?.awaitingEnd) return 'Now tap the last bar, or save this one bar.';
  if (selection) return 'Tap a bar to start again.';
  return canDrag
    ? 'Tap the first bar on the score, then the last. Or drag across the bars.'
    : 'Tap the first bar on the score, then the last.';
}
