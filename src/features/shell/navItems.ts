import type { IconName } from '@/components/icons';
import { SONGS_PATH, STATS_PATH } from '@/lib/routes';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /**
   * Paths besides its own that the item stands for: Songs is the current page
   * on a song's screens too, which are a level below it.
   */
  alsoFor: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: SONGS_PATH, label: 'Songs', icon: 'music', alsoFor: ['/songs/'] },
  { to: STATS_PATH, label: 'Stats', icon: 'chart', alsoFor: [] },
  { to: '/settings', label: 'Settings', icon: 'settings', alsoFor: [] },
];

/** Whether the item is the current page: its own path exactly, or a path under one it stands for. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.to) return true;
  // "/" would be a prefix of everything, so the root takes no subpaths of its own.
  if (item.to !== '/' && pathname.startsWith(`${item.to}/`)) return true;
  return item.alsoFor.some((prefix) => pathname.startsWith(prefix));
}
