/**
 * What the controls bar changes while a song plays, and the starting values
 * taken from user_settings.
 */
import type { Settings } from '@/features/settings/settingsForm';
import {
  isCountInBars,
  METRONOME_VOLUME_MAX,
  METRONOME_VOLUME_MIN,
  type CountInBars,
  type CountInMode,
} from '@/lib/schema';

export interface PlayerOptions {
  speedRatio: number;
  metronomeOn: boolean;
  /** 0 to 1; kept while the metronome is off so turning it back on restores it. */
  metronomeVolume: number;
  drumsMuted: boolean;
  /** 0 is off. */
  countInBars: CountInBars;
  /** Before the first play only, or before every loop repeat as well. */
  countInMode: CountInMode;
}

/** The user_settings column defaults, for when settings can't be read. */
export const DEFAULT_PLAYER_OPTIONS: PlayerOptions = {
  speedRatio: 1,
  metronomeOn: true,
  metronomeVolume: 0.8,
  drumsMuted: false,
  countInBars: 0,
  countInMode: 'start',
};

/** Every song opens at 100%; speed is per loop (Unit 08), not a setting. */
export function playerOptionsFromSettings(
  settings: Pick<
    Settings,
    'metronome_on' | 'metronome_volume' | 'drums_muted_default' | 'count_in_bars' | 'count_in_mode'
  >,
): PlayerOptions {
  return {
    speedRatio: 1,
    metronomeOn: settings.metronome_on,
    metronomeVolume: clampVolume(settings.metronome_volume),
    drumsMuted: settings.drums_muted_default,
    // The column is a plain int; anything the check constraint wouldn't allow counts as off.
    countInBars: isCountInBars(settings.count_in_bars) ? settings.count_in_bars : 0,
    countInMode: settings.count_in_mode,
  };
}

export function clampVolume(volume: number): number {
  if (Number.isNaN(volume)) return METRONOME_VOLUME_MAX;
  return Math.min(METRONOME_VOLUME_MAX, Math.max(METRONOME_VOLUME_MIN, volume));
}

/** The metronome volume alphaTab should play at: silent while the metronome is off. */
export function effectiveMetronomeVolume(
  options: Pick<PlayerOptions, 'metronomeOn' | 'metronomeVolume'>,
): number {
  return options.metronomeOn ? options.metronomeVolume : 0;
}
