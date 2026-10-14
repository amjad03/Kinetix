'use client';

import { Calendar, CheckSquare, GripVertical, Hash, IndianRupee, Lock, Percent, Plus, Search, Type, X } from 'lucide-react';
import { useEffect, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { checkFormula } from '@/app/(dashboard)/reports/studio-actions';
import { Button } from '@/components/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Dialog, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { aggsFor, isNumeric, type AggFn, type Calculated, type DatasetMeta, type Definition, type FieldMeta, type FieldType } from '@/lib/report-studio';
import { cn } from '@/lib/utils';
import { Labelled, Pick, tk } from './controls';

export const FIELD_MIME = 'text/x-rs-field';
const CHIP_MIME = 'text/x-rs-chip';

const TYPE_ICON: Record<FieldType, typeof Type> = { text: Type, int: Hash, number: Hash, money: IndianRupee, percent: Percent, date: Calendar, bool: CheckSquare };
export const TypeIcon = ({ type }: { type: FieldType }) => {
  const I = TYPE_ICON[type];
  return <I aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
};

export type FieldAction = { kind: 'column' | 'group' | 'filter' | 'pivot' } | { kind: 'agg'; fn: AggFn };

/** The dataset's fields, searchable, grouped into details and numbers. Drag one onto a section, or use its + menu. */
export function FieldList({ dataset, calculated, onAction }: { dataset: DatasetMeta; calculated: Calculated[]; onAction: (field: string, a: FieldAction) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const rowCalcs: FieldMeta[] = calculated.filter((c) => c.kind === 'row').map((c) => ({ key: c.key, label: c.label, type: 'text', aggregatable: false, picker: null, restricted: false }));
  const all = [...dataset.fields, ...rowCalcs];
  const shown = all.filter((f) => !q.trim() || f.label.toLowerCase().includes(q.trim().toLowerCase()));
  const groups: [string, FieldMeta[]][] = [
    [t('rs.b.dimensions'), shown.filter((f) => !isNumeric(f.type))],
    [t('rs.b.measures'), shown.filter((f) => isNumeric(f.type))],
  ];
  return (
    <div className="grid gap-3" data-testid="rs-fields">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label={t('rs.b.searchFields')} placeholder={t('rs.b.searchFields')} className="h-9 bg-card pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.map(([label, fields]) =>
        fields.length ? (
          <section key={label} aria-label={label}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h3>
            <ul className="grid list-none gap-0.5 p-0">
              {fields.map((f) => (
                <li
                  key={f.key}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(FIELD_MIME, f.key);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                  data-testid={`rs-field-${f.key}`}
                >
                  <GripVertical aria-hidden className="size-3.5 shrink-0 cursor-grab text-muted-foreground opacity-40 group-hover:opacity-100" />
                  <TypeIcon type={f.type} />
                  <span className="min-w-0 flex-1 truncate" title={f.label}>
                    {f.label}
                  </span>
                  {f.restricted && <Lock aria-label={t('rs.b.restricted')} className="size-3 text-amber-ink" />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-xs" variant="ghost" aria-label={t('rs.b.addFieldTo', { field: f.label })} data-testid={`rs-add-${f.key}`}>
                        <Plus />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onAction(f.key, { kind: 'column' })}>{t('rs.b.asColumn')}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction(f.key, { kind: 'group' })}>{t('rs.b.asGroup')}</DropdownMenuItem>
                      {!isNumeric(f.type) && <DropdownMenuItem onSelect={() => onAction(f.key, { kind: 'pivot' })}>{t('rs.b.asPivot')}</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => onAction(f.key, { kind: 'filter' })}>{t('rs.b.asFilter')}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{t('rs.b.aggregates')}</DropdownMenuLabel>
                      {aggsFor(f).map((fn) => (
                        <DropdownMenuItem key={fn} onSelect={() => onAction(f.key, { kind: 'agg', fn })}>
                          {tk(t, `rs.agg.${fn}`)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

/** A section of the builder that takes dropped fields. */
export function DropZone({ onField, children, testId }: { onField: (key: string) => void; children: ReactNode; testId?: string }) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(FIELD_MIME);
  return (
    <div
      data-testid={testId}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const key = e.dataTransfer.getData(FIELD_MIME);
        if (key) {
          e.preventDefault();
          onField(key);
        }
      }}
      className={cn('rounded-md border border-dashed p-2 transition-colors', over ? 'border-primary bg-teal-soft/40' : 'border-border')}
    >
      {children}
    </div>
  );
}

/** Chips that can be reordered by dragging (or Alt+arrow keys) and removed. */
export function ChipList({ items, label, onMove, onRemove, extra, empty }: { items: { key: string; label: string; type?: FieldType }[]; label: string; onMove: (from: number, to: number) => void; onRemove: (i: number) => void; extra?: (i: number) => ReactNode; empty: string }) {
  const { t } = useI18n();
  if (items.length === 0) return <p className="px-1 py-1.5 text-xs text-muted-foreground">{empty}</p>;
  const onKey = (e: KeyboardEvent, i: number) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onMove(i, i - 1);
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      onMove(i, i + 1);
    }
  };
  return (
    <ul className="flex list-none flex-wrap gap-1.5 p-0" aria-label={label}>
      {items.map((it, i) => (
        <li
          key={`${it.key}-${i}`}
          tabIndex={0}
          draggable
          aria-label={t('rs.b.chip', { label: it.label, n: i + 1, m: items.length })}
          onKeyDown={(e) => onKey(e, i)}
          onDragStart={(e) => e.dataTransfer.setData(CHIP_MIME, String(i))}
          onDragOver={(e) => e.dataTransfer.types.includes(CHIP_MIME) && e.preventDefault()}
          onDrop={(e) => {
            const from = e.dataTransfer.getData(CHIP_MIME);
            if (from === '') return;
            e.preventDefault();
            e.stopPropagation();
            onMove(Number(from), i);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card pr-1 pl-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical aria-hidden className="size-3.5 cursor-grab text-muted-foreground" />
          {it.type && <TypeIcon type={it.type} />}
          <span className="max-w-[160px] truncate">{it.label}</span>
          {extra?.(i)}
          <button type="button" className="grid size-6 place-items-center rounded hover:bg-muted" onClick={() => onRemove(i)} aria-label={t('rs.b.removeItem', { label: it.label })}>
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A collapsible section of the builder's settings. */
export function Section({ title, hint, children, open = true, count, testId }: { title: string; hint?: string; children: ReactNode; open?: boolean; count?: number; testId?: string }) {
  return (
    <details open={open} className="group rounded-lg border bg-card" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {count ? <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{count}</span> : null}
        </span>
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="grid gap-2 border-t px-3 py-3">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {children}
      </div>
    </details>
  );
}

const slug = (s: string) =>
  `c_${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30) || Math.random().toString(36).slice(2, 8)}`;

/** Add or change a formula, checked against the API as it is typed. */
export function FormulaDialog({ dataset, definition, initial, existingKeys, functions, onSave, onClose }: { dataset: DatasetMeta; definition: Definition; initial?: Calculated; existingKeys: string[]; functions: { row: string[]; measure: string[] }; onSave: (c: Calculated) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [expr, setExpr] = useState(initial?.expr ?? '');
  const [kind, setKind] = useState<'row' | 'measure'>(initial?.kind ?? 'row');
  const [check, setCheck] = useState<{ ok: boolean; type?: string; error?: string } | null>(null);
  const others = { ...definition, calculated: definition.calculated.filter((c) => c.key !== initial?.key) };

  useEffect(() => {
    if (!expr.trim()) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await checkFormula(dataset.key, expr, kind, others);
      if (live) setCheck(res.ok ? res.data : { ok: false, error: res.error });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, kind, dataset.key]);

  const shown = expr.trim() ? check : null;
  const insert = (s: string) => setExpr((e) => `${e}${e && !e.endsWith(' ') && !e.endsWith('(') ? ' ' : ''}${s}`);
  const save = () => {
    let key = initial?.key ?? slug(label);
    while (!initial && existingKeys.includes(key)) key = `${key.slice(0, 34)}_${Math.random().toString(36).slice(2, 5)}`;
    onSave({ key, label: label.trim(), expr: expr.trim(), kind });
    onClose();
  };
  return (
    <Dialog
      title={initial ? t('rs.calc.edit') : t('rs.calc.title')}
      onClose={onClose}
      size="md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('rs.cancel')}
          </Button>
          <Button onClick={save} disabled={!label.trim() || !shown?.ok} data-testid="rs-formula-save">
            {t('rs.save.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextInput label={t('rs.calc.label')} required value={label} onChange={(e) => setLabel(e.target.value)} slotProps={{ htmlInput: { maxLength: 60, 'data-testid': 'rs-formula-label' } }} />
        <Labelled label={t('rs.calc.kind')}>
          <Pick label={t('rs.calc.kind')} value={kind} onChange={(k) => setKind(k as 'row' | 'measure')} options={[{ value: 'row', label: t('rs.calc.kind.row') }, { value: 'measure', label: t('rs.calc.kind.measure') }]} className="w-[260px]" />
        </Labelled>
        <TextInput label={t('rs.calc.expr')} required multiline minRows={3} value={expr} onChange={(e) => setExpr(e.target.value)} helper={t(kind === 'row' ? 'rs.calc.helpRow' : 'rs.calc.helpMeasure')} slotProps={{ htmlInput: { maxLength: 400, spellCheck: false, className: 'font-mono', 'data-testid': 'rs-formula-expr' } }} />
        <p role="status" className={cn('rounded-md px-3 py-2 text-sm', !shown ? 'bg-muted text-muted-foreground' : shown.ok ? 'bg-green-soft text-green-ink' : 'bg-red-soft text-red-ink')}>
          {!shown ? t('rs.calc.waiting') : shown.ok ? t('rs.calc.ok', { type: tk(t, `rs.type.${shown.type}`) }) : shown.error}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t('rs.calc.fields')}</h4>
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {dataset.fields.map((f) => (
                <button key={f.key} type="button" title={f.label} onClick={() => insert(f.key)} className="rounded border bg-card px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
                  {f.key}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t('rs.calc.functions')}</h4>
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {(kind === 'row' ? functions.row : functions.measure).map((fn) => (
                <button key={fn} type="button" onClick={() => insert(`${fn}(`)} className="rounded border bg-card px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
                  {fn}()
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('rs.calc.examples', { a: "percent(sum(paid), sum(amount))", b: "if(balance > 0, 'Due', 'Clear')", c: 'days_between(due_on, today())' })}</p>
      </div>
    </Dialog>
  );
}
