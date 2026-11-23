import {
  clampVolume,
  DEFAULT_PLAYER_OPTIONS,
  effectiveMetronomeVolume,
  playerOptionsFromSettings,
} from './playerOptions';

describe('playerOptionsFromSettings', () => {
  it('takes the metronome and drum defaults and starts at 100%', () => {
    expect(
      playerOptionsFromSettings({
        metronome_on: false,
        metronome_volume: 0.4,
        drums_muted_default: true,
        count_in_bars: 2,
        count_in_mode: 'every_repeat',
      }),
    ).toEqual({
      speedRatio: 1,
      metronomeOn: false,
      metronomeVolume: 0.4,
      drumsMuted: true,
      countInBars: 2,
      countInMode: 'every_repeat',
    });
  });

  it('clamps an out-of-range volume', () => {
    const options = playerOptionsFromSettings({
      metronome_on: true,
      metronome_volume: 3,
      drums_muted_default: false,
      count_in_bars: 0,
      count_in_mode: 'start',
    });
    expect(options.metronomeVolume).toBe(1);
  });

  it('treats a count-in length the app does not offer as off', () => {
    const options = playerOptionsFromSettings({
      metronome_on: true,
      metronome_volume: 0.8,
      drums_muted_default: false,
      count_in_bars: 5,
      count_in_mode: 'start',
    });
    expect(options.countInBars).toBe(0);
  });
});

describe('DEFAULT_PLAYER_OPTIONS', () => {
  it('matches the user_settings column defaults', () => {
    // supabase/migrations/20261122000000_schema.sql: metronome_on true, volume 0.8, drums unmuted,
    // count-in off at start.
    expect(DEFAULT_PLAYER_OPTIONS).toEqual({
      speedRatio: 1,
      metronomeOn: true,
      metronomeVolume: 0.8,
      drumsMuted: false,
      countInBars: 0,
      countInMode: 'start',
    });
  });
});

describe('clampVolume', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [2, 1],
    [Number.NaN, 1],
  ])('clamps %f to %f', (input, expected) => {
    expect(clampVolume(input)).toBe(expected);
  });
});

describe('effectiveMetronomeVolume', () => {
  it('is silent while off and the set volume while on', () => {
    expect(effectiveMetronomeVolume({ metronomeOn: false, metronomeVolume: 0.7 })).toBe(0);
    expect(effectiveMetronomeVolume({ metronomeOn: true, metronomeVolume: 0.7 })).toBe(0.7);
  });
});
