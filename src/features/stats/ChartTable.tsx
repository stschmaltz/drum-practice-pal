import type { ReactNode } from 'react';

/**
 * The numbers behind a chart, as a table for a screen reader only (see
 * chartText.ts). The table sits in a visually hidden box rather than being
 * hidden itself: a `<table>` grows to its cells whatever width it is given,
 * and with `sr-only`'s `nowrap` that is every heading in one line, which took
 * room in the page and, in a font wider than Windows' or a phone's, made a
 * 320 px page scroll sideways (20 batch 9, Copilot review: CI's Linux fonts).
 */
export function ChartTable({ children }: { children: ReactNode }) {
  return (
    <div className="sr-only">
      <table>{children}</table>
    </div>
  );
}
