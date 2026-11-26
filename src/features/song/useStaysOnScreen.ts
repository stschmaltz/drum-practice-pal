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
 * Where it was is read in the render that changes `folded`, before React
 * changes the page, so it is where the score is on screen at that moment,
 * whatever scrolled the window since the last render. Not from `scroll`
 * events: they reach the page a frame after the scroll, so a press in the
 * same frame as a scroll (a tap on Hide controls that the browser first
 * scrolled into view) found the score where it was before that scroll, and
 * the hook put it back there, off a phone's window in landscape. A resize to
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
  const lastFolded = useRef(folded);
  const width = useRef<number | null>(null);
  // Where the score is on screen before this render's change reaches the page. Read during
  // render on purpose: by the layout effect the page has changed, and nothing else runs between
  // the two. A render that is thrown away leaves a value the next render reads again.
  const before = useRef<number | null>(null);
  if (lastFolded.current !== folded) {
    before.current = ref.current ? ref.current.getBoundingClientRect().top : null;
  }

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const rootAnchor = root.style.overflowAnchor;
    const bodyAnchor = body.style.overflowAnchor;
    root.style.overflowAnchor = 'none';
    body.style.overflowAnchor = 'none';

    const onResize = () => {
      const widthAfter = window.innerWidth;
      const room = roomAfterResize({
        reserve: reserve.current,
        widthBefore: width.current ?? widthAfter,
        widthAfter,
      });
      width.current = widthAfter;
      if (room !== reserve.current) holdRoom(reserve, roomRef.current, room);
    };
    width.current = window.innerWidth;
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      root.style.overflowAnchor = rootAnchor;
      body.style.overflowAnchor = bodyAnchor;
    };
  }, [roomRef]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && lastFolded.current !== folded && before.current !== null) {
      // Both read after the change, so a scroll the browser clamped as the page got shorter is
      // in each: the shift is how far the score really moved, from where the window really is.
      const next = keepInPlace({
        shift: element.getBoundingClientRect().top - before.current,
        scrollY: window.scrollY,
        reserve: reserve.current,
        folded,
      });
      if (next.reserve !== reserve.current) holdRoom(reserve, roomRef.current, next.reserve);
      if (next.scrollBy !== 0) window.scrollBy({ top: next.scrollBy, behavior: 'instant' });
    }
    lastFolded.current = folded;
    before.current = null;
  });
}

/** Holds `px` of room as the element's bottom margin, and remembers how much. */
function holdRoom(reserve: RefObject<number>, element: HTMLElement | null, px: number): void {
  reserve.current = px;
  if (element) element.style.marginBottom = px > 0 ? `${px}px` : '';
}
