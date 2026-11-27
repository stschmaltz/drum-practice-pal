import { describe, expect, it } from 'vitest';
import { axisDates, dateSpan, shortDate, weekdayDate } from './dateLabels';

const now = new Date(2026, 10, 26, 18);

it('writes a day of this year without the year, and of another with it', () => {
  expect(shortDate(new Date(2026, 10, 3), now, 'en-GB')).toBe('3 Nov');
  expect(shortDate(new Date(2025, 11, 31), now, 'en-GB')).toBe('31 Dec 2025');
  expect(shortDate(new Date(2026, 10, 3), now, 'en-US')).toBe('Nov 3');
});

it('names a single day with its weekday', () => {
  expect(weekdayDate(new Date(2026, 10, 14), now, 'en-GB')).toBe('Sat 14 Nov');
  expect(weekdayDate(new Date(2025, 10, 14), now, 'en-GB')).toBe('Fri, 14 Nov 2025');
});

it('writes a span, or one date when it starts and ends on the same day', () => {
  expect(dateSpan(new Date(2026, 10, 3), new Date(2026, 10, 9), now, 'en-GB')).toBe(
    '3 Nov – 9 Nov',
  );
  expect(dateSpan(new Date(2026, 10, 3), new Date(2026, 10, 3), now, 'en-GB')).toBe('3 Nov');
  expect(dateSpan(new Date(2025, 11, 30), new Date(2026, 0, 2), now, 'en-GB')).toBe(
    '30 Dec 2025 – 2 Jan',
  );
});

// 17 QA issue 1: a first date with its year ran under the next one.
describe('axisDates', () => {
  it('writes the two ends of a chart without a year when both are in one year', () => {
    expect(axisDates(new Date(2026, 1, 14), new Date(2026, 10, 27), 'en-GB')).toEqual([
      '14 Feb',
      '27 Nov',
    ]);
    // Even a year that isn't this one: the two dates place the line between them.
    expect(axisDates(new Date(2024, 1, 14), new Date(2024, 10, 27), 'en-GB')).toEqual([
      '14 Feb',
      '27 Nov',
    ]);
  });

  it('gives both their year when the line crosses a new year', () => {
    expect(axisDates(new Date(2025, 10, 28), new Date(2026, 10, 27), 'en-GB')).toEqual([
      '28 Nov 2025',
      '27 Nov 2026',
    ]);
    expect(axisDates(new Date(2025, 11, 31), new Date(2026, 0, 1), 'en-US')).toEqual([
      'Dec 31, 2025',
      'Jan 1, 2026',
    ]);
  });
});
