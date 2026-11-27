import { expect, it } from 'vitest';
import { dateSpan, shortDate, weekdayDate } from './dateLabels';

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
