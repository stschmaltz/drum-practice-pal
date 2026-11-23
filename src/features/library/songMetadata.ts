/**
 * The songs-row metadata read from a parsed score. Typed against the few score
 * fields it reads rather than alphaTab's classes, so it stays a pure module
 * that node tests can feed real fixture scores or plain objects.
 */
import { barStartTempos } from '@/features/player/tempo';
import { SONG_TEMPO_MAX, SONG_TEXT_MAX_LENGTH } from '@/lib/schema';
import { titleFromFileName } from './songFile';

export interface ScoreLike {
  title: string;
  artist: string;
  tempo: number;
  masterBars: readonly {
    tempoAutomations: readonly { value: number; ratioPosition: number }[];
  }[];
  tracks: readonly { staves: readonly { isPercussion: boolean }[] }[];
}

export interface SongMetadata {
  title: string;
  artist: string;
  originalTempo: number;
  barCount: number;
  /** 0-based alphaTab track index, or null when the file has no percussion track. */
  drumTrackIndex: number | null;
}

/** Shown after the upload and on the library entry when drumTrackIndex is null. */
export const NO_DRUM_TRACK_NOTE =
  'No drum track found in this file. It will play the other parts and the metronome, with nothing to mute or read along with.';

export type MetadataResult =
  | { ok: true; metadata: SongMetadata }
  | { ok: false; reason: 'no-bars' | 'no-tracks' | 'bad-tempo' };

/** Collapses whitespace and cuts to the DB's limit by code point, as char_length counts. */
export function cleanSongText(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, SONG_TEXT_MAX_LENGTH).join('').trim();
}

/**
 * The tempo bar 1 starts at, from the same helper the player's BPM readout
 * uses, so the library's BPM and the jam header can't disagree. A change
 * part-way through bar 1 doesn't count: the bar starts at the score tempo.
 */
export function tempoAtFirstBar(score: ScoreLike): number {
  return barStartTempos(score)[0] ?? score.tempo;
}

export function drumTrackIndexOf(score: ScoreLike): number | null {
  const index = score.tracks.findIndex((track) => track.staves.some((staff) => staff.isPercussion));
  return index === -1 ? null : index;
}

export function extractSongMetadata(score: ScoreLike, fileName: string): MetadataResult {
  // An empty score is what alphaTab returns for bytes it only half understood.
  if (score.masterBars.length === 0) return { ok: false, reason: 'no-bars' };
  if (score.tracks.length === 0) return { ok: false, reason: 'no-tracks' };

  const originalTempo = tempoAtFirstBar(score);
  if (!Number.isFinite(originalTempo) || originalTempo <= 0 || originalTempo > SONG_TEMPO_MAX) {
    return { ok: false, reason: 'bad-tempo' };
  }

  return {
    ok: true,
    metadata: {
      title: cleanSongText(score.title) || cleanSongText(titleFromFileName(fileName)) || 'Untitled',
      artist: cleanSongText(score.artist),
      originalTempo,
      barCount: score.masterBars.length,
      drumTrackIndex: drumTrackIndexOf(score),
    },
  };
}
