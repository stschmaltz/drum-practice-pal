/**
 * Whether the device is worked with a mouse or trackpad. Asked where a touch
 * screen and a mouse want different things from the same moment: a field
 * focused as its form opens saves a click with a mouse, and brings up a
 * keyboard over the page on a phone; a drag is only offered where one works.
 * False where it can't be asked (tests, old browsers).
 */
export function pointerIsFine(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}
