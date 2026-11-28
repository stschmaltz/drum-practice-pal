import { describe, expect, it } from 'vitest';
import { barShare, otherSongsLabel, songBarScale, timeBySong, type SongTimeLoop } from './songTime';
import type { StatsSession } from './totals';

const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour);
// A Thursday.
const now = at(2026, 11, 26, 18);

let nextId = 0;
function session(loop_id: string, date: Date, duration_seconds: number): StatsSession {
  nextId += 1;
  return {
    id: `s${nextId}`,
    loop_id,
    started_at: date.toISOString(),
    duration_seconds,
    speed_ratio: 0.8,
    repeats: 1,
  };
}

const loop = (id: string, song_id: string, title = `Song ${song_id}`): SongTimeLoop => ({
  id,
  song_id,
  song: { title },
});

it.each([
  [0, 'Other'],
  [1, 'Other (1 song)'],
  [7, 'Other (7 songs)'],
])('otherSongsLabel(%i) is "%s"', (songs, label) => {
  expect(otherSongsLabel(songs)).toBe(label);
});

describe('timeBySong', () => {
  const loops = [loop('verse', 'x'), loop('chorus', 'x'), loop('fill', 'y'), loop('idle', 'z')];

  it('adds a song’s loops together, most play time first, and leaves out a song with none', () => {
    const time = timeBySong(
      [
        session('verse', at(2026, 11, 26), 300),
        session('fill', at(2026, 11, 25), 500),
        session('chorus', at(2026, 11, 24), 400),
      ],
      loops,
      'week',
      now,
    );
    expect(time.songs).toEqual([
      { songId: 'x', title: 'Song x', seconds: 700 },
      { songId: 'y', title: 'Song y', seconds: 500 },
    ]);
    expect(time.other).toBeNull();
    expect(time.totalSeconds).toBe(1200);
  });

  it('counts only the chosen period, from midnight of its first day', () => {
    const sessions = [
      session('verse', new Date(2026, 10, 20, 0, 0), 100),
      session('verse', new Date(2026, 10, 19, 23, 59), 1000),
      session('fill', at(2026, 6, 1), 5000),
    ];
    expect(timeBySong(sessions, loops, 'week', now).songs).toEqual([
      { songId: 'x', title: 'Song x', seconds: 100 },
    ]);
    expect(timeBySong(sessions, loops, 'month', now).songs.map((song) => song.seconds)).toEqual([
      1100,
    ]);
    expect(timeBySong(sessions, loops, 'all', now).songs.map((song) => song.songId)).toEqual([
      'y',
      'x',
    ]);
  });

  it('is empty with nothing practised in the period', () => {
    expect(timeBySong([session('verse', at(2026, 1, 1), 60)], loops, 'week', now)).toEqual({
      songs: [],
      other: null,
      totalSeconds: 0,
    });
  });

  it('lists five songs and sums the rest as Other, the parts adding up to the total', () => {
    const many = Array.from({ length: 8 }, (_, index) => loop(`l${index}`, `s${index}`));
    const sessions = many.map((each, index) =>
      session(each.id, at(2026, 11, 25), (index + 1) * 60),
    );
    const time = timeBySong(sessions, many, 'week', now);
    expect(time.songs.map((song) => song.seconds)).toEqual([480, 420, 360, 300, 240]);
    expect(time.other).toEqual({ songs: 3, seconds: 180 + 120 + 60 });
    expect(
      time.songs.reduce((total, song) => total + song.seconds, 0) + (time.other?.seconds ?? 0),
    ).toBe(time.totalSeconds);
  });

  it('has no Other for exactly five songs', () => {
    const five = Array.from({ length: 5 }, (_, index) => loop(`l${index}`, `s${index}`));
    const time = timeBySong(
      five.map((each) => session(each.id, at(2026, 11, 25), 60)),
      five,
      'week',
      now,
    );
    expect(time.songs).toHaveLength(5);
    expect(time.other).toBeNull();
  });

  it('orders equal times by title', () => {
    const time = timeBySong(
      [session('b', at(2026, 11, 25), 60), session('a', at(2026, 11, 25), 60)],
      [loop('b', '2', 'Beta'), loop('a', '1', 'Alpha')],
      'week',
      now,
    );
    expect(time.songs.map((song) => song.title)).toEqual(['Alpha', 'Beta']);
  });

  it('keeps a session whose loop is not in the list under Other, so the total still adds up', () => {
    const time = timeBySong(
      [session('verse', at(2026, 11, 25), 300), session('gone', at(2026, 11, 25), 120)],
      loops,
      'week',
      now,
    );
    expect(time.songs).toHaveLength(1);
    expect(time.other).toEqual({ songs: 0, seconds: 120 });
    expect(time.totalSeconds).toBe(420);
  });
});

