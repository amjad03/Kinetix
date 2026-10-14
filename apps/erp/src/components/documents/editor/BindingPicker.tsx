'use client';
import { Braces, Search } from 'lucide-react';
import { Popover } from 'radix-ui';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { bind } from '@/lib/doc-editor/bindings';
import type { DocBinding, DocData } from '@/lib/doc-editor/schema';
import { cn } from '@/lib/utils';
import { inputClass } from './controls';

const FILTERS = ['', 'upper', 'title', 'date', 'money', 'words', 'initials'] as const;

/** The block a binding belongs to ("student", "institution"), for grouping. */
const blockOf = (key: string) => key.split('.')[0];

/**
 * A searchable list of the document type's data fields with their sample values; picking one
 * inserts `{{key}}` (with an optional filter such as `| upper` or `| date`).
 */
export function BindingPicker({ bindings, data, onPick, kind = 'value', trigger, rowKeys }: { bindings: DocBinding[]; data: DocData; onPick: (expr: string, b: DocBinding | null) => void; kind?: 'value' | 'list'; trigger?: ReactNode; rowKeys?: string[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('');
  const list = useMemo(() => {
    const rows = rowKeys ? rowKeys.map((k) => ({ key: `row.${k}`, label: k, kind: 'value' as const, sample: '' })) : bindings.filter((b) => b.kind === kind);
    const s = q.trim().toLowerCase();
    return s ? rows.filter((b) => b.key.toLowerCase().includes(s) || b.label.toLowerCase().includes(s) || b.sample.toLowerCase().includes(s)) : rows;
  }, [bindings, kind, q, rowKeys]);
  const groups = useMemo(() => {
    const m = new Map<string, DocBinding[]>();
    for (const b of list) m.set(blockOf(b.key), [...(m.get(blockOf(b.key)) ?? []), b]);
    return [...m.entries()];
  }, [list]);
  const pick = (b: DocBinding) => {
    onPick(kind === 'list' ? b.key : `{{${b.key}${filter ? ` | ${filter}` : ''}}}`, b);
    setOpen(false);
    setQ('');
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button type="button" className="flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-[12px] font-medium hover:bg-muted" data-testid="insert-field">
            <Braces className="size-3.5" /> {t('de.insertField')}
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="end" className="z-[60] flex max-h-[min(520px,70vh)] w-[340px] flex-col rounded-lg border bg-popover text-popover-foreground shadow-xl outline-none">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus aria-label={t('de.searchFields')} placeholder={t('de.searchFields')} value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputClass, 'pl-7')} />
            </div>
            {kind === 'value' && !rowKeys && (
              <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('de.filter')}>
                {FILTERS.map((f) => (
                  <button key={f || 'none'} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={cn('rounded-full border px-2 py-0.5 text-[11px]', filter === f ? 'border-primary bg-primary/10 font-semibold text-primary' : 'hover:bg-muted')}>
                    {t(`de.filter.${f || 'none'}` as MessageKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox" aria-label={t('de.fields')}>
            {!list.length && <p className="m-0 p-3 text-center text-[12px] text-muted-foreground">{t('de.noFields')}</p>}
            {groups.map(([g, items]) => (
              <div key={g}>
                {!rowKeys && <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{g}</div>}
                {items.map((b) => {
                  const sample = kind === 'list' ? b.sample : rowKeys ? '' : bind(`{{${b.key}${filter ? ` | ${filter}` : ''}}}`, data);
                  return (
                    <button key={b.key} type="button" role="option" aria-selected={false} onClick={() => pick(b)} className="grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted" data-testid={`binding-${b.key}`}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">{b.label.includes(': ') ? b.label.split(': ').slice(1).join(': ') : b.label}</span>
                        <code className="shrink-0 text-[10px] text-muted-foreground">{b.key}</code>
                      </span>
                      {sample && <span className="truncate text-[11px] text-muted-foreground">{sample}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A multi-line text with `{{placeholders}}`: inserts a field at the cursor and shows how it reads with the data. */
export function BindingText({ value, onChange, bindings, data, label, rows = 3, rowKeys, id, invalid, showPreview = true }: { value: string; onChange: (v: string) => void; bindings: DocBinding[]; data: DocData; label: string; rows?: number; rowKeys?: string[]; id?: string; invalid?: boolean; showPreview?: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (expr: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + expr + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + expr.length, start + expr.length);
    });
  };
  const preview = value.includes('{{') && !rowKeys ? bind(value, data) : '';
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
          {label}
        </label>
        <BindingPicker bindings={bindings} data={data} rowKeys={rowKeys} onPick={(e) => insert(e)} />
      </div>
      <textarea id={id} ref={ref} rows={rows} aria-invalid={invalid || undefined} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, 'h-auto resize-y py-1.5 font-mono text-[12px] leading-relaxed')} />
      {showPreview && preview && (
        <p className="m-0 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
          <span className="font-semibold">{t('de.reads')}</span> {preview.length > 160 ? `${preview.slice(0, 160)}…` : preview}
        </p>
      )}
    </div>
  );
}
