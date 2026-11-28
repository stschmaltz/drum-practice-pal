import { BAR_ONE_SECONDS_MAX } from '@/lib/schema';
import { clockLabel, parseVideoClock, toMilliseconds, videoClockLabel } from './videoClock';

describe('a video’s clock as text', () => {
  it.each([
    [0, '0:00'],
    [90, '1:30'],
    [3723, '1:02:03'],
  ])('shows %s whole seconds as %s', (seconds, label) => {
    expect(clockLabel(seconds)).toBe(label);
  });

  it.each([
    [0, '0:00.00'],
    [7.25, '0:07.25'],
    [7.432, '0:07.43'],
    [59.999, '1:00.00'],
    [75.5, '1:15.50'],
    [3723.5, '1:02:03.50'],
  ])('shows %s s as %s', (seconds, label) => {
    expect(videoClockLabel(seconds)).toBe(label);
  });

  it('rounds to the millisecond', () => {
    expect(toMilliseconds(7.4321)).toBe(7.432);
    expect(toMilliseconds(0.1 + 0.2)).toBe(0.3);
  });
});

// Shane, after trying it: "let's allow users to enter a timestamp directly".
describe('a typed time for bar 1', () => {
  it.each([
    ['7', 7],
    ['7.25', 7.25],
    ['7,25', 7.25],
    ['0:07', 7],
    ['0:07.25', 7.25],
    ['1:15.5', 75.5],
    ['01:15', 75],
    ['1:02:03.5', 3723.5],
    [' 0:07.25 ', 7.25],
    ['90', 90],
    ['90s', 90],
    ['1m30s', 90],
    ['1m30.5s', 90.5],
    ['2m', 120],
    ['0', 0],
    ['7.4321', 7.432],
    // What the line shows reads back as itself.
    [videoClockLabel(3723.5), 3723.5],
  ])('reads %j as %s seconds', (text, seconds) => {
    expect(parseVideoClock(text)).toBe(seconds);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['-5'],
    ['1:75'],
    ['1:60:00'],
    ['1:2:3:4'],
    ['1:'],
    [':30'],
    ['1..5'],
    ['1e3'],
    ['Infinity'],
    ['0x10'],
    [String(BAR_ONE_SECONDS_MAX + 1)],
    ['99:59:59'],
  ])('refuses %j', (text) => {
    expect(parseVideoClock(text)).toBeNull();
  });

  // YouTube's own way of writing a time, hours included (19 QA issue 14).
  it.each([
    ['1h2m3s', 3723],
    ['1h', 3600],
    ['2h30m', 9000],
    ['1h5s', 3605],
    ['1h2m3.5s', 3723.5],
    ['1h0m0s', 3600],
    ['12h', 43200],
    ['90s', 90],
    ['90m', 5400],
    ['1m59.9s', 119.9],
    ['0h59m59s', 3599],
  ])('reads %j, with its units, as %s seconds', (text, seconds) => {
    expect(parseVideoClock(text)).toBe(seconds);
  });

  it.each([
    ['1m90s'],
    ['1m60s'],
    ['1h60m'],
    ['1h90m'],
    ['1h2m60s'],
    ['1h90s'],
    ['13h'],
    ['12h0m1s'],
    ['h'],
    ['1h2s3m'],
    ['1m2h'],
    ['1.5h'],
    ['1.5m'],
    ['1h 2m'],
  ])('refuses %j: a part after a larger one counts in sixties, in a fixed order', (text) => {
    expect(parseVideoClock(text)).toBeNull();
  });
});
