import { expect, it } from 'vitest';
import { barMinutesLabel, clockLabel, daysLabel, minutesLabel } from './statLabels';

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
