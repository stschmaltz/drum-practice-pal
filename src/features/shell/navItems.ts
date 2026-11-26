import type { IconName } from '@/components/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Match the path exactly, so "/" isn't active on every page. */
  end: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'On the go', icon: 'home', end: true },
  { to: '/library', label: 'Library', icon: 'library', end: false },
  { to: '/settings', label: 'Settings', icon: 'settings', end: false },
];
