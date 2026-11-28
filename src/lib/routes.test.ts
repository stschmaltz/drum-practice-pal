import { expect, it } from 'vitest';
import {
  editLoopPath,
  legacyLoopRedirect,
  libraryRedirect,
  loopPracticePath,
  newLoopPath,
  showsScore,
  songPath,
  songPlayPath,
  songSourcePath,
} from './routes';

const SONG = '11111111-1111-4111-8111-111111111111';
const LOOP = '22222222-2222-4222-8222-222222222222';

it('builds the three levels under a song', () => {
  expect(songPath(SONG)).toBe(`/songs/${SONG}`);
  expect(songPlayPath(SONG)).toBe(`/songs/${SONG}/play`);
  expect(loopPracticePath(SONG, LOOP)).toBe(`/songs/${SONG}/loops/${LOOP}`);
  expect(newLoopPath(SONG)).toBe(`/songs/${SONG}/play?new=1`);
  expect(editLoopPath(SONG, LOOP)).toBe(`/songs/${SONG}/play?edit=${LOOP}`);
  expect(songSourcePath(SONG, 'drumless')).toBe(`/songs/${SONG}/play?source=drumless`);
});

it('sends an old ?loop= link to the loop’s practice screen', () => {
  expect(legacyLoopRedirect(SONG, new URLSearchParams(`loop=${LOOP}`))).toBe(
    loopPracticePath(SONG, LOOP),
  );
});

it.each([
  ['no parameter', SONG, ''],
  ['a loop id that isn’t one', SONG, 'loop=1%27%20or%201=1'],
  ['an empty loop id', SONG, 'loop='],
  ['a song id that isn’t one', 'nope', `loop=${LOOP}`],
])('ignores %s', (_case, songId, search) => {
  expect(legacyLoopRedirect(songId, new URLSearchParams(search))).toBeNull();
});

it('keeps the library’s search and sort on its way to the songs list', () => {
  expect(libraryRedirect('?q=fill&sort=added')).toBe('/?q=fill&sort=added');
  expect(libraryRedirect('')).toBe('/');
});

it.each([
  [songPlayPath(SONG), true],
  [`${songPlayPath(SONG)}/`, true],
  [loopPracticePath(SONG, LOOP), true],
  [songPath(SONG), false],
  ['/', false],
  ['/stats', false],
  ['/settings', false],
  [`${songPath(SONG)}/loops`, false],
])('%s draws the score: %s', (pathname, expected) => {
  expect(showsScore(pathname)).toBe(expected);
});
