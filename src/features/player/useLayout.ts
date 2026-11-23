import { useSyncExternalStore } from 'react';
import { layoutForWidth, PAGE_LAYOUT_QUERY, type LayoutChoice } from './layout';

/** Page layout from 768 px, horizontal below (docs/units/01-spike.md, Layout per breakpoint). */
export function useLayout(): LayoutChoice {
  return useSyncExternalStore(subscribeToWidth, currentLayout);
}

function currentLayout(): LayoutChoice {
  if (typeof window.matchMedia !== 'function') return layoutForWidth(window.innerWidth);
  return window.matchMedia(PAGE_LAYOUT_QUERY).matches ? 'page' : 'horizontal';
}

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }
  const query = window.matchMedia(PAGE_LAYOUT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
