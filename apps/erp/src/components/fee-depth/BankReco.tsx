'use client';

import { FileUp, Landmark, Link2, Link2Off, Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { deskRead, deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, Dialog, EmptyState, LinkTabs, SelectInput, StatGrid, StatTile, StatusPill, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { toneOf } from '@/lib/fee-desk';
import type { BankAccount, BankLine, Brs } from '@/lib/fee-depth';
import { DeskDialog } from './DeskDialog';

type Candidate = { voucherId: string; number: string; date: string; text: string; amountPaise: number };
type Settlement = { id: string; provider: string; reference: string; settlementDate: string; netPaise: number; bankLineId: string | null };

/**
 * Bank reconciliation for one bank ledger: import the bank's statement (CSV), let the lines match the books by
 * themselves, match the rest by hand (a voucher, or a gateway settlement), mark bank-only entries, and read the
 * reconciliation statement that explains the difference between the books and the bank.
 */
export function BankReco({ accounts, account, lines, status, brs, settlements }: { accounts: BankAccount[]; account: BankAccount | null; lines: BankLine[]; status: string; brs: Brs | null; settlements: Settlement[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const word = (v: string) => {
    const k = `fd.st.${v}` as MessageKey;
    const s = t(k);
    return s === k ? v : s;
  };
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState<BankLine | null>(null);
  const [ignoring, setIgnoring] = useState<BankLine | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!account)
    return (
      <EmptyState icon={<Landmark />} title={t('fx.noBankAccounts')}>
        {t('fx.noBankAccountsBody')}
      </EmptyState>
    );

  const auto = () =>
    start(async () => {
      const res = await deskSend<{ matched: number }>('/v1/accounts-depth/bank/auto-match', { accountId: account.id });
      if (!res.ok) return setError(res.error);
      setError(null);
      setMsg(t('fx.autoMatched', { n: res.data.matched }));
      router.refresh();
    });
  const unmatch = (l: BankLine) =>
    start(async () => {
      const res = await deskSend(`/v1/accounts-depth/bank/lines/${l.id}/unmatch`, {});
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  const cols: Column<BankLine>[] = [
    { id: 'date', header: t('fx.col.date'), rowHeader: true, cell: (l) => fmt.date(l.txnDate, 'short'), sort: (l) => l.txnDate },
    { id: 'text', header: t('fx.col.particulars'), cell: (l) => <span className="block max-w-[340px] whitespace-normal">{[l.reference, l.description].filter(Boolean).join(' · ')}</span> },
    { id: 'out', header: t('fx.col.withdrawal'), align: 'right', cell: (l) => (l.debitPaise ? fmt.rupees(l.debitPaise) : ''), sort: (l) => l.debitPaise },
    { id: 'in', header: t('fx.col.deposit'), align: 'right', cell: (l) => (l.creditPaise ? fmt.rupees(l.creditPaise) : ''), sort: (l) => l.creditPaise },
    { id: 'match', header: t('fx.col.matchedTo'), hideBelow: 'md', cell: (l) => (l.voucherNo ? `${l.voucherNo}${l.matchKind === 'auto' ? ` · ${t('fx.auto')}` : ''}` : l.settlement ? t('fx.settlementRef', { ref: l.settlement }) : (l.note ?? '—')) },
    { id: 'status', header: t('fx.col.status'), cell: (l) => <StatusPill tone={toneOf(l.status)}>{word(l.status)}</StatusPill> },
    {
      id: 'act',
      header: '',
      csv: false,
      cell: (l) =>
        l.status === 'unmatched' ? (
          <span className="flex gap-1">
            <Button variant="ghost" className="h-8 px-2" onClick={() => setMatching(l)}>
              <Link2 className="size-4" /> {t('fx.match')}
            </Button>
            <Button variant="ghost" className="h-8 px-2" onClick={() => setIgnoring(l)}>
              {t('fx.notInBooks')}
            </Button>
          </span>
        ) : (
          <Button variant="ghost" className="h-8 px-2" disabled={pending} onClick={() => unmatch(l)}>
            <Link2Off className="size-4" /> {t('fx.unmatch')}
          </Button>
        ),
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SelectInput label={t('fx.f.bankAccount')} value={account.id} onChange={(e) => router.push(`${pathname}?account=${e.target.value}`)} options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}${a.bankName ? ` · ${a.bankName}` : ''}` }))} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" disabled={pending} onClick={auto}>
            <Sparkles className="size-4" /> {t('fx.autoMatch')}
          </Button>
          <Button className="h-9" onClick={() => setImporting(true)}>
            <FileUp className="size-4" /> {t('fx.importStatement')}
          </Button>
        </div>
      </div>
      {msg && (
        <p role="status" className="m-0 rounded-md bg-muted px-4 py-3 text-sm">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      {brs && (
        <StatGrid min={190}>
          <StatTile label={t('fx.kpi.books')} value={fmt.rupees(brs.booksPaise)} caption={t('fx.asOn', { date: fmt.date(brs.asOn, 'short') })} />
          <StatTile label={t('fx.kpi.bankComputed')} value={fmt.rupees(brs.bankComputedPaise)} />
          <StatTile label={t('fx.kpi.bankStatement')} value={brs.bankStatementPaise === null ? '—' : fmt.rupees(brs.bankStatementPaise)} />
          <StatTile label={t('fx.kpi.difference')} value={brs.differencePaise === null ? '—' : fmt.rupees(brs.differencePaise)} tone={brs.differencePaise ? 'warning' : 'default'} />
        </StatGrid>
      )}
      <LinkTabs
        value={status}
        label={t('fx.bankReco')}
        items={['unmatched', 'matched', 'ignored', 'all', 'brs'].map((s) => ({ value: s, label: t(`fx.reco.${s}` as MessageKey), href: `${pathname}?${new URLSearchParams({ account: account.id, status: s })}` }))}
      />
      {status === 'brs' && brs ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {(
            [
              ['fx.brs.deposits', brs.depositsNotCredited],
              ['fx.brs.payments', brs.paymentsNotPresented],
            ] as const
          ).map(([label, list]) => (
            <Card key={label} title={t(label)} subtitle={fmt.rupees(list.reduce((a, x) => a + x.amountPaise, 0))}>
              {list.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">{t('fx.none')}</p>
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0 text-sm">
                  {list.map((x) => (
                    <li key={x.voucherId} className="flex justify-between gap-2">
                      <span className="truncate">
                        {fmt.date(x.date, 'short')} · {x.number}
                      </span>
                      <span className="tabular-nums">{fmt.rupees(x.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          <Card title={t('fx.brs.bankOnly')} subtitle={fmt.rupees(brs.bankOnly.reduce((a, x) => a + x.creditPaise - x.debitPaise, 0))}>
            {brs.bankOnly.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">{t('fx.none')}</p>
            ) : (
              <ul className="m-0 grid list-none gap-1 p-0 text-sm">
                {brs.bankOnly.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {fmt.date(x.date, 'short')} · {x.text}
                    </span>
                    <span className="tabular-nums">{fmt.rupees(x.creditPaise - x.debitPaise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : lines.length === 0 ? (
        <EmptyState icon={<Landmark />} title={t('fx.noLines')}>
          {t('fx.noLinesBody')}
        </EmptyState>
      ) : (
        <DataTable columns={cols} rows={lines} rowId={(l) => l.id} label={t('fx.bankReco')} exportName={`bank-${account.code}`} />
      )}

      {importing && <ImportStatement accountId={account.id} onClose={() => setImporting(false)} onDone={(n, m) => setMsg(t('fx.statementImported', { n, m }))} />}
      {matching && <MatchLine line={matching} settlements={settlements.filter((s) => !s.bankLineId && s.netPaise === matching.creditPaise)} onClose={() => setMatching(null)} />}
      {ignoring && <DeskDialog title={t('fx.notInBooksTitle')} path={`/v1/accounts-depth/bank/lines/${ignoring.id}/ignore`} fields={[{ name: 'note', label: 'fx.col.note', kind: 'textarea', required: true }]} intro={t('fx.notInBooksIntro')} onClose={() => setIgnoring(null)} />}
    </div>
  );
}

function ImportStatement({ accountId, onClose, onDone }: { accountId: string; onClose: () => void; onDone: (lines: number, matched: number) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const upload = (file: File | undefined) =>
    start(async () => {
      if (!file) return;
      if (file.size > 5_000_000) return setError(t('fx.fileTooBig'));
      const res = await deskSend<{ lines: number; matched: number }>('/v1/accounts-depth/bank/statements', { accountId, fileName: file.name, csv: await file.text() });
      if (!res.ok) return setError(res.error);
      onDone(res.data.lines, res.data.matched);
      onClose();
      router.refresh();
    });
  return (
    <Dialog title={t('fx.importStatement')} busy={pending} onClose={onClose} actions={<Button variant="outline" onClick={onClose}>{t('fd.cancel')}</Button>}>
      <div className="grid gap-3">
        <p className="m-0 text-sm text-muted-foreground">{t('fx.importStatementHelp')}</p>
        <input type="file" accept=".csv,text/csv" aria-label={t('fx.importStatement')} disabled={pending} onChange={(e) => upload(e.target.files?.[0])} className="text-sm" data-testid="statement-file" />
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function MatchLine({ line, settlements, onClose }: { line: BankLine; settlements: Settlement[]; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [voucherNo, setVoucherNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let live = true;
    void deskRead<Candidate[]>(`/v1/accounts-depth/bank/lines/${line.id}/candidates`).then((res) => {
      if (!live) return;
      setList(res.ok ? res.data : []);
      if (!res.ok) setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [line.id]);
  const pick = (path: string, body: Record<string, string>) =>
    start(async () => {
      const res = await deskSend(path, body);
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    });
  const shown = (list ?? []).filter((c) => !voucherNo.trim() || c.number.toLowerCase().includes(voucherNo.trim().toLowerCase()) || c.text.toLowerCase().includes(voucherNo.trim().toLowerCase()));
  return (
    <Dialog title={t('fx.matchTitle', { amount: fmt.rupees(line.creditPaise || line.debitPaise) })} size="md" busy={pending} onClose={onClose} actions={<Button variant="outline" onClick={onClose}>{t('fd.cancel')}</Button>}>
      <div className="grid gap-3">
        <p className="m-0 text-sm text-muted-foreground">
          {fmt.date(line.txnDate, 'short')} · {[line.reference, line.description].filter(Boolean).join(' · ')}
        </p>
        <TextInput label={t('fx.f.findVoucher')} value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
        {list && shown.length === 0 && settlements.length === 0 && <p className="m-0 text-sm text-muted-foreground">{t('fx.noCandidates')}</p>}
        <ul className="m-0 grid max-h-80 list-none gap-2 overflow-y-auto p-0">
          {shown.map((c) => (
            <li key={c.voucherId}>
              <button type="button" className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted" disabled={pending} onClick={() => pick(`/v1/accounts-depth/bank/lines/${line.id}/match`, { voucherId: c.voucherId })}>
                <span className="min-w-0">
                  <b className="font-mono">{c.number}</b> · {fmt.date(c.date, 'short')}
                  <span className="block truncate text-xs text-muted-foreground">{c.text}</span>
                </span>
                <span className="tabular-nums">{fmt.rupees(c.amountPaise)}</span>
              </button>
            </li>
          ))}
          {settlements.map((s) => (
            <li key={s.id}>
              <button type="button" className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted" disabled={pending} onClick={() => pick(`/v1/accounts-depth/bank/lines/${line.id}/settlement`, { batchId: s.id })}>
                <span>{t('fx.settlementPick', { provider: s.provider, ref: s.reference, date: fmt.date(s.settlementDate, 'short') })}</span>
                <span className="tabular-nums">{fmt.rupees(s.netPaise)}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
