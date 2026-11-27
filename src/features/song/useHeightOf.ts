import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * An element's height, kept up to date as it wraps or the safe area changes:
 * the folded controls stick right under the sticky bar, at this offset.
 */
export function useHeightOf(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setHeight(Math.ceil(element.getBoundingClientRect().height));
    measure();
    // jsdom has no ResizeObserver; the one measure above is all a test needs.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}
