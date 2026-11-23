import { selectionHint, tapBar, type RangeSelection } from './rangeSelection';

describe('tapBar', () => {
  it('the first tap picks that bar alone and waits for the other end', () => {
    expect(tapBar(null, 5)).toEqual({ startBar: 5, endBar: 5, awaitingEnd: true });
  });

  it('the second tap makes the range', () => {
    expect(tapBar(tapBar(null, 5), 8)).toEqual({ startBar: 5, endBar: 8, awaitingEnd: false });
  });

  it('puts the bars in order when the last bar was tapped first', () => {
    expect(tapBar(tapBar(null, 8), 5)).toEqual({ startBar: 5, endBar: 8, awaitingEnd: false });
  });

  it('the same bar twice is a one-bar loop', () => {
    expect(tapBar(tapBar(null, 5), 5)).toEqual({ startBar: 5, endBar: 5, awaitingEnd: false });
  });

  it('a tap on a finished selection starts again from that bar', () => {
    const done: RangeSelection = { startBar: 5, endBar: 8, awaitingEnd: false };
    expect(tapBar(done, 11)).toEqual({ startBar: 11, endBar: 11, awaitingEnd: true });
  });

  it('three taps: range, then a fresh start', () => {
    const taps = [3, 6, 2].reduce<RangeSelection | null>(tapBar, null);
    expect(taps).toEqual({ startBar: 2, endBar: 2, awaitingEnd: true });
  });
});

describe('selectionHint', () => {
  it('asks for the first bar, mentioning a drag only where there is a mouse', () => {
    expect(selectionHint(null, false)).toBe('Tap the first bar on the score, then the last.');
    expect(selectionHint(null, true)).toContain('drag across the bars');
  });

  it('asks for the last bar once the first is picked', () => {
    expect(selectionHint(tapBar(null, 5), true)).toBe(
      'Now tap the last bar, or save this one bar.',
    );
  });

  it('says how to start over once the range is made', () => {
    const done: RangeSelection = { startBar: 5, endBar: 8, awaitingEnd: false };
    expect(selectionHint(done, false)).toBe('Tap a bar to start again.');
  });
});
