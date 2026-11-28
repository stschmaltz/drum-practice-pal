import { isOnShow } from './onShow';

describe('isOnShow', () => {
  function build(html: string): Element {
    document.body.innerHTML = html;
    const target = document.querySelector('#target');
    if (!target) throw new Error('no #target');
    return target;
  }
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each([
    ['drawn, with nothing hidden round it', '<div><p id="target"></p></div>', true],
    ['hidden itself', '<div><p id="target" hidden></p></div>', false],
    ['inside a hidden parent', '<div hidden><p id="target"></p></div>', false],
    [
      'inside a hidden wrapper further out, its own parent not hidden',
      '<div hidden class="contents"><aside><div><p id="target"></p></div></aside></div>',
      false,
    ],
    ['beside a hidden element', '<div hidden></div><p id="target"></p>', true],
  ])('%s', (_name, html, expected) => {
    expect(isOnShow(build(html))).toBe(expected);
  });

  it('nothing is not on show, nor is an element taken off the page', () => {
    expect(isOnShow(null)).toBe(false);
    const target = build('<p id="target"></p>');
    target.remove();
    expect(isOnShow(target)).toBe(false);
  });
});
