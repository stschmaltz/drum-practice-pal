import { layoutForWidth, layoutToDraw } from './layout';

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

describe('layoutToDraw', () => {
  it('is the layout for the width while the tab is played', () => {
    expect(layoutToDraw('horizontal', false)).toBe('horizontal');
    expect(layoutToDraw('page', false)).toBe('page');
  });

  // 14 QA issue 2: one horizontal line under a video can't be read along to on a phone.
  it('is page layout at every width while the score is only read along to', () => {
    expect(layoutToDraw('horizontal', true)).toBe('page');
    expect(layoutToDraw('page', true)).toBe('page');
  });
});
