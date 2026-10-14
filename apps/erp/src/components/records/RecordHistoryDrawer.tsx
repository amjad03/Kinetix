'use client';

import { ArrowRight, History } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { recordHistory } from '@/app/(dashboard)/records-actions';
import { Button } from '@/components/shadcn/button';
import { EmptyState, Sheet, SkeletonText } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { optionLabel, type HistoryEntry, type RecordMeta } from '@/lib/records';
import { actionText, options, tr } from './text';

/**
 * A record's history from the audit log, newest first: who did what and when, and for each changed field its value
 * before and after (choices shown by name, not id).
 */
export function RecordHistoryDrawer({ meta, id, title, onClose }: { meta: RecordMeta; id: string; title: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (offset: number) =>
    start(async () => {
      const res = await recordHistory(meta.key, id, offset);
      if (!res.ok) return setError(res.error);
      setTotal(res.data.total);
      setItems((prev) => (offset ? [...(prev ?? []), ...res.data.items] : res.data.items));
    });
  useEffect(() => load(0), [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = (field: string, v: unknown) => {
    const f = meta.fields.find((x) => x.key === field || x.rowKey === field);
    const opts = f?.options ? options(t, meta.key, f.key, f.options) : meta.move && /id$/i.test(field) ? meta.move.options : null;
    return optionLabel(opts, v);
  };
  const label = (c: HistoryEntry['changes'][number]) => {
    const f = meta.fields.find((x) => x.key === c.field || x.rowKey === c.field);
    return f ? tr(t, `rk.f.${meta.key}.${f.key}`, f.label) : c.label;
  };

  return (
    <Sheet open title={t('rk.history.title')} subtitle={title} onClose={onClose} width={520}>
      <div data-testid="record-history">
        {error ? (
          <p role="alert" className="text-[13px] text-red-ink">
            {error}
          </p>
        ) : items === null ? (
          <SkeletonText lines={6} />
        ) : items.length === 0 ? (
          <EmptyState dense icon={<History />} title={t('rk.history.none')} />
        ) : (
          <ol className="m-0 grid list-none gap-4 p-0">
            {items.map((e) => (
              <li key={e.id} className="relative border-l-2 border-border pl-4">
                <span aria-hidden className="absolute top-1.5 -left-[5px] size-2 rounded-full bg-primary" />
                <p className="m-0 text-[13.5px] font-semibold">{actionText(t, e.action)}</p>
                <p className="m-0 text-xs text-muted-foreground">
                  {e.actor.name ?? (e.actor.type === 'system' ? t('rk.history.system') : t('rk.history.someone'))} · <time dateTime={e.at}>{fmt.dateTime(e.at)}</time>
                </p>
                {e.changes.length > 0 && (
                  <dl className="mt-2 grid gap-1.5 text-[13px]">
                    {e.changes.map((c) => (
                      <div key={c.field} className="grid gap-0.5">
                        <dt className="text-xs font-semibold text-muted-foreground">{label(c)}</dt>
                        <dd className="m-0 flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-red-soft/50 px-1.5 text-red-ink line-through decoration-1">{value(c.field, c.before)}</span>
                          <ArrowRight aria-label={t('rk.history.to')} className="size-3.5 text-muted-foreground" />
                          <span className="rounded bg-green-soft/60 px-1.5 text-green-ink">{value(c.field, c.after)}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {typeof e.data?.reason === 'string' && <p className="mt-1 mb-0 text-[13px] text-muted-foreground">{t('rk.history.reason', { reason: e.data.reason })}</p>}
                {typeof e.data?.to === 'string' && e.changes.length === 0 && <p className="mt-1 mb-0 text-[13px] text-muted-foreground">{t('rk.history.movedTo', { to: e.data.to })}</p>}
              </li>
            ))}
          </ol>
        )}
        {items && items.length < total && (
          <Button variant="outline" className="mt-4" onClick={() => load(items.length)} disabled={pending}>
            {t('rk.history.more')}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
