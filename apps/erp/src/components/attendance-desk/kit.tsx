import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { LinkTabs } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import type { TFunction } from '@/i18n/translate';
import { ATTENDANCE_HREF, ATTENDANCE_TABS, type AttendanceTab } from '@/lib/attendance-desk';
import { cn } from '@/lib/utils';

/** The attendance pages as tabs under the page header. */
export function AttendanceTabs({ value, t, hide = [] }: { value: AttendanceTab; t: TFunction; hide?: AttendanceTab[] }) {
  return <LinkTabs value={value} label={t('nav.attendance')} items={ATTENDANCE_TABS.filter((x) => !hide.includes(x)).map((x) => ({ value: x, label: t(`atd.tab.${x}` as MessageKey), href: ATTENDANCE_HREF[x] }))} />;
}

/**
 * A filter bar that is a plain GET form: its fields become the URL, so the view can be bookmarked and works without
 * script. Items sit on the bottom edge with 36px controls (ERP layout rules).
 */
export function FilterForm({ children, submit, testId, hidden = {} }: { children: ReactNode; submit: string; testId?: string; hidden?: Record<string, string> }) {
  return (
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3" data-testid={testId}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <Button type="submit" className="h-9 rounded-md">
        <Search />
        {submit}
      </Button>
    </form>
  );
}

const control = 'h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** A labelled native select for filter forms. */
export function SelectField({ label, name, value, options, empty, minWidth = 200, required }: { label: string; name: string; value?: string; options: { value: string; label: string; group?: string }[]; empty?: string; minWidth?: number; required?: boolean }) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  const id = `f-${name}`;
  return (
    <div className="grid min-w-0 gap-1" style={{ minWidth: `min(${minWidth}px, 100%)` }}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ''} className={control} required={required}>
        {empty !== undefined && <option value="">{empty}</option>}
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => o.group === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ) : (
            options
              .filter((o) => !o.group)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
          ),
        )}
      </select>
    </div>
  );
}

/** A labelled date (or month) input for filter forms. */
export function DateField({ label, name, value, type = 'date', className }: { label: string; name: string; value?: string; type?: 'date' | 'month'; className?: string }) {
  const id = `f-${name}`;
  return (
    <div className={cn('grid gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input id={id} type={type} name={name} defaultValue={value ?? ''} className="h-9 bg-card" />
    </div>
  );
}

/** "86.5%" or a dash. */
export const pctText = (n: number | null | undefined, fmt: { number: (n: number) => string }) => (n === null || n === undefined ? '—' : `${fmt.number(n)}%`);
