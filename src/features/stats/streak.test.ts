import { describe, expect, it } from 'vitest';
import { addDays, dateOfDayKey, dayKeyOf, nextDayKey } from './days';
import { currentStreak, daysLabel, longestStreak, practiceDayKeys } from './streak';
import { hoursInLocalDay, inTimeZone } from '@/test/timeZone';

// Local-time dates throughout, so the tests mean the same in every zone. The
// summer-time cases cross the dates Europe and North America change their
// clocks; in a zone that changes then, a day is 23 or 25 hours long there.
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);
const session = (date: Date) => ({ started_at: date.toISOString() });

describe('days', () => {
  it('keys a local day, and steps by the calendar', () => {
    expect(dayKeyOf(at(2026, 3, 5))).toBe('2026-03-05');
    expect(nextDayKey('2026-12-31')).toBe('2027-01-01');
    expect(dayKeyOf(addDays(at(2026, 3, 1), -1))).toBe('2026-02-28');
    expect(dateOfDayKey('2026-11-26').getTime()).toBe(new Date(2026, 10, 26).getTime());
  });

  it.each([
    ['spring forward (Europe)', at(2026, 3, 28), '2026-03-29', '2026-03-30'],
    ['fall back (Europe)', at(2026, 10, 24), '2026-10-25', '2026-10-26'],
    ['spring forward (North America)', at(2026, 3, 7), '2026-03-08', '2026-03-09'],
    ['fall back (North America)', at(2026, 10, 31), '2026-11-01', '2026-11-02'],
  ])('steps across %s one day at a time', (_name, from, second, third) => {
    expect(dayKeyOf(addDays(from, 1))).toBe(second);
    expect(dayKeyOf(addDays(from, 2))).toBe(third);
    expect(nextDayKey(second)).toBe(third);
  });
});

describe('currentStreak', () => {
  const now = at(2026, 11, 26, 9);

  it('is 0 with no sessions, or none today or yesterday', () => {
    expect(currentStreak([], now)).toBe(0);
    expect(currentStreak([session(at(2026, 11, 24))], now)).toBe(0);
  });

  it('counts back from today', () => {
    const days = [at(2026, 11, 26, 8), at(2026, 11, 25), at(2026, 11, 24), at(2026, 11, 22)];
    expect(currentStreak(days.map(session), now)).toBe(3);
  });

  it('still runs this morning when the last session was yesterday', () => {
    const days = [at(2026, 11, 25, 22), at(2026, 11, 24)];
    expect(currentStreak(days.map(session), now)).toBe(2);
  });

  it('a gap of one day ends it', () => {
    const days = [at(2026, 11, 26, 8), at(2026, 11, 24), at(2026, 11, 23)];
    expect(currentStreak(days.map(session), now)).toBe(1);
  });

  it('counts several sessions on one day once', () => {
    const days = [at(2026, 11, 26, 7), at(2026, 11, 26, 8), at(2026, 11, 25, 20)];
    expect(currentStreak(days.map(session), now)).toBe(2);
  });

  it('goes by local midnight: 23:59 and 00:01 are two days', () => {
    const days = [at(2026, 11, 25, 23, 59), at(2026, 11, 26, 0, 1)];
    expect(currentStreak(days.map(session), at(2026, 11, 26, 0, 2))).toBe(2);
    expect(practiceDayKeys(days.map(session)).size).toBe(2);
  });

  it.each([
    ['Europe', at(2026, 3, 30, 8), [at(2026, 3, 28, 23), at(2026, 3, 29, 1), at(2026, 3, 30, 7)]],
    [
      'North America',
      at(2026, 11, 2, 8),
      [at(2026, 10, 31, 23), at(2026, 11, 1, 1), at(2026, 11, 2)],
    ],
  ])('runs through a summer-time change (%s)', (_name, today, days) => {
    expect(currentStreak(days.map(session), today)).toBe(3);
  });
});

describe('longestStreak', () => {
  it('finds the longest run anywhere in the history', () => {
    const days = [
      at(2026, 1, 1),
      at(2026, 1, 2),
      at(2026, 1, 3),
      at(2026, 1, 4),
      at(2026, 1, 10),
      at(2026, 1, 11),
    ];
    expect(longestStreak(days.map(session))).toBe(4);
  });

  it('runs across a month and a year end', () => {
    const days = [at(2025, 12, 30), at(2025, 12, 31), at(2026, 1, 1)];
    expect(longestStreak(days.map(session))).toBe(3);
  });

  it('is 0 with nothing, 1 with one day', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak([session(at(2026, 5, 5))])).toBe(1);
  });
});

it('daysLabel', () => {
  expect(daysLabel(1)).toBe('1 day');
  expect(daysLabel(4)).toBe('4 days');
});

// The cases above run in whatever zone the machine is in, which may never
// change its clocks (CI runs in UTC). These pin zones that do, both
// hemispheres. The 25-hour day is the one that catches stepping by 24 hours:
// from 23:30 on the day the clocks go back, 24 hours earlier is still that day.
describe.each([
  ['Europe/London', { fallBack: [2026, 10, 25], springForward: [2026, 3, 29] }],
  ['America/New_York', { fallBack: [2026, 11, 1], springForward: [2026, 3, 8] }],
  ['Australia/Sydney', { fallBack: [2026, 4, 5], springForward: [2026, 10, 4] }],
] as const)('in %s', (zone, { fallBack, springForward }) => {
  inTimeZone(zone);
  const changes = [
    ['the clocks go back', fallBack],
    ['the clocks go forward', springForward],
  ] as const;

  it('has a 25-hour and a 23-hour day where the tests expect them', () => {
    expect(hoursInLocalDay(at(fallBack[0], fallBack[1], fallBack[2]))).toBe(25);
    expect(hoursInLocalDay(at(springForward[0], springForward[1], springForward[2]))).toBe(23);
  });

  it.each(changes)('late on the day %s, counts that day once and the two before', (_, change) => {
    const [y, m, d] = change;
    const days = [at(y, m, d - 2, 21), at(y, m, d - 1, 0, 30), at(y, m, d, 1, 30)];
    expect(currentStreak(days.map(session), at(y, m, d, 23, 30))).toBe(3);
    expect(longestStreak(days.map(session))).toBe(3);
    expect(practiceDayKeys(days.map(session)).size).toBe(3);
  });

  it.each(changes)('just after midnight following the day %s, still runs', (_, change) => {
    const [y, m, d] = change;
    const days = [at(y, m, d - 1, 20), at(y, m, d, 23, 45)];
    expect(currentStreak(days.map(session), at(y, m, d + 1, 0, 15))).toBe(2);
  });

  it.each(changes)('a day off on the day %s ends the streak', (_, change) => {
    const [y, m, d] = change;
    const days = [at(y, m, d - 1, 23, 50), at(y, m, d + 1, 0, 10)];
    expect(currentStreak(days.map(session), at(y, m, d + 1, 9))).toBe(1);
    expect(longestStreak(days.map(session))).toBe(1);
  });
});
