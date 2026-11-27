import { expect, it } from 'vitest';
import {
  fullSpeedFraction,
  fullSpeedLabel,
  isMastered,
  masteryFraction,
  masteryLine,
  masteryOf,
  masterySummary,
  songMastery,
} from './mastery';

it('counts each song’s finished loops out of all of them', () => {
  const bySong = songMastery([
    { song_id: 'a', status: 'finished' },
    { song_id: 'a', status: 'active' },
    { song_id: 'b', status: 'finished' },
  ]);
  expect(bySong.get('a')).toEqual({ finished: 1, total: 2 });
  expect(bySong.get('b')).toEqual({ finished: 1, total: 1 });
  expect(bySong.has('c')).toBe(false);
  expect(masteryOf([{ status: 'active' }, { status: 'finished' }])).toEqual({
    finished: 1,
    total: 2,
  });
});

it.each([
  [{ finished: 0, total: 0 }, 'No loops yet', false, 0],
  [{ finished: 0, total: 1 }, '0 of 1 loop mastered', false, 0],
  [{ finished: 2, total: 4 }, '2 of 4 loops mastered', false, 0.5],
  [{ finished: 3, total: 3 }, 'Mastered', true, 1],
])('%j reads "%s"', (mastery, line, mastered, fraction) => {
  expect(masteryLine(mastery)).toBe(line);
  expect(isMastered(mastery)).toBe(mastered);
  expect(masteryFraction(mastery)).toBe(fraction);
});

it('summarises a song for its header', () => {
  expect(masterySummary({ finished: 2, total: 4 })).toBe('2 of 4 mastered');
});

it.each([
  [92, '8% to full speed', 0.92],
  [100, 'Full speed', 1],
  [110, '10% over full speed', 1],
  [25, '75% to full speed', 0.25],
])('%i%% is "%s"', (percent, label, fraction) => {
  expect(fullSpeedLabel(percent)).toBe(label);
  expect(fullSpeedFraction(percent)).toBe(fraction);
});
