'use client';

import { Ban, FileDown, Printer, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { useWord } from '@/components/fee-desk/SpecTable';
import { Button } from '@/components/shadcn/button';
import { Card, Dialog, SelectInput, StatusPill, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { toneOf } from '@/lib/fee-desk';
import { isInstrument, needsReference, PAY_MODES, receiptState, rupeesInput, type ReceiptView } from '@/lib/fee-depth';
import type { RoleName } from '@/lib/types';
import { DeskDialog } from './DeskDialog';

const PRINT_CSS = `@media print {
  @page { margin: 12mm; }
  html, body { background: #fff !important; }
  .kx-chrome, .kx-noprint { display: none !important; }
  .kx-shell { display: block !important; min-height: 0 !important; background: #fff !important; }
  .kx-main { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .kx-receipt { border: 1px solid #9aa0a6 !important; box-shadow: none !important; color: #000 !important; max-width: none !important; }
  .kx-receipt * { color: #000 !important; }
}`;

/**
 * A receipt as it is printed: every fee and head it paid, the modes, the amount in words and the balance left; a
 * second print says "Duplicate". The receipt is never deleted: it may be asked to be cancelled (approved by the
 * receipt-cancel chain, which reverses the books) and then reissued under a new number.
 */
export function ReceiptPanel({ r, me }: { r: ReceiptView; me: { id: string; roles: RoleName[] } }) {
  const { t, fmt } = useI18n();
  const word = useWord();
  const router = useRouter();
  const toast = useToastOptional();
  const [dialog, setDialog] = useState<'cancel' | 'reissue' | 'decide' | null>(null);
  const [pending, start] = useTransition();
  const st = receiptState(r);
  const duplicate = r.printCount > 0;
  const deciders: RoleName[] = ['principal', 'tenant_admin', 'hod', 'accountant'];
  const canDecide = r.status === 'cancel_pending' && me.roles.some((x) => deciders.includes(x)) && r.cancel?.requestedBy !== me.id;

  const print = () =>
    start(async () => {
      const res = await deskSend<{ printCount: number }>(`/v1/fee-collect/receipts/${r.id}/print`, {});
      if (!res.ok) return toast?.error(res.error);
      window.print();
      router.refresh();
    });

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="kx-noprint mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={toneOf(r.status)}>{word(r.status)}</StatusPill>
          {r.printCount > 0 && <span className="text-sm text-muted-foreground">{t('fx.printedTimes', { n: r.printCount })}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" disabled={pending} onClick={print}>
            <Printer className="size-4" /> {duplicate ? t('fx.printDuplicate') : t('fx.print')}
          </Button>
          <Button variant="outline" className="h-9" onClick={() => window.open(`/api/fee-receipt/${r.id}`, '_blank')}>
            <FileDown className="size-4" /> {t('fx.pdf')}
          </Button>
          {st.canCancel && (
            <Button variant="outline" className="h-9" onClick={() => setDialog('cancel')}>
              <Ban className="size-4" /> {t('fx.askCancel')}
            </Button>
          )}
          {canDecide && (
            <Button className="h-9" onClick={() => setDialog('decide')}>
              {t('fx.decideCancel')}
            </Button>
          )}
          {st.canReissue && (
            <Button className="h-9" onClick={() => setDialog('reissue')}>
              <RotateCcw className="size-4" /> {t('fx.reissue')}
            </Button>
          )}
        </div>
      </div>

      {r.cancel && (
        <Card className="kx-noprint mb-6">
          <p className="m-0 text-sm">
            <b>{r.status === 'cancel_pending' ? t('fx.cancelWaiting') : r.status === 'bounced' ? t('fx.receiptBounced') : t('fx.receiptCancelled')}</b> {r.cancel.reason}
          </p>
          {r.reissuedAs && (
            <p className="m-0 mt-2 text-sm">
              {t('fx.reissuedAs')} <Link className="underline" href={`/fees/receipt/${r.reissuedAs.id}`}>{r.reissuedAs.receiptNo}</Link>
            </p>
          )}
        </Card>
      )}

      <Card className="kx-receipt mx-auto max-w-[760px] p-5 md:p-10">
        <div data-testid="fee-receipt">
          <div className="text-center">
            <h2 className="m-0 text-xl font-semibold">{r.institution}</h2>
            <p className="m-0 mt-1 text-sm font-semibold tracking-wide uppercase">{t('fx.feeReceipt')}</p>
            {duplicate && <p className="m-0 mt-1 text-xs font-semibold text-destructive uppercase">{t('fx.duplicateCopy')}</p>}
            {st.taken && <p className="m-0 mt-1 text-xs font-semibold text-destructive uppercase">{word(r.status)}</p>}
          </div>
          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('fx.col.receipt')}</dt>
              <dd className="m-0 font-mono font-semibold">{r.receiptNo}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('fx.col.date')}</dt>
              <dd className="m-0">{fmt.date(r.date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('fx.col.student')}</dt>
              <dd className="m-0 text-right">
                <Link className="hover:underline" href={`/accounts/accounts/${r.student.id}`}>
                  {r.student.fullName}
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('fx.col.class')}</dt>
              <dd className="m-0 text-right">
                {r.student.section} · {r.student.rollNo}
              </dd>
            </div>
          </dl>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">{t('fx.col.towards')}</th>
                  <th className="py-2 font-medium">{t('fx.col.head')}</th>
                  <th className="py-2 text-right font-medium">{t('fx.col.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((it) => (
                  <tr key={`${it.invoiceId}:${it.headCode}`} className="border-b">
                    <td className="py-2">
                      {it.title}
                      {it.invoiceNo && <span className="block text-xs text-muted-foreground">{it.invoiceNo}</span>}
                    </td>
                    <td className="py-2">
                      {it.head}
                      {it.gstRate > 0 && <span className="block text-xs text-muted-foreground">{t('fx.gstIncl', { rate: it.gstRate, sac: it.sac ?? '—' })}</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt.rupees(it.amountPaise)}</td>
                  </tr>
                ))}
                {r.advancePaise > 0 && (
                  <tr className="border-b">
                    <td className="py-2" colSpan={2}>
                      {t('fx.advanceKept')}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt.rupees(r.advancePaise)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 font-semibold" colSpan={2}>
                    {t('fx.totalReceived')}
                  </td>
                  <td className="pt-3 text-right font-semibold tabular-nums" data-testid="receipt-total">
                    {fmt.rupees(r.totalPaise)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="m-0 mt-2 text-sm">{r.inWords}</p>
          <div className="mt-4 grid gap-1 text-sm">
            {r.modes.map((m, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-3">
                <span>
                  {word(m.method)}
                  {m.chequeNo ? ` · ${m.chequeNo}` : ''}
                  {m.bankName ? ` · ${m.bankName}` : ''}
                  {m.reference && !m.chequeNo ? ` · ${m.reference}` : ''}
                </span>
                <span className="tabular-nums">{fmt.rupees(m.amountPaise)}</span>
              </div>
            ))}
          </div>
          <p className="m-0 mt-4 text-sm">{t('fx.balanceAfter', { amount: fmt.rupees(r.balancePaise) })}</p>
          {r.cheques.length > 0 && <p className="m-0 mt-1 text-xs text-muted-foreground">{t('fx.subjectToRealisation')}</p>}
          {r.note && <p className="m-0 mt-2 text-xs text-muted-foreground">{r.note}</p>}
          {r.reissueOf && <p className="m-0 mt-2 text-xs text-muted-foreground">{t('fx.reissueOf', { no: r.reissueOf.receiptNo })}</p>}
          <p className="m-0 mt-8 text-center text-xs text-muted-foreground">{t('fx.computerGenerated')}</p>
        </div>
      </Card>

      {dialog === 'cancel' && <DeskDialog title={t('fx.askCancelTitle', { no: r.receiptNo })} path={`/v1/fee-collect/receipts/${r.id}/cancel`} fields={[{ name: 'reason', label: 'fx.col.reason', kind: 'textarea', required: true }]} intro={t('fx.askCancelIntro')} done="fx.done.cancelAsked" onClose={() => setDialog(null)} />}
      {dialog === 'decide' && <DecideCancel id={r.id} onClose={() => setDialog(null)} />}
      {dialog === 'reissue' && <Reissue r={r} onClose={() => setDialog(null)} />}
    </>
  );
}

/** Approves or rejects a receipt cancellation (the receipt-cancel chain decides who may). */
function DecideCancel({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (decision: 'approve' | 'reject') =>
    start(async () => {
      const res = await deskSend(`/v1/fee-collect/receipts/${id}/cancel/decide`, { decision, comment });
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={t('fx.decideCancel')}
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" disabled={pending} onClick={() => send('reject')}>
            {t('fx.keepReceipt')}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => send('approve')}>
            {t('fx.approveCancel')}
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-sm text-muted-foreground">{t('fx.decideCancelIntro')}</p>
      <TextInput label={t('fx.f.comment')} value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} />
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/** Collects a cancelled receipt's fees again under a new number, with the modes corrected. */
function Reissue({ r, onClose }: { r: ReceiptView; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const word = useWord();
  const router = useRouter();
  const total = r.totalPaise;
  const [method, setMethod] = useState(r.modes[0]?.method && PAY_MODES.includes(r.modes[0].method as never) ? r.modes[0].method : 'cash');
  const [reference, setReference] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(total / 100));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const paise = rupeesInput(amount);
      if (paise === null) return setError(t('fx.err.amount'));
      const mode = { method, amountPaise: paise, ...(needsReference(method) ? { reference } : {}), ...(isInstrument(method) ? { chequeNo, bankName, chequeDate } : {}) };
      const res = await deskSend<{ id: string }>(`/v1/fee-collect/receipts/${r.id}/reissue`, { modes: [mode] });
      if (!res.ok) return setError(res.error);
      onClose();
      router.push(`/fees/receipt/${res.data.id}`);
    });
  return (
    <Dialog
      title={t('fx.reissueTitle', { no: r.receiptNo })}
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('fd.cancel')}
          </Button>
          <Button onClick={send} disabled={pending}>
            {t('fx.reissue')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-sm text-muted-foreground">{t('fx.reissueIntro', { amount: fmt.rupees(total) })}</p>
        <SelectInput label={t('fx.f.mode')} value={method} onChange={(e) => setMethod(e.target.value)} options={PAY_MODES.map((m) => ({ value: m, label: word(m) }))} />
        <TextInput label={t('fx.f.amount')} value={amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ inputMode: 'decimal' }} />
        {needsReference(method) && <TextInput label={t('fx.f.utr')} value={reference} onChange={(e) => setReference(e.target.value)} />}
        {isInstrument(method) && (
          <>
            <TextInput label={method === 'dd' ? t('fx.f.ddNo') : t('fx.f.chequeNo')} value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
            <TextInput label={t('fx.f.bank')} value={bankName} onChange={(e) => setBankName(e.target.value)} />
            <TextInput label={t('fx.f.instrumentDate')} type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
          </>
        )}
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
