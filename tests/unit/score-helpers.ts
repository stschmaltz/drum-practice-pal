import { readFileSync } from 'node:fs';
import * as alphaTab from '@coderline/alphatab';

const settings = new alphaTab.Settings();

export function loadScoreFile(path: string): alphaTab.model.Score {
  const bytes = new Uint8Array(readFileSync(path));
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
}

/** Tempo a bar starts at, following tempo automations from bar 1. */
export function tempoAtBar(score: alphaTab.model.Score, barNumber: number): number {
  let tempo = score.tempo;
  for (const masterBar of score.masterBars.slice(0, barNumber)) {
    const first = masterBar.tempoAutomations[0];
    if (first) tempo = first.value;
  }
  return tempo;
}

/** 0-based index of the first percussion track, or null when there is none. */
export function drumTrackIndex(score: alphaTab.model.Score): number | null {
  const index = score.tracks.findIndex((track) => track.staves[0]?.isPercussion);
  return index === -1 ? null : index;
}
