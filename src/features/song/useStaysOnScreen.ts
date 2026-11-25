import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { keepInPlace } from './keepInPlace';

/**
 * Keeps an element where it is in the window when `key` changes something
 * above it (the controls folding): the window is scrolled by however far the
 * element moved on screen, and what the window can't scroll (at the top of
 * the page, or on a phone whose song page doesn't scroll at all) is held as
 * room, a bottom margin on `roomRef`'s element, in the place of what folded
 * away (`keepInPlace`). A margin, not padding: the folded strip sticks, and
 * the room scrolls with the page. Written to the element here, in the layout
 * effect, not through state: an effect of the same commit (Play's scroll of
 * the score into view) must already measure the page with the room in it. So the score never moves at Play or Pause, and a bar
 * tapped just after a Pause is the bar that was under the finger.
 *
 * Where it was is kept from the last render and the last scroll, so a scroll
 * the user made since counts as where it was, and Chrome's own scroll
 * anchoring, when it has already kept the element still, leaves nothing to do
 * but give back room the window can now stand in for (Safari has none).
 */
export function useStaysOnScreen(
  ref: RefObject<HTMLElement | null>,
  roomRef: RefObject<HTMLElement | null>,
  key: unknown,
): void {
  const reserve = useRef(0);
  const lastTop = useRef<number | null>(null);
  const lastKey = useRef(key);
  useEffect(() => {
    const onScroll = () => {
      if (ref.current) lastTop.current = ref.current.getBoundingClientRect().top;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ref]);
  useLayoutEffect(() => {
    const element = ref.current;
    const before = lastTop.current;
    if (element && lastKey.current !== key && before !== null) {
      const next = keepInPlace({
        shift: element.getBoundingClientRect().top - before,
        scrollY: window.scrollY,
        reserve: reserve.current,
      });
      if (next.reserve !== reserve.current && roomRef.current) {
        reserve.current = next.reserve;
        roomRef.current.style.marginBottom = next.reserve > 0 ? `${next.reserve}px` : '';
      }
      if (next.scrollBy !== 0) window.scrollBy({ top: next.scrollBy, behavior: 'instant' });
    }
    lastKey.current = key;
    lastTop.current = element ? element.getBoundingClientRect().top : null;
  });
}
