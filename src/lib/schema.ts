/**
 * App-side mirror of the limits and storage layout set in supabase/migrations.
 * The database is the source of truth; schema.test.ts fails if these drift.
 */
import { Constants, type Database } from './database.types';

export type LoopStatus = Database['public']['Enums']['loop_status'];
export type CountInMode = Database['public']['Enums']['count_in_mode'];
export type MetronomeSound = Database['public']['Enums']['metronome_sound'];
export type SongLinkKind = Database['public']['Enums']['song_link_kind'];
export type SongLinkProvider = Database['public']['Enums']['song_link_provider'];

export const GP_FILES_BUCKET = 'gp-files';
/** The bucket's file_size_limit. */
export const GP_FILE_MAX_BYTES = 20 * 1024 * 1024;

export const SPEED_RATIO_MIN = 0.25;
export const SPEED_RATIO_MAX = 2.0;
export const COUNT_IN_BAR_OPTIONS = [0, 1, 2] as const;
export type CountInBars = (typeof COUNT_IN_BAR_OPTIONS)[number];
export const COUNT_IN_MODES = Constants.public.Enums.count_in_mode;

export const METRONOME_VOLUME_MIN = 0;
export const METRONOME_VOLUME_MAX = 1;
export const METRONOME_SOUNDS = Constants.public.Enums.metronome_sound;
/** Clicks per beat: beats only, then twice and four times as many. */
export const METRONOME_SUBDIVISIONS = [1, 2, 4] as const;
export type MetronomeSubdivision = (typeof METRONOME_SUBDIVISIONS)[number];

export const SONG_TEXT_MAX_LENGTH = 300;
/** songs.original_tempo must be above 0 and at most this. */
export const SONG_TEMPO_MAX = 1000;
export const LOOP_NAME_MAX_LENGTH = 100;
/** song_links.url can't be longer. */
export const SONG_LINK_URL_MAX_LENGTH = 2048;
/** song_links.bar_one_seconds is between 0 and this: within a 12-hour video. */
export const BAR_ONE_SECONDS_MAX = 43200;
export const SONG_LINK_KINDS = Constants.public.Enums.song_link_kind;

/** practice_sessions.duration_seconds can't be longer: no sitting lasts a day. */
export const SESSION_MAX_DURATION_SECONDS = 24 * 60 * 60;

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

export function isValidMetronomeVolume(volume: number): boolean {
  return (
    Number.isFinite(volume) && volume >= METRONOME_VOLUME_MIN && volume <= METRONOME_VOLUME_MAX
  );
}

export function isCountInBars(value: number): value is CountInBars {
  return (COUNT_IN_BAR_OPTIONS as readonly number[]).includes(value);
}

export function isCountInMode(value: string): value is CountInMode {
  return (COUNT_IN_MODES as readonly string[]).includes(value);
}

export function isMetronomeSound(value: string): value is MetronomeSound {
  return (METRONOME_SOUNDS as readonly string[]).includes(value);
}

export function isMetronomeSubdivision(value: number): value is MetronomeSubdivision {
  return (METRONOME_SUBDIVISIONS as readonly number[]).includes(value);
}
