'use client';

import { BadgeIndianRupee, FileText, Plus, Printer, ReceiptText, Trash2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { deskPeek, deskSend } from '@/app/(dashboard)/accounts/actions';
import { useWord } from '@/components/fee-desk/SpecTable';
import { Button } from '@/components/shadcn/button';
import { Card, Dialog, EmptyState, SelectInput, StatGrid, StatTile, StatusPill, SwitchField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { toneOf } from '@/lib/fee-desk';
import { isInstrument, needsReference, PAY_MODES, rupeesInput, shortfall, type ReceiptView, type StudentDues, type StudentHit } from '@/lib/fee-depth';
import { NewChallan } from './ChallanActions';
import { StudentPicker } from './StudentPicker';

type ModeRow = { method: string; amount: string; reference: string; chequeNo: string; bankName: string; chequeDate: string };
type Preview = { allocatedPaise: number; excessPaise: number; rows: { invoiceId: string; headCode: string; head: string; balancePaise: number; amountPaise: number }[] };

const blank = (method = 'cash', amount = ''): ModeRow => ({ method, amount, reference: '', chequeNo: '', bankName: '', chequeDate: new Date().toISOString().slice(0, 10) });

/**
 * The fees counter: find the student, see every open fee by head (oldest first) with instalments due, take one or
 * more payment modes on one receipt, let the split follow head priority or set it by hand, keep anything extra as
 * advance, and print the receipt. Also pays from advance and issues a bank challan for the same dues.
 */
export function Counter({ dues, modes: enabled }: { dues: StudentDues | null; modes: string[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const word = useWord();
  const [modes, setModes] = useState<ModeRow[]>(() => [blank('cash', dues && dues.duePaise > 0 ? String(dues.duePaise / 100) : '')]);
  const [manual, setManual] = useState(false);
  const [split, setSplit] = useState<Record<string, string>>({});
  const [keepExcess, setKeepExcess] = useState(false);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [pending, start] = useTransition();

  const allowed = PAY_MODES.filter((m) => enabled.length === 0 || enabled.includes(m === 'card' ? 'online' : m));
  const paise = modes.map((m) => rupeesInput(m.amount) ?? 0);
  const total = paise.reduce((a, b) => a + b, 0);
  const lines = useMemo(() => (dues?.invoices ?? []).flatMap((i) => i.lines.filter((l) => l.balancePaise > 0).map((l) => ({ ...l, invoice: i }))), [dues]);
  const manualTotal = lines.reduce((a, l) => a + (rupeesInput(split[l.id] ?? '') ?? 0), 0);
  const left = dues ? shortfall(dues.duePaise, modes.map((_, i) => ({ amountPaise: paise[i] }))) : 0;

  // The automatic split, refreshed as the amount changes.
  useEffect(() => {
    if (!dues || manual || total <= 0) return;
    const timer = setTimeout(async () => {
      const res = await deskPeek<Preview>('/v1/fee-collect/preview', { studentId: dues.student.id, amountPaise: total });
      setPreview(res.ok ? res.data : null);
    }, 250);
    return () => clearTimeout(timer);
  }, [dues, manual, total]);

  if (!dues)
    return (
      <Card title={t('fx.counter')} subtitle={t('fx.counterHint')}>
        <StudentPicker autoFocus onPick={(s: StudentHit) => router.push(`/fees/counter?student=${s.id}`)} />
      </Card>
    );

  const setMode = (i: number, p: Partial<ModeRow>) => setModes(modes.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const problem = (): string | null => {
    if (total <= 0) return t('fx.err.amount');
    for (const [i, m] of modes.entries()) {
      if (rupeesInput(m.amount) === null) return t('fx.err.amount');
      if (isInstrument(m.method) && (!m.chequeNo.trim() || !m.bankName.trim() || !m.chequeDate)) return t('fx.err.cheque');
      if (needsReference(m.method) && !m.reference.trim()) return t('fx.err.reference', { mode: word(modes[i].method) });
    }
    if (manual && manualTotal > total) return t('fx.err.splitOver');
    if (total > dues.duePaise && !keepExcess && !manual) return t('fx.err.excess', { amount: fmt.rupees(total - dues.duePaise) });
    return null;
  };

  const collect = () =>
    start(async () => {
      const p = problem();
      if (p) return setError(p);
      const body = {
        studentId: dues.student.id,
        keepExcess,
        note,
        modes: modes.map((m, i) => ({ method: m.method, amountPaise: paise[i], ...(needsReference(m.method) ? { reference: m.reference.trim() } : {}), ...(isInstrument(m.method) ? { chequeNo: m.chequeNo.trim(), bankName: m.bankName.trim(), chequeDate: m.chequeDate } : {}) })),
        ...(manual ? { allocations: lines.map((l) => ({ invoiceId: l.invoiceId, headCode: l.headCode, amountPaise: rupeesInput(split[l.id] ?? '') ?? 0 })).filter((a) => a.amountPaise > 0) } : {}),
      };
      const res = await deskSend<ReceiptView>('/v1/fee-collect/counter', body);
      if (!res.ok) return setError(res.error);
      setError(null);
      setReceipt(res.data);
    });

  const fromAdvance = () =>
    start(async () => {
      const res = await deskSend<ReceiptView>(`/v1/fee-collect/students/${dues.student.id}/from-advance`, {});
      if (!res.ok) return setError(res.error);
      setReceipt(res.data);
    });

  const s = dues.student;
  const blocked = [dues.blocks.hallTicket && t('fx.block.hallTicket'), dues.blocks.results && t('fx.block.results'), dues.blocks.tc && t('fx.block.tc')].filter(Boolean) as string[];

  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="m-0 text-lg font-semibold">{s.fullName}</h2>
            <p className="m-0 text-sm text-muted-foreground">
              {s.rollNo} · {s.section}
            </p>
            {blocked.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {blocked.map((b) => (
                  <StatusPill key={b} tone="danger">
                    {b}
                  </StatusPill>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="h-9">
              <Link href={`/accounts/accounts/${s.id}`}>
                <FileText className="size-4" /> {t('fx.feeAccount')}
              </Link>
            </Button>
            <NewChallan student={{ id: s.id, fullName: s.fullName, rollNo: s.rollNo, section: s.section, status: s.status, duePaise: dues.duePaise }} />
            <Button variant="outline" className="h-9" onClick={() => router.push('/fees/counter')}>
              {t('fx.nextStudent')}
            </Button>
          </div>
        </div>
      </Card>

      <StatGrid min={180}>
        <StatTile label={t('fx.kpi.due')} value={fmt.rupees(dues.duePaise)} testId="counter-due" />
        <StatTile label={t('fx.kpi.overdue')} value={fmt.rupees(dues.overduePaise)} tone={dues.overduePaise > 0 ? 'warning' : 'default'} />
        <StatTile label={t('fx.kpi.advance')} value={fmt.rupees(dues.advancePaise)} />
        <StatTile label={t('fx.kpi.receipts')} value={dues.receipts.length} />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card title={t('fx.openFees')} subtitle={t('fx.openFeesHint')}>
          {dues.invoices.length === 0 ? (
            <EmptyState icon={<BadgeIndianRupee />} title={t('fx.nothingDue')} dense>
              {dues.advancePaise > 0 ? t('fx.advanceHeld', { amount: fmt.rupees(dues.advancePaise) }) : t('fx.nothingDueBody')}
            </EmptyState>
          ) : (
            <div className="grid gap-4">
              {dues.invoices.map((inv) => (
                <div key={inv.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                    <span className="min-w-0">
                      <b className="font-[550]">{inv.title}</b>
                      <span className="ml-2 text-xs text-muted-foreground">{inv.invoiceNo ?? ''}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      {t('fx.dueOnDate', { date: fmt.date(inv.dueOn, 'short') })}
                      {inv.overdue && <StatusPill tone="danger">{t('fx.overdue')}</StatusPill>}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">{t('fx.col.head')}</th>
                          <th className="px-4 py-2 text-right font-medium">{t('fx.col.charge')}</th>
                          <th className="px-4 py-2 text-right font-medium">{t('fx.col.paid')}</th>
                          <th className="px-4 py-2 text-right font-medium">{t('fx.col.balance')}</th>
                          {manual && <th className="px-4 py-2 text-right font-medium">{t('fx.col.payNow')}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {inv.lines.map((l) => (
                          <tr key={l.id} className="border-t">
                            <td className="px-4 py-2">
                              {l.headName}
                              {l.waivedPaise > 0 && <span className="ml-1 text-xs text-muted-foreground">({t('fx.lessWaived', { amount: fmt.rupees(l.waivedPaise) })})</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">{fmt.rupees(l.netPaise)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{fmt.rupees(l.paidPaise)}</td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums">{fmt.rupees(l.balancePaise)}</td>
                            {manual && (
                              <td className="px-4 py-1.5 text-right">
                                {l.balancePaise > 0 && <input aria-label={t('fx.payNowFor', { head: l.headName })} inputMode="decimal" className="h-9 w-28 rounded-md border bg-background px-2 text-right tabular-nums" value={split[l.id] ?? ''} onChange={(e) => setSplit({ ...split, [l.id]: e.target.value })} />}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {inv.instalments.length > 0 && (
                    <p className="m-0 border-t px-4 py-2 text-xs text-muted-foreground">
                      {t('fx.instalmentsDue', { now: fmt.rupees(inv.dueNowPaise), n: inv.instalments.length })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('fx.takePayment')}>
          <div className="grid gap-4">
            {modes.map((m, i) => (
              <div key={i} className="grid gap-3 rounded-lg border p-3">
                <div className="flex items-end gap-3">
                  <SelectInput label={t('fx.f.mode')} value={m.method} onChange={(e) => setMode(i, { method: e.target.value })} options={allowed.map((x) => ({ value: x, label: word(x) }))} />
                  <TextInput label={t('fx.f.amount')} value={m.amount} onChange={(e) => setMode(i, { amount: e.target.value })} inputProps={{ inputMode: 'decimal' }} data-testid={`mode-amount-${i}`} />
                  {modes.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={t('fd.remove')} onClick={() => setModes(modes.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {needsReference(m.method) && <TextInput label={m.method === 'upi' ? t('fx.f.upiRef') : m.method === 'card' ? t('fx.f.cardRef') : t('fx.f.utr')} value={m.reference} onChange={(e) => setMode(i, { reference: e.target.value })} />}
                {isInstrument(m.method) && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <TextInput label={m.method === 'dd' ? t('fx.f.ddNo') : t('fx.f.chequeNo')} value={m.chequeNo} onChange={(e) => setMode(i, { chequeNo: e.target.value })} />
                    <TextInput label={t('fx.f.bank')} value={m.bankName} onChange={(e) => setMode(i, { bankName: e.target.value })} />
                    <TextInput label={t('fx.f.instrumentDate')} type="date" value={m.chequeDate} onChange={(e) => setMode(i, { chequeDate: e.target.value })} />
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-9" onClick={() => setModes([...modes, blank(modes.some((x) => x.method === 'cash') ? 'cheque' : 'cash', left > 0 ? String(left / 100) : '')])}>
                <Plus className="size-4" /> {t('fx.addMode')}
              </Button>
              {dues.duePaise > 0 && (
                <Button type="button" variant="outline" className="h-9" onClick={() => setModes([{ ...modes[0], amount: String(dues.duePaise / 100) }])}>
                  {t('fx.payAll')}
                </Button>
              )}
            </div>
            <SwitchField label={t('fx.manualSplit')} checked={manual} onChange={setManual} />
            {total > dues.duePaise && !manual && <SwitchField label={t('fx.keepExcess', { amount: fmt.rupees(total - dues.duePaise) })} checked={keepExcess} onChange={setKeepExcess} />}
            <TextInput label={t('fx.f.note')} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="rounded-md bg-muted/60 p-3 text-sm">
              <div className="flex justify-between">
                <span>{t('fx.receiving')}</span>
                <b className="tabular-nums">{fmt.rupees(total)}</b>
              </div>
              {manual ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('fx.splitSoFar')}</span>
                  <span className="tabular-nums">{fmt.rupees(manualTotal)}</span>
                </div>
              ) : (
                preview &&
                preview.rows.slice(0, 8).map((r) => (
                  <div key={`${r.invoiceId}:${r.headCode}`} className="flex justify-between text-muted-foreground">
                    <span className="truncate">{r.head}</span>
                    <span className="tabular-nums">{fmt.rupees(r.amountPaise)}</span>
                  </div>
                ))
              )}
              {!manual && preview && preview.excessPaise > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('fx.toAdvance')}</span>
                  <span className="tabular-nums">{fmt.rupees(preview.excessPaise)}</span>
                </div>
              )}
              {left > 0 && <p className="m-0 mt-1 text-xs text-muted-foreground">{t('fx.stillDueAfter', { amount: fmt.rupees(left) })}</p>}
            </div>
            {error && (
              <p role="alert" className="m-0 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={pending} onClick={collect} data-testid="counter-collect">
              <ReceiptText className="size-4" /> {t('fx.collectAndReceipt')}
            </Button>
            {dues.advancePaise > 0 && dues.duePaise > 0 && (
              <Button variant="outline" disabled={pending} onClick={fromAdvance}>
                <Wallet className="size-4" /> {t('fx.payFromAdvance', { amount: fmt.rupees(Math.min(dues.advancePaise, dues.duePaise)) })}
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Card title={t('fx.recentReceipts')}>
        {dues.receipts.length === 0 ? (
          <EmptyState icon={<ReceiptText />} title={t('fx.noReceipts')} dense />
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {dues.receipts.map((r) => (
              <li key={r.id}>
                <Link href={`/fees/receipt/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                  <span className="font-mono">{r.receiptNo}</span>
                  <span className="text-muted-foreground">{fmt.date(r.collectedOn, 'short')}</span>
                  <span className="tabular-nums">{fmt.rupees(r.totalPaise)}</span>
                  <StatusPill tone={toneOf(r.status)}>{word(r.status)}</StatusPill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {receipt && (
        <Dialog
          title={t('fx.receiptDone')}
          onClose={() => {
            setReceipt(null);
            setModes([blank()]);
            setSplit({});
            setPreview(null);
            router.refresh();
          }}
          actions={
            <>
              <Button variant="outline" onClick={() => window.open(`/api/fee-receipt/${receipt.id}`, '_blank')}>
                <Printer className="size-4" /> {t('fx.pdf')}
              </Button>
              <Button asChild variant="outline">
                <Link href={`/fees/receipt/${receipt.id}`}>{t('fx.openReceipt')}</Link>
              </Button>
              <Button
               
                onClick={() => {
                  setReceipt(null);
                  router.push('/fees/counter');
                }}
              >
                {t('fx.nextStudent')}
              </Button>
            </>
          }
        >
          <div className="grid gap-2 text-sm" data-testid="counter-receipt">
            <div className="flex justify-between">
              <span>{t('fx.col.receipt')}</span>
              <b className="font-mono" data-testid="counter-receipt-no">
                {receipt.receiptNo}
              </b>
            </div>
            <div className="flex justify-between">
              <span>{t('fx.col.amount')}</span>
              <b className="tabular-nums">{fmt.rupees(receipt.totalPaise)}</b>
            </div>
            <p className="m-0 text-muted-foreground">{receipt.inWords}</p>
            {receipt.items.map((it) => (
              <div key={`${it.invoiceId}:${it.headCode}`} className="flex justify-between text-muted-foreground">
                <span>{it.head}</span>
                <span className="tabular-nums">{fmt.rupees(it.amountPaise)}</span>
              </div>
            ))}
            {receipt.advancePaise > 0 && (
              <div className="flex justify-between">
                <span>{t('fx.toAdvance')}</span>
                <span className="tabular-nums">{fmt.rupees(receipt.advancePaise)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2">
              <span>{t('fx.balanceLeft')}</span>
              <b className="tabular-nums">{fmt.rupees(receipt.balancePaise)}</b>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
