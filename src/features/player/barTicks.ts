/**
 * Bar numbers and MIDI ticks. alphaTab's tick cache lists master bars in play
 * order (a repeated bar appears once per playthrough), with 0-based indexes.
 */

/** Tick span of one played master bar, as alphaTab's tick cache reports it. */
export interface BarTicks {
  /** 0-based master bar index */
  barIndex: number;
  start: number;
  end: number;
}

export interface TickRange {
  startTick: number;
  endTick: number;
}

/**
 * Tick range covering 1-based bars `startBarNumber..endBarNumber` inclusive.
 * Uses the first playthrough of the start bar, so repeats don't stretch the range.
 * Returns null when either bar doesn't exist or the range is reversed.
 */
export function barRangeToTicks(
  bars: readonly BarTicks[],
  startBarNumber: number,
  endBarNumber: number,
): TickRange | null {
  if (startBarNumber < 1 || endBarNumber < startBarNumber) return null;
  const startPos = bars.findIndex((bar) => bar.barIndex === startBarNumber - 1);
  if (startPos === -1) return null;
  const endBar = bars.slice(startPos).find((bar) => bar.barIndex === endBarNumber - 1);
  const startBar = bars[startPos];
  if (!endBar || !startBar) return null;
  return { startTick: startBar.start, endTick: endBar.end };
}

/** 0-based bar index playing at `tick`, or null outside the song. */
export function barIndexAtTick(bars: readonly BarTicks[], tick: number): number | null {
  const bar = bars.find((b) => tick >= b.start && tick < b.end);
  return bar ? bar.barIndex : null;
}

/** Tick where 1-based `barNumber` first starts, or null when the bar doesn't exist. */
export function startTickOfBar(bars: readonly BarTicks[], barNumber: number): number | null {
  return bars.find((bar) => bar.barIndex === barNumber - 1)?.start ?? null;
}
