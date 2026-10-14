'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { closeVerification, saveCounts } from '@/app/(dashboard)/inventory/actions';
import { ConfirmDialog } from '@/components/records/ConfirmDialog';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { RecordPage } from '@/components/templates';
import { Card, CheckboxField, StatusPill, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone, type Verification } from '@/lib/procurement';

/**
 * The count sheet of one stock verification: the book quantity of every item in the store, what was counted and a
 * remark; the difference and its value show as counts are typed. Closing it can set the stock to the count.
 */
export function VerificationSheet({ data, canAdjust }: { data: Verification; canAdjust: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counts, setCounts] = useState<Record<string, { qty: string; remark: string }>>(() => Object.fromEntries(data.lines.map((l) => [l.itemId, { qty: l.countedQty === null ? '' : String(l.countedQty), remark: l.remark }])));
  const [closing, setClosing] = useState(false);
  const [adjust, setAdjust] = useState(canAdjust);
  const open = data.status === 'open';

  const changed = data.lines.filter((l) => {
    const c = counts[l.itemId];
    return c && c.qty.trim() !== '' && (String(l.countedQty ?? '') !== c.qty.trim() || l.remark !== c.remark);
  });
  const save = () =>
    start(async () => {
      const bad = changed.find((l) => !/^\d+$/.test(counts[l.itemId].qty.trim()));
      if (bad) return void toast.error(t('ops.err.field', { field: bad.item }));
      const r = await saveCounts(data.id, changed.map((l) => ({ itemId: l.itemId, countedQty: Number(counts[l.itemId].qty), remark: counts[l.itemId].remark })));
      if (!r.ok) return void toast.error(r.error);
      toast.success(t('ops.saved'));
      router.refresh();
    });
  const close = () =>
    start(async () => {
      const r = await closeVerification(data.id, adjust);
      if (!r.ok) return void toast.error(r.error);
      setClosing(false);
      toast.success(t('ivd.vf.closed'));
      router.refresh();
    });

  return (
    <>
      <RecordPage
        title={`${data.number} · ${data.store}`}
        subtitle={t('ivd.vf.subtitle', { year: data.fiscalYear })}
        status={{ label: t(`ivd.vs.${data.status}`), tone: statusTone(data.status) }}
        facts={[
          { label: t('ivd.vf.items'), value: fmt.number(data.summary.items) },
          { label: t('ivd.counted'), value: fmt.number(data.summary.counted) },
          { label: t('ivd.vf.short'), value: fmt.number(data.summary.short) },
          { label: t('ivd.vf.excess'), value: fmt.number(data.summary.excess) },
          { label: t('ivd.vf.value'), value: fmt.rupees(data.summary.varianceValuePaise) },
        ]}
        primary={
          open ? (
            <>
              <Button variant="outline" disabled={pending || changed.length === 0} onClick={save} data-testid="vf-save">
                {t('ivd.vf.save', { n: changed.length })}
              </Button>
              <Button disabled={pending || data.summary.counted === 0 || changed.length > 0} onClick={() => setClosing(true)} data-testid="vf-close">
                {t('ivd.vf.close')}
              </Button>
            </>
          ) : undefined
        }
        overview={
          <Card title={t('ivd.vf.sheet')}>
            {data.note && <p className="mb-3 text-sm text-muted-foreground">{data.note}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('inv.item')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('ivd.vf.book')}</th>
                    <th className="py-2 pr-3 font-medium">{t('ivd.vf.count')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('ivd.vf.diff')}</th>
                    <th className="py-2 font-medium">{t('ivd.vf.remark')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => {
                    const c = counts[l.itemId] ?? { qty: '', remark: '' };
                    const typed = /^\d+$/.test(c.qty.trim()) ? Number(c.qty) - l.bookQty : null;
                    return (
                      <tr key={l.id} className="border-b last:border-0">
                        <th scope="row" className="py-2 pr-3 text-left font-normal">
                          {l.item}
                          <span className="block text-xs text-muted-foreground">{l.sku}</span>
                        </th>
                        <td className="py-2 pr-3 text-right">{`${fmt.number(l.bookQty)} ${l.unit}`}</td>
                        <td className="py-2 pr-3">
                          {open ? (
                            <Input className="h-9 w-24" inputMode="numeric" aria-label={t('ivd.vf.countOf', { item: l.item })} value={c.qty} onChange={(e) => setCounts({ ...counts, [l.itemId]: { ...c, qty: e.target.value } })} />
                          ) : (
                            fmt.number(l.countedQty ?? 0)
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">{typed === null ? '—' : typed === 0 ? '0' : <StatusPill tone={typed < 0 ? 'danger' : 'warning'}>{typed > 0 ? `+${typed}` : typed}</StatusPill>}</td>
                        <td className="py-2">
                          {open ? <Input className="h-9 min-w-[160px]" aria-label={t('ivd.vf.remarkOf', { item: l.item })} value={c.remark} onChange={(e) => setCounts({ ...counts, [l.itemId]: { ...c, remark: e.target.value } })} /> : l.remark || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.lines.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('ivd.vf.empty')}</p>}
          </Card>
        }
      />
      {closing && (
        <ConfirmDialog title={t('ivd.vf.close')} confirmLabel={t('ivd.vf.close')} busy={pending} onConfirm={close} onClose={() => setClosing(false)}>
          <p className="mb-3">{t('ivd.vf.closeHelp', { counted: data.summary.counted, items: data.summary.items })}</p>
          {canAdjust ? <CheckboxField label={t('ivd.vf.adjust')} checked={adjust} onChange={setAdjust} /> : <p className="text-sm text-muted-foreground">{t('ivd.vf.adjustApprover')}</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
