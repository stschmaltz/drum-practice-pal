// Shared Tailwind class strings for form controls. Touch targets stay at 44 px or more.

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400';

const buttonBase = `min-h-11 rounded-md px-4 py-2 font-medium ${focusRing} disabled:cursor-not-allowed disabled:opacity-50`;

export const buttonClass = `${buttonBase} bg-neutral-800 text-neutral-100 hover:bg-neutral-700`;

// sky-700 and the darker hover keep white labels above WCAG AA's 4.5:1.
export const primaryButtonClass = `${buttonBase} bg-sky-700 text-white hover:bg-sky-800`;

export const inputClass = `min-h-11 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-base text-neutral-100 ${focusRing}`;

// red-700 keeps white labels above 4.5:1 too.
export const dangerButtonClass = `${buttonBase} bg-red-700 text-white hover:bg-red-800`;
