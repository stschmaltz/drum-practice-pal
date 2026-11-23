/**
 * Tempo per bar, and the BPM a speed ratio plays at. Typed against the few
 * score fields it reads rather than alphaTab's classes, so node tests can feed
 * it real fixture scores or plain objects. BPM is always derived, never stored
 * (AGENTS.md): displayed BPM = speed ratio x the tempo at the relevant bar.
 */

export interface TempoScoreLike {
  /** The score's starting tempo, used until the first tempo automation. */
  tempo: number;
  masterBars: readonly {
    tempoAutomations: readonly { value: number; ratioPosition: number }[];
  }[];
}

/**
 * The tempo each bar starts at, by 0-based bar index. A change on a bar's
 * downbeat counts for that bar; a change part-way through takes effect from
 * the next bar, since the bar started at the old tempo.
 */
export function barStartTempos(score: TempoScoreLike): number[] {
  let carried = score.tempo;
  return score.masterBars.map(({ tempoAutomations }) => {
    const byPosition = [...tempoAutomations].sort((a, b) => a.ratioPosition - b.ratioPosition);
    const onDownbeat = byPosition.filter((automation) => automation.ratioPosition <= 0).at(-1);
    const startTempo = onDownbeat?.value ?? carried;
    carried = byPosition.at(-1)?.value ?? carried;
    return startTempo;
  });
}

/** The tempo 1-based `barNumber` starts at, or null when the song has no such bar. */
export function tempoAtBar(tempos: readonly number[], barNumber: number): number | null {
  if (!Number.isInteger(barNumber) || barNumber < 1) return null;
  return tempos[barNumber - 1] ?? null;
}

/** The BPM heard at `speedRatio`, to whole beats: what a drummer sets a click to. */
export function bpmAtSpeed(tempo: number, speedRatio: number): number {
  return Math.round(tempo * speedRatio);
}
