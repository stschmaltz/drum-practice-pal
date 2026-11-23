import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COUNT_IN_BAR_OPTIONS,
  COUNT_IN_MODES,
  GP_FILES_BUCKET,
  GP_FILE_MAX_BYTES,
  METRONOME_VOLUME_MAX,
  METRONOME_VOLUME_MIN,
  LOOP_NAME_MAX_LENGTH,
  SONG_TEMPO_MAX,
  SONG_TEXT_MAX_LENGTH,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
  isCountInBars,
  isCountInMode,
  isValidBarRange,
  isValidMetronomeVolume,
  isValidSpeedRatio,
  songFilePath,
} from './schema';

// jsdom gives import.meta.url an http URL, so resolve from the repo root Vitest runs in.
const readMigration = (file: string) =>
  readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8');

describe('songFilePath', () => {
  it('builds {user_id}/{song_id}.gp', () => {
    expect(songFilePath('user-1', 'song-1')).toBe('user-1/song-1.gp');
  });
});

describe('isValidSpeedRatio', () => {
  it.each([0.25, 0.5, 1, 1.75, 2])('accepts %s', (ratio) => {
    expect(isValidSpeedRatio(ratio)).toBe(true);
  });

  it.each([0, 0.24, 2.01, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (ratio) => {
    expect(isValidSpeedRatio(ratio)).toBe(false);
  });
});

describe('isValidBarRange', () => {
  it.each([
    [1, 1, 1],
    [1, 16, 16],
    [5, 8, 16],
  ])('accepts %i to %i of %i bars', (start, end, count) => {
    expect(isValidBarRange(start, end, count)).toBe(true);
  });

  it.each([
    [0, 4, 16],
    [5, 4, 16],
    [1, 17, 16],
    [1.5, 4, 16],
    [1, 4.5, 16],
  ])('rejects %s to %s of %i bars', (start, end, count) => {
    expect(isValidBarRange(start, end, count)).toBe(false);
  });
});

describe('isValidMetronomeVolume', () => {
  it.each([0, 0.5, 1])('accepts %s', (volume) => {
    expect(isValidMetronomeVolume(volume)).toBe(true);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (volume) => {
    expect(isValidMetronomeVolume(volume)).toBe(false);
  });
});

describe('isCountInBars', () => {
  it.each([0, 1, 2])('accepts %i', (bars) => {
    expect(isCountInBars(bars)).toBe(true);
  });

  it.each([-1, 3, 1.5, Number.NaN])('rejects %s', (bars) => {
    expect(isCountInBars(bars)).toBe(false);
  });
});

describe('isCountInMode', () => {
  it.each(['start', 'every_repeat'])('accepts %s', (mode) => {
    expect(isCountInMode(mode)).toBe(true);
  });

  it.each(['', 'every', 'START'])('rejects %j', (mode) => {
    expect(isCountInMode(mode)).toBe(false);
  });
});

// The constants mirror SQL checks; these fail if one side changes without the other.
describe('matches the migrations', () => {
  const schema = readMigration('20261122000000_schema.sql');
  const storage = readMigration('20261122000100_storage.sql');

  it('speed ratio bounds', () => {
    const check = `speed_ratio between ${SPEED_RATIO_MIN} and ${SPEED_RATIO_MAX.toFixed(1)}`;
    expect(schema).toContain(check);
  });

  it('count-in options', () => {
    expect(schema).toContain(`count_in_bars in (${COUNT_IN_BAR_OPTIONS.join(', ')})`);
  });

  it('metronome volume bounds', () => {
    expect(schema).toContain(
      `metronome_volume between ${METRONOME_VOLUME_MIN} and ${METRONOME_VOLUME_MAX}`,
    );
  });

  it('count-in modes', () => {
    const modes = COUNT_IN_MODES.map((mode) => `'${mode}'`).join(', ');
    expect(schema).toContain(`create type public.count_in_mode as enum (${modes})`);
  });

  it('text lengths', () => {
    expect(schema).toContain(`char_length(title) between 1 and ${SONG_TEXT_MAX_LENGTH}`);
    expect(schema).toContain(`char_length(name) between 1 and ${LOOP_NAME_MAX_LENGTH}`);
  });

  it('bucket name and file size limit', () => {
    expect(storage).toContain(`values ('${GP_FILES_BUCKET}', '${GP_FILES_BUCKET}'`);
    const megabytes = /false, (\d+) \* 1024 \* 1024\)/.exec(storage)?.[1];
    expect(Number(megabytes) * 1024 * 1024).toBe(GP_FILE_MAX_BYTES);
  });

  it('song tempo bound', () => {
    expect(schema).toContain(`original_tempo > 0 and original_tempo <= ${SONG_TEMPO_MAX}`);
  });
});
