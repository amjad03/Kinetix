import { Skeleton } from '@/components/shadcn/skeleton';
import { cn } from '@/lib/utils';

const px = (v: number | string) => (typeof v === 'number' ? `${v}px` : v);

/** Loading placeholders that keep the layout steady; announced once as "busy". */
export function SkeletonBlock({ height = 16, width = '100%', radius = 6 }: { height?: number | string; width?: number | string; radius?: number }) {
  return <Skeleton className="bg-muted" style={{ height: px(height), width: px(width), borderRadius: `${radius}px` }} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} height={14} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

const frame = 'rounded-lg border border-border bg-card';

export function SkeletonCard({ height = 160 }: { height?: number }) {
  return (
    <div aria-hidden className={cn(frame, 'p-5')}>
      <SkeletonBlock height={16} width="40%" />
      <div className="mt-4">
        <SkeletonBlock height={height} />
      </div>
    </div>
  );
}

export function SkeletonStats({ n = 5 }: { n?: number }) {
  return (
    <div aria-hidden className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cn(frame, 'p-5')}>
          <SkeletonBlock height={14} width="55%" />
          <div className="mt-3">
            <SkeletonBlock height={32} width="45%" />
          </div>
          <div className="mt-3">
            <SkeletonBlock height={12} width="70%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A table-shaped placeholder. */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden className={cn(frame, 'overflow-hidden shadow-card')}>
      {Array.from({ length: rows + 1 }, (_, r) => (
        <div
          key={r}
          className={cn('grid gap-4 px-4 py-3.5', r !== rows && 'border-b border-border', r === 0 && 'bg-muted')}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <SkeletonBlock key={c} height={14} width={r === 0 ? '50%' : c === 0 ? '80%' : '60%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
