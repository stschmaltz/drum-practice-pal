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
    const many = Array.from({ length: 7 }, (_, index) => loop(`l${index}`, `s${index}`));
    const time = timeBySong(
      many.map((each, index) => session(each.id, at(2026, 11, 25), (7 - index) * 100)),
      many,
      'week',
      now,
    );
    // The sixth and seventh songs, 200 and 100 seconds, against the first's 700.
    expect(barShare(time.other!.seconds, songBarScale(time))).toBeCloseTo(300 / 700);
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

  // Unit 20, batch 9 (17 QA): "Other (1 song)" took a row to hide one name.
  it('lists a single sixth song by name: a row of its own is no shorter as "Other"', () => {
    const six = songs(6);
    const time = timeBySong(
      six.map((each, index) => session(each.id, at(2026, 11, 25), (6 - index) * 60)),
      six,
      'week',
      now,
    );
    expect(time.songs.map((song) => song.title)).toEqual([...firstFive, 'Song 5']);
    expect(time.songs[5]).toEqual({ songId: 's5', title: 'Song 5', seconds: 60 });
    expect(time.other).toBeNull();
    expect(time.songs.reduce((total, song) => total + song.seconds, 0)).toBe(time.totalSeconds);
  });

  it('sums two or more past the fifth as Other, never one', () => {
    for (const count of [7, 8, 12]) {
      const many = songs(count);
      const time = timeBySong(
        many.map((each, index) => session(each.id, at(2026, 11, 25), (count - index) * 60)),
        many,
        'week',
        now,
      );
      expect(time.songs.map((song) => song.title)).toEqual(firstFive);
      expect(time.other?.songs).toBe(count - 5);
    }
  });

  it('names the sixth song beside an Other that holds only sessions of unknown loops', () => {
    const six = songs(6);
    const time = timeBySong(
      [
        ...six.map((each, index) => session(each.id, at(2026, 11, 25), (6 - index) * 60)),
        session('gone', at(2026, 11, 25), 30),
      ],
      six,
      'week',
      now,
    );
    expect(time.songs.map((song) => song.title)).toEqual([...firstFive, 'Song 5']);
    // No song is in it, so it is plain "Other": the rows still add up to the total.
    expect(time.other).toEqual({ songs: 0, seconds: 30 });
    expect(otherSongsLabel(time.other!.songs)).toBe('Other');
    expect(time.songs.reduce((total, song) => total + song.seconds, 0) + 30).toBe(
      time.totalSeconds,
    );
  });

  it('keeps to the limit it is given: one past it is named, two are Other', () => {
    const four = songs(4);
    const sessions = four.map((each, index) =>
      session(each.id, at(2026, 11, 25), (4 - index) * 60),
    );
    expect(timeBySong(sessions, four, 'week', now, 3).songs).toHaveLength(4);
    const two = timeBySong(sessions, four, 'week', now, 2);
    expect(two.songs).toHaveLength(2);
    expect(two.other).toEqual({ songs: 2, seconds: 120 + 60 });
  });

  it('cuts a tie at the fifth place by title, the same whatever order the loops come in', () => {
    const seven = songs(7);
    const sessions = seven.map((each) => session(each.id, at(2026, 11, 25), 60));
    const forwards = timeBySong(sessions, seven, 'week', now);
    const backwards = timeBySong([...sessions].reverse(), [...seven].reverse(), 'week', now);
    expect(forwards.songs.map((song) => song.title)).toEqual(firstFive);
    expect(backwards).toEqual(forwards);
  });

  // Unit 20, batch 9 Test: exactly six, the last two level.
  it('names all six when the fifth and sixth tie, by title, whatever order the loops come in', () => {
    const six = songs(6);
    // Four songs ahead, then two with the same time: neither is cut, so the tie decides only the order.
    const sessions = six.map((each, index) =>
      session(each.id, at(2026, 11, 25), index < 4 ? (6 - index) * 60 : 60),
    );
    const forwards = timeBySong(sessions, six, 'week', now);
    const backwards = timeBySong([...sessions].reverse(), [...six].reverse(), 'week', now);
    expect(forwards.songs.map((song) => song.title)).toEqual([...firstFive, 'Song 5']);
    expect(forwards.other).toBeNull();
    expect(backwards).toEqual(forwards);
    // All six level: still six names, in title order.
    const level = timeBySong(
      six.map((each) => session(each.id, at(2026, 11, 25), 60)).reverse(),
      [...six].reverse(),
      'week',
      now,
    );
    expect(level.songs.map((song) => song.title)).toEqual([...firstFive, 'Song 5']);
    expect(level.other).toBeNull();
  });

  it('goes from five names to six to five and Other as the period takes in a sixth and a seventh song', () => {
    const seven = songs(7);
    const sessions = [
      ...seven.slice(0, 5).map((each, index) => session(each.id, at(2026, 11, 25), 600 - index)),
      // The sixth song three weeks ago, the seventh in the summer.
      session('l5', at(2026, 11, 5), 90),
      session('l6', at(2026, 7, 1), 30),
    ];
    const week = timeBySong(sessions, seven, 'week', now);
    expect(week.songs.map((song) => song.title)).toEqual(firstFive);
    expect(week.other).toBeNull();

    const month = timeBySong(sessions, seven, 'month', now);
    expect(month.songs.map((song) => song.title)).toEqual([...firstFive, 'Song 5']);
    expect(month.other).toBeNull();

    const all = timeBySong(sessions, seven, 'all', now);
    expect(all.songs.map((song) => song.title)).toEqual(firstFive);
    expect(all.other).toEqual({ songs: 2, seconds: 120 });
    for (const time of [week, month, all]) {
      expect(
        time.songs.reduce((total, song) => total + song.seconds, 0) + (time.other?.seconds ?? 0),
      ).toBe(time.totalSeconds);
    }
  });

  it('counts seven songs of which one has no time in the period as six, all named', () => {
    const seven = songs(7);
    const sessions = [
      ...seven.slice(0, 6).map((each, index) => session(each.id, at(2026, 11, 25), 600 - index)),
      session('l6', at(2026, 7, 1), 9000),
    ];
    const week = timeBySong(sessions, seven, 'week', now);
    expect(week.songs.map((song) => song.title)).toEqual([...firstFive, 'Song 5']);
    expect(week.other).toBeNull();
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
    // All time it leads, and all six are named: one song is never "Other".
    const all = timeBySong(sessions, six, 'all', now);
    expect(all.songs[0]).toMatchObject({ title: 'Song 5', seconds: 9000 });
    expect(all.songs).toHaveLength(6);
    expect(all.other).toBeNull();
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
