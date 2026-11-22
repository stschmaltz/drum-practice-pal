/** Meter and starting tempo of one bar. */
export interface BarTiming {
  /** Time signature numerator */
  beats: number;
  /** Time signature denominator */
  beatValue: number;
  /** Quarter-note BPM the bar plays at */
  tempo: number;
}

/** Milliseconds one bar lasts at `speedRatio`. Tempo is in quarter notes, so 6/8 is 3 quarters long. */
export function barDurationMs(bar: BarTiming, speedRatio: number): number {
  const quarters = bar.beats * (4 / bar.beatValue);
  return (quarters * 60_000) / (bar.tempo * speedRatio);
}

/** Expected wall-clock length of one loop pass, for comparing against measured wrap intervals. */
export function loopDurationMs(bars: readonly BarTiming[], speedRatio: number): number {
  return bars.reduce((total, bar) => total + barDurationMs(bar, speedRatio), 0);
}

export interface CountInClick {
  /** AudioContext time in seconds */
  time: number;
  accent: boolean;
}

/**
 * Click times for a count-in of `bars` bars in the given meter, starting at `startTime`.
 * Also returns `downbeat`, the time playback should resume.
 * Spike-grade: Unit 07 owns the real scheduler.
 */
export function countInClicks(
  bar: BarTiming,
  bars: number,
  speedRatio: number,
  startTime: number,
): { clicks: CountInClick[]; downbeat: number } {
  const beatSeconds = barDurationMs(bar, speedRatio) / 1000 / bar.beats;
  const clicks: CountInClick[] = [];
  for (let i = 0; i < bars * bar.beats; i++) {
    clicks.push({ time: startTime + i * beatSeconds, accent: i % bar.beats === 0 });
  }
  return { clicks, downbeat: startTime + bars * bar.beats * beatSeconds };
}
