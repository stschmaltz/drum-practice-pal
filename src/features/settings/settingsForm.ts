/**
 * The user_settings fields the Settings page edits, and their validation
 * against the DB limits mirrored in src/lib/schema.ts. No client import, so
 * settingsApi.ts, the page and node tests all share it.
 */
import type { Database } from '@/lib/database.types';
import {
  isCountInBars,
  isCountInMode,
  isMetronomeSound,
  isMetronomeSubdivision,
  isValidMetronomeVolume,
  METRONOME_VOLUME_MAX,
  METRONOME_VOLUME_MIN,
} from '@/lib/schema';

type SettingsRow = Database['public']['Tables']['user_settings']['Row'];

export const SETTINGS_FIELDS = [
  'metronome_on',
  'metronome_volume',
  'metronome_sound',
  'metronome_accent',
  'metronome_accent_sound',
  'metronome_subdivision',
  'count_in_bars',
  'count_in_mode',
  'drums_muted_default',
] as const satisfies readonly (keyof SettingsRow)[];

/** A literal, so supabase-js can type the selected row. Tested against SETTINGS_FIELDS. */
export const SETTINGS_SELECT =
  'metronome_on, metronome_volume, metronome_sound, metronome_accent, metronome_accent_sound, metronome_subdivision, count_in_bars, count_in_mode, drums_muted_default';

export type SettingsField = (typeof SETTINGS_FIELDS)[number];
export type Settings = Pick<SettingsRow, SettingsField>;
export type SettingsErrors = Partial<Record<SettingsField, string>>;

export function validateSettings(settings: Settings): SettingsErrors {
  const errors: SettingsErrors = {};
  if (!isValidMetronomeVolume(settings.metronome_volume)) {
    errors.metronome_volume = `Volume must be between ${volumeToPercent(METRONOME_VOLUME_MIN)}% and ${volumeToPercent(METRONOME_VOLUME_MAX)}%.`;
  }
  if (!isMetronomeSound(settings.metronome_sound)) {
    errors.metronome_sound = 'Choose a metronome sound.';
  }
  if (!isMetronomeSound(settings.metronome_accent_sound)) {
    errors.metronome_accent_sound = 'Choose a sound for beat one.';
  }
  if (!isMetronomeSubdivision(settings.metronome_subdivision)) {
    errors.metronome_subdivision = 'Clicks must be on the beats, 2 per beat or 4 per beat.';
  }
  if (!isCountInBars(settings.count_in_bars)) {
    errors.count_in_bars = 'Count-in must be off, 1 bar or 2 bars.';
  }
  if (!isCountInMode(settings.count_in_mode)) {
    errors.count_in_mode = 'Choose when the count-in plays.';
  }
  return errors;
}

/** Only the fields that differ, so a save never rewrites what another device just changed. */
export function changedSettings(saved: Settings, draft: Settings): Partial<Settings> {
  const changes: Partial<Settings> = {};
  for (const field of SETTINGS_FIELDS) {
    if (draft[field] !== saved[field]) Object.assign(changes, { [field]: draft[field] });
  }
  return changes;
}

/** The columns that hold a metronome voice (see playerOptions' metronomeVoiceFromSettings). */
export function metronomeVoiceSettings(voice: {
  sound: Settings['metronome_sound'];
  accent: boolean;
  accentSound: Settings['metronome_accent_sound'];
  subdivision: number;
}): Partial<Settings> {
  return {
    metronome_sound: voice.sound,
    metronome_accent: voice.accent,
    metronome_accent_sound: voice.accentSound,
    metronome_subdivision: voice.subdivision,
  };
}

/** The volume slider works in whole percent; the DB stores 0 to 1. */
export function volumeToPercent(volume: number): number {
  return Math.round(volume * 100);
}

export function percentToVolume(percent: number): number {
  return Math.round(percent) / 100;
}
