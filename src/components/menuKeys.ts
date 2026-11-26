/**
 * The keys of a menu button and its menu (WAI-ARIA APG, "Menu Button"), as
 * pure rules: `OverflowMenu` feeds each `keydown` and does what they say.
 *
 * Space is left out on purpose: on the song page it is play/pause wherever
 * focus is (Unit 10), menu items included. Enter presses a menu item as it
 * presses any button.
 */

export type MenuKeyResult =
  /** Open the menu (from its button) or move within it, with focus on this item. */
  | { kind: 'focus'; index: number }
  /** Close the menu and put focus back on its button. */
  | { kind: 'close' };

/** On the closed menu's button: the arrows open it on the first or the last item. */
export function menuButtonKey(
  key: string,
  count: number,
): Extract<MenuKeyResult, { kind: 'focus' }> | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return { kind: 'focus', index: 0 };
  if (key === 'ArrowUp') return { kind: 'focus', index: count - 1 };
  return null;
}

/**
 * Inside the open menu, with focus on item `current` of `count`. The arrows
 * wrap round. Escape and Tab close it and hand focus back to its button: Tab
 * doesn't carry on past the menu, whose items go when it closes.
 */
export function menuItemKey(key: string, current: number, count: number): MenuKeyResult | null {
  if (count === 0) return key === 'Escape' || key === 'Tab' ? { kind: 'close' } : null;
  switch (key) {
    case 'ArrowDown':
      return { kind: 'focus', index: (current + 1) % count };
    case 'ArrowUp':
      return { kind: 'focus', index: (current - 1 + count) % count };
    case 'Home':
      return { kind: 'focus', index: 0 };
    case 'End':
      return { kind: 'focus', index: count - 1 };
    case 'Escape':
    case 'Tab':
      return { kind: 'close' };
    default:
      return null;
  }
}
