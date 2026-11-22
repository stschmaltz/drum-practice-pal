import {
  SETTINGS_FIELDS,
  SETTINGS_SELECT,
  changedSettings,
  percentToVolume,
  validateSettings,
  volumeToPercent,
  type Settings,
} from './settingsForm';

const defaults: Settings = {
  metronome_on: true,
  metronome_volume: 0.8,
  count_in_bars: 0,
  count_in_mode: 'start',
  drums_muted_default: false,
};

describe('validateSettings', () => {
  it('accepts the DB defaults', () => {
    expect(validateSettings(defaults)).toEqual({});
  });

  it('accepts the volume and count-in limits', () => {
    expect(validateSettings({ ...defaults, metronome_volume: 0, count_in_bars: 2 })).toEqual({});
    expect(
      validateSettings({ ...defaults, metronome_volume: 1, count_in_mode: 'every_repeat' }),
    ).toEqual({});
  });

  it.each([-0.01, 1.01, Number.NaN])('rejects volume %s', (volume) => {
    expect(validateSettings({ ...defaults, metronome_volume: volume })).toEqual({
      metronome_volume: 'Volume must be between 0% and 100%.',
    });
  });

  it.each([-1, 3, 1.5])('rejects %s count-in bars', (bars) => {
    expect(validateSettings({ ...defaults, count_in_bars: bars })).toHaveProperty('count_in_bars');
  });

  it('rejects an unknown count-in mode', () => {
    const settings = { ...defaults, count_in_mode: 'sometimes' } as unknown as Settings;
    expect(validateSettings(settings)).toHaveProperty('count_in_mode');
  });
});

describe('changedSettings', () => {
  it('is empty when nothing changed', () => {
    expect(changedSettings(defaults, { ...defaults })).toEqual({});
  });

  it('includes only the changed fields, false and 0 included', () => {
    const saved = { ...defaults, metronome_on: true, count_in_bars: 2 };
    expect(
      changedSettings(saved, {
        ...saved,
        metronome_on: false,
        count_in_bars: 0,
        metronome_volume: 0.8,
      }),
    ).toEqual({ metronome_on: false, count_in_bars: 0 });
  });
});

describe('volume percent', () => {
  it.each([
    [0, 0],
    [0.8, 80],
    [1, 100],
    [0.333, 33],
  ])('%s is %i%%', (volume, percent) => {
    expect(volumeToPercent(volume)).toBe(percent);
  });

  it.each([
    [0, 0],
    [80, 0.8],
    [100, 1],
    [33.4, 0.33],
  ])('%s%% is %s', (percent, volume) => {
    expect(percentToVolume(percent)).toBe(volume);
  });
});

it('SETTINGS_SELECT lists exactly SETTINGS_FIELDS', () => {
  expect(SETTINGS_SELECT.split(', ')).toEqual([...SETTINGS_FIELDS]);
});
