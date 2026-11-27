/**
 * "Where the time went": play time per song in the chosen period (Unit 17).
 * Pure. A session belongs to its loop's song.
 */
import { inRange, rangeStart, type StatsRange, type StatsSession } from './totals';

/** A loop as this needs it: which song it is in, and the song's name. */
export interface SongTimeLoop {
  id: string;
  song_id: string;
  song: { title: string };
}

export interface SongTime {
  songId: string;
  title: string;
  seconds: number;
}

export interface TimeBySong {
  /** The songs with the most play time, most first. */
  songs: SongTime[];
  /**
   * Everything past the songs listed, as one row: how many more songs, and
   * their play time. Null when every song is listed.
   */
  other: { songs: number; seconds: number } | null;
  /** All play time in the period: the rows and "Other" add up to it. */
  totalSeconds: number;
}

/** How many songs get a bar of their own before the rest are "Other". */
export const SONG_TIME_SHOWN = 5;

/**
 * Play time per song in the range, most first (then by title, so equal times
 * keep their order between renders). A session whose loop isn't in the list
 * (deleted on another device, the cache not caught up) counts towards "Other"
 * rather than vanishing, so the rows still add up to the period's total.
 */
export function timeBySong(
  sessions: readonly StatsSession[],
  loops: readonly SongTimeLoop[],
  range: StatsRange,
  now: Date,
  shown = SONG_TIME_SHOWN,
): TimeBySong {
  const start = rangeStart(range, now);
  const loopsById = new Map(loops.map((loop) => [loop.id, loop]));
  const bySong = new Map<string, SongTime>();
  let unknownSeconds = 0;
  let totalSeconds = 0;
  for (const session of sessions) {
    if (!inRange(session.started_at, start)) continue;
    totalSeconds += session.duration_seconds;
    const loop = loopsById.get(session.loop_id);
    if (!loop) {
      unknownSeconds += session.duration_seconds;
      continue;
    }
    const song = bySong.get(loop.song_id) ?? {
      songId: loop.song_id,
      title: loop.song.title,
      seconds: 0,
    };
    song.seconds += session.duration_seconds;
    bySong.set(loop.song_id, song);
  }
  const ranked = [...bySong.values()].sort(
    (a, b) =>
      b.seconds - a.seconds || a.title.localeCompare(b.title) || a.songId.localeCompare(b.songId),
  );
  const rest = ranked.slice(shown);
  const otherSeconds = rest.reduce((total, song) => total + song.seconds, 0) + unknownSeconds;
  return {
    songs: ranked.slice(0, shown),
    other:
      rest.length > 0 || unknownSeconds > 0 ? { songs: rest.length, seconds: otherSeconds } : null,
    totalSeconds,
  };
}
