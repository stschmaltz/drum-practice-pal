import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { keepInPlace, roomAfterResize } from './keepInPlace';

/**
 * Keeps an element where it is in the window when `folded` changes something
 * above it (the controls folding at Play, unfolding at Pause): the window is
 * scrolled by however far the element moved on screen, and while folded, what
 * the window can't scroll (at the top of the page, or on a phone whose song
 * page doesn't scroll at all) is held as room, a bottom margin on `roomRef`'s
 * element, in the place of what folded away (`keepInPlace`). A margin, not
 * padding: the folded strip sticks, and the room scrolls with the page.
 * Unfolded, no room is held. Written to the element here, in the layout
 * effect, not through state: an effect of the same commit (Play's scroll of
 * the score into view) must already measure the page with the room in it. So
 * the score never moves at Play or Pause, and a bar tapped just after a Pause
 * is the bar that was under the finger.
 *
 * Where it was is kept from the last render, the last scroll and the last
 * resize, so a scroll the user made since counts as where it was. A resize to
 * a new width while folded (a rotation) drops the room (`roomAfterResize`):
 * the new layout's controls are another height, and the room could push the
 * score, and the beat cursor with it, off a shorter window.
 *
 * The browser's own scroll anchoring is off on the page while this is
 * mounted. Chrome's runs after the layout effect, as the frame is drawn, so
 * at a Pause it scrolled up by the room just taken away and the score moved
 * by as much (with a count-in on, where it picked another anchor); Safari has
 * none. With it off, this is the one owner of the window's scroll at a fold.
 */
export function useStaysOnScreen(
  ref: RefObject<HTMLElement | null>,
  roomRef: RefObject<HTMLElement | null>,
  folded: boolean,
): void {
  const reserve = useRef(0);
  const lastTop = useRef<number | null>(null);
  const lastFolded = useRef(folded);
  const width = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const rootAnchor = root.style.overflowAnchor;
    const bodyAnchor = body.style.overflowAnchor;
    root.style.overflowAnchor = 'none';
    body.style.overflowAnchor = 'none';

    const measure = () => {
      lastTop.current = ref.current ? ref.current.getBoundingClientRect().top : null;
    };
    const onResize = () => {
      const widthAfter = window.innerWidth;
      const room = roomAfterResize({
        reserve: reserve.current,
        widthBefore: width.current ?? widthAfter,
        widthAfter,
      });
      width.current = widthAfter;
      if (room !== reserve.current) holdRoom(reserve, roomRef.current, room);
      measure();
    };
    width.current = window.innerWidth;
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', onResize);
      root.style.overflowAnchor = rootAnchor;
      body.style.overflowAnchor = bodyAnchor;
    };
  }, [ref, roomRef]);

  useLayoutEffect(() => {
    const element = ref.current;
    const before = lastTop.current;
    if (element && lastFolded.current !== folded && before !== null) {
      const next = keepInPlace({
        shift: element.getBoundingClientRect().top - before,
        scrollY: window.scrollY,
        reserve: reserve.current,
        folded,
      });
      if (next.reserve !== reserve.current) holdRoom(reserve, roomRef.current, next.reserve);
      if (next.scrollBy !== 0) window.scrollBy({ top: next.scrollBy, behavior: 'instant' });
    }
    lastFolded.current = folded;
    lastTop.current = element ? element.getBoundingClientRect().top : null;
  });
}

/** Holds `px` of room as the element's bottom margin, and remembers how much. */
function holdRoom(reserve: RefObject<number>, element: HTMLElement | null, px: number): void {
  reserve.current = px;
  if (element) element.style.marginBottom = px > 0 ? `${px}px` : '';
}
