'use client';

import { Search } from 'lucide-react';
import { useId, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Dialog, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { FieldOption } from '@/lib/records';
import { matchesQuery } from '@/lib/table';
import { cn } from '@/lib/utils';

/**
 * Move one record or many (a student to another class or programme, a subject to another department). The places
 * are grouped (classes under their programme) and searchable; a reason is asked for when the module records one.
 */
export function MoveDialog({ title, places, current, reasonRequired, count, onMove, onClose }: { title: string; places: FieldOption[]; current?: string | null; reasonRequired?: boolean; count: number; onMove: (to: string, reason?: string) => Promise<string | null>; onClose: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [q, setQ] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = useMemo(() => {
    const out = new Map<string, FieldOption[]>();
    for (const p of places) if (p.value !== current && matchesQuery(`${p.group ?? ''} ${p.label}`, q)) out.set(p.group ?? '', [...(out.get(p.group ?? '') ?? []), p]);
    return [...out.entries()];
  }, [places, q, current]);
  const ready = !!to && (!reasonRequired || reason.trim().length >= 3);
  const move = () =>
    start(async () => {
      setError(null);
      const err = await onMove(to, reason.trim() || undefined);
      if (err) setError(err);
    });
  return (
    <Dialog
      title={title}
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={move} disabled={!ready || pending} data-testid="move-confirm">
            {count > 1 ? t('rk.move.many', { n: count }) : t('rk.move.one')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {error && (
          <p role="alert" className="m-0 rounded-md border border-red-soft bg-red-soft/40 px-3 py-2 text-[13px] text-red-ink">
            {error}
          </p>
        )}
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('rk.move.search')} aria-label={t('rk.move.search')} className="h-9 pl-8" autoFocus />
        </div>
        <div role="radiogroup" aria-labelledby={`${id}-to`} className="max-h-[40vh] overflow-y-auto rounded-md border border-border">
          <span id={`${id}-to`} className="sr-only">
            {title}
          </span>
          {groups.length === 0 ? (
            <p className="m-0 px-3 py-4 text-center text-[13px] text-muted-foreground">{t('rk.move.nothing')}</p>
          ) : (
            groups.map(([group, list]) => (
              <div key={group} role="group" aria-label={group || undefined}>
                {group && <div className="sticky top-0 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{group}</div>}
                {list.map((p) => (
                  <label key={p.value} className={cn('flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-[13.5px] last:border-b-0 hover:bg-muted', to === p.value && 'bg-teal-soft hover:bg-teal-soft')}>
                    <input type="radio" name={`${id}-place`} value={p.value} checked={to === p.value} onChange={() => setTo(p.value)} className="accent-[var(--color-primary)]" data-testid={`move-to-${p.value}`} />
                    {p.label}
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
        {reasonRequired && <TextInput label={t('rk.move.reason')} required value={reason} onChange={(e) => setReason(e.target.value)} multiline rows={2} inputProps={{ 'data-testid': 'move-reason' }} />}
      </div>
    </Dialog>
  );
}
