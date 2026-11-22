import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COUNT_IN_BAR_OPTIONS,
  GP_FILES_BUCKET,
  LOOP_NAME_MAX_LENGTH,
  SONG_TEXT_MAX_LENGTH,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
  isValidBarRange,
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

  it('text lengths', () => {
    expect(schema).toContain(`char_length(title) between 1 and ${SONG_TEXT_MAX_LENGTH}`);
    expect(schema).toContain(`char_length(name) between 1 and ${LOOP_NAME_MAX_LENGTH}`);
  });

  it('bucket name', () => {
    expect(storage).toContain(`values ('${GP_FILES_BUCKET}', '${GP_FILES_BUCKET}'`);
  });
});
