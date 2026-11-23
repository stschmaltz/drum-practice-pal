import { barIndexAtPoint, type SystemBoundsLike } from './barHitTest';

/** Two systems of two bars, 200 px wide each, 100 px tall, the second 120 px down. */
const systems: SystemBoundsLike[] = [
  {
    realBounds: { x: 0, y: 0, w: 400, h: 100 },
    bars: [
      { index: 0, realBounds: { x: 0, y: 0, w: 200, h: 100 } },
      { index: 1, realBounds: { x: 200, y: 0, w: 200, h: 100 } },
    ],
  },
  {
    realBounds: { x: 0, y: 120, w: 400, h: 100 },
    bars: [
      { index: 2, realBounds: { x: 0, y: 120, w: 200, h: 100 } },
      { index: 3, realBounds: { x: 200, y: 120, w: 200, h: 100 } },
    ],
  },
];

describe('barIndexAtPoint', () => {
  it('finds the bar under the point in each system', () => {
    expect(barIndexAtPoint(systems, 10, 10)).toBe(0);
    expect(barIndexAtPoint(systems, 390, 90)).toBe(1);
    expect(barIndexAtPoint(systems, 100, 150)).toBe(2);
    expect(barIndexAtPoint(systems, 300, 219)).toBe(3);
  });

  it('gives a shared edge to the bar that starts there', () => {
    expect(barIndexAtPoint(systems, 200, 50)).toBe(1);
    expect(barIndexAtPoint(systems, 0, 120)).toBe(2);
  });

  it('is null outside every bar', () => {
    expect(barIndexAtPoint(systems, 100, 110)).toBeNull(); // between systems
    expect(barIndexAtPoint(systems, 400, 50)).toBeNull(); // right of the last bar
    expect(barIndexAtPoint(systems, -1, 50)).toBeNull();
    expect(barIndexAtPoint(systems, 100, 500)).toBeNull(); // below the score
    expect(barIndexAtPoint([], 10, 10)).toBeNull(); // nothing rendered yet
  });

  it('uses each bar index as rendered, not its position in the system', () => {
    const horizontal: SystemBoundsLike[] = [
      {
        realBounds: { x: 0, y: 0, w: 900, h: 100 },
        bars: [
          { index: 7, realBounds: { x: 0, y: 0, w: 300, h: 100 } },
          { index: 8, realBounds: { x: 300, y: 0, w: 600, h: 100 } },
        ],
      },
    ];
    expect(barIndexAtPoint(horizontal, 650, 40)).toBe(8);
  });
});