// 17 QA issue 9: with twelve songs "Other" was the full bar and the five named ones a sliver each.
describe('songBarScale and barShare', () => {
  it('scales the bars to the named song with the most time, whatever Other adds up to', () => {
    const many = Array.from({ length: 12 }, (_, index) => loop(`l${index}`, `s${index}`));
    // Seven songs past the fifth, together far more than the longest named one.
    const time = timeBySong(
      many.map((each, index) => session(each.id, at(2026, 11, 25), index < 5 ? 600 - index : 500)),
      many,
      'week',
      now,
    );
    expect(time.other?.seconds).toBe(3500);
    const scale = songBarScale(time);
    expect(scale).toBe(600);
    expect(barShare(time.songs[0]!.seconds, scale)).toBe(1);
    expect(barShare(300, scale)).toBe(0.5);
    // "Other" is as wide as the widest bar at most: it never sets the scale and never runs past it.
    expect(barShare(time.other!.seconds, scale)).toBe(1);
  });

  it('gives a smaller Other its own share', () => {
    const many = Array.from({ length: 6 }, (_, index) => loop(`l${index}`, `s${index}`));
    const time = timeBySong(
      many.map((each, index) => session(each.id, at(2026, 11, 25), (6 - index) * 100)),
      many,
      'week',
      now,
    );
    expect(barShare(time.other!.seconds, songBarScale(time))).toBeCloseTo(100 / 600);
  });

  it('falls back to Other when no song is named, and to nothing with no time at all', () => {
    const unknownOnly = timeBySong([session('gone', at(2026, 11, 25), 120)], [], 'week', now);
    expect(songBarScale(unknownOnly)).toBe(120);
    expect(barShare(120, 120)).toBe(1);
    expect(songBarScale(timeBySong([], [], 'week', now))).toBe(0);
    expect(barShare(0, 0)).toBe(0);
  });
});

// Unit 17 Test: the cut at five, and what a period leaves out.
describe('timeBySong, the sixth song and the period', () => {
  const songs = (count: number) =>
    Array.from({ length: count }, (_, index) => loop(`l${index}`, `s${index}`, `Song ${index}`));
  const firstFive = ['Song 0', 'Song 1', 'Song 2', 'Song 3', 'Song 4'];

  it('makes a single sixth song "Other" with one song in it', () => {
    const six = songs(6);
    const time = timeBySong(
      six.map((each, index) => session(each.id, at(2026, 11, 25), (6 - index) * 60)),
      six,
      'week',
      now,
    );
    expect(time.songs.map((song) => song.title)).toEqual(firstFive);
    expect(time.other).toEqual({ songs: 1, seconds: 60 });
  });

  it('cuts a tie at the fifth place by title, the same whatever order the loops come in', () => {
    const six = songs(6);
    const sessions = six.map((each) => session(each.id, at(2026, 11, 25), 60));
    const forwards = timeBySong(sessions, six, 'week', now);
    const backwards = timeBySong([...sessions].reverse(), [...six].reverse(), 'week', now);
    expect(forwards.songs.map((song) => song.title)).toEqual(firstFive);
    expect(backwards).toEqual(forwards);
  });

  it('leaves a song with no time in the period out of the rows, out of Other and out of the total', () => {
    const six = songs(6);
    const sessions = [
      ...six.slice(0, 5).map((each) => session(each.id, at(2026, 11, 25), 120)),
      // The sixth song, and plenty of it, but a month ago.
      session('l5', at(2026, 10, 20), 9000),
    ];
    const week = timeBySong(sessions, six, 'week', now);
    expect(week.songs).toHaveLength(5);
    expect(week.other).toBeNull();
    expect(week.totalSeconds).toBe(600);
    // All time it leads, and the last of the five that tie is the one song in Other.
    const all = timeBySong(sessions, six, 'all', now);
    expect(all.songs[0]).toMatchObject({ title: 'Song 5', seconds: 9000 });
    expect(all.other).toEqual({ songs: 1, seconds: 120 });
  });

  it('counts songs past the fifth and sessions of unknown loops in one Other, naming only the songs', () => {
    const seven = songs(7);
    const time = timeBySong(
      [
        ...seven.map((each, index) => session(each.id, at(2026, 11, 25), (7 - index) * 60)),
        session('gone', at(2026, 11, 25), 30),
      ],
      seven,
      'week',
      now,
    );
    expect(time.other).toEqual({ songs: 2, seconds: 120 + 60 + 30 });
    expect(
      time.songs.reduce((total, song) => total + song.seconds, 0) + (time.other?.seconds ?? 0),
    ).toBe(time.totalSeconds);
  });

  it('starts the week and the month at midnight across the end of a year', () => {
    const january = at(2027, 1, 3, 9);
    const sessions = [
      session('verse', new Date(2026, 11, 28, 0, 0), 100),
      session('verse', new Date(2026, 11, 27, 23, 59), 1000),
      session('fill', new Date(2026, 11, 5, 0, 0), 10),
      session('fill', new Date(2026, 11, 4, 23, 59), 5000),
    ];
    const list = [loop('verse', 'x'), loop('fill', 'y')];
    expect(timeBySong(sessions, list, 'week', january)).toMatchObject({
      songs: [{ songId: 'x', seconds: 100 }],
      totalSeconds: 100,
    });
    expect(timeBySong(sessions, list, 'month', january)).toMatchObject({
      songs: [
        { songId: 'x', seconds: 1100 },
        { songId: 'y', seconds: 10 },
      ],
      totalSeconds: 1110,
    });
  });
});
