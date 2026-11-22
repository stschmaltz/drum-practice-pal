export interface NavItem {
  to: string;
  label: string;
  /** Match the path exactly, so "/" isn't active on every page. */
  end: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'On the go', end: true },
  { to: '/library', label: 'Library', end: false },
  { to: '/settings', label: 'Settings', end: false },
];
