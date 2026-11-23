/**
 * Playback speed as a ratio (1 = the file's own tempo), within the DB's
 * loops.speed_ratio bounds so a speed played here can always be saved.
 */
import { SPEED_RATIO_MAX, SPEED_RATIO_MIN } from '@/lib/schema';

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
