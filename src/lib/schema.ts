/**
 * App-side mirror of the limits and storage layout set in supabase/migrations.
 * The database is the source of truth; schema.test.ts fails if these drift.
 */
import type { Database } from './database.types';

export type LoopStatus = Database['public']['Enums']['loop_status'];
export type CountInMode = Database['public']['Enums']['count_in_mode'];

export const GP_FILES_BUCKET = 'gp-files';

export const SPEED_RATIO_MIN = 0.25;
export const SPEED_RATIO_MAX = 2.0;
export const COUNT_IN_BAR_OPTIONS = [0, 1, 2] as const;
export type CountInBars = (typeof COUNT_IN_BAR_OPTIONS)[number];

export const SONG_TEXT_MAX_LENGTH = 300;
export const LOOP_NAME_MAX_LENGTH = 100;

/** Object path inside the gp-files bucket. Storage policies only accept this shape. */
export function songFilePath(userId: string, songId: string): string {
  return `${userId}/${songId}.gp`;
}

export function isValidSpeedRatio(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio >= SPEED_RATIO_MIN && ratio <= SPEED_RATIO_MAX;
}

/** Mirrors the loops bar-range check and trigger: 1 <= start <= end <= barCount. */
export function isValidBarRange(startBar: number, endBar: number, barCount: number): boolean {
  return (
    Number.isInteger(startBar) &&
    Number.isInteger(endBar) &&
    startBar >= 1 &&
    startBar <= endBar &&
    endBar <= barCount
  );
}
