import { describe, expect, it } from 'vitest';
import {
  approxTextWidth,
  axisDatesShown,
  bestDayIndex,
  boxesOverlap,
  clearLabels,
  dottedDays,
  percentLabelOrder,
  textBox,
  SPEED_DOTS_MAX_DAYS,
  SPEED_LABEL_ALL_MAX_DAYS,
  type Box,
} from './speedChartLayout';

const range = (count: number) => Array.from({ length: count }, (_, index) => index);
const box = (x: number, y: number, width = 20, height = 10): Box => ({ x, y, width, height });
const ascending = (indexes: Iterable<number>) => [...indexes].sort((a, b) => a - b);

describe('bestDayIndex', () => {
  it('is the highest day, the latest of equals, and -1 with no days', () => {
    expect(bestDayIndex([60, 85, 70])).toBe(1);
    expect(bestDayIndex([60, 85, 70, 85])).toBe(3);
    expect(bestDayIndex([80])).toBe(0);
    expect(bestDayIndex([])).toBe(-1);
  });
});

describe('dottedDays', () => {
  it('dots every day up to thirty', () => {
    expect([...dottedDays(1, 0)]).toEqual([0]);
    expect(ascending(dottedDays(9, 4))).toEqual(range(9));
    expect(ascending(dottedDays(SPEED_DOTS_MAX_DAYS, 3))).toEqual(range(30));
  });

  it('past thirty dots only the first, the last and the best day', () => {
    expect(ascending(dottedDays(31, 12))).toEqual([0, 12, 30]);
    expect(ascending(dottedDays(336, 200))).toEqual([0, 200, 335]);
    // A line that ends on its best day has two dots, not three.
    expect(ascending(dottedDays(336, 335))).toEqual([0, 335]);
  });

  it('is nothing for no days', () => {
    expect(dottedDays(0, -1).size).toBe(0);
  });
});

describe('percentLabelOrder', () => {
  const spread = (count: number, step: number) => range(count).map((index) => index * step);

  it('up to eight days offers every day with room, the last, first and best ahead of the rest', () => {
    const xs = spread(SPEED_LABEL_ALL_MAX_DAYS, 40);
    expect(percentLabelOrder(xs, 5, 34)).toEqual([7, 0, 5, 1, 2, 3, 4, 6]);
    // Days too close to one already offered are left out: only every other one fits here.
    expect(percentLabelOrder(spread(5, 20), 4, 34)).toEqual([4, 0, 2]);
  });

  it('from nine days offers only the last, the first and the best', () => {
    expect(percentLabelOrder(spread(9, 100), 3, 34)).toEqual([8, 0, 3]);
    expect(percentLabelOrder(spread(30, 100), 3, 34)).toEqual([29, 0, 3]);
    expect(percentLabelOrder(spread(336, 1), 200, 34)).toEqual([335, 0, 200]);
  });

  it('names a day once when it is two of the three', () => {
    expect(percentLabelOrder(spread(40, 5), 39, 34)).toEqual([39, 0]);
    expect(percentLabelOrder(spread(40, 5), 0, 34)).toEqual([39, 0]);
    expect(percentLabelOrder([118], 0, 34)).toEqual([0]);
    expect(percentLabelOrder([], -1, 34)).toEqual([]);
  });
});

describe('boxesOverlap', () => {
  it('is true only when the boxes share some area', () => {
    expect(boxesOverlap(box(0, 0), box(10, 5))).toBe(true);
    expect(boxesOverlap(box(0, 0), box(20, 0))).toBe(false);
    expect(boxesOverlap(box(0, 0), box(0, 10))).toBe(false);
    expect(boxesOverlap(box(0, 0), box(5, 2, 2, 2))).toBe(true);
  });
});

describe('textBox', () => {
  it('hangs the text from its anchor: start runs right, end runs left, middle straddles', () => {
    const width = approxTextWidth('100%', 9);
    const at = (anchor: 'start' | 'middle' | 'end') =>
      textBox({ x: 30, baseline: 50, anchor, text: '100%', fontSize: 9 });
    expect(at('start')).toMatchObject({ x: 30, width });
    expect(at('end').x).toBe(30 - width);
    expect(at('middle').x).toBe(30 - width / 2);
  });

  it('reaches above the baseline by the font’s height and a little below it', () => {
    const { y, height } = textBox({ x: 0, baseline: 50, anchor: 'start', text: '8', fontSize: 10 });
    expect(y).toBeLessThanOrEqual(40);
    expect(y + height).toBeGreaterThan(50);
  });

  it('allows more room for longer text', () => {
    expect(approxTextWidth('Nov 28, 2025', 9)).toBeGreaterThan(approxTextWidth('Nov 28', 9));
    expect(approxTextWidth('', 9)).toBe(0);
  });
});

describe('clearLabels', () => {
  it('keeps every label when none touches another', () => {
    expect(clearLabels([box(0, 0), box(30, 0), box(60, 0)], [])).toEqual([0, 1, 2]);
  });

  it('drops the later of two that overlap: the list is in priority order', () => {
    // Last, first, best: the best sits on the first and gives way.
    expect(clearLabels([box(200, 0), box(0, 50), box(10, 52)], [])).toEqual([0, 1]);
    // The first sits on the last (two days a moment apart): the last stays.
    expect(clearLabels([box(100, 0), box(95, 3)], [])).toEqual([0]);
  });

  it('judges each label against those kept, not against one already dropped', () => {
    // 1 overlaps 0 and goes; 2 overlaps only 1, so it stays.
    expect(clearLabels([box(0, 0), box(15, 0), box(30, 0)], [])).toEqual([0, 2]);
  });

  it('drops a label that lies on something fixed, such as the axis’s "100%"', () => {
    expect(clearLabels([box(200, 0), box(5, 5)], [box(0, 0, 24, 10)])).toEqual([0]);
    expect(clearLabels([box(200, 0), box(30, 5)], [box(0, 0, 24, 10)])).toEqual([0, 1]);
  });

  it('never returns two labels that overlap', () => {
    // Last, first and best of a year of days, the best a day before the last.
    const boxes = [box(210, 4, 24, 12), box(30, 90, 18, 12), box(200, 2, 24, 12)];
    const kept = clearLabels(boxes, [box(0, 0, 24, 12)]);
    expect(kept).toEqual([0, 1]);
    for (const a of kept) {
      for (const b of kept) {
        if (a !== b) expect(boxesOverlap(boxes[a]!, boxes[b]!)).toBe(false);
      }
    }
  });
});

describe('axisDatesShown', () => {
  it('shows both ends’ dates when they fit with air between them', () => {
    expect(axisDatesShown({ firstWidth: 40, lastWidth: 40, room: 236, gap: 8 })).toBe('both');
    expect(axisDatesShown({ firstWidth: 114, lastWidth: 114, room: 236, gap: 8 })).toBe('both');
  });

  it('lets the first date give way when the two would touch', () => {
    expect(axisDatesShown({ firstWidth: 115, lastWidth: 114, room: 236, gap: 8 })).toBe('last');
    expect(axisDatesShown({ firstWidth: 70, lastWidth: 70, room: 120, gap: 8 })).toBe('last');
  });
});
