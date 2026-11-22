import type { ReactNode } from 'react';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children && <div className="text-neutral-400">{children}</div>}
    </header>
  );
}
