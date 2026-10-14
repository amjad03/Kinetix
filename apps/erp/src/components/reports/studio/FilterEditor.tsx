'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fieldValues } from '@/app/(dashboard)/reports/studio-actions';
import { Button } from '@/components/shadcn/button';
import { Checkbox } from '@/components/shadcn/checkbox';
import { Input } from '@/components/shadcn/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { useI18n } from '@/i18n/client';
import { isNumeric, opNeedsValue, opsFor, type DatasetMeta, type FieldMeta, type Filter, type Op } from '@/lib/report-studio';
import { cn } from '@/lib/utils';
import { Pick, tk } from './controls';

type Scalar = string | number | boolean;
const asList = (v: Filter['value']): Scalar[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** One filter: field, condition and value, each control 36px high on one row. */
export function FilterEditor({ dataset, filter, onChange, onRemove, relative, fields }: { dataset: DatasetMeta; filter: Filter; onChange: (f: Filter) => void; onRemove: () => void; relative: { key: string; label: string }[]; fields?: FieldMeta[] }) {
  const { t } = useI18n();
  const list = fields ?? dataset.fields;
  const field = list.find((f) => f.key === filter.field);
  const ops = field ? opsFor(field.type, field.picker) : [];
  const setField = (key: string) => {
    const f = list.find((x) => x.key === key)!;
    const op = opsFor(f.type, f.picker)[0];
    onChange({ field: key, op, ...(op === 'relative' ? { value: 'this_month' } : {}) });
  };
  const setOp = (op: Op) => {
    const keep = (op === 'in' || op === 'not_in') === (filter.op === 'in' || filter.op === 'not_in') && op !== 'between' && filter.op !== 'between' && op !== 'relative' && filter.op !== 'relative';
    onChange({ field: filter.field, op, ...(op === 'relative' ? { value: 'this_month' } : keep && opNeedsValue(op) && filter.value !== undefined ? { value: filter.value } : {}) });
  };
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="rs-filter">
      <Pick label={t('rs.f.field')} value={filter.field} onChange={setField} options={list.map((f) => ({ value: f.key, label: f.label }))} className="w-[150px]" />
      {field && <Pick label={t('rs.f.condition')} value={filter.op} onChange={(v) => setOp(v as Op)} options={ops.map((o) => ({ value: o, label: tk(t, `rs.op.${o}`) }))} className="w-[130px]" />}
      {field && opNeedsValue(filter.op) && <ValueEditor dataset={dataset} field={field} filter={filter} onChange={onChange} relative={relative} />}
      <Button size="icon" variant="ghost" onClick={onRemove} aria-label={t('rs.b.remove')}>
        <X />
      </Button>
    </div>
  );
}

function ValueEditor({ dataset, field, filter, onChange, relative }: { dataset: DatasetMeta; field: FieldMeta; filter: Filter; onChange: (f: Filter) => void; relative: { key: string; label: string }[] }) {
  const { t } = useI18n();
  const set = (value: Filter['value']) => onChange({ ...filter, value });
  const vals = asList(filter.value);
  if (field.type === 'date' && filter.op === 'relative') return <Pick label={t('rs.v.period')} value={String(filter.value ?? '')} onChange={set} options={relative.map((r) => ({ value: r.key, label: r.label }))} className="w-[190px]" />;
  if (filter.op === 'between') {
    const type = field.type === 'date' ? 'date' : 'number';
    return (
      <>
        <Input type={type} aria-label={t('rs.v.from')} placeholder={t('rs.v.from')} className="h-9 w-[140px] bg-card" value={String(vals[0] ?? '')} onChange={(e) => set([e.target.value, String(vals[1] ?? '')])} />
        <Input type={type} aria-label={t('rs.v.to')} placeholder={t('rs.v.to')} className="h-9 w-[140px] bg-card" value={String(vals[1] ?? '')} onChange={(e) => set([String(vals[0] ?? ''), e.target.value])} />
      </>
    );
  }
  if (field.type === 'date') return <Input type="date" aria-label={t('rs.v.value')} className="h-9 w-[160px] bg-card" value={String(filter.value ?? '')} onChange={(e) => set(e.target.value)} />;
  if (isNumeric(field.type)) return <Input type="number" inputMode="decimal" aria-label={field.type === 'money' ? t('rs.v.rupees') : t('rs.v.value')} placeholder={field.type === 'money' ? t('rs.v.rupees') : t('rs.v.value')} className="h-9 w-[140px] bg-card" value={String(filter.value ?? '')} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />;
  if (field.picker || filter.op === 'in' || filter.op === 'not_in') return <ValuePicker dataset={dataset.key} field={field} multiple={filter.op === 'in' || filter.op === 'not_in'} value={vals.map(String)} onChange={(v) => set(filter.op === 'in' || filter.op === 'not_in' ? v : (v[0] ?? ''))} />;
  return <Input aria-label={t('rs.v.value')} placeholder={t('rs.v.value')} className="h-9 w-[180px] bg-card" value={String(filter.value ?? '')} onChange={(e) => set(e.target.value)} />;
}

/** Choose one or more of a field's values: classes, programs and departments by name (their ids are sent). */
export function ValuePicker({ dataset, field, multiple, value, onChange, className }: { dataset: string; field: FieldMeta; multiple: boolean; value: string[]; onChange: (v: string[]) => void; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [known, setKnown] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open && value.length === 0) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await fieldValues(dataset, field.key, open ? q : '');
      if (!live) return;
      if (res.ok) {
        setOptions(res.data);
        setKnown((k) => ({ ...k, ...Object.fromEntries(res.data.map((o) => [o.value, o.label])) }));
        setError(null);
      } else setError(res.error);
    }, open ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, q, dataset, field.key, value.length]);

  const label = useMemo(() => {
    if (value.length === 0) return t('rs.v.pick');
    if (value.length === 1) return known[value[0]] ?? value[0];
    return t('rs.v.selected', { n: value.length });
  }, [value, known, t]);
  const toggle = (v: string) => onChange(multiple ? (value.includes(v) ? value.filter((x) => x !== v) : [...value, v]) : [v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-9 w-[200px] justify-between bg-card font-normal', className)} aria-label={`${field.label}: ${label}`} data-testid="rs-value-picker">
          <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>{label}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <Input autoFocus aria-label={t('rs.v.search')} placeholder={t('rs.v.search')} className="mb-2 h-9" value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <p className="px-1 text-xs text-red-ink">{error}</p>}
        <ul className="max-h-[260px] list-none overflow-y-auto p-0" role="listbox" aria-multiselectable={multiple}>
          {options.length === 0 && !error && <li className="px-2 py-3 text-center text-sm text-muted-foreground">{t('rs.v.noValues')}</li>}
          {options.map((o) => {
            const on = value.includes(o.value);
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => toggle(o.value)}>
                  {multiple ? <Checkbox checked={on} tabIndex={-1} aria-hidden /> : <Check className={cn('size-4', on ? 'opacity-100' : 'opacity-0')} />}
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {multiple && value.length > 0 && (
          <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => onChange([])}>
            {t('rs.quick.clear')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
