import { describe, expect, it, vi } from 'vitest';
import { inBrowserLocale } from '@/test/browserLocale';
import {
  axisDates,
  dateSpan,
  dayOfMonth,
  narrowWeekday,
  shortDate,
  shortMonth,
  weekdayDate,
} from './dateLabels';

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

// Copilot review on #32: a formatter was built for every date written, hundreds a render
// with a heatmap and a year-long chart on show.
it('builds one formatter per locale and shape, however many dates it writes', () => {
  const Original = Intl.DateTimeFormat;
  let built = 0;
  // A counting stand-in that still constructs the real thing (a spy can't be called with `new`).
  vi.stubGlobal('Intl', {
    ...Intl,
    DateTimeFormat: function (...args: ConstructorParameters<typeof Original>) {
      built++;
      return new Original(...args);
    },
  });
  try {
    // A locale nothing else in this file uses, so the count starts from none.
    for (let day = 1; day <= 28; day++) {
      shortDate(new Date(2026, 1, day), now, 'fr-CA');
      weekdayDate(new Date(2026, 1, day), now, 'fr-CA');
    }
    expect(built).toBe(2);
    shortDate(new Date(2025, 1, 1), now, 'fr-CA');
    expect(built).toBe(3);
  } finally {
    vi.unstubAllGlobals();
  }
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

// Unit 20, batch 9 (17 QA issue 4): the page's sentences are English, and a German
// browser wrote "the week of 8. Juni." into them, the date's own full stop before the
// sentence's.
describe('with the browser set to German', () => {
  inBrowserLocale('de');
  const june = new Date(2026, 5, 8);

  it('still writes every date in English, left to itself', () => {
    expect(shortDate(june, now)).toBe('Jun 8');
    expect(shortDate(new Date(2025, 11, 31), now)).toBe('Dec 31, 2025');
    expect(weekdayDate(new Date(2026, 10, 14), now)).toBe('Sat, Nov 14');
    expect(dateSpan(new Date(2026, 10, 3), new Date(2026, 10, 9), now)).toBe('Nov 3 – Nov 9');
    expect(axisDates(new Date(2025, 10, 28), new Date(2026, 10, 27))).toEqual([
      'Nov 28, 2025',
      'Nov 27, 2026',
    ]);
  });

  it('writes the charts’ own marks in English too: a weekday’s letter, a month, a day of the month', () => {
    // A Monday to a Sunday.
    const week = Array.from({ length: 7 }, (_, index) => new Date(2026, 5, 8 + index));
    expect(week.map(narrowWeekday)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(Array.from({ length: 12 }, (_, month) => shortMonth(new Date(2026, month, 1)))).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    expect(dayOfMonth(june)).toBe('8');
  });

  // 17 QA round 1: "…, the week of 8. Juni.." The sentence brings the only full stop.
  it('ends no date in a full stop, in any month, with a weekday or a year', () => {
    for (let month = 0; month < 12; month++) {
      for (const year of [2025, 2026]) {
        const date = new Date(year, month, 14);
        for (const written of [shortDate(date, now), weekdayDate(date, now)]) {
          expect(written).not.toMatch(/\./);
        }
      }
    }
  });
});
