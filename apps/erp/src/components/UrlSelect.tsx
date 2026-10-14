'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useId, useTransition } from 'react';
import { Label } from '@/components/shadcn/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { useI18n } from '@/i18n/client';
import { PendingBar } from './PendingBar';

export interface UrlOption {
  value: string;
  label: string;
  /** Options with a group get a subheader. */
  group?: string;
}

/**
 * A select whose value lives in the URL (`?param=value`), so the view can be bookmarked.
 * Choosing a value replaces the whole query string. Without `param`, each option's value is
 * itself the query string (`class=…` or `teacher=…`), for one picker over two kinds of thing.
 */
export function UrlSelect({ label, param, value, options, minWidth = 220, testId }: { label: string; param?: string; value: string; options: UrlOption[]; minWidth?: number; testId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const id = useId();
  const { t } = useI18n();
  const groups: { group?: string; options: UrlOption[] }[] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.options.push(o);
    else groups.push({ group: o.group, options: [o] });
  }
  const current = options.some((o) => o.value === value) ? value : undefined;
  return (
    <>
      {pending && <PendingBar label={t('common.loading')} />}
      <div className="grid max-w-full min-w-0 grid-cols-1 gap-1" style={{ minWidth: `min(${minWidth}px, 100%)` }}>
        <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        <Select value={current} onValueChange={(v) => start(() => router.push(`${pathname}?${param ? new URLSearchParams({ [param]: v }) : v}`, { scroll: false }))}>
          <SelectTrigger id={id} data-testid={testId} aria-label={label} className="h-9 w-full min-w-0 rounded-md bg-card">
            <SelectValue placeholder={label} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g, i) =>
              g.group ? (
                <SelectGroup key={`g-${g.group}-${i}`}>
                  <SelectLabel>{g.group}</SelectLabel>
                  {g.options.map((o) => (
                    <SelectItem key={`${g.group}${o.value}`} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : (
                <Fragment key={`n-${i}`}>
                  {g.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </Fragment>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
