import { barStartTempos, bpmAtSpeed, tempoAtBar, type TempoScoreLike } from './tempo';

const at = (value: number, ratioPosition = 0) => ({ value, ratioPosition });

function score(tempo: number, automations: ReturnType<typeof at>[][]): TempoScoreLike {
  return { tempo, masterBars: automations.map((tempoAutomations) => ({ tempoAutomations })) };
}

describe('barStartTempos', () => {
  it('uses the score tempo for every bar when nothing changes', () => {
    expect(barStartTempos(score(120, [[], [], []]))).toEqual([120, 120, 120]);
  });

  it('lets an automation on bar 1 override the score tempo', () => {
    expect(barStartTempos(score(120, [[at(100)], []]))).toEqual([100, 100]);
  });

  it('carries a downbeat change forward until the next one', () => {
    expect(barStartTempos(score(120, [[], [at(90)], [], [at(140)], []]))).toEqual([
      120, 90, 90, 140, 140,
    ]);
  });

  it('applies a mid-bar change from the next bar on', () => {
    expect(barStartTempos(score(120, [[at(80, 0.5)], [], []]))).toEqual([120, 80, 80]);
  });

  it('uses the last of several changes in a bar, in position order', () => {
    const tempos = barStartTempos(score(120, [[at(70, 0.75), at(100), at(60, 0.25)], []]));
    expect(tempos).toEqual([100, 70]);
  });

  it('returns nothing for a score with no bars', () => {
    expect(barStartTempos(score(120, []))).toEqual([]);
  });
});

describe('tempoAtBar', () => {
  const tempos = [120, 120, 90];

  it('reads 1-based bar numbers', () => {
    expect(tempoAtBar(tempos, 1)).toBe(120);
    expect(tempoAtBar(tempos, 3)).toBe(90);
  });

  it('is null for bars the song lacks', () => {
    expect(tempoAtBar(tempos, 0)).toBeNull();
    expect(tempoAtBar(tempos, 4)).toBeNull();
    expect(tempoAtBar(tempos, 1.5)).toBeNull();
    expect(tempoAtBar([], 1)).toBeNull();
  });
});

describe('bpmAtSpeed', () => {
  it('is the tempo times the ratio, to whole BPM', () => {
    expect(bpmAtSpeed(120, 1)).toBe(120);
    expect(bpmAtSpeed(120, 0.5)).toBe(60);
    expect(bpmAtSpeed(90, 0.85)).toBe(77);
    expect(bpmAtSpeed(90, 2)).toBe(180);
    expect(bpmAtSpeed(133, 0.25)).toBe(33);
  });
});
