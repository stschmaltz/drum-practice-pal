import {
  buttonClass,
  pressedButtonClass,
  primaryButtonClass,
  segmentOnClass,
  toolButtonClass,
} from './styles';

const classes = (classString: string) => classString.split(/\s+/);

describe('the primary button when off (12 UX pass)', () => {
  it('is drawn as off, not as a faded orange: no fill, a dashed edge, muted text', () => {
    for (const variant of ['disabled', 'aria-disabled']) {
      expect(classes(primaryButtonClass)).toEqual(
        expect.arrayContaining([
          `${variant}:bg-transparent`,
          `${variant}:border-dashed`,
          `${variant}:border-line-strong`,
          `${variant}:text-ink-muted`,
        ]),
      );
    }
    expect(primaryButtonClass).not.toMatch(/disabled:opacity-/);
  });

  it('keeps the same size on and off: the edge is there, transparent, when on', () => {
    expect(classes(primaryButtonClass)).toEqual(
      expect.arrayContaining(['border', 'border-transparent']),
    );
  });

  it('leaves the other buttons faded when off', () => {
    expect(classes(buttonClass)).toEqual(
      expect.arrayContaining(['disabled:opacity-50', 'aria-disabled:opacity-50']),
    );
  });
});

describe('on and selected (12 UX pass)', () => {
  it.each([
    ['a pressed toggle', pressedButtonClass],
    ['the view on show', segmentOnClass],
    ['a tool that is on', toolButtonClass(true)],
  ])('%s takes the quiet selected colours with a ring, never the brand', (_, classString) => {
    expect(classes(classString)).toEqual(
      expect.arrayContaining(['bg-selected', 'ring-2', 'ring-selected-line']),
    );
    expect(classString).not.toMatch(/brand/);
  });

  it('lays a tool out as a row in the folded strip, as a tile otherwise', () => {
    expect(classes(toolButtonClass(false, { inline: true }))).toEqual(
      expect.arrayContaining(['flex-row', 'min-h-touch']),
    );
    expect(classes(toolButtonClass(false))).toEqual(
      expect.arrayContaining(['flex-col', 'min-h-14']),
    );
  });
});
