/**
 * Playback speed as a ratio (1 = the file's own tempo), within the DB's
 * loops.speed_ratio bounds so a speed played here can always be saved.
 */
import { SPEED_RATIO_MAX, SPEED_RATIO_MIN } from '@/lib/schema';
import { bpmAtSpeed } from './tempo';

/** The speed slider moves in whole steps of this many percent. */
export const SPEED_STEP_PERCENT = 5;

export function clampSpeedRatio(ratio: number): number {
  if (Number.isNaN(ratio)) return 1;
  return Math.min(SPEED_RATIO_MAX, Math.max(SPEED_RATIO_MIN, ratio));
}

export function ratioToPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

/** Clamped, and rounded to whole percent so 0.1 + 0.2 style drift never reaches alphaTab or the DB. */
export function percentToRatio(percent: number): number {
  return clampSpeedRatio(Math.round(percent) / 100);
}

/**
 * Ratios are kept to this many decimal places: enough that a typed BPM comes
 * back as the same whole BPM at any tempo the DB allows (the error is under
 * 0.001 BPM at 1000 BPM), without storing float noise like 0.7083333333333334.
 */
const RATIO_DECIMALS = 6;

function roundRatio(ratio: number): number {
  const scale = 10 ** RATIO_DECIMALS;
  return Math.round(ratio * scale) / scale;
}

/**
 * The speed ratio that plays `tempo` (the file's BPM at the relevant bar) at
 * `bpm`, clamped to the bounds. Not rounded to a whole percent: 85 BPM of 120
 * is 70.8333%, and storing 71% would show 85 BPM as 85.2. Null when there is
 * no ratio to give (no tempo, or a BPM that isn't a positive number).
 */
export function bpmToRatio(bpm: number, tempo: number): number | null {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(tempo) || tempo <= 0) return null;
  return clampSpeedRatio(roundRatio(bpm / tempo));
}

/**
 * Moves the speed by whole percent steps from the percent on show, so a ratio
 * that came from a BPM (70.8333%, shown as 71%) nudges to 72%, not 71.8333%.
 */
export function nudgeSpeedRatio(ratio: number, percentDelta: number): number {
  return percentToRatio(ratioToPercent(ratio) + percentDelta);
}

/**
 * Moves the speed by whole BPM from the BPM on show (`bpmAtSpeed`), to the
 * exact ratio of the new BPM at `tempo`: 85 BPM of 120 up one is 86 BPM,
 * 0.716667, never a whole percent. Clamped; null without a tempo or below 1 BPM.
 */
export function nudgeSpeedBpm(ratio: number, tempo: number, bpmDelta: number): number | null {
  return bpmToRatio(bpmAtSpeed(tempo, ratio) + bpmDelta, tempo);
}

/** A typed percentage ("85", "85%", " 85.4 ") as a ratio, or null when it isn't a positive number. */
export function parseSpeedPercent(text: string): number | null {
  const percent = parsePositiveNumber(text.replace('%', ''));
  return percent === null ? null : percentToRatio(percent);
}

/** A typed BPM as the ratio that gives it at `tempo`, or null when it isn't a positive number. */
export function parseSpeedBpm(text: string, tempo: number): number | null {
  const bpm = parsePositiveNumber(text);
  return bpm === null ? null : bpmToRatio(bpm, tempo);
}

function parsePositiveNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}
