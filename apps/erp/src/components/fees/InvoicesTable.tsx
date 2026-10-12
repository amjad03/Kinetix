'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { cancelInvoice, invoicePayments, recordPayment } from '@/app/(dashboard)/fees/actions';
import { EmptyState } from '@/components/States';
import { DataTable, FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { daysBetween } from '@/lib/dates';
import { formatRupees, methodLabel, paiseToInput, PAY_METHODS, referenceKey, rupeesToPaise, type CounterMethod } from '@/lib/money';
import type { FeeInvoice, FeeReceipt, StudentFees } from '@/lib/types';
import { ReceiptView } from './ReceiptView';

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, List, ListItem, ListItemText, Menu, MenuItem, Snackbar, TextField, ToggleButton, ToggleButtonGroup } from '@/components/kx';
import { CircleCheck as CheckCircleOutlined, EllipsisVertical as MoreVert, Printer as PrintOutlined, ReceiptText as ReceiptLongOutlined, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
function StatusCell({ inv, today }: { inv: FeeInvoice; today: string }) {
  const { t } = useI18n();
  if (inv.status === 'paid')
    return <span data-status="paid"><StatusPill tone="success">{t('fees.status.paid')}</StatusPill></span>;
  if (inv.status === 'cancelled') return <span data-status="cancelled"><StatusPill>{t('fees.status.cancelled')}</StatusPill></span>;
  const late = inv.dueOn < today;
  if (late) return <span data-status="overdue"><StatusPill tone="danger">{t('fees.status.overdue')}</StatusPill></span>;
  return <span data-status="due"><StatusPill tone={inv.paidPaise > 0 ? 'info' : 'warning'}>{inv.paidPaise > 0 ? t('fees.status.partPaid') : t('fees.status.due')}</StatusPill></span>;
}

function DueCell({ inv, today }: { inv: FeeInvoice; today: string }) {
  const { t, fmt } = useI18n();
  const n = daysBetween(today, inv.dueOn);
  const open = inv.status === 'due';
  return (
    <div>
      <p className="text-[13px] leading-[19px] whitespace-nowrap">
        {fmt.date(inv.dueOn, 'short')}
      </p>
      {open && (
        <span className={cn('text-xs leading-4 tracking-[0.3px] whitespace-nowrap', n < 0 ? 'text-red-ink' : 'text-muted-foreground')}>
          {n < 0 ? t.plural('fees.late', -n) : n === 0 ? t('fees.dueToday') : t.plural('fees.inDays', n)}
        </span>
      )}
    </div>
  );
}

export function InvoicesTable({ invoices, today, timeZone }: { invoices: FeeInvoice[]; today: string; timeZone: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState<FeeInvoice | null>(null);
  const [cancelling, setCancelling] = useState<FeeInvoice | null>(null);
  const [receipts, setReceipts] = useState<FeeInvoice | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; inv: FeeInvoice } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return invoices;
    return invoices.filter((i) => i.student.fullName.toLowerCase().includes(s) || (i.student.rollNo ?? '').toLowerCase().includes(s) || i.title.toLowerCase().includes(s));
  }, [invoices, q]);
  const balance = rows.reduce((s, i) => s + (i.status === 'due' ? i.amountPaise - i.paidPaise : 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <TextField className="flex-[1_1_260px] max-w-[420px]"
          size="small"
          placeholder={t('fees.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search className="size-5" /></InputAdornment> },
            htmlInput: { 'aria-label': t('fees.searchLabel') },
          }}
        />
        <p className="text-[13px] leading-[19px] text-muted-foreground" data-testid="invoice-count">
          {t.plural('fees.count', rows.length)}
          {balance > 0 && ` · ${t('fees.amountDue', { amount: formatRupees(balance) })}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState dense icon={<ReceiptLongOutlined />} title={invoices.length ? t('fees.noMatch') : t('fees.noInvoices')} testId="no-invoices">
          {invoices.length ? t('fees.noMatchBody') : t('fees.noInvoicesBody')}
        </EmptyState>
      ) : (
        <DataTable
          testId="invoices-table"
          label={t('nav.fees')}
          rows={rows}
          rowId={(inv) => inv.id}
          bare
          rowAttrs={() => ({ 'data-testid': 'invoice-row' })}
          columns={[
            {
              id: 'student',
              header: t('fees.col.student'),
              rowHeader: true,
              sort: (inv) => inv.student.fullName,
              cell: (inv) => (
                <>
                  <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{inv.student.fullName}</h6>
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {[inv.student.rollNo, inv.className].filter(Boolean).join(' · ')}
                  </span>
                </>
              ),
            },
            { id: 'fee', header: t('fees.col.fee'), sort: (inv) => inv.title, cell: (inv) => inv.title },
            { id: 'amount', header: t('fees.col.amount'), align: 'right', sort: (inv) => inv.amountPaise / 100, cell: (inv) => <span className="whitespace-nowrap">{formatRupees(inv.amountPaise)}</span> },
            {
              id: 'balance',
              header: t('fees.col.balance'),
              align: 'right',
              sort: (inv) => (inv.status === 'cancelled' ? 0 : Math.max(0, inv.amountPaise - inv.paidPaise) / 100),
              cell: (inv) => (
                <span className={cn('whitespace-nowrap', inv.status === 'due' ? 'text-foreground' : 'text-muted-foreground')}>
                  {inv.status === 'cancelled' ? '—' : formatRupees(Math.max(0, inv.amountPaise - inv.paidPaise))}
                </span>
              ),
            },
            { id: 'due', header: t('fees.col.due'), sort: (inv) => inv.dueOn, cell: (inv) => <DueCell inv={inv} today={today} /> },
            { id: 'status', header: t('fees.col.status'), sort: (inv) => inv.status, cell: (inv) => <StatusCell inv={inv} today={today} /> },
            {
              id: 'actions',
              header: '',
              csv: false,
              align: 'right',
              cell: (inv) => (
                <span className="whitespace-nowrap">
                  {inv.status === 'due' && (
                    <Button className="mr-1" size="small" variant="outlined" onClick={() => setPaying(inv)}>
                      {t('fees.recordPayment')}
                    </Button>
                  )}
                  {(inv.paidPaise > 0 || inv.status === 'due') && (
                    <IconButton size="small" aria-label={t('fees.moreFor', { name: inv.student.fullName })} onClick={(e) => setMenu({ el: e.currentTarget, inv })} data-testid="invoice-menu">
                      <MoreVert className="size-5" />
                    </IconButton>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {menu && menu.inv.paidPaise > 0 && (
          <MenuItem
            onClick={() => {
              setReceipts(menu.inv);
              setMenu(null);
            }}
          >
            {t('fees.paymentsReceipts')}
          </MenuItem>
        )}
        {menu && menu.inv.status === 'due' && menu.inv.paidPaise === 0 && (
          <MenuItem className="text-red-ink"
            onClick={() => {
              setCancelling(menu.inv);
              setMenu(null);
            }}
          >
            {t('fees.cancelInvoice')}
          </MenuItem>
        )}
      </Menu>

      {paying && <PaymentDialog inv={paying} timeZone={timeZone} onClose={() => setPaying(null)} />}
      {cancelling && (
        <CancelDialog
          inv={cancelling}
          onClose={(done) => {
            setCancelling(null);
            if (done) setToast(t('fees.cancelled', { title: cancelling.title, name: cancelling.student.fullName }));
          }}
        />
      )}
      {receipts && <ReceiptsDialog inv={receipts} timeZone={timeZone} onClose={() => setReceipts(null)} />}
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}

function PaymentDialog({ inv, timeZone, onClose }: { inv: FeeInvoice; timeZone: string; onClose: () => void }) {
  const { t } = useI18n();
  const balance = inv.amountPaise - inv.paidPaise;
  const [amount, setAmount] = useState(paiseToInput(balance));
  const [method, setMethod] = useState<CounterMethod>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<FeeReceipt | null>(null);
  const [pending, start] = useTransition();

  const paise = rupeesToPaise(amount);
  const amountError = amount.trim() !== '' && (paise === null || paise < 100 || paise > balance);
  const needsRef = method !== 'cash';
  const ready = paise !== null && paise >= 100 && paise <= balance && (!needsRef || reference.trim() !== '');

  const submit = () => {
    if (!ready || paise === null) return;
    setError(null);
    start(async () => {
      const res = await recordPayment(inv.id, { amountPaise: paise, method, reference });
      if (res.ok) setDone(res.data);
      else setError(res.error);
    });
  };

  if (done) {
    return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="paid-title">
        <DialogTitle className="flex items-center gap-3" id="paid-title">
          <CheckCircleOutlined className="text-green-ink" />
          {t('fees.paid.title')}
        </DialogTitle>
        <DialogContent>
          <div className="border border-border rounded-[12px] p-5">
            <ReceiptView r={done} timeZone={timeZone} />
          </div>
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-3">
            {t('fees.paid.notified')}
          </p>
        </DialogContent>
        <DialogActions>
          <Button component={Link} href={`/fees/receipts/${done.paymentId}`} target="_blank" startIcon={<PrintOutlined />}>
            {t('fees.printReceipt')}
          </Button>
          <Button variant="contained" onClick={onClose}>
            {t('common.done')}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="pay-title">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="pay-title">{t('fees.pay.title')}</DialogTitle>
        <DialogContent>
          <div className="mb-5 p-4 rounded-[12px] bg-muted">
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{inv.student.fullName}</h6>
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {inv.title} · {inv.className}
            </p>
            <p className="text-[13px] leading-[19px] mt-1">
              {t('fees.pay.balance')} <strong>{formatRupees(balance)}</strong>
              {inv.paidPaise > 0 && ` ${t('fees.pay.ofAmount', { amount: formatRupees(inv.amountPaise) })}`}
            </p>
          </div>
          <div className="flex flex-col gap-5">
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('fees.pay.received')} required>
              <TextInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
                error={amountError}
                helperText={amountError ? (paise !== null && paise > balance ? t('fees.pay.tooMuch') : t('fees.pay.enterRupees')) : paise && paise < balance ? t('fees.pay.part', { amount: formatRupees(balance - paise) }) : ' '}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
              />
            </FormField>
            <div>
              <p className="text-[13px] leading-[19px] text-muted-foreground mb-2" id="pay-method">
                {t('fees.pay.paidBy')}
              </p>
              <ToggleButtonGroup className="flex-wrap" exclusive value={method} onChange={(_, v: CounterMethod | null) => v && setMethod(v)} aria-labelledby="pay-method" size="small">
                {PAY_METHODS.map((m) => (
                  <ToggleButton className="px-3.5" key={m} value={m}>
                    {methodLabel(m, t)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </div>
            <FormField label={t(referenceKey(method))} required={needsRef}>
              <TextInput
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required={needsRef}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </FormField>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('fees.recordPayment')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function CancelDialog({ inv, onClose }: { inv: FeeInvoice; onClose: (done?: boolean) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth aria-labelledby="cancel-inv-title">
      <DialogTitle id="cancel-inv-title">{t('fees.cancel.title')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert className="mb-4" severity="error">
            {error}
          </Alert>
        )}
        <p className="text-[13px] leading-[19px]">
          {t('fees.cancel.body', { title: inv.title, amount: formatRupees(inv.amountPaise), name: inv.student.fullName })}
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('fees.cancel.keep')}
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await cancelInvoice(inv.id);
              if (res.ok) onClose(true);
              else setError(res.error);
            })
          }
        >
          {t('fees.cancelInvoice')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReceiptsDialog({ inv, timeZone, onClose }: { inv: FeeInvoice; timeZone: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [payments, setPayments] = useState<StudentFees['payments'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    invoicePayments(inv.student.id, inv.id).then((res) => {
      if (!live) return;
      if (res.ok) setPayments(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [inv.id, inv.student.id]);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="receipts-title">
      <DialogTitle id="receipts-title">{t('fees.paymentsReceipts')}</DialogTitle>
      <DialogContent>
        <p className="text-[13px] leading-[19px] text-muted-foreground mb-2">
          {inv.student.fullName} · {inv.title}
        </p>
        {error && <Alert severity="error">{error}</Alert>}
        {!payments && !error && <CircularProgress className="block mx-auto my-6" size={24} />}
        {payments && payments.length === 0 && <p className="text-[13px] leading-[19px]">{t('fees.noPayments')}</p>}
        {payments && payments.length > 0 && (
          <List dense disablePadding>
            {payments.map((p) => (
              <ListItem
                key={p.id}
                disableGutters
                secondaryAction={
                  <Button component={Link} href={`/fees/receipts/${p.id}`} size="small" startIcon={<PrintOutlined />}>
                    {t('fees.receipt')}
                  </Button>
                }
              >
                <ListItemText
                  primary={`${formatRupees(p.amountPaise)} · ${methodLabel(p.method, t)}${p.reference ? ` · ${p.reference}` : ''}`}
                  secondary={`${p.receiptNo ?? ''}${p.paidAt ? ` · ${fmt.dateTime(p.paidAt, timeZone)}` : ''}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
