import type { ReactNode } from 'react';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight break-words md:text-3xl">{title}</h1>
      {children && <div className="text-ink-muted">{children}</div>}
    </header>
  );
}
