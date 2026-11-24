import { menuButtonKey, menuItemKey } from './menuKeys';

describe('menuButtonKey', () => {
  it('opens on the first item with ArrowDown and on the last with ArrowUp', () => {
    expect(menuButtonKey('ArrowDown', 3)).toEqual({ kind: 'focus', index: 0 });
    expect(menuButtonKey('ArrowUp', 3)).toEqual({ kind: 'focus', index: 2 });
  });

  it.each(['Enter', ' ', 'Escape', 'Tab', 'ArrowLeft', 'm'])(
    'leaves %j to the button (Enter clicks it; Space is play/pause on the song page)',
    (key) => {
      expect(menuButtonKey(key, 3)).toBeNull();
    },
  );

  it('does nothing for an empty menu', () => {
    expect(menuButtonKey('ArrowDown', 0)).toBeNull();
  });
});

describe('menuItemKey', () => {
  it.each([
    ['ArrowDown', 0, 1],
    ['ArrowDown', 2, 0],
    ['ArrowUp', 1, 0],
    ['ArrowUp', 0, 2],
    ['Home', 2, 0],
    ['End', 0, 2],
  ])('%s from item %i of three moves to item %i, wrapping round', (key, from, to) => {
    expect(menuItemKey(key, from, 3)).toEqual({ kind: 'focus', index: to });
  });

  it.each(['Escape', 'Tab'])('%s closes the menu, focus back on its button', (key) => {
    expect(menuItemKey(key, 1, 3)).toEqual({ kind: 'close' });
  });

  it.each(['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'PageDown', 'a'])(
    'leaves %j alone (Enter presses the item)',
    (key) => {
      expect(menuItemKey(key, 1, 3)).toBeNull();
    },
  );

  it('still closes an empty menu', () => {
    expect(menuItemKey('Escape', 0, 0)).toEqual({ kind: 'close' });
    expect(menuItemKey('ArrowDown', 0, 0)).toBeNull();
  });
});
