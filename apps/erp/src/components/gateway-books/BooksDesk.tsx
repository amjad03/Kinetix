'use client';

import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addAccount, closeYear, loadDaybook, loadReports, postVoucher, voidVoucher } from '@/app/(dashboard)/books/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface Account { id: string; code: string; name: string; groupType: string; isCashBank: boolean; active: boolean }
export interface FyClose { financialYear: string; surplusPaise: number; closedAt: string }
interface Voucher { id: string; voucherType: string; number: string; date: string; narration: string; voided: boolean; lines: { code: string; accountName: string; debitPaise: number; creditPaise: number }[] }
interface Row { code: string; name: string; paise: number }
interface Reports {
  trial: { asOf: string; lines: { code: string; name: string; debitPaise: number; creditPaise: number }[]; totalDebitPaise: number; totalCreditPaise: number; balanced: boolean };
  ie: { financialYear: string; income: Row[]; expense: Row[]; totalIncomePaise: number; totalExpensePaise: number; surplusPaise: number };
  bs: { assets: Row[]; liabilities: Row[]; equity: Row[]; surplusPaise: number; totalAssetsPaise: number; totalLiabilitiesPaise: number; balanced: boolean };
}

const today = () => new Date().toISOString().slice(0, 10);
const fyOf = (d: string) => {
  const y = Number(d.slice(0, 4));
  const s = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
};

