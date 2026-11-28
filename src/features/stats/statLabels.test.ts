import { describe, expect, it } from 'vitest';
import { inBrowserLocale } from '@/test/browserLocale';
import { barMinutesLabel, clockLabel, countLabel, daysLabel, minutesLabel } from './statLabels';

it('daysLabel', () => {
  expect(daysLabel(1)).toBe('1 day');
  expect(daysLabel(4)).toBe('4 days');
});

it.each([
  [0, '0:00'],
  [9, '0:09'],
  [252, '4:12'],
  [3600 + 4 * 60 + 12, '1:04:12'],
])('clockLabel(%i) is %s', (seconds, label) => {
  expect(clockLabel(seconds)).toBe(label);
});

// 17 QA issue 2: a 45-second session read "0 min" beside "1 day", and "<1" on its bar.
it.each([
  [0, '0 min'],
  [1, '<1 min'],
  [45, '<1 min'],
  [59, '<1 min'],
  [60, '1 min'],
  [119, '1 min'],
  [45 * 60, '45 min'],
  [2 * 3600, '2 h'],
  [2 * 3600 + 5 * 60 + 30, '2 h 5 min'],
  [-5, '0 min'],
])('minutesLabel(%i) is %s', (seconds, label) => {
  expect(minutesLabel(seconds)).toBe(label);
});

it.each([
  [0, '0'],
  [45, '<1'],
  [60, '1'],
  [12 * 60 + 59, '12'],
  // A bar counts in minutes however long the day: there is no room for "1 h 15 min" over it.
  [75 * 60, '75'],
])('barMinutesLabel(%i) is %s, agreeing with minutesLabel under an hour', (seconds, label) => {
  expect(barMinutesLabel(seconds)).toBe(label);
  if (seconds < 3600) expect(minutesLabel(seconds)).toBe(`${label} min`);
});

// Unit 20, batch 9 (17 QA round 1, issue 1): "1,100" days beside "1100 h" and a
// "1100-day streak". Every count goes through `countLabel`, grouped as English is.
describe('counts of a thousand or more', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [1100, '1,100'],
    [1234567, '1,234,567'],
  ])('countLabel(%i) is %s', (value, label) => {
    expect(countLabel(value)).toBe(label);
  });

  it('are grouped in days, hours and a bar’s minutes alike', () => {
    expect(daysLabel(1100)).toBe('1,100 days');
    expect(minutesLabel(1100 * 3600)).toBe('1,100 h');
    expect(minutesLabel(1100 * 3600 + 5 * 60)).toBe('1,100 h 5 min');
    expect(barMinutesLabel(1100 * 60)).toBe('1,100');
  });

  describe('with the browser set to German', () => {
    inBrowserLocale('de');

    it('are still grouped the English way, since the words around them are English', () => {
      expect(countLabel(1100)).toBe('1,100');
      expect(daysLabel(1100)).toBe('1,100 days');
      expect(minutesLabel(1100 * 3600)).toBe('1,100 h');
    });
  });
});
