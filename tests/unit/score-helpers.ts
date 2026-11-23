import { readFileSync } from 'node:fs';
import * as alphaTab from '@coderline/alphatab';
import { barStartTempos } from '../../src/features/player/tempo.ts';

const settings = new alphaTab.Settings();

export function loadScoreFile(path: string): alphaTab.model.Score {
  const bytes = new Uint8Array(readFileSync(path));
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
}

/**
 * Tempo 1-based `barNumber` starts at, from the app's own helper, so the seed
 * script and the fixture tests agree with uploads and the player.
 */
export function tempoAtBar(score: alphaTab.model.Score, barNumber: number): number {
  const tempo = barStartTempos(score)[barNumber - 1];
  if (tempo === undefined) throw new RangeError(`The score has no bar ${barNumber}`);
  return tempo;
}

/** 0-based index of the first percussion track, or null when there is none. */
export function drumTrackIndex(score: alphaTab.model.Score): number | null {
  const index = score.tracks.findIndex((track) => track.staves[0]?.isPercussion);
  return index === -1 ? null : index;
}
