import type { ReactNode } from 'react';

/**
 * The app's icons: 24 px line drawings in `currentColor`, so they take the
 * colour of the text beside them. Always decoration next to a visible or
 * screen-reader label (`aria-hidden`); a control's name is its text, never
 * the icon.
 */
const PATHS = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  backToStart: (
    <>
      <path d="M6 5v14" />
      <path d="M19 5 9 12l10 7z" fill="currentColor" />
    </>
  ),
  metronome: (
    <>
      <path d="M9 3h6l4.5 18h-15z" />
      <path d="m12 16 5.5-10" />
    </>
  ),
  drumMuted: (
    <>
      <ellipse cx="12" cy="9" rx="8" ry="3" />
      <path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9" />
      <path d="M3 3l18 18" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </>
  ),
  countIn: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9h3.5L12 5v14l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  loop: (
    <>
      <path d="m17 3 3 3-3 3" />
      <path d="M4 12v-1a5 5 0 0 1 5-5h11" />
      <path d="m7 21-3-3 3-3" />
      <path d="M20 12v1a5 5 0 0 1-5 5H4" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-7.5 9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </>
  ),
  library: (
    <>
      <path d="M4 4h4v16H4zM10 4h4v16h-4z" />
      <path d="m16 5.5 3.8-1 3 14.5-3.8 1z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </>
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  history: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  reopen: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4v5h5" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  signOut: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  offline: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-3.2-2.1M2 9.5a15 15 0 0 1 4.4-2.8M22 9.5A15 15 0 0 0 11 5.1" />
      <path d="M12 20h.01" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/** `className` adds to the icon's classes; without a `size-*` among them it is `size-5`. */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const size = /(^|\s)size-/.test(className) ? '' : 'size-5';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${size} ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
