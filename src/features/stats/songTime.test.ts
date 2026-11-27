import { describe, expect, it } from 'vitest';
import { timeBySong, type SongTimeLoop } from './songTime';
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
