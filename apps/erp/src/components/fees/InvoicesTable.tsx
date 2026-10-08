'use client';

import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import Search from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { cancelInvoice, invoicePayments, recordPayment } from '@/app/(dashboard)/fees/actions';
import { TableFrame } from '@/components/DataTable';
import { EmptyState } from '@/components/States';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { daysBetween } from '@/lib/dates';
import { formatRupees, methodLabel, paiseToInput, PAY_METHODS, referenceKey, rupeesToPaise, type CounterMethod } from '@/lib/money';
import type { FeeInvoice, FeeReceipt, StudentFees } from '@/lib/types';
import { ReceiptView } from './ReceiptView';

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
    <Box>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {fmt.date(inv.dueOn, 'short')}
      </Typography>
      {open && (
        <Typography variant="caption" sx={{ color: n < 0 ? 'error.main' : 'text.secondary', whiteSpace: 'nowrap' }}>
          {n < 0 ? t.plural('fees.late', -n) : n === 0 ? t('fees.dueToday') : t.plural('fees.inDays', n)}
        </Typography>
      )}
    </Box>
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder={t('fees.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 260px', maxWidth: 420 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': t('fees.searchLabel') },
          }}
        />
        <Typography variant="body2" color="text.secondary" data-testid="invoice-count">
          {t.plural('fees.count', rows.length)}
          {balance > 0 && ` · ${t('fees.amountDue', { amount: formatRupees(balance) })}`}
        </Typography>
      </Box>

      {rows.length === 0 ? (
        <EmptyState dense icon={<ReceiptLongOutlined />} title={invoices.length ? t('fees.noMatch') : t('fees.noInvoices')} testId="no-invoices">
          {invoices.length ? t('fees.noMatchBody') : t('fees.noInvoicesBody')}
        </EmptyState>
      ) : (
        <TableFrame testId="invoices-table">
          <Table sx={{ minWidth: 900 }} size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('fees.col.student')}</TableCell>
                <TableCell>{t('fees.col.fee')}</TableCell>
                <TableCell align="right">{t('fees.col.amount')}</TableCell>
                <TableCell align="right">{t('fees.col.balance')}</TableCell>
                <TableCell>{t('fees.col.due')}</TableCell>
                <TableCell>{t('fees.col.status')}</TableCell>
                <TableCell aria-label={t('fees.col.actions')} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((inv) => {
                const bal = inv.amountPaise - inv.paidPaise;
                return (
                  <TableRow key={inv.id} hover data-testid="invoice-row" sx={{ '& td': { py: 1.25 } }}>
                    <TableCell>
                      <Typography variant="subtitle2">{inv.student.fullName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[inv.student.rollNo, inv.className].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell>{inv.title}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatRupees(inv.amountPaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: inv.status === 'due' ? 'text.primary' : 'text.secondary' }}>
                      {inv.status === 'cancelled' ? '—' : formatRupees(Math.max(0, bal))}
                    </TableCell>
                    <TableCell>
                      <DueCell inv={inv} today={today} />
                    </TableCell>
                    <TableCell>
                      <StatusCell inv={inv} today={today} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', pr: 1 }}>
                      {inv.status === 'due' && (
                        <Button size="small" variant="outlined" onClick={() => setPaying(inv)} sx={{ mr: 0.5 }}>
                          {t('fees.recordPayment')}
                        </Button>
                      )}
                      {(inv.paidPaise > 0 || inv.status === 'due') && (
                        <IconButton size="small" aria-label={t('fees.moreFor', { name: inv.student.fullName })} onClick={(e) => setMenu({ el: e.currentTarget, inv })} data-testid="invoice-menu">
                          <MoreVert fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
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
          <MenuItem
            onClick={() => {
              setCancelling(menu.inv);
              setMenu(null);
            }}
            sx={{ color: 'error.main' }}
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
        <DialogTitle id="paid-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CheckCircleOutlined sx={{ color: 'kx.success' }} />
          {t('fees.paid.title')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', p: 2.5 }}>
            <ReceiptView r={done} timeZone={timeZone} />
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            {t('fees.paid.notified')}
          </Typography>
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
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="pay-title">{t('fees.pay.title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2.5, p: 2, borderRadius: '12px', bgcolor: 'kx.tonal' }}>
            <Typography variant="subtitle2">{inv.student.fullName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {inv.title} · {inv.className}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {t('fees.pay.balance')} <strong>{formatRupees(balance)}</strong>
              {inv.paidPaise > 0 && ` ${t('fees.pay.ofAmount', { amount: formatRupees(inv.amountPaise) })}`}
            </Typography>
          </Box>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t('fees.pay.received')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              error={amountError}
              helperText={amountError ? (paise !== null && paise > balance ? t('fees.pay.tooMuch') : t('fees.pay.enterRupees')) : paise && paise < balance ? t('fees.pay.part', { amount: formatRupees(balance - paise) }) : ' '}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
            />
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} id="pay-method">
                {t('fees.pay.paidBy')}
              </Typography>
              <ToggleButtonGroup exclusive value={method} onChange={(_, v: CounterMethod | null) => v && setMethod(v)} aria-labelledby="pay-method" size="small" sx={{ flexWrap: 'wrap' }}>
                {PAY_METHODS.map((m) => (
                  <ToggleButton key={m} value={m} sx={{ px: 1.75 }}>
                    {methodLabel(m, t)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <TextField
              label={t(referenceKey(method))}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required={needsRef}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('fees.recordPayment')}
          </Button>
        </DialogActions>
      </Box>
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
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2">
          {t('fees.cancel.body', { title: inv.title, amount: formatRupees(inv.amountPaise), name: inv.student.fullName })}
        </Typography>
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {inv.student.fullName} · {inv.title}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {!payments && !error && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 3 }} />}
        {payments && payments.length === 0 && <Typography variant="body2">{t('fees.noPayments')}</Typography>}
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
