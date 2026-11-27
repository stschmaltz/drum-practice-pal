import { describe, expect, it } from 'vitest';
import { inTimeZone } from '@/test/timeZone';
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

describe('at each threshold', () => {
  it.each([
    ['hours-1', 3599, false],
    ['hours-1', 3600, true],
    ['hours-10', 36_000 - 1, false],
    ['hours-10', 36_000, true],
    ['hours-50', 180_000, true],
  ] as const)('%s with %i s of play is earned: %s', (id, seconds, earned) => {
    // Split over two sessions on one day: the sum counts, not any one session.
    const half = Math.floor(seconds / 2);
    const sessions = [session(day(1), half), session(day(1), seconds - half)];
    expect(byId({ sessions, loops: [] })[id]?.earned).toBe(earned);
  });

  it.each([
    ['passes-100', 99, false],
    ['passes-100', 100, true],
    ['passes-1000', 999, false],
    ['passes-1000', 1000, true],
  ] as const)('%s with %i passes is earned: %s', (id, passes, earned) => {
    const sessions = [session(day(1), 60, passes - 1), session(day(2), 60, 1)];
    expect(byId({ sessions, loops: [] })[id]?.earned).toBe(earned);
  });

  it.each([
    [2, false],
    [3, true],
  ])('streak-3 with %i days in a row is earned: %s', (days, earned) => {
    const sessions = Array.from({ length: days }, (_, i) => session(day(10 + i)));
    expect(byId({ sessions, loops: [] })['streak-3']?.earned).toBe(earned);
  });

  it.each([
    [6, false],
    [7, true],
  ])('streak-7 with %i days in a row is earned: %s', (days, earned) => {
    const sessions = Array.from({ length: days }, (_, i) => session(day(1 + i)));
    expect(byId({ sessions, loops: [] })['streak-7']?.earned).toBe(earned);
  });

  it('streak-30 runs across the end of a month', () => {
    const sessions = Array.from({ length: 30 }, (_, i) =>
      session(new Date(2026, 9, 20 + i, 12).toISOString()),
    );
    expect(byId({ sessions, loops: [] })['streak-30']).toMatchObject({ earned: true, current: 30 });
    expect(byId({ sessions: sessions.slice(1), loops: [] })['streak-30']).toMatchObject({
      earned: false,
      progressLabel: '29 of 30 days in a row',
    });
  });

  it.each([
    [4, false],
    [5, true],
  ])('mastered-5 with %i finished loops is earned: %s', (finished, earned) => {
    const loops = Array.from({ length: finished }, (_, i) => ({
      song_id: `s${i}`,
      status: 'finished' as const,
    }));
    expect(byId({ sessions: [], loops })['mastered-5']?.earned).toBe(earned);
  });

  it('a song with no loops is never mastered', () => {
    expect(
      byId({ sessions: [], loops: [{ song_id: 'a', status: 'active' }] })['song-mastered'],
    ).toMatchObject({ earned: false });
  });
});

// A streak badge across a change of clocks, in zones that have one (streak.test.ts).
describe.each([
  ['Europe/London', [2026, 10, 25]],
  ['America/New_York', [2026, 11, 1]],
  ['Australia/Sydney', [2026, 4, 5]],
] as const)('in %s', (zone, [y, m, d]) => {
  inTimeZone(zone);

  it('three days running through the 25-hour day earn the 3-day streak, at night and early morning', () => {
    const sessions = [
      session(new Date(y, m - 1, d - 1, 23, 30).toISOString()),
      session(new Date(y, m - 1, d, 23, 30).toISOString()),
      session(new Date(y, m - 1, d + 1, 0, 30).toISOString()),
    ];
    expect(byId({ sessions, loops: [] })['streak-3']?.earned).toBe(true);
  });

  it('two sessions on the 25-hour day, 24 hours apart, are one day', () => {
    const sessions = [
      session(new Date(y, m - 1, d, 0, 30).toISOString()),
      session(new Date(y, m - 1, d, 23, 30).toISOString()),
      session(new Date(y, m - 1, d + 1, 12).toISOString()),
    ];
    expect(byId({ sessions, loops: [] })['streak-3']).toMatchObject({ earned: false, current: 2 });
  });
});
