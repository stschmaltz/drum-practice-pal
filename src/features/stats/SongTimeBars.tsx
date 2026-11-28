import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { nameLinkClass } from '@/components/styles';
import { songPath } from '@/lib/routes';
import { barShare, otherSongsLabel, songBarScale, timeBySong } from './songTime';
import { minutesLabel } from './statLabels';
import type { StatsData } from './statsData';
import type { StatsRange } from './totals';

/** "Where the time went": play time per song in the period, as bars with their minutes, most first. */
export function SongTimeBars({
  sessions,
  loops,
  range,
  now,
}: StatsData & { range: StatsRange; now: Date }) {
  const time = timeBySong(sessions, loops, range, now);
  const { songs, other } = time;
  // The longest named song's time, never Other's (17 QA issue 9).
  const scale = songBarScale(time);
  if (scale === 0) {
    return <p className="text-ink-muted">No practice in this period.</p>;
  }
  return (
    <ol aria-label="Practice time by song" className="flex flex-col">
      {songs.map((song) => (
        <SongTimeRow key={song.songId} seconds={song.seconds} scale={scale}>
          <Link to={songPath(song.songId)} title={song.title} className={nameLinkClass}>
            <span className="truncate">{song.title}</span>
          </Link>
        </SongTimeRow>
      ))}
      {other && (
        <SongTimeRow seconds={other.seconds} scale={scale} muted>
          <span className="inline-flex min-h-touch items-center text-ink-soft">
            {otherSongsLabel(other.songs)}
          </span>
        </SongTimeRow>
      )}
    </ol>
  );
}

function SongTimeRow({
  seconds,
  scale,
  muted = false,
  children,
}: {
  seconds: number;
  /** The play time a full-width bar stands for. */
  scale: number;
  /** "Other": several songs together, drawn apart from the songs and never wider than the widest. */
  muted?: boolean;
  children: ReactNode;
}) {
  // To a hundredth of a percent, so 540 of 600 is "90%", not 90.00000000000001.
  const width = Math.round(barShare(seconds, scale) * 10_000) / 100;
  return (
    <li className="flex flex-col pb-2" data-testid="song-time">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 font-medium">{children}</span>
        <span className="shrink-0 text-sm text-ink-soft tabular-nums">{minutesLabel(seconds)}</span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full min-w-1 rounded-full ${muted ? 'bg-ink-muted' : 'bg-selected-line'}`}
          style={{ width: `${width}%` }}
          data-testid="song-bar"
        />
      </div>
    </li>
  );
}
