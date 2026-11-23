import { layoutForWidth } from './layout';

describe('layoutForWidth', () => {
  it.each([
    [390, 'horizontal'],
    [767, 'horizontal'],
    [768, 'page'],
    [820, 'page'],
    [1440, 'page'],
  ])('%i px uses %s', (width, layout) => {
    expect(layoutForWidth(width)).toBe(layout);
  });
});
