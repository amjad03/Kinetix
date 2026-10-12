import type { ReactNode } from 'react';

/** A white card frame for plain tables; scrolls sideways on narrow screens. */
export function TableFrame({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="overflow-x-auto rounded-lg border border-border bg-card shadow-card [&_th]:bg-card [&_tbody>tr:last-of-type>td]:border-b-0"
    >
      {children}
    </div>
  );
}