/** Chart of accounts, day book, statements and year close. */
export function BooksDesk({ accounts, years, initialTab }: { accounts: Account[]; years: FyClose[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<'account' | 'voucher' | null>(null);
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [vouchers, setVouchers] = useState<Voucher[] | null>(null);
  const [asOf, setAsOf] = useState(today());
  const [reports, setReports] = useState<Reports | null>(null);
  const done = (m?: string) => {
    setDialog(null);
    if (m) toast(m);
  };
  const showDaybook = () =>
    start(async () => {
      const r = await loadDaybook(from, to);
      if (r.ok) setVouchers((r.data as { vouchers: Voucher[] }).vouchers);
      else toast(r.error);
    });
  const showReports = () =>
    start(async () => {
      const r = await loadReports(asOf, fyOf(asOf));
      if (r.ok) setReports(r.data as Reports);
      else toast(r.error);
    });
  const group = (g: string) => t(`gb.group.${g}` as MessageKey);
  const opts = accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const accountFields: Field[] = [
    { name: 'code', label: t('gb.col.code'), required: true },
    { name: 'name', label: t('gb.col.name'), required: true },
    { name: 'groupType', label: t('gb.col.group'), kind: 'select', required: true, init: 'expense', options: ['asset', 'liability', 'equity', 'income', 'expense'].map((g) => ({ value: g, label: group(g) })) },
    { name: 'isCashBank', label: 'Cash / bank', kind: 'select', init: 'no', options: [{ value: 'no', label: t('gb.tally.off') }, { value: 'yes', label: t('gb.tally.on') }] },
  ];
  const voucherFields: Field[] = [
    { name: 'type', label: t('gb.col.type'), kind: 'select', required: true, init: 'journal', options: ['receipt', 'payment', 'journal', 'contra'].map((v) => ({ value: v, label: t(`gb.vt.${v}` as MessageKey) })) },
    { name: 'date', label: t('gb.col.date'), kind: 'date', required: true, init: today() },
    { name: 'account1', label: t('gb.voucher.line1'), kind: 'select', required: true, options: opts },
    { name: 'side', label: t('gb.voucher.line1Side'), kind: 'select', required: true, init: 'debit', options: [{ value: 'debit', label: t('gb.side.debit') }, { value: 'credit', label: t('gb.side.credit') }] },
    { name: 'account2', label: t('gb.voucher.line2'), kind: 'select', required: true, options: opts },
    { name: 'amount', label: t('gb.col.amount'), kind: 'rupees', required: true },
    { name: 'narration', label: t('gb.col.narration') },
  ];
  const sumRows = (rows: Row[], total: number, label: string) => (
    <Grid
      empty={t('gb.empty')}
      rows={[...rows, { code: '', name: label, paise: total }]}
      cols={[
        { label: t('gb.col.code'), cell: (r) => r.code },
        { label: t('gb.col.name'), cell: (r) => r.name },
        { label: t('gb.col.amount'), num: true, cell: (r) => fmt.rupees(r.paise) },
      ]}
    />
  );
  const closed = new Set(years.map((y) => y.financialYear));
  const thisFy = fyOf(today());

  const tabs = [
    {
      id: 'accounts',
      label: t('gb.tab.accounts'),
      node: (
        <>
          <Bar>
            <Button variant="contained" onClick={() => setDialog('account')}>{t('gb.new.account')}</Button>
          </Bar>
          <Grid
            testId="books-accounts"
            empty={t('gb.empty')}
            rows={accounts}
            cols={[
              { label: t('gb.col.code'), cell: (a) => a.code, sort: (a) => a.code },
              { label: t('gb.col.name'), cell: (a) => a.name, sort: (a) => a.name },
              { label: t('gb.col.group'), cell: (a) => group(a.groupType) },
            ]}
          />
        </>
      ),
    },
    {
      id: 'vouchers',
      label: t('gb.tab.vouchers'),
      node: (
        <>
          <Bar>
            <TextField type="date" size="small" label={t('gb.range.from')} value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" size="small" label={t('gb.range.to')} value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <Button variant="outlined" disabled={pending} onClick={showDaybook}>{t('gb.range.show')}</Button>
            <Button variant="contained" onClick={() => setDialog('voucher')}>{t('gb.new.voucher')}</Button>
          </Bar>
          {vouchers && (
            <Grid
              testId="books-daybook"
              empty={t('gb.empty')}
              rows={vouchers}
              cols={[
                { label: t('gb.col.date'), cell: (v) => v.date, sort: (v) => v.date },
                { label: t('gb.col.number'), cell: (v) => v.number },
                { label: t('gb.col.type'), cell: (v) => t(`gb.vt.${v.voucherType}` as MessageKey) },
                { label: t('gb.col.narration'), cell: (v) => v.narration },
                { label: t('gb.col.amount'), num: true, cell: (v) => fmt.rupees(v.lines.reduce((s, l) => s + l.debitPaise, 0)) },
                { label: '', cell: (v) => (v.voided ? <Pill label={t('gb.voided')} warn /> : <ActionButton label={t('gb.void')} tone="error" run={() => voidVoucher(v.id)} onDone={(m) => { toast(m); showDaybook(); }} />) },
              ]}
            />
          )}
        </>
      ),
    },
    {
      id: 'reports',
      label: t('gb.tab.reports'),
      node: (
        <>
          <Bar>
            <TextField type="date" size="small" label={t('gb.rep.asOf')} value={asOf} onChange={(e) => setAsOf(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <Button variant="outlined" disabled={pending} onClick={showReports}>{t('gb.range.show')}</Button>
          </Bar>
          {reports && (
            <>
              <Typography variant="h6" sx={{ mt: 2 }}>{t('gb.rep.trial')}</Typography>
              <Typography variant="body2" color={reports.trial.balanced ? 'text.secondary' : 'error'}>{reports.trial.balanced ? t('gb.rep.balanced') : t('gb.rep.unbalanced')}</Typography>
              <Grid
                testId="books-trial"
                empty={t('gb.empty')}
                rows={reports.trial.lines}
                cols={[
                  { label: t('gb.col.code'), cell: (r) => r.code },
                  { label: t('gb.col.name'), cell: (r) => r.name },
                  { label: t('gb.col.debit'), num: true, cell: (r) => (r.debitPaise ? fmt.rupees(r.debitPaise) : '') },
                  { label: t('gb.col.credit'), num: true, cell: (r) => (r.creditPaise ? fmt.rupees(r.creditPaise) : '') },
                ]}
              />
              <Typography variant="h6" sx={{ mt: 3 }}>{t('gb.rep.ie')} ({reports.ie.financialYear})</Typography>
              {sumRows(reports.ie.income, reports.ie.totalIncomePaise, `${t('gb.rep.income')} ${t('gb.rep.total')}`)}
              {sumRows(reports.ie.expense, reports.ie.totalExpensePaise, `${t('gb.rep.expense')} ${t('gb.rep.total')}`)}
              <Typography sx={{ mt: 1 }}>{t('gb.rep.surplus')}: {fmt.rupees(reports.ie.surplusPaise)}</Typography>
              <Typography variant="h6" sx={{ mt: 3 }}>{t('gb.rep.bs')}</Typography>
              {sumRows(reports.bs.assets, reports.bs.totalAssetsPaise, `${t('gb.rep.assets')} ${t('gb.rep.total')}`)}
              {sumRows([...reports.bs.liabilities, ...reports.bs.equity, { code: '', name: t('gb.rep.surplus'), paise: reports.bs.surplusPaise }], reports.bs.totalLiabilitiesPaise, `${t('gb.rep.liabilities')} ${t('gb.rep.total')}`)}
            </>
          )}
        </>
      ),
    },
    {
      id: 'years',
      label: t('gb.tab.years'),
      node: (
        <>
          <Typography variant="body2" sx={{ mb: 1.5 }}>{t('gb.years.help')}</Typography>
          <Grid
            testId="books-years"
            empty={t('gb.empty')}
            rows={[...(closed.has(thisFy) ? [] : [{ financialYear: thisFy, surplusPaise: 0, closedAt: '' }]), ...years]}
            cols={[
              { label: t('gb.rep.year'), cell: (y) => y.financialYear },
              { label: t('gb.col.status'), cell: (y) => <Pill label={y.closedAt ? t('gb.years.closed') : t('gb.years.open')} warn={!y.closedAt} /> },
              { label: t('gb.years.surplus'), num: true, cell: (y) => (y.closedAt ? fmt.rupees(y.surplusPaise) : '') },
              { label: '', cell: (y) => (y.closedAt ? null : <ActionButton label={t('gb.years.close')} tone="error" run={() => closeYear(y.financialYear)} onDone={toast} />) },
            ]}
          />
        </>
      ),
    },
  ];

  return (
    <>
      <Tabbed tabs={tabs} initial={initialTab} label={t('nav.books')} />
      {dialog === 'account' && <FormDialog title={t('gb.new.account')} fields={accountFields} onSubmit={addAccount} onClose={done} />}
      {dialog === 'voucher' && <FormDialog title={t('gb.new.voucher')} intro={t('gb.voucher.hint')} fields={voucherFields} onSubmit={postVoucher} onClose={done} />}
      {toastNode}
    </>
  );
}
