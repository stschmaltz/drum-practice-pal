import type { ReactNode } from 'react';
import { sectionHeadingClass } from '@/components/styles';

/** One of the Stats page's sections under its heading. */
export function StatsSection({
  id,
  title,
  aside,
  children,
}: {
  /** The heading's id, which names the section. */
  id: string;
  title: string;
  /** Said quietly after the heading: the time the section covers, which the Period choice may or may not set. */
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      {/* Inline, with a real space between: the heading reads "Records All time", not "RecordsAll time". */}
      <h2 id={id} className={sectionHeadingClass}>
        {title}
        {aside && (
          <>
            {' '}
            <span className="ml-1 text-sm font-normal tracking-normal whitespace-nowrap text-ink-muted">
              {aside}
            </span>
          </>
        )}
      </h2>
      {children}
    </section>
  );
}
