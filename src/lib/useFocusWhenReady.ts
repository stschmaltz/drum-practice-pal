import { useCallback, useEffect, useRef } from 'react';

/** How long a press waits for the control it should hand focus to; a change that never shows is let go. */
export const FOCUS_WAIT_MS = 5000;

interface PendingFocus {
  /** The element to focus once it is on the page, or null while the change hasn't rendered yet. */
  find: () => HTMLElement | null;
  /** What had focus when the press was made: focus moves only if it is still there or was lost. */
  from: Element | null;
  until: number;
}

/**
 * Hands focus on after a press whose control leaves the page, once the change
 * it starts has rendered: "Mark finished" moves its loop to another list (an
 * optimistic edit, a few ticks after the press), closing the loop form brings
 * back the button that opened it. The owner re-renders when that happens, and
 * each render looks again. Focus is only moved if it is still on what was
 * pressed or has fallen to `<body>`: a user who has moved on keeps their place.
 */
export function useFocusWhenReady(): (find: () => HTMLElement | null) => void {
  const pending = useRef<PendingFocus | null>(null);

  // Every render: the change the press waits for is what re-renders the owner.
  useEffect(() => {
    const wanted = pending.current;
    if (!wanted) return;
    if (Date.now() > wanted.until) {
      pending.current = null;
      return;
    }
    const target = wanted.find();
    if (!target) return;
    pending.current = null;
    if (focusIsFree(wanted.from)) target.focus();
  });

  return useCallback((find: () => HTMLElement | null) => {
    pending.current = { find, from: document.activeElement, until: Date.now() + FOCUS_WAIT_MS };
  }, []);
}

function focusIsFree(from: Element | null): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === from;
}
