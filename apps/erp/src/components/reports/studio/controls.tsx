'use client';

import { useId, type ReactNode } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import type { MessageKey } from '@/i18n/messages';
import type { Fmt } from '@/i18n/format';
import type { TFunction } from '@/i18n/translate';
import type { Cell, OutColumn, Tone } from '@/lib/report-studio';
import { cn } from '@/lib/utils';

// Small building blocks of the report studio: labelled controls that line up (every control is
// 36px high and toolbars align to the bottom edge), and how a value is shown.

/** A row of labelled controls and buttons, aligned on their bottom edge so heights match. */
export function Toolbar({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role={label ? 'toolbar' : undefined} aria-label={label} className={cn('flex flex-wrap items-end gap-3', className)}>
      {children}
    </div>
  );
}

/** A label above one control. */
export function Labelled({ label, children, className, htmlFor }: { label: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
  group?: string;
}

/** A 36px select over a list of options (grouped when options carry a group). */
export function Pick({ value, onChange, options, label, placeholder, className, testId, disabled, id: given }: { value: string; onChange: (v: string) => void; options: Option[]; label: string; placeholder?: string; className?: string; testId?: string; disabled?: boolean; id?: string }) {
  const generated = useId();
  const id = given ?? generated;
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} data-testid={testId} className={cn('h-9 w-full min-w-[120px] bg-card', className)}>
        <SelectValue placeholder={placeholder ?? label} />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {groups.map((g) => (
          <SelectGroup key={g || '_'}>
            {g && <SelectLabel>{g}</SelectLabel>}
            {options
              .filter((o) => (o.group ?? '') === g)
              .map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

const TONE_FILL: Record<Tone, string> = { red: 'bg-red-soft text-red-ink', amber: 'bg-amber-soft text-amber-ink', green: 'bg-green-soft text-green-ink', blue: 'bg-blue-soft text-blue-ink', grey: 'bg-slate-soft text-slate-ink' };
const TONE_TEXT: Record<Tone, string> = { red: 'text-red-ink font-semibold', amber: 'text-amber-ink font-semibold', green: 'text-green-ink font-semibold', blue: 'text-blue-ink font-semibold', grey: 'text-slate-ink font-semibold' };
export const toneClass = (tone: Tone, style: 'fill' | 'text') => (style === 'fill' ? TONE_FILL[tone] : TONE_TEXT[tone]);

/** A value as people read it: rupees, percents, dates and yes/no in the ERP language. */
export function cellText(col: Pick<OutColumn, 'type'>, v: Cell, fmt: Fmt, t: TFunction): string {
  if (v === null || v === undefined || v === '') return '–';
  if (typeof v === 'boolean') return v ? t('rs.yes') : t('rs.no');
  if (typeof v === 'number') {
    if (col.type === 'money') return fmt.rupees(v);
    if (col.type === 'percent') return `${fmt.number(v, { maximumFractionDigits: 1 })}%`;
    if (col.type === 'int') return fmt.number(v);
    return fmt.number(v, { maximumFractionDigits: 2 });
  }
  if (col.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmt.date(v, 'short');
  return v;
}

/** A plain number for chart axes: money in rupees. */
export const chartNumber = (col: Pick<OutColumn, 'type'>, v: Cell): number | null => (v === null || v === undefined || v === '' ? null : col.type === 'money' ? Number(v) / 100 : Number(v));

/** A short axis tick: 12.5 L, 3.2 Cr, 45%. */
export function axisTick(type: OutColumn['type'], n: number, fmt: Fmt, t: TFunction): string {
  if (type === 'percent') return `${fmt.number(n, { maximumFractionDigits: 0 })}%`;
  const a = Math.abs(n);
  const prefix = type === 'money' ? '₹' : '';
  if (a >= 1e7) return `${prefix}${fmt.number(n / 1e7, { maximumFractionDigits: 1 })} ${t('money.crore')}`;
  if (a >= 1e5) return `${prefix}${fmt.number(n / 1e5, { maximumFractionDigits: 1 })} ${t('money.lakh')}`;
  return `${prefix}${fmt.number(n, { maximumFractionDigits: 1 })}`;
}

export const tk = (t: TFunction, key: string) => t(key as MessageKey);
