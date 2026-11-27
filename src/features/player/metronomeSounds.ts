/**
 * The metronome's sounds and where its clicks go. Pure: alphaTabEngine.ts
 * turns these notes into MIDI events.
 *
 * alphaTab's own metronome always plays one note (GM percussion key 33) at one
 * velocity, hard-coded in its synth worker. So the engine takes alphaTab's
 * metronome events out of the generated MIDI and writes these notes in their
 * place: the soundfont plays them in time with the song.
 */
import type { MetronomeSound, MetronomeSubdivision } from '@/lib/schema';

/** What the metronome plays, from user_settings and the controls bar. */
export interface MetronomeVoice {
  /** Every click but beat one's when `accent` is on. */
  sound: MetronomeSound;
  /** Beat one played louder, in `accentSound`. */
  accent: boolean;
  accentSound: MetronomeSound;
  /** Clicks per beat of the meter. */
  subdivision: MetronomeSubdivision;
}

export const DEFAULT_METRONOME_VOICE: MetronomeVoice = {
  sound: 'click',
  accent: true,
  accentSound: 'click',
  subdivision: 1,
};

/** General MIDI percussion keys (33 is the GS metronome click alphaTab plays). */
export const METRONOME_SOUND_KEYS: Record<MetronomeSound, number> = {
  click: 33,
  side_stick: 37,
  hi_hat: 42,
  cowbell: 56,
  claves: 75,
  woodblock_high: 76,
  woodblock_low: 77,
};

export const METRONOME_SOUND_LABELS: Record<MetronomeSound, string> = {
  click: 'Click',
  side_stick: 'Side stick',
  hi_hat: 'Hi-hat',
  cowbell: 'Cowbell',
  claves: 'Claves',
  woodblock_high: 'Woodblock (high)',
  woodblock_low: 'Woodblock (low)',
};

export const METRONOME_SUBDIVISION_LABELS: Record<MetronomeSubdivision, string> = {
  1: 'Beats',
  2: '2 per beat',
  4: '4 per beat',
};

/** The voice in a few words, for the controls bar's closed "Metronome sounds": "Click, beat one Cowbell". */
export function metronomeVoiceSummary(voice: MetronomeVoice): string {
  const parts = [METRONOME_SOUND_LABELS[voice.sound]];
  if (voice.accent && voice.accentSound !== voice.sound) {
    parts.push(`beat one ${METRONOME_SOUND_LABELS[voice.accentSound]}`);
  }
  if (voice.subdivision !== 1) parts.push(METRONOME_SUBDIVISION_LABELS[voice.subdivision]);
  return parts.join(', ');
}

/**
 * The metronome channel's mix volume at the top of the slider. At 1 the click
 * was too quiet over a full band (Shane, 2026-11-27); alphaTab's channel volume
 * has no upper bound, so the slider's 0 to 1 maps to 0 to this.
 */
export const METRONOME_MAX_GAIN = 3;

/**
 * The channel volume for a slider value (0 to 1, as stored). Squared, so the
 * lower half stays fine-grained for quiet practice and the top end gets loud.
 */
export function metronomeChannelGain(volume: number): number {
  const clamped = Math.min(1, Math.max(0, volume));
  return METRONOME_MAX_GAIN * clamped * clamped;
}

/** 0 to 127. Beats keep alphaTab's own tick velocity (95), so the level of the default is unchanged. */
export const ACCENT_VELOCITY = 127;
export const BEAT_VELOCITY = 95;
export const SUBDIVISION_VELOCITY = 64;

/** One of alphaTab's metronome events: a beat of the meter. */
export interface MetronomeBeat {
  tick: number;
  /** 0-based beat within the bar; 0 is beat one. */
  counter: number;
  durationInTicks: number;
}

export interface MetronomeNote {
  tick: number;
  key: number;
  velocity: number;
  /** Before the next click's tick, so its note-off can never cut the next click short. */
  offTick: number;
}

/** The notes that play the beats, in tick order. */
export function metronomeNotes(
  beats: readonly MetronomeBeat[],
  voice: MetronomeVoice,
): MetronomeNote[] {
  const notes: MetronomeNote[] = [];
  const beatKey = METRONOME_SOUND_KEYS[voice.sound];
  for (const beat of beats) {
    const step = beat.durationInTicks / voice.subdivision;
    for (let part = 0; part < voice.subdivision; part++) {
      const tick = Math.round(beat.tick + part * step);
      const accented = part === 0 && beat.counter === 0 && voice.accent;
      notes.push({
        tick,
        key: accented ? METRONOME_SOUND_KEYS[voice.accentSound] : beatKey,
        velocity: accented ? ACCENT_VELOCITY : part === 0 ? BEAT_VELOCITY : SUBDIVISION_VELOCITY,
        offTick: tick + Math.max(1, Math.floor(step) - 1),
      });
    }
  }
  return notes.sort((a, b) => a.tick - b.tick);
}

/** Every key a voice can play, which the synth must load samples for. */
export function metronomeKeys(voice: MetronomeVoice): number[] {
  const keys = new Set([METRONOME_SOUND_KEYS[voice.sound]]);
  if (voice.accent) keys.add(METRONOME_SOUND_KEYS[voice.accentSound]);
  return [...keys];
}

/** MIDI's drum channel (0-based). alphaTab only loads percussion samples for keys played on it. */
export const PERCUSSION_CHANNEL = 9;

/**
 * A channel no track uses, for the metronome alone: its volume and mute then
 * never touch a track's. The one after the highest used, as alphaTab picks its
 * own metronome channel, and never the drum channel.
 */
export function freeChannel(usedChannels: Iterable<number>): number {
  let highest = -1;
  for (const channel of usedChannels) highest = Math.max(highest, channel);
  const next = highest + 1;
  return next === PERCUSSION_CHANNEL ? next + 1 : next;
}

export function isSameVoice(a: MetronomeVoice, b: MetronomeVoice): boolean {
  return (
    a.sound === b.sound &&
    a.accent === b.accent &&
    a.accentSound === b.accentSound &&
    a.subdivision === b.subdivision
  );
}
