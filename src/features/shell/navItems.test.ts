import { expect, it } from 'vitest';
import { isNavItemActive, NAV_ITEMS } from './navItems';

it('lists Songs, Stats and Settings', () => {
  expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Songs', 'Stats', 'Settings']);
});

it.each([
  ['/', 'Songs'],
  ['/songs/abc', 'Songs'],
  ['/songs/abc/loops/def', 'Songs'],
  ['/songs/abc/play', 'Songs'],
  ['/stats', 'Stats'],
  ['/settings', 'Settings'],
  ['/no-such-page', null],
])('%s is under %s', (pathname, label) => {
  const active = NAV_ITEMS.filter((item) => isNavItemActive(item, pathname));
  expect(active.map((item) => item.label)).toEqual(label === null ? [] : [label]);
});
