import { barsAroundLoop } from './practiceView';

describe('barsAroundLoop', () => {
  it.each([
    [{ startBar: 5, endBar: 8 }, 16, { startBar: 4, endBar: 9 }],
    [{ startBar: 1, endBar: 4 }, 16, { startBar: 1, endBar: 5 }],
    [{ startBar: 13, endBar: 16 }, 16, { startBar: 12, endBar: 16 }],
    [{ startBar: 7, endBar: 7 }, 16, { startBar: 6, endBar: 8 }],
    [{ startBar: 1, endBar: 1 }, 1, { startBar: 1, endBar: 1 }],
    [{ startBar: 1, endBar: 16 }, 16, { startBar: 1, endBar: 16 }],
  ])('around %o of %i bars, draws %o', (loop, barCount, drawn) => {
    expect(barsAroundLoop(loop, barCount)).toEqual(drawn);
  });

  it('never draws past the song when the loop is from a longer version of it', () => {
    expect(barsAroundLoop({ startBar: 10, endBar: 20 }, 12)).toEqual({ startBar: 9, endBar: 12 });
  });
});
