/**
 * Count-in timing: tempo, meter, speed and bar count to click times. Pure, so
 * it is tested without audio; countInRunner.ts plays what this returns on the
 * AudioContext clock. Times are seconds on whatever clock `startTime` is on.
 */
// Relative, not `@/`: tests/unit imports this file under the node tsconfig, which has no alias.
import type { CountInBars, CountInMode } from '../../lib/schema';

/** A bar's time signature. */
export interface Meter {
  /** Beats in the bar (the top number). */
  beats: number;
  /** The note value that gets one beat (the bottom number): 4 is a quarter, 8 an eighth. */
  beatValue: number;
}

export const COMMON_TIME: Meter = { beats: 4, beatValue: 4 };

export interface MeterScoreLike {
  masterBars: readonly { timeSignatureNumerator: number; timeSignatureDenominator: number }[];
}

/** Each bar's meter, by 0-based bar index. Typed against the fields it reads, like tempo.ts. */
export function barMeters(score: MeterScoreLike): Meter[] {
  return score.masterBars.map((bar) => ({
    beats: bar.timeSignatureNumerator,
    beatValue: bar.timeSignatureDenominator,
  }));
}

/** The meter of 1-based `barNumber`, or null when the song has no such bar. */
export function meterAtBar(meters: readonly Meter[], barNumber: number): Meter | null {
  if (!Number.isInteger(barNumber) || barNumber < 1) return null;
  return meters[barNumber - 1] ?? null;
}

export interface CountInRequest {
  /** How many bars to count. */
  bars: number;
  /** The meter of the bar playback starts on. */
  meter: Meter;
  /** That bar's tempo in the file's quarter-note BPM, before speed. */
  tempo: number;
  speedRatio: number;
  /** When the first click sounds. */
  startTime: number;
}

export interface CountInClick {
  time: number;
  /** The first beat of each counted bar. */
  accent: boolean;
  /** 1-based bar of the count-in. */
  bar: number;
  /** 1-based beat within that bar. */
  beat: number;
}

export interface CountInSchedule {
  clicks: CountInClick[];
  /** Seconds between clicks. */
  beatSeconds: number;
  /** When playback should be heard: one beat after the last click. */
  downbeat: number;
}

/**
 * Seconds one beat of `meter` lasts. Tempo counts quarter notes, so a beat in
 * 6/8 (an eighth) is half as long as one in 3/4 at the same tempo.
 */
export function beatSeconds(meter: Meter, tempo: number, speedRatio: number): number {
  return (60 / (tempo * speedRatio)) * (4 / meter.beatValue);
}

/**
 * One click per beat of the meter for `bars` bars, the first of each bar
 * accented. Null when there is nothing to count: no bars, or a meter, tempo or
 * speed that gives no usable beat (a damaged file), so the caller just plays.
 */
export function countInSchedule(request: CountInRequest): CountInSchedule | null {
  const { bars, meter, tempo, speedRatio, startTime } = request;
  if (!Number.isInteger(bars) || bars < 1) return null;
  if (!Number.isInteger(meter.beats) || meter.beats < 1) return null;
  // Checked one by one: two negatives would otherwise multiply into a usable-looking beat.
  if (!(tempo > 0) || !(speedRatio > 0) || !(meter.beatValue > 0)) return null;
  const seconds = beatSeconds(meter, tempo, speedRatio);
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(startTime)) return null;

  const clicks: CountInClick[] = [];
  for (let bar = 1; bar <= bars; bar++) {
    for (let beat = 1; beat <= meter.beats; beat++) {
      // Multiplied from the start, not accumulated, so rounding never drifts across beats.
      const index = (bar - 1) * meter.beats + (beat - 1);
      clicks.push({ time: startTime + index * seconds, accent: beat === 1, bar, beat });
    }
  }
  return { clicks, beatSeconds: seconds, downbeat: startTime + bars * meter.beats * seconds };
}

export interface CountInSettings {
  countInBars: CountInBars;
  countInMode: CountInMode;
}

/** Whether a loop repeat gets its own count-in, rather than wrapping straight round. */
export function countsInEveryRepeat(settings: CountInSettings): boolean {
  return settings.countInBars > 0 && settings.countInMode === 'every_repeat';
}
