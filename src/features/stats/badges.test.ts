import { describe, expect, it } from 'vitest';
import { BADGES, badgeProgress, newlyEarned, type BadgeInput } from './badges';

const day = (n: number) => new Date(2026, 10, n, 12).toISOString();
const session = (started: string, duration_seconds = 60, repeats = 1) => ({
  started_at: started,
  duration_seconds,
  repeats,
});

const byId = (input: BadgeInput) =>
  Object.fromEntries(badgeProgress(input).map((badge) => [badge.id, badge]));

describe('badgeProgress', () => {
  it('lists every badge in a fixed order, none earned at the start', () => {
    const badges = badgeProgress({ sessions: [], loops: [] });
    expect(badges.map((badge) => badge.id)).toEqual(BADGES.map((badge) => badge.id));
    expect(badges.every((badge) => !badge.earned && badge.current === 0)).toBe(true);
    expect(badges.map((badge) => badge.label)).toEqual([
      '3-day streak',
      '7-day streak',
      '30-day streak',
      '1 hour practised',
      '10 hours practised',
      '50 hours practised',
      '100 passes',
      '1,000 passes',
      'First loop mastered',
      '5 loops mastered',
      'Song mastered',
    ]);
  });

  it('earns streaks from the longest run, which a day off does not take back', () => {
    const badges = byId({
      sessions: [session(day(1)), session(day(2)), session(day(3)), session(day(10))],
      loops: [],
    });
    expect(badges['streak-3']).toMatchObject({ earned: true, current: 3 });
    expect(badges['streak-7']).toMatchObject({
      earned: false,
      current: 3,
      progressLabel: '3 of 7 days in a row',
    });
  });

  it('counts hours and passes, with progress that stops at the target', () => {
    const badges = byId({
      sessions: [session(day(1), 2400, 60), session(day(2), 2400, 60)],
      loops: [],
    });
    expect(badges['hours-1']).toMatchObject({
      earned: true,
      current: 1,
      progressLabel: '60 of 60 min',
    });
    expect(badges['hours-10']).toMatchObject({ earned: false, progressLabel: '1 of 10 hours' });
    expect(badges['passes-100']).toMatchObject({ earned: true, current: 100 });
    expect(badges['passes-1000']).toMatchObject({
      earned: false,
      progressLabel: '120 of 1,000 passes',
    });
  });

  it('shows the first hour in minutes', () => {
    expect(byId({ sessions: [session(day(1), 36 * 60 + 59)], loops: [] })['hours-1']).toMatchObject(
      {
        earned: false,
        progressLabel: '36 of 60 min',
      },
    );
  });

  it('counts mastered loops, and a song only once every one of its loops is', () => {
    const half = byId({
      sessions: [],
      loops: [
        { song_id: 'a', status: 'finished' },
        { song_id: 'a', status: 'active' },
        { song_id: 'b', status: 'finished' },
      ],
    });
    expect(half['mastered-1']?.earned).toBe(true);
    expect(half['mastered-5']).toMatchObject({ earned: false, current: 2 });
    // Song b has one loop, and it's finished.
    expect(half['song-mastered']?.earned).toBe(true);

    const none = byId({ sessions: [], loops: [{ song_id: 'a', status: 'active' }] });
    expect(none['song-mastered']?.earned).toBe(false);
  });
});

describe('newlyEarned', () => {
  it('names only what the new session earned', () => {
    const before: BadgeInput = {
      sessions: [session(day(1), 3000, 95), session(day(2), 100, 1)],
      loops: [],
    };
    const after: BadgeInput = {
      ...before,
      sessions: [...before.sessions, session(day(3), 700, 10)],
    };
    expect(newlyEarned(before, after).map((badge) => badge.id)).toEqual([
      'streak-3',
      'hours-1',
      'passes-100',
    ]);
    expect(newlyEarned(after, after)).toEqual([]);
  });
});
