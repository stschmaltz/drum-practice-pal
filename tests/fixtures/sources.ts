/**
 * Synthetic fixture songs, written in alphaTex and exported to GP7 by
 * scripts/generate-fixtures.ts. Each entry records what tests should expect
 * after the file is loaded back in.
 */

export interface FixtureSource {
  /** File name without extension; output goes to tests/fixtures/gp/<name>.gp */
  name: string;
  tex: string;
  expected: {
    title: string;
    barCount: number;
    tempoAtBar1: number;
    /** 1-based bar number -> tempo that bar starts at, for songs with tempo changes */
    tempoChanges?: Record<number, number>;
    trackCount: number;
    drumTrackIndex: number | null;
    timeSignature: [number, number];
    /** 1-based bar numbers in the order they play, for a song with repeats. */
    playOrder?: number[];
  };
}

const DRUM_HEADER =
  '\\track "Drums" \\instrument percussion \\clef neutral \\articulation defaults';

/** One bar of a basic rock beat in 4/4: eighth-note hats, kick on 1 and 3, snare on 2 and 4. */
const ROCK_BAR_44 =
  '(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 ' +
  '(KickHit HiHatClosed).8 (KickHit HiHatClosed).8 (SnareHit HiHatClosed).8 HiHatClosed.8 |';

/** One bar of a waltz beat in 3/4. */
const WALTZ_BAR_34 =
  '(KickHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 (SnareHit HiHatClosed).8 HiHatClosed.8 |';

const repeat = (bar: string, times: number) => Array.from({ length: times }, () => bar).join(' ');

export const fixtures: FixtureSource[] = [
  {
    name: 'groove-120',
    tex: [
      '\\title "Groove 120"',
      '\\artist "Fixture"',
      '\\tempo 120',
      DRUM_HEADER,
      repeat(ROCK_BAR_44, 16),
    ].join('\n'),
    expected: {
      title: 'Groove 120',
      barCount: 16,
      tempoAtBar1: 120,
      trackCount: 1,
      drumTrackIndex: 0,
      timeSignature: [4, 4],
    },
  },
  {
    name: 'tempo-change',
    tex: [
      '\\title "Tempo Change"',
      '\\artist "Fixture"',
      '\\tempo 120',
      DRUM_HEADER,
      repeat(ROCK_BAR_44, 8),
      '\\tempo 90',
      repeat(ROCK_BAR_44, 8),
    ].join('\n'),
    expected: {
      title: 'Tempo Change',
      barCount: 16,
      tempoAtBar1: 120,
      tempoChanges: { 9: 90 },
      trackCount: 1,
      drumTrackIndex: 0,
      timeSignature: [4, 4],
    },
  },
  {
    name: 'multi-track',
    tex: [
      '\\title "Multi Track"',
      '\\artist "Fixture"',
      '\\tempo 100',
      DRUM_HEADER,
      repeat(ROCK_BAR_44, 8),
      '\\track "Bass" \\instrument 33 \\tuning (G2 D2 A1 E1)',
      repeat('0.4.4 0.4 3.4 5.4 |', 8),
      '\\track "Guitar" \\instrument 30 \\tuning (E4 B3 G3 D3 A2 E2)',
      repeat('(0.6 2.5 2.4).4 (0.6 2.5 2.4) (3.6 5.5 5.4) (5.6 7.5 7.4) |', 8),
    ].join('\n'),
    expected: {
      title: 'Multi Track',
      barCount: 8,
      tempoAtBar1: 100,
      trackCount: 3,
      drumTrackIndex: 0,
      timeSignature: [4, 4],
    },
  },
  {
    name: 'waltz-34',
    tex: [
      '\\title "Waltz 3-4"',
      '\\artist "Fixture"',
      '\\tempo 140',
      DRUM_HEADER,
      '\\ts (3 4)',
      repeat(WALTZ_BAR_34, 12),
    ].join('\n'),
    expected: {
      title: 'Waltz 3-4',
      barCount: 12,
      tempoAtBar1: 140,
      trackCount: 1,
      drumTrackIndex: 0,
      timeSignature: [3, 4],
    },
  },
  {
    // No percussion track: uploads with drum_track_index null (Unit 04).
    name: 'no-drums',
    tex: [
      '\\title "No Drums"',
      '\\artist "Fixture"',
      '\\tempo 110',
      '\\track "Guitar" \\instrument 30 \\tuning (E4 B3 G3 D3 A2 E2)',
      repeat('(0.6 2.5 2.4).4 (0.6 2.5 2.4) (3.6 5.5 5.4) (5.6 7.5 7.4) |', 4),
    ].join('\n'),
    expected: {
      title: 'No Drums',
      barCount: 4,
      tempoAtBar1: 110,
      trackCount: 1,
      drumTrackIndex: null,
      timeSignature: [4, 4],
    },
  },
  {
    // Bars 3 and 4 play twice, so alphaTab's tick cache lists them twice (Unit 08).
    name: 'repeats',
    tex: [
      '\\title "Repeats"',
      '\\artist "Fixture"',
      '\\tempo 120',
      DRUM_HEADER,
      repeat(ROCK_BAR_44, 2),
      `\\ro ${ROCK_BAR_44}`,
      `\\rc 2 ${ROCK_BAR_44}`,
      repeat(ROCK_BAR_44, 4),
    ].join('\n'),
    expected: {
      title: 'Repeats',
      barCount: 8,
      tempoAtBar1: 120,
      trackCount: 1,
      drumTrackIndex: 0,
      timeSignature: [4, 4],
      playOrder: [1, 2, 3, 4, 3, 4, 5, 6, 7, 8],
    },
  },
];
